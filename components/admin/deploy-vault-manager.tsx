"use client"

import { useCallback, useMemo, useState } from "react"
import type { Hex } from "viem"
import { deployContract } from "viem/actions"
import { useAccount, useChainId, usePublicClient, useWalletClient } from "wagmi"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getVaultManagerAddress } from "@/lib/contracts/addresses"
import { vaultManagerAbi } from "@/lib/contracts/vault-manager"
import { vaultManagerBytecode } from "@/lib/contracts/vault-manager-bytecode"

function toErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (typeof error === "string") return error
  return "未知错误"
}

export function DeployVaultManager() {
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()

  const configuredAddress = useMemo(() => getVaultManagerAddress(chainId), [chainId])
  const bytecodeReady = useMemo(() => vaultManagerBytecode.length > 2, [])

  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string>("")
  const [error, setError] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<Hex | null>(null)
  const [deployedAddress, setDeployedAddress] = useState<Hex | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  const copy = useCallback(async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(label)
      window.setTimeout(() => setCopied(null), 1500)
    } catch {
      setCopied(null)
    }
  }, [])

  const deploy = useCallback(async () => {
    setError(null)
    setStatus("")
    setTxHash(null)
    setDeployedAddress(null)

    if (!isConnected || !address) return setError("请先连接钱包")
    if (!walletClient || !publicClient) return setError("钱包客户端未就绪")
    if (!bytecodeReady) {
      return setError("缺少合约 bytecode：请先在本地运行 forge build，并执行导出脚本生成前端 bytecode 文件。")
    }

    try {
      setBusy(true)
      setStatus("部署中…请在钱包确认交易")
      const hash = await deployContract(walletClient, {
        abi: vaultManagerAbi,
        bytecode: vaultManagerBytecode,
        args: [],
        account: address,
      })
      setTxHash(hash)

      setStatus("等待链上确认…")
      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      if (!receipt.contractAddress) throw new Error("部署交易未返回 contractAddress")
      setDeployedAddress(receipt.contractAddress)
      setStatus("部署完成")
    } catch (err) {
      setError(toErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }, [address, bytecodeReady, isConnected, publicClient, walletClient])

  const setDeploymentCmd = useMemo(() => {
    if (!deployedAddress || !chainId) return null
    return `node contracts/scripts/set-deployment.mjs ${chainId} ${deployedAddress}`
  }, [chainId, deployedAddress])

  const envLine = useMemo(() => {
    if (!deployedAddress) return null
    return `NEXT_PUBLIC_VAULT_MANAGER_ADDRESS=${deployedAddress}`
  }, [deployedAddress])

  return (
    <Card className="w-full max-w-2xl border-2 border-[#28a0f0]/20 bg-gradient-to-br from-background to-[#28a0f0]/5">
      <CardHeader>
        <CardTitle className="text-xl">合约部署（VaultManager）</CardTitle>
        <CardDescription>使用当前连接的钱包在当前网络部署 VaultManager 合约。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-xl bg-muted/40 p-4 text-sm space-y-1">
          <div>
            <span className="text-muted-foreground">ChainId：</span> <span className="font-mono">{chainId}</span>
          </div>
          <div className="break-all">
            <span className="text-muted-foreground">当前配置地址：</span>{" "}
            <span className="font-mono">{configuredAddress ?? "-"}</span>
          </div>
          <div>
            <span className="text-muted-foreground">前端 Bytecode：</span>{" "}
            <span className="font-mono">{bytecodeReady ? "ready" : "missing"}</span>
          </div>
          {!bytecodeReady ? (
            <div className="text-muted-foreground text-xs">
              需要先生成 `lib/contracts/vault-manager-bytecode.ts`：执行 `cd contracts && forge build && node
              scripts/export-frontend-bytecode.mjs`，并提交该文件。
            </div>
          ) : null}
        </div>

        <Button onClick={deploy} disabled={busy || !isConnected || !walletClient || !publicClient || !bytecodeReady}>
          {busy ? "部署中…" : "部署 VaultManager"}
        </Button>

        {txHash ? (
          <div className="rounded-xl border bg-background p-4 text-sm space-y-2">
            <div className="break-all">
              <span className="text-muted-foreground">Tx：</span> <span className="font-mono">{txHash}</span>
              <Button className="ml-2" variant="outline" size="sm" onClick={() => copy("txHash", txHash)}>
                {copied === "txHash" ? "已复制" : "复制"}
              </Button>
            </div>
            {deployedAddress ? (
              <div className="break-all">
                <span className="text-muted-foreground">Contract：</span>{" "}
                <span className="font-mono">{deployedAddress}</span>
                <Button className="ml-2" variant="outline" size="sm" onClick={() => copy("address", deployedAddress)}>
                  {copied === "address" ? "已复制" : "复制"}
                </Button>
              </div>
            ) : null}
            {envLine ? (
              <div className="break-all">
                <span className="text-muted-foreground">.env.local：</span> <span className="font-mono">{envLine}</span>
                <Button className="ml-2" variant="outline" size="sm" onClick={() => copy("env", envLine)}>
                  {copied === "env" ? "已复制" : "复制"}
                </Button>
              </div>
            ) : null}
            {setDeploymentCmd ? (
              <div className="break-all">
                <span className="text-muted-foreground">写入 deployments：</span>{" "}
                <span className="font-mono">{setDeploymentCmd}</span>
                <Button className="ml-2" variant="outline" size="sm" onClick={() => copy("cmd", setDeploymentCmd)}>
                  {copied === "cmd" ? "已复制" : "复制"}
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}

        {(status || error) && (
          <div className="rounded-xl border bg-background p-4 text-sm space-y-1">
            {status ? (
              <div>
                <span className="text-muted-foreground">状态：</span> {status}
              </div>
            ) : null}
            {error ? (
              <div className="text-destructive">
                <span className="text-muted-foreground">错误：</span> {error}
              </div>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

