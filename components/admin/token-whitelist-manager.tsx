"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import type { Hex } from "viem"
import { isAddress } from "viem"
import { useAccount, useChainId, usePublicClient, useWalletClient } from "wagmi"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { getVaultManagerAddress, type Address } from "@/lib/contracts/addresses"
import { vaultManagerAbi } from "@/lib/contracts/vault-manager"

function toErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (typeof error === "string") return error
  return "未知错误"
}

function sameAddress(a?: string, b?: string) {
  return a?.toLowerCase() === b?.toLowerCase()
}

export function TokenWhitelistManager() {
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()

  const vaultManagerAddress = useMemo(() => getVaultManagerAddress(chainId), [chainId])

  const [tokenAddress, setTokenAddress] = useState("")
  const tokenAddressTrimmed = tokenAddress.trim()
  const tokenAddressValid = isAddress(tokenAddressTrimmed)
  const tokenAddressTyped = (tokenAddressValid ? (tokenAddressTrimmed as Address) : undefined) satisfies Address | undefined

  const [contractOwner, setContractOwner] = useState<Address | null>(null)
  const [isWhitelisted, setIsWhitelisted] = useState<boolean | null>(null)

  const isContractOwner = useMemo(() => sameAddress(address, contractOwner ?? undefined), [address, contractOwner])

  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string>("")
  const [error, setError] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<Hex | null>(null)

  const refresh = useCallback(async () => {
    setError(null)
    setStatus("")

    if (!publicClient || !vaultManagerAddress) {
      setContractOwner(null)
      setIsWhitelisted(null)
      return
    }

    try {
      const owner = (await publicClient.readContract({
        address: vaultManagerAddress,
        abi: vaultManagerAbi,
        functionName: "owner",
      })) as Address
      setContractOwner(owner)
    } catch {
      setContractOwner(null)
    }

    if (!tokenAddressTyped) {
      setIsWhitelisted(null)
      return
    }

    try {
      const allowed = await publicClient.readContract({
        address: vaultManagerAddress,
        abi: vaultManagerAbi,
        functionName: "isTokenWhitelisted",
        args: [tokenAddressTyped],
      })
      setIsWhitelisted(allowed)
    } catch {
      setIsWhitelisted(null)
    }
  }, [publicClient, tokenAddressTyped, vaultManagerAddress])

  useEffect(() => {
    refresh().catch((err) => setError(toErrorMessage(err)))
  }, [refresh])

  const setWhitelist = useCallback(
    async (allowed: boolean) => {
      setError(null)
      setStatus("")
      setTxHash(null)

      if (!isConnected || !address) return setError("请先连接钱包")
      if (!walletClient || !publicClient) return setError("钱包客户端未就绪")
      if (!vaultManagerAddress) return setError("当前网络未配置 VaultManager 地址")
      if (!tokenAddressTyped) return setError("Token 地址不合法")

      if (contractOwner && !sameAddress(contractOwner, address)) {
        return setError("当前钱包不是合约 owner（仅 owner 可修改白名单）")
      }

      try {
        setBusy(true)
        setStatus(allowed ? "加入白名单中…" : "移出白名单中…")

        const hash = await (walletClient as any).writeContract({
          address: vaultManagerAddress,
          abi: vaultManagerAbi,
          functionName: "setTokenWhitelist",
          args: [tokenAddressTyped, allowed],
          account: address,
        })

        setTxHash(hash)
        await publicClient.waitForTransactionReceipt({ hash })
        setStatus("已确认")
        await refresh()
      } catch (err) {
        setError(toErrorMessage(err))
      } finally {
        setBusy(false)
      }
    },
    [address, contractOwner, isConnected, publicClient, refresh, tokenAddressTyped, vaultManagerAddress, walletClient],
  )

  return (
    <Card className="w-full max-w-2xl border-2 border-[#28a0f0]/20 bg-gradient-to-br from-background to-[#28a0f0]/5">
      <CardHeader>
        <CardTitle className="text-xl">Token 白名单管理</CardTitle>
        <CardDescription>修改 VaultManager 的 ERC20 白名单（仅合约 owner 可操作）。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-xl bg-muted/40 p-4 text-sm space-y-1">
          <div>
            <span className="text-muted-foreground">ChainId：</span> <span className="font-mono">{chainId}</span>
          </div>
          <div className="break-all">
            <span className="text-muted-foreground">VaultManager：</span>{" "}
            <span className="font-mono">{vaultManagerAddress ?? "-"}</span>
          </div>
          <div className="break-all">
            <span className="text-muted-foreground">合约 owner：</span>{" "}
            <span className="font-mono">{contractOwner ?? "-"}</span>{" "}
            {contractOwner && address ? (
              <span className={isContractOwner ? "text-[#28a0f0]" : "text-muted-foreground"}>
                ({isContractOwner ? "当前钱包是 owner" : "当前钱包不是 owner"})
              </span>
            ) : null}
          </div>
        </div>

        {!vaultManagerAddress ? (
          <div className="text-sm text-muted-foreground">
            请先配置 VaultManager 地址（提交 `contracts/deployments/vault-manager.json` 或设置{" "}
            <span className="font-mono">NEXT_PUBLIC_VAULT_MANAGER_ADDRESS</span>）。
          </div>
        ) : null}

        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">Token 地址</label>
          <Input
            value={tokenAddress}
            onChange={(e) => setTokenAddress(e.target.value)}
            placeholder="0x…"
            className={tokenAddress && !tokenAddressValid ? "border-destructive" : ""}
          />
          <div className="text-xs text-muted-foreground">
            当前状态：{isWhitelisted == null ? "-" : isWhitelisted ? "已在白名单" : "不在白名单"}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => setWhitelist(true)}
            disabled={busy || !isConnected || !tokenAddressTyped || !vaultManagerAddress || !isContractOwner}
          >
            加入白名单
          </Button>
          <Button
            variant="outline"
            onClick={() => setWhitelist(false)}
            disabled={busy || !isConnected || !tokenAddressTyped || !vaultManagerAddress || !isContractOwner}
          >
            移出白名单
          </Button>
          <Button variant="ghost" onClick={() => refresh().catch((err) => setError(toErrorMessage(err)))} disabled={busy}>
            刷新
          </Button>
        </div>

        {(status || error || txHash) && (
          <div className="rounded-xl border bg-background p-4 text-sm space-y-1">
            {status ? (
              <div>
                <span className="text-muted-foreground">状态：</span> {status}
              </div>
            ) : null}
            {txHash ? (
              <div className="break-all">
                <span className="text-muted-foreground">Tx：</span> <span className="font-mono">{txHash}</span>
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

