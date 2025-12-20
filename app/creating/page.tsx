"use client"

import { Suspense, useCallback, useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useAccount, useChainId, usePublicClient, useWalletClient } from "wagmi"
import { parseUnits, type Hash } from "viem"
import { Check, Menu } from "lucide-react"
import { DotLottieReact } from "@lottiefiles/dotlottie-react"
import { Button } from "@/components/ui/button"
import { HeaderLogo } from "@/components/header-logo"
import { getVaultManagerAddress, type Address } from "@/lib/contracts/addresses"
import { vaultManagerAbi } from "@/lib/contracts/vault-manager"
import { erc20Abi } from "@/lib/contracts/erc20"

type Step = "approve" | "createVault" | "confirm"
type TxStatus = "pending" | "signing" | "mempool" | "confirmed" | "error"

type TransactionState = {
  status: TxStatus
  hash?: Hash
  blockNumber?: bigint
  error?: string
}

const STEPS: { key: Step; label: string }[] = [
  { key: "approve", label: "Approve" },
  { key: "createVault", label: "Create Vault" },
  { key: "confirm", label: "Confirm" },
]

export default function CreatingPage() {
  return (
    <Suspense
      fallback={
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
      }
    >
      <CreatingContent />
    </Suspense>
  )
}

function CreatingContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()

  const vaultManagerAddress = useMemo(() => getVaultManagerAddress(chainId), [chainId])

  // Get params from URL (set by setgoal page)
  const tokenAddress = searchParams.get("token") as Address | null
  const unlockDays = searchParams.get("days")
  const initialDeposit = searchParams.get("deposit")

  // Transaction states
  const [approveTx, setApproveTx] = useState<TransactionState>({ status: "pending" })
  const [createTx, setCreateTx] = useState<TransactionState>({ status: "pending" })
  const [currentStep, setCurrentStep] = useState<Step>("approve")
  const [logs, setLogs] = useState<string[]>([])
  const [isComplete, setIsComplete] = useState(false)

  // Add log message
  const addLog = useCallback((message: string) => {
    setLogs((prev) => [...prev, message])
  }, [])

  // Execute approve transaction
  const executeApprove = useCallback(async () => {
    if (!walletClient || !publicClient || !address || !tokenAddress || !vaultManagerAddress || !initialDeposit) {
      return
    }

    setApproveTx({ status: "signing" })
    setCurrentStep("approve")
    addLog("> Requesting token approval...")

    try {
      // Get token decimals
      const decimals = await publicClient.readContract({
        address: tokenAddress,
        abi: erc20Abi,
        functionName: "decimals",
      })

      const amount = parseUnits(initialDeposit, Number(decimals))

      addLog("> Signing approval transaction...")
      const hash = await walletClient.writeContract({
        address: tokenAddress,
        abi: erc20Abi,
        functionName: "approve",
        args: [vaultManagerAddress, amount],
        account: address,
      })

      setApproveTx({ status: "mempool", hash })
      addLog("> Broadcasted to network (Mempool)")
      addLog("> Waiting for confirmation...")

      const receipt = await publicClient.waitForTransactionReceipt({ hash })

      setApproveTx({
        status: "confirmed",
        hash,
        blockNumber: receipt.blockNumber,
      })
      addLog("> Approval confirmed!")
    } catch (err) {
      setApproveTx({
        status: "error",
        error: err instanceof Error ? err.message : "Approval failed",
      })
      addLog(`> Error: ${err instanceof Error ? err.message : "Approval failed"}`)
    }
  }, [address, addLog, initialDeposit, publicClient, tokenAddress, vaultManagerAddress, walletClient])

  // Execute create vault transaction
  const executeCreateVault = useCallback(async () => {
    if (!walletClient || !publicClient || !address || !tokenAddress || !vaultManagerAddress || !unlockDays || !initialDeposit) {
      return
    }

    setCreateTx({ status: "signing" })
    setCurrentStep("createVault")
    addLog("> Preparing vault creation...")

    try {
      // Get token decimals
      const decimals = await publicClient.readContract({
        address: tokenAddress,
        abi: erc20Abi,
        functionName: "decimals",
      })

      const amount = parseUnits(initialDeposit, Number(decimals))
      const unlockTimestamp = BigInt(Math.floor(Date.now() / 1000) + Number(unlockDays) * 24 * 60 * 60)

      addLog("> Signing vault creation transaction...")
      const hash = await walletClient.writeContract({
        address: vaultManagerAddress,
        abi: vaultManagerAbi,
        functionName: "createVault",
        args: [unlockTimestamp, tokenAddress, amount],
        account: address,
      })

      setCreateTx({ status: "mempool", hash })
      addLog("> Broadcasted to network (Mempool)")
      addLog("> Waiting for block confirmation...")

      const receipt = await publicClient.waitForTransactionReceipt({ hash })

      setCreateTx({
        status: "confirmed",
        hash,
        blockNumber: receipt.blockNumber,
      })
      setCurrentStep("confirm")
      addLog(`> Included in block #${receipt.blockNumber}`)
      addLog("> Vault created successfully!")
      setIsComplete(true)
    } catch (err) {
      setCreateTx({
        status: "error",
        error: err instanceof Error ? err.message : "Vault creation failed",
      })
      addLog(`> Error: ${err instanceof Error ? err.message : "Vault creation failed"}`)
    }
  }, [address, addLog, initialDeposit, publicClient, tokenAddress, unlockDays, vaultManagerAddress, walletClient])

  // Start the process when component mounts
  useEffect(() => {
    if (isConnected && tokenAddress && walletClient) {
      executeApprove()
    }
  }, [isConnected, tokenAddress, walletClient, executeApprove])

  // Auto-start create vault after approve is confirmed
  useEffect(() => {
    if (approveTx.status === "confirmed" && createTx.status === "pending") {
      // Small delay before starting next transaction
      const timer = setTimeout(() => {
        executeCreateVault()
      }, 1000)
      return () => clearTimeout(timer)
    }
  }, [approveTx.status, createTx.status, executeCreateVault])

  // Current active transaction for display
  const activeTx = currentStep === "approve" ? approveTx : createTx
  const isSuccess = isComplete && createTx.status === "confirmed"
  const hasError = approveTx.status === "error" || createTx.status === "error"

  // Format transaction ID for display
  const displayTxId = activeTx.hash ? `${activeTx.hash.slice(0, 10)}...` : ""

  // Button handler
  const handleButtonClick = () => {
    if (isSuccess) {
      router.push("/vault")
    } else if (hasError) {
      // Retry - reset and start over
      setApproveTx({ status: "pending" })
      setCreateTx({ status: "pending" })
      setCurrentStep("approve")
      setLogs([])
      setIsComplete(false)
      executeApprove()
    }
  }

  // Button text
  const buttonText = isSuccess
    ? "Visit Dashboard"
    : hasError
      ? "Retry"
      : currentStep === "approve"
        ? "Approving Token..."
        : currentStep === "createVault"
          ? "Creating Vault..."
          : "Confirming..."

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
      <div className="flex flex-col items-center px-6 py-6">
        {/* Success Icon */}
        <div className="mb-6 flex flex-col items-center">
          <div className="relative flex h-48 w-48 items-center justify-center">
            {isSuccess ? (
              <DotLottieReact
                src="/lotties/fly.json"
                loop
                autoplay
                style={{ width: "192px", height: "192px" }}
              />
            ) : hasError ? (
              <div
                className={`flex h-28 w-28 items-center justify-center rounded-full border-4 border-red-300`}
              >
                <div className={`flex h-16 w-16 items-center justify-center rounded-full bg-red-500`}>
                  <span className="text-2xl text-white">!</span>
                </div>
              </div>
            ) : (
              <DotLottieReact
                src="/lotties/jump.json"
                loop
                autoplay
                style={{ width: "192px", height: "192px" }}
              />
            )}
          </div>

          {/* Title */}
          <h1 className="mt-6 text-3xl font-bold text-slate-900">
            {isSuccess ? "Success!" : hasError ? "Failed" : "Processing..."}
          </h1>
          <p className="mt-2 text-slate-500">
            {isSuccess
              ? "Funds secured on blockchain"
              : hasError
                ? "Transaction failed"
                : currentStep === "approve"
                  ? "Approving token transfer"
                  : currentStep === "createVault"
                    ? "Creating your vault"
                    : "Finalizing..."}
          </p>
        </div>

        {/* Step Indicators */}
        <div className="relative mb-8 w-full max-w-md">
          {/* Progress line background */}
          <div className="absolute left-[16.67%] right-[16.67%] top-5 h-0.5 bg-slate-200" />
          {/* Progress line filled */}
          <div
            className="absolute left-[16.67%] top-5 h-0.5 bg-orange-500 transition-all duration-500"
            style={{
              width:
                currentStep === "approve"
                  ? "0%"
                  : currentStep === "createVault"
                    ? "33.33%"
                    : "66.67%",
            }}
          />
          {/* Steps */}
          <div className="relative flex items-start justify-between px-4">
            {STEPS.map((step, index) => {
              const stepIndex = STEPS.findIndex((s) => s.key === currentStep)
              const isActive = index <= stepIndex

              return (
                <div key={step.key} className="flex flex-col items-center">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold ${
                      isActive ? "bg-orange-500 text-white" : "bg-slate-200 text-slate-400"
                    }`}
                  >
                    {index + 1}
                  </div>
                  <span
                    className={`mt-2 text-xs ${isActive ? "font-medium text-slate-700" : "text-slate-400"}`}
                  >
                    {step.label}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Transaction Details Card */}
        <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-lg">
          {/* Card Header */}
          <div className="flex items-center justify-between bg-slate-800 px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-green-500" />
              <span className="text-xs font-semibold tracking-wider text-green-400">LIVE MAINNET</span>
            </div>
            {displayTxId && <span className="font-mono text-xs text-slate-400">ID: {displayTxId}</span>}
          </div>

          {/* Card Content */}
          <div className="divide-y divide-slate-100">
            {/* Status */}
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-slate-500">Status</span>
              <span
                className={`font-semibold ${
                  activeTx.status === "confirmed"
                    ? "text-green-500"
                    : activeTx.status === "error"
                      ? "text-red-500"
                      : "text-orange-500"
                }`}
              >
                {activeTx.status === "confirmed"
                  ? "Confirmed"
                  : activeTx.status === "error"
                    ? "Failed"
                    : activeTx.status === "mempool"
                      ? "In Mempool"
                      : "Signing..."}
              </span>
            </div>

            {/* Block Height */}
            {activeTx.blockNumber && (
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-slate-500">Block Height</span>
                <span className="font-mono font-semibold text-slate-900">
                  {activeTx.blockNumber.toLocaleString()}
                </span>
              </div>
            )}

            {/* Amount */}
            {initialDeposit && (
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-slate-500">Amount</span>
                <span className="font-semibold text-slate-900">{initialDeposit} BTC</span>
              </div>
            )}

            {/* Network Fee - placeholder */}
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-slate-500">Network Fee</span>
              <span className="font-mono text-slate-600">0.00004500 BTC</span>
            </div>

            {/* Log Messages */}
            <div className="bg-slate-50 px-4 py-3">
              <div className="space-y-1 font-mono text-xs text-slate-500">
                {logs.map((log, i) => (
                  <div key={i}>{log}</div>
                ))}
                {!isComplete && !hasError && (
                  <div className="animate-pulse">{">"} Processing...</div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Button */}
        <div className="mt-6 w-full max-w-md">
          <Button
            onClick={handleButtonClick}
            disabled={!isSuccess && !hasError}
            className={`w-full rounded-2xl py-6 text-lg font-semibold ${
              isSuccess
                ? "bg-slate-900 text-white hover:bg-slate-800"
                : hasError
                  ? "bg-red-500 text-white hover:bg-red-600"
                  : "bg-slate-200 text-slate-400"
            }`}
          >
            {buttonText}
          </Button>
        </div>
      </div>
    </main>
  )
}
