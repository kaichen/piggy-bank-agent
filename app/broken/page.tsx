"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { formatUnits } from "viem"
import { useAccount, useChainId, useConnect, usePublicClient } from "wagmi"
import Link from "next/link"
import { Menu, ArrowLeft, Wallet } from "lucide-react"
import { DotLottieReact } from "@lottiefiles/dotlottie-react"
import { Button } from "@/components/ui/button"
import { HeaderLogo } from "@/components/header-logo"
import { getVaultManagerAddress, type Address } from "@/lib/contracts/addresses"
import { vaultManagerAbi } from "@/lib/contracts/vault-manager"
import { erc20Abi } from "@/lib/contracts/erc20"

const BTC_PRICE = 87500 // Placeholder BTC price in USD

type TokenBalance = {
  token: Address
  symbol: string | null
  decimals: number | null
  balance: bigint
}

export default function BrokenPage() {
  const { address, isConnected } = useAccount()
  const { connect, connectors, isPending } = useConnect()
  const chainId = useChainId()
  const publicClient = usePublicClient()

  const vaultManagerAddress = useMemo(() => getVaultManagerAddress(chainId), [chainId])

  const [vaultId, setVaultId] = useState<bigint | null>(null)
  const [isBroken, setIsBroken] = useState(false)
  const [tokens, setTokens] = useState<TokenBalance[]>([])
  const [loading, setLoading] = useState(true)

  // Fetch vault data
  const fetchVaultData = useCallback(async () => {
    if (!publicClient || !vaultManagerAddress || !address) {
      setLoading(false)
      return
    }

    setLoading(true)

    try {
      // Get vault IDs
      const ids = await publicClient.readContract({
        address: vaultManagerAddress,
        abi: vaultManagerAbi,
        functionName: "getVaultIdsByOwner",
        args: [address],
      })

      const idsArray = Array.from(ids)
      if (!idsArray.length) {
        setLoading(false)
        return
      }

      // Find the first broken vault or use the first vault
      for (const id of idsArray) {
        const vault = await publicClient.readContract({
          address: vaultManagerAddress,
          abi: vaultManagerAbi,
          functionName: "getVault",
          args: [id],
        })

        const broken = (vault as any).broken ?? (vault as any)[2]

        if (broken) {
          setVaultId(id)
          setIsBroken(true)

          // Get token addresses
          const tokenAddresses = await publicClient.readContract({
            address: vaultManagerAddress,
            abi: vaultManagerAbi,
            functionName: "getVaultTokens",
            args: [id],
          })

          // Get token info and balances
          const tokenData: TokenBalance[] = await Promise.all(
            (tokenAddresses as Address[]).map(async (tokenAddr) => {
              const [symbol, decimals, balance] = await Promise.all([
                publicClient.readContract({
                  address: tokenAddr,
                  abi: erc20Abi,
                  functionName: "symbol",
                }).catch(() => null),
                publicClient.readContract({
                  address: tokenAddr,
                  abi: erc20Abi,
                  functionName: "decimals",
                }).catch(() => null),
                publicClient.readContract({
                  address: vaultManagerAddress,
                  abi: vaultManagerAbi,
                  functionName: "vaultTokenBalance",
                  args: [id, tokenAddr],
                }).catch(() => 0n),
              ])

              return {
                token: tokenAddr,
                symbol: symbol as string | null,
                decimals: decimals != null ? Number(decimals) : null,
                balance: balance as bigint,
              }
            })
          )

          setTokens(tokenData)
          break
        }
      }

      // If no broken vault found, use first vault's data
      if (!isBroken && idsArray.length > 0) {
        setVaultId(idsArray[0])
      }
    } catch (err) {
      console.error("Failed to fetch vault data:", err)
    } finally {
      setLoading(false)
    }
  }, [address, isBroken, publicClient, vaultManagerAddress])

  useEffect(() => {
    if (isConnected) {
      fetchVaultData()
    } else {
      setLoading(false)
    }
  }, [isConnected, fetchVaultData])

  // Calculate total available to withdraw
  const totalWithdrawable = useMemo(() => {
    if (!tokens.length) return { amount: 0, usd: 0, symbol: "BTC" }

    const firstToken = tokens[0]
    if (!firstToken || firstToken.decimals == null) return { amount: 0, usd: 0, symbol: "BTC" }

    const amount = Number(formatUnits(firstToken.balance, firstToken.decimals))
    return {
      amount,
      usd: amount * BTC_PRICE,
      symbol: firstToken.symbol || "BTC",
    }
  }, [tokens])

  // Not connected
  if (!isConnected) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-pink-50 to-pink-100">
        <header className="flex h-16 items-center justify-between px-4">
          <HeaderLogo />
          <button className="p-2">
            <Menu className="h-6 w-6 text-slate-600" />
          </button>
        </header>

        <div className="flex flex-col items-center justify-center px-6 py-16">
          <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-orange-100">
            <Wallet className="h-10 w-10 text-orange-500" />
          </div>
          <h1 className="mb-2 text-2xl font-bold text-slate-900">Connect Wallet</h1>
          <p className="mb-8 text-center text-slate-500">
            Connect your wallet to view released funds
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

  // Loading
  if (loading) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-pink-50 to-pink-100">
        <header className="flex h-16 items-center justify-between px-4">
          <HeaderLogo />
          <button className="p-2">
            <Menu className="h-6 w-6 text-slate-600" />
          </button>
        </header>
        <div className="flex flex-col items-center justify-center px-6 py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-orange-500 border-t-transparent" />
          <p className="mt-4 text-slate-500">Loading...</p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-pink-50 to-pink-100">
      {/* Header */}
      <header className="flex h-16 items-center justify-between px-4">
        <HeaderLogo />
        <button className="p-2">
          <Menu className="h-6 w-6 text-slate-600" />
        </button>
      </header>

      {/* Content */}
      <div className="flex flex-col items-center px-6 py-4">
        {/* Back & Title */}
        <div className="mb-6 flex w-full max-w-md items-center">
          <h1 className="text-2xl font-bold text-slate-900">Funds Released</h1>
        </div>

        {/* Broken Piggy Image */}
        <div className="mb-6 overflow-hidden rounded-3xl bg-white shadow-lg">
          <DotLottieReact
            src="/lotties/broken.json"
            loop
            autoplay
            className="w-full"
          />
        </div>

        {/* Progress Bar */}
        <div className="mb-8 w-full max-w-md">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm text-slate-500">Progress</span>
            <span className="text-sm font-medium text-slate-700">Cleared</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
            <div className="h-full w-full rounded-full bg-slate-300" />
          </div>
        </div>

        {/* Available to Withdraw */}
        <p className="mb-2 text-sm text-slate-500">Available to Withdraw</p>
        <h2 className="mb-2 text-5xl font-bold text-slate-900">
          {totalWithdrawable.amount.toFixed(4)}{" "}
          <span className="text-4xl">{totalWithdrawable.symbol}</span>
        </h2>
        <p className="mb-8 text-lg font-medium text-orange-500">
          ≈ ${totalWithdrawable.usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </p>

        {/* Token List (if multiple) */}
        {tokens.length > 1 && (
          <div className="mb-6 w-full max-w-md space-y-2">
            {tokens.map((token) => (
              <div
                key={token.token}
                className="flex items-center justify-between rounded-xl bg-white px-4 py-3 shadow-sm"
              >
                <span className="font-medium text-slate-700">{token.symbol || "Unknown"}</span>
                <span className="font-mono text-slate-600">
                  {token.decimals != null
                    ? Number(formatUnits(token.balance, token.decimals)).toFixed(4)
                    : token.balance.toString()}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Back to Vault Button */}
        <Link
          href="/newplan"
          className="w-full max-w-md rounded-2xl bg-slate-900 py-4 text-center font-semibold text-white hover:bg-slate-800"
        >
          New Plan
        </Link>
      </div>
    </main>
  )
}
