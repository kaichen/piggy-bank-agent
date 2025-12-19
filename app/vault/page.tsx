"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { formatUnits } from "viem"
import { useAccount, useChainId, useConnect, usePublicClient } from "wagmi"
import Image from "next/image"
import Link from "next/link"
import { Menu, Plus, MessageSquare, Wallet, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { getVaultManagerAddress, type Address } from "@/lib/contracts/addresses"
import { vaultManagerAbi } from "@/lib/contracts/vault-manager"
import { erc20Abi } from "@/lib/contracts/erc20"

const BTC_PRICE = 87500 // Placeholder BTC price in USD
const GOAL_STORAGE_KEY = "piggy-goal-draft"

type TokenMeta = {
  symbol: string | null
  decimals: number | null
}

type VaultTokenPosition = {
  token: Address
  symbol: string | null
  decimals: number | null
  balance: bigint
}

type VaultDetails = {
  id: bigint
  owner: Address
  unlockTimestamp: bigint
  broken: boolean
  tokens: VaultTokenPosition[]
}

function parseVaultTuple(vault: unknown) {
  return {
    owner: ((vault as any).owner ?? (vault as any)[0]) as Address,
    unlockTimestamp: ((vault as any).unlockTimestamp ?? (vault as any)[1]) as bigint,
    broken: ((vault as any).broken ?? (vault as any)[2]) as boolean,
  }
}

function formatUnitsTruncated(value: bigint, decimals: number, maxFractionDigits = 6) {
  const full = formatUnits(value, decimals)
  if (!full.includes(".")) return full
  const [integerPart, fractionalPartRaw] = full.split(".")
  const fractionalPart = fractionalPartRaw.slice(0, maxFractionDigits).replace(/0+$/, "")
  return fractionalPart ? `${integerPart}.${fractionalPart}` : integerPart
}

export default function VaultPage() {
  const { address, isConnected } = useAccount()
  const { connect, connectors, isPending } = useConnect()
  const chainId = useChainId()
  const publicClient = usePublicClient()

  const vaultManagerAddress = useMemo(() => getVaultManagerAddress(chainId), [chainId])

  const [vault, setVault] = useState<VaultDetails | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [breakDialogOpen, setBreakDialogOpen] = useState(false)

  // Goal from localStorage
  const [targetBTC, setTargetBTC] = useState(1.0)

  const tokenMetaCacheRef = useRef<Map<Address, TokenMeta>>(new Map())

  // Load goal from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(GOAL_STORAGE_KEY)
    if (saved) {
      try {
        const data = JSON.parse(saved)
        if (data.targetBTC) setTargetBTC(data.targetBTC)
      } catch {
        // ignore
      }
    }
  }, [])

  const ensureTokenMeta = useCallback(
    async (tokens: Address[]) => {
      if (!publicClient) return
      const tokensToFetch = tokens.filter((token) => !tokenMetaCacheRef.current.has(token))
      if (!tokensToFetch.length) return

      try {
        const metaCalls = tokensToFetch.flatMap(
          (token) =>
            [
              { address: token, abi: erc20Abi, functionName: "symbol" as const },
              { address: token, abi: erc20Abi, functionName: "decimals" as const },
            ] as const,
        )
        const results = await (publicClient as any).multicall({
          contracts: metaCalls,
          allowFailure: true,
        })

        for (let i = 0; i < tokensToFetch.length; i++) {
          const symbolResult = results[i * 2]
          const decimalsResult = results[i * 2 + 1]

          const symbol = symbolResult?.status === "success" ? (symbolResult.result as string) : null
          const decimalsRaw = decimalsResult?.status === "success" ? (decimalsResult.result as unknown) : null
          const decimals =
            decimalsRaw == null ? null : typeof decimalsRaw === "bigint" ? Number(decimalsRaw) : (decimalsRaw as number)

          tokenMetaCacheRef.current.set(tokensToFetch[i], { symbol, decimals })
        }
      } catch {
        // Fallback to individual calls
        await Promise.all(
          tokensToFetch.map(async (token) => {
            const [symbolResult, decimalsResult] = await Promise.allSettled([
              publicClient.readContract({ address: token, abi: erc20Abi, functionName: "symbol" }),
              publicClient.readContract({ address: token, abi: erc20Abi, functionName: "decimals" }),
            ])

            const symbol = symbolResult.status === "fulfilled" ? (symbolResult.value as string) : null
            const decimalsRaw = decimalsResult.status === "fulfilled" ? (decimalsResult.value as unknown) : null
            const decimals =
              decimalsRaw == null ? null : typeof decimalsRaw === "bigint" ? Number(decimalsRaw) : (decimalsRaw as number)

            tokenMetaCacheRef.current.set(token, { symbol, decimals })
          }),
        )
      }
    },
    [publicClient],
  )

  const refreshVault = useCallback(async () => {
    if (!publicClient || !vaultManagerAddress || !address) {
      setVault(null)
      return
    }

    setLoading(true)
    setError(null)

    try {
      // Get vault IDs for the owner
      const ids = await publicClient.readContract({
        address: vaultManagerAddress,
        abi: vaultManagerAbi,
        functionName: "getVaultIdsByOwner",
        args: [address],
      })

      const idsArray = Array.from(ids)
      if (!idsArray.length) {
        setVault(null)
        setLoading(false)
        return
      }

      // Use the first vault
      const vaultId = idsArray[0]

      // Get vault details and tokens
      const [vaultData, tokenAddresses] = await Promise.all([
        publicClient.readContract({
          address: vaultManagerAddress,
          abi: vaultManagerAbi,
          functionName: "getVault",
          args: [vaultId],
        }),
        publicClient.readContract({
          address: vaultManagerAddress,
          abi: vaultManagerAbi,
          functionName: "getVaultTokens",
          args: [vaultId],
        }),
      ])

      const { owner, unlockTimestamp, broken } = parseVaultTuple(vaultData)

      // Get token metadata
      await ensureTokenMeta(tokenAddresses as Address[])

      // Get token balances
      const balanceResults = await Promise.all(
        (tokenAddresses as Address[]).map((token) =>
          publicClient.readContract({
            address: vaultManagerAddress,
            abi: vaultManagerAbi,
            functionName: "vaultTokenBalance",
            args: [vaultId, token],
          }),
        ),
      )

      const tokens: VaultTokenPosition[] = (tokenAddresses as Address[]).map((token, i) => {
        const meta = tokenMetaCacheRef.current.get(token) ?? { symbol: null, decimals: null }
        return {
          token,
          symbol: meta.symbol,
          decimals: meta.decimals,
          balance: balanceResults[i],
        }
      })

      setVault({
        id: vaultId,
        owner,
        unlockTimestamp,
        broken,
        tokens,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load vault")
    } finally {
      setLoading(false)
    }
  }, [address, ensureTokenMeta, publicClient, vaultManagerAddress])

  // Load vault on connect
  useEffect(() => {
    if (isConnected) {
      refreshVault()
    } else {
      setVault(null)
    }
  }, [isConnected, refreshVault])

  // Calculate total savings (sum all token balances, assuming BTC-like token for demo)
  const totalSavings = useMemo(() => {
    if (!vault?.tokens.length) return { btc: 0, usd: 0 }

    // For demo, use first token's balance converted to BTC equivalent
    // In real app, you'd convert each token to a common unit
    const firstToken = vault.tokens[0]
    if (!firstToken || firstToken.decimals == null) return { btc: 0, usd: 0 }

    const btcAmount = Number(formatUnits(firstToken.balance, firstToken.decimals))
    return {
      btc: btcAmount,
      usd: btcAmount * BTC_PRICE,
    }
  }, [vault])

  const progressPercent = useMemo(() => {
    if (totalSavings.btc <= 0 || targetBTC <= 0) return 0
    return Math.min((totalSavings.btc / targetBTC) * 100, 100)
  }, [totalSavings.btc, targetBTC])

  // Not connected - show connect wallet prompt
  if (!isConnected) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-pink-50 to-pink-100">
        {/* Header */}
        <header className="flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500">
              <span className="text-sm font-bold text-white">🐷</span>
            </div>
            <span className="text-xl font-bold text-slate-900">BitPiggy</span>
          </div>
          <button className="p-2">
            <Menu className="h-6 w-6 text-slate-600" />
          </button>
        </header>

        {/* Connect Wallet Content */}
        <div className="flex flex-col items-center justify-center px-6 py-16">
          <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-orange-100">
            <Wallet className="h-10 w-10 text-orange-500" />
          </div>

          <h1 className="mb-2 text-2xl font-bold text-slate-900">Connect Wallet</h1>
          <p className="mb-8 text-center text-slate-500">
            Connect your wallet to view your piggy bank vault
          </p>

          <div className="w-full max-w-sm space-y-3">
            {connectors.map((connector) => (
              <Button
                key={connector.uid}
                variant="outline"
                className="w-full justify-start gap-3 rounded-xl border-slate-200 bg-white py-6 hover:bg-slate-50"
                onClick={() => connect({ connector })}
                disabled={isPending}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100">
                  <Wallet className="h-5 w-5 text-slate-600" />
                </div>
                <span className="font-medium text-slate-900">{connector.name}</span>
              </Button>
            ))}
          </div>
        </div>
      </main>
    )
  }

  // Loading state
  if (loading && !vault) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-pink-50 to-pink-100">
        <header className="flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500">
              <span className="text-sm font-bold text-white">🐷</span>
            </div>
            <span className="text-xl font-bold text-slate-900">BitPiggy</span>
          </div>
          <button className="p-2">
            <Menu className="h-6 w-6 text-slate-600" />
          </button>
        </header>
        <div className="flex flex-col items-center justify-center px-6 py-16">
          <RefreshCw className="h-8 w-8 animate-spin text-orange-500" />
          <p className="mt-4 text-slate-500">Loading vault...</p>
        </div>
      </main>
    )
  }

  // No vault - show create prompt
  if (!vault) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-pink-50 to-pink-100">
        <header className="flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500">
              <span className="text-sm font-bold text-white">🐷</span>
            </div>
            <span className="text-xl font-bold text-slate-900">BitPiggy</span>
          </div>
          <button className="p-2">
            <Menu className="h-6 w-6 text-slate-600" />
          </button>
        </header>
        <div className="flex flex-col items-center justify-center px-6 py-16">
          <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-orange-100">
            <span className="text-4xl">🐷</span>
          </div>
          <h1 className="mb-2 text-2xl font-bold text-slate-900">No Vault Found</h1>
          <p className="mb-8 text-center text-slate-500">
            You don&apos;t have a piggy bank yet. Create one to start saving!
          </p>
          {error && <p className="mb-4 text-sm text-red-500">{error}</p>}
          <Link
            href="/setgoal"
            className="rounded-full bg-slate-900 px-8 py-4 font-semibold text-white hover:bg-slate-800"
          >
            Create Piggy Bank
          </Link>
        </div>
      </main>
    )
  }

  // Connected with vault - show vault details
  return (
    <main className="min-h-screen bg-gradient-to-b from-pink-50 to-pink-100">
      {/* Header */}
      <header className="flex h-16 items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500">
            <span className="text-sm font-bold text-white">🐷</span>
          </div>
          <span className="text-xl font-bold text-slate-900">BitPiggy</span>
        </div>
        <button className="p-2">
          <Menu className="h-6 w-6 text-slate-600" />
        </button>
      </header>

      {/* Content */}
      <div className="flex flex-col items-center">
        {/* Piggy Image */}
        <div className="flex justify-center px-4">
          <Image
            src="/piggy/vault.svg"
            alt="Golden Piggy Bank"
            width={320}
            height={280}
            className="object-contain"
          />
        </div>

        {/* Total Savings */}
        <p className="mb-1 text-sm tracking-widest text-slate-500">TOTAL SAVINGS</p>
        <h1 className="mb-2 text-5xl font-bold text-slate-900">
          {totalSavings.btc.toFixed(3)}
          <span className="ml-2 text-3xl text-orange-500">
            {vault.tokens[0]?.symbol || "BTC"}
          </span>
        </h1>
        <div className="mb-6 rounded-full border border-slate-200 bg-white px-4 py-1">
          <span className="text-slate-500">
            ≈ ${totalSavings.usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>

        {/* Progress */}
        <div className="mb-6 w-full max-w-md">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm text-slate-500">Progress</span>
            <span className="text-sm text-slate-500">
              {progressPercent.toFixed(0)}% of {targetBTC} {vault.tokens[0]?.symbol || "BTC"}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-orange-500 transition-all"
              style={{ width: `${progressPercent}%` }}
            ></div>
          </div>
        </div>

        {/* Token Details (if multiple tokens) */}
        {vault.tokens.length > 1 && (
          <div className="mb-6 w-full max-w-md space-y-2">
            {vault.tokens.map((token) => (
              <div
                key={token.token}
                className="flex items-center justify-between rounded-xl bg-white px-4 py-3 shadow-sm"
              >
                <span className="font-medium text-slate-700">{token.symbol || "Unknown"}</span>
                <span className="font-mono text-slate-600">
                  {token.decimals != null
                    ? formatUnitsTruncated(token.balance, token.decimals)
                    : token.balance.toString()}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Vault Status */}
        {vault.broken && (
          <div className="mb-6 w-full max-w-md rounded-xl bg-red-50 px-4 py-3 text-center text-red-600">
            This vault has been broken
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex w-full max-w-md gap-3">
          {/* Deposit Button */}
          <Link
            href="/deposit"
            className="flex flex-1 flex-col items-center justify-center gap-2 rounded-2xl bg-slate-900 py-6 text-white"
          >
            <Plus className="h-6 w-6" />
            <span className="font-semibold">Deposit</span>
          </Link>

          {/* Right Side Buttons */}
          <div className="flex flex-[1.5] flex-col gap-3">
            <Link
              href="/talk"
              className="flex items-center justify-center rounded-2xl border border-blue-200 bg-blue-50 py-3 font-medium text-blue-600"
            >
              Talk to Piggy
            </Link>
            <button
              onClick={() => setBreakDialogOpen(true)}
              className="flex items-center justify-center rounded-2xl border border-red-200 bg-red-50 py-3 font-medium text-red-500"
            >
              Break Piggy
            </button>
          </div>
        </div>

        {/* Refresh Button */}
        <Button
          variant="ghost"
          className="mt-4"
          onClick={refreshVault}
          disabled={loading}
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Break Piggy Confirmation Dialog */}
      <Dialog open={breakDialogOpen} onOpenChange={setBreakDialogOpen}>
        <DialogContent showCloseButton={false} className="max-w-sm rounded-3xl border-0 bg-white p-8 text-center shadow-xl">
          {/* Piggy Icon */}
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-red-50">
            <div className="flex h-12 w-12 items-center justify-center rounded-full border-4 border-red-300">
              <div className="h-3 w-3 rounded-full bg-red-400" />
            </div>
          </div>

          <DialogTitle className="mb-2 text-2xl font-bold text-slate-900">
            Break the Piggy?
          </DialogTitle>
          <DialogDescription className="mb-6 text-slate-500">
            Are you sure? This will withdraw{" "}
            <span className="font-bold text-slate-900">
              {totalSavings.btc.toFixed(4)} {vault?.tokens[0]?.symbol || "BTC"}
            </span>
            .
          </DialogDescription>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1 rounded-xl border-slate-200 py-6 font-semibold text-slate-700 hover:bg-slate-50"
              onClick={() => setBreakDialogOpen(false)}
            >
              Keep Saving
            </Button>
            <Link
              href="/broken"
              className="flex flex-1 items-center justify-center rounded-xl bg-red-500 py-6 font-semibold text-white hover:bg-red-600"
              onClick={() => setBreakDialogOpen(false)}
            >
              Break It
            </Link>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  )
}
