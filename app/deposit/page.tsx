"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { formatUnits, parseUnits } from "viem"
import { useAccount, useChainId, useConnect, usePublicClient, useWalletClient } from "wagmi"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Menu, Check, Wallet, RefreshCw, ArrowLeft } from "lucide-react"
import { DotLottieReact } from "@lottiefiles/dotlottie-react"
import { Button } from "@/components/ui/button"
import { getVaultManagerAddress, type Address } from "@/lib/contracts/addresses"
import { vaultManagerAbi } from "@/lib/contracts/vault-manager"
import { erc20Abi } from "@/lib/contracts/erc20"

const BTC_PRICE = 87500 // Placeholder BTC price in USD
const QUICK_AMOUNTS = ["0.001", "0.005", "0.010"]

type WhitelistedToken = {
  address: Address
  symbol: string | null
  decimals: number | null
}

export default function DepositPage() {
  const router = useRouter()
  const { address, isConnected } = useAccount()
  const { connect, connectors, isPending: connectPending } = useConnect()
  const chainId = useChainId()
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()

  const vaultManagerAddress = useMemo(() => getVaultManagerAddress(chainId), [chainId])

  // State
  const [vaultId, setVaultId] = useState<bigint | null>(null)
  const [amount, setAmount] = useState("")
  const [selectedToken, setSelectedToken] = useState<WhitelistedToken | null>(null)
  const [whitelistedTokens, setWhitelistedTokens] = useState<WhitelistedToken[]>([])
  const [tokenBalance, setTokenBalance] = useState<bigint | null>(null)
  const [allowance, setAllowance] = useState<bigint | null>(null)
  const [loading, setLoading] = useState(false)
  const [approving, setApproving] = useState(false)
  const [depositing, setDepositing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<string | null>(null)

  // Parsed amount
  const parsedAmount = useMemo(() => {
    if (!amount || !selectedToken?.decimals) return null
    try {
      return parseUnits(amount, selectedToken.decimals)
    } catch {
      return null
    }
  }, [amount, selectedToken?.decimals])

  // USD equivalent
  const usdAmount = useMemo(() => {
    const num = parseFloat(amount)
    if (!Number.isFinite(num)) return 0
    return num * BTC_PRICE
  }, [amount])

  // Check if approval needed
  const needsApproval = useMemo(() => {
    if (!parsedAmount || !allowance) return true
    return allowance < parsedAmount
  }, [parsedAmount, allowance])

  // Fetch user's first vault
  const fetchVaultId = useCallback(async () => {
    if (!publicClient || !vaultManagerAddress || !address) return

    try {
      const ids = await publicClient.readContract({
        address: vaultManagerAddress,
        abi: vaultManagerAbi,
        functionName: "getVaultIdsByOwner",
        args: [address],
      })
      const idsArray = Array.from(ids)
      if (idsArray.length > 0) {
        setVaultId(idsArray[0])
      }
    } catch (err) {
      console.error("Failed to fetch vault IDs:", err)
    }
  }, [address, publicClient, vaultManagerAddress])

  // Fetch whitelisted tokens
  const fetchWhitelistedTokens = useCallback(async () => {
    if (!publicClient || !vaultManagerAddress) return

    setLoading(true)
    try {
      // For demo, use a known token list or fetch from events
      // Here we'll try to get the first token from vault if exists
      if (vaultId) {
        const tokenAddresses = await publicClient.readContract({
          address: vaultManagerAddress,
          abi: vaultManagerAbi,
          functionName: "getVaultTokens",
          args: [vaultId],
        })

        if ((tokenAddresses as Address[]).length > 0) {
          const tokens: WhitelistedToken[] = await Promise.all(
            (tokenAddresses as Address[]).map(async (tokenAddr) => {
              const [symbol, decimals] = await Promise.all([
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
              ])
              return {
                address: tokenAddr,
                symbol: symbol as string | null,
                decimals: decimals != null ? Number(decimals) : null,
              }
            })
          )
          setWhitelistedTokens(tokens)
          if (tokens.length > 0 && !selectedToken) {
            setSelectedToken(tokens[0])
          }
        }
      }
    } catch (err) {
      console.error("Failed to fetch tokens:", err)
    } finally {
      setLoading(false)
    }
  }, [publicClient, vaultManagerAddress, vaultId, selectedToken])

  // Fetch token balance and allowance
  const fetchTokenInfo = useCallback(async () => {
    if (!publicClient || !address || !selectedToken?.address || !vaultManagerAddress) return

    try {
      const [balance, currentAllowance] = await Promise.all([
        publicClient.readContract({
          address: selectedToken.address,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [address],
        }),
        publicClient.readContract({
          address: selectedToken.address,
          abi: erc20Abi,
          functionName: "allowance",
          args: [address, vaultManagerAddress],
        }),
      ])
      setTokenBalance(balance)
      setAllowance(currentAllowance)
    } catch (err) {
      console.error("Failed to fetch token info:", err)
    }
  }, [address, publicClient, selectedToken?.address, vaultManagerAddress])

  // Approve token
  const handleApprove = useCallback(async () => {
    if (!walletClient || !publicClient || !address || !selectedToken?.address || !vaultManagerAddress || !parsedAmount) {
      return
    }

    setError(null)
    setApproving(true)

    try {
      const hash = await walletClient.writeContract({
        address: selectedToken.address,
        abi: erc20Abi,
        functionName: "approve",
        args: [vaultManagerAddress, parsedAmount],
        account: address,
      })

      setTxHash(hash)
      await publicClient.waitForTransactionReceipt({ hash })
      await fetchTokenInfo()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approval failed")
    } finally {
      setApproving(false)
    }
  }, [address, fetchTokenInfo, parsedAmount, publicClient, selectedToken?.address, vaultManagerAddress, walletClient])

  // Deposit to vault
  const handleDeposit = useCallback(async () => {
    if (!walletClient || !publicClient || !address || !selectedToken?.address || !vaultManagerAddress || !parsedAmount || !vaultId) {
      return
    }

    setError(null)
    setDepositing(true)

    try {
      const hash = await walletClient.writeContract({
        address: vaultManagerAddress,
        abi: vaultManagerAbi,
        functionName: "deposit",
        args: [vaultId, selectedToken.address, parsedAmount],
        account: address,
      })

      setTxHash(hash)
      await publicClient.waitForTransactionReceipt({ hash })

      // Success - redirect to vault page
      router.push("/vault")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deposit failed")
    } finally {
      setDepositing(false)
    }
  }, [address, parsedAmount, publicClient, router, selectedToken?.address, vaultId, vaultManagerAddress, walletClient])

  // Effects
  useEffect(() => {
    if (isConnected) {
      fetchVaultId()
    }
  }, [isConnected, fetchVaultId])

  useEffect(() => {
    if (vaultId) {
      fetchWhitelistedTokens()
    }
  }, [vaultId, fetchWhitelistedTokens])

  useEffect(() => {
    if (selectedToken) {
      fetchTokenInfo()
    }
  }, [selectedToken, fetchTokenInfo])

  // Quick select handler
  const handleQuickSelect = (value: string) => {
    setAmount(value)
  }

  // Validation
  const canDeposit = useMemo(() => {
    if (!parsedAmount || parsedAmount <= 0n) return false
    if (!vaultId) return false
    if (!selectedToken) return false
    if (tokenBalance && parsedAmount > tokenBalance) return false
    if (needsApproval) return false
    return true
  }, [parsedAmount, vaultId, selectedToken, tokenBalance, needsApproval])

  const isProcessing = approving || depositing

  // Not connected
  if (!isConnected) {
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
            <Wallet className="h-10 w-10 text-orange-500" />
          </div>
          <h1 className="mb-2 text-2xl font-bold text-slate-900">Connect Wallet</h1>
          <p className="mb-8 text-center text-slate-500">
            Connect your wallet to make a deposit
          </p>
          <div className="w-full max-w-sm space-y-3">
            {connectors.map((connector) => (
              <Button
                key={connector.uid}
                variant="outline"
                className="w-full justify-start gap-3 rounded-xl border-slate-200 bg-white py-6 hover:bg-slate-50"
                onClick={() => connect({ connector })}
                disabled={connectPending}
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

  // No vault
  if (!vaultId && !loading) {
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
            Create a piggy bank first before making deposits
          </p>
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

      {/* Back button */}
      <div className="px-4 py-2">
        <Link href="/vault" className="inline-flex items-center text-slate-500 hover:text-slate-700">
          <ArrowLeft className="mr-1 h-4 w-4" />
          <span className="text-sm">Back</span>
        </Link>
      </div>

      {/* Divider */}
      <div className="mx-4 border-t border-slate-200" />

      {/* Content */}
      <div className="flex flex-col items-center px-6 py-8">
        {/* Piggy Icon with Plus */}
        <div className="relative mb-8">
          <div className="flex h-32 w-32 items-center justify-center">
            <DotLottieReact
              src="/lotties/piggy-deposit.json"
              loop
              autoplay
              style={{ width: "128px", height: "128px" }}
            />
          </div>
        </div>

        {/* Quick Select */}
        <div className="mb-6 w-full max-w-md">
          <p className="mb-3 text-sm font-medium tracking-widest text-slate-500">QUICK SELECT</p>
          <div className="grid grid-cols-3 gap-3">
            {QUICK_AMOUNTS.map((quickAmount) => (
              <button
                key={quickAmount}
                onClick={() => handleQuickSelect(quickAmount)}
                className={`rounded-2xl border-2 py-4 text-lg font-medium transition-colors ${
                  amount === quickAmount
                    ? "border-orange-500 bg-orange-50 text-orange-600"
                    : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                }`}
              >
                {quickAmount}
              </button>
            ))}
          </div>
        </div>

        {/* Custom Amount */}
        <div className="mb-4 w-full max-w-md">
          <p className="mb-3 text-sm font-medium tracking-widest text-slate-500">CUSTOM AMOUNT</p>
          <div className="flex items-center rounded-2xl bg-slate-100 px-6 py-4">
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.0000"
              className="flex-1 bg-transparent text-center text-4xl font-bold text-slate-400 placeholder-slate-300 outline-none"
            />
            <span className="ml-4 text-lg font-medium text-slate-500">
              {selectedToken?.symbol || "BTC"}
            </span>
          </div>
        </div>

        {/* USD Equivalent */}
        <p className="mb-6 text-slate-500">
          ≈ ${usdAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
        </p>

        {/* Balance Info */}
        {tokenBalance != null && selectedToken?.decimals != null && (
          <p className="mb-4 text-sm text-slate-500">
            Balance: {formatUnits(tokenBalance, selectedToken.decimals)} {selectedToken.symbol}
          </p>
        )}

        {/* Error Message */}
        {error && (
          <div className="mb-4 w-full max-w-md rounded-xl bg-red-50 px-4 py-3 text-center text-red-600">
            {error}
          </div>
        )}

        {/* Action Buttons */}
        <div className="w-full max-w-md space-y-3">
          {needsApproval && parsedAmount && parsedAmount > 0n ? (
            <Button
              onClick={handleApprove}
              disabled={isProcessing || !parsedAmount}
              className="w-full rounded-2xl bg-orange-500 py-6 text-lg font-semibold text-white hover:bg-orange-600 disabled:bg-slate-200 disabled:text-slate-400"
            >
              {approving ? (
                <>
                  <RefreshCw className="mr-2 h-5 w-5 animate-spin" />
                  Approving...
                </>
              ) : (
                "Approve Token"
              )}
            </Button>
          ) : (
            <Button
              onClick={handleDeposit}
              disabled={!canDeposit || isProcessing}
              className="w-full rounded-2xl bg-slate-200 py-6 text-lg font-semibold text-slate-400 hover:bg-slate-900 hover:text-white disabled:bg-slate-200 disabled:text-slate-400"
            >
              {depositing ? (
                <>
                  <RefreshCw className="mr-2 h-5 w-5 animate-spin" />
                  Depositing...
                </>
              ) : (
                <>
                  <Check className="mr-2 h-5 w-5" />
                  Confirm Deposit
                </>
              )}
            </Button>
          )}
        </div>

        {/* Transaction Hash */}
        {txHash && (
          <p className="mt-4 break-all text-center text-xs text-slate-400">
            Tx: {txHash}
          </p>
        )}
      </div>
    </main>
  )
}
