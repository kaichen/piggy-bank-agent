"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { isAddress, parseUnits, formatUnits } from "viem"
import { useAccount, useChainId, usePublicClient, useWalletClient } from "wagmi"
import { ChevronDown, RefreshCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { erc20Abi } from "@/lib/contracts/erc20"
import { getVaultManagerAddress, type Address } from "@/lib/contracts/addresses"
import { vaultManagerAbi } from "@/lib/contracts/vault-manager"

type Hex = `0x${string}`

function toErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (typeof error === "string") return error
  return "未知错误"
}

export function VaultManagerDemo() {
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()

  const vaultManagerAddress = useMemo(() => getVaultManagerAddress(chainId), [chainId])

  const [unlockMinutes, setUnlockMinutes] = useState("10")
  const [tokenAddress, setTokenAddress] = useState("")
  const [amount, setAmount] = useState("")

  const [txHash, setTxHash] = useState<Hex | null>(null)
  const [status, setStatus] = useState<string>("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [tokenSymbol, setTokenSymbol] = useState<string | null>(null)
  const [tokenDecimals, setTokenDecimals] = useState<number | null>(null)
  const [tokenWhitelisted, setTokenWhitelisted] = useState<boolean | null>(null)
  const [allowance, setAllowance] = useState<bigint | null>(null)
  const [tokenBalance, setTokenBalance] = useState<bigint | null>(null)

  const [whitelistLoading, setWhitelistLoading] = useState(false)
  const [whitelistError, setWhitelistError] = useState<string | null>(null)
  const [whitelistedTokens, setWhitelistedTokens] = useState<Array<{ address: Address; symbol: string | null }>>([])

  const [myVaultIds, setMyVaultIds] = useState<bigint[]>([])
  const [lastCreatedVaultId, setLastCreatedVaultId] = useState<bigint | null>(null)
  const [vaultDetails, setVaultDetails] = useState<Map<string, {
    owner: Address
    unlockTimestamp: bigint
    broken: boolean
    tokens: Array<{ address: Address; symbol: string; decimals: number; balance: bigint }>
  }>>(new Map())
  const [vaultDetailsLoading, setVaultDetailsLoading] = useState(false)

  const [breakVaultId, setBreakVaultId] = useState("")
  const [breakVaultPreview, setBreakVaultPreview] = useState<{
    owner: Address
    unlockTimestamp: bigint
    broken: boolean
  } | null>(null)

  const normalizedTokenAddress = tokenAddress.trim()
  const tokenAddressValid = isAddress(normalizedTokenAddress)
  const tokenAddressTyped = (tokenAddressValid ? (normalizedTokenAddress as Address) : undefined) satisfies Address | undefined

  const unlockTimestamp = useMemo(() => {
    const minutes = Number(unlockMinutes)
    if (!Number.isFinite(minutes) || minutes <= 0) return null
    const secondsFromNow = Math.floor(minutes * 60)
    return BigInt(Math.floor(Date.now() / 1000) + secondsFromNow)
  }, [unlockMinutes])

  const parsedAmount = useMemo(() => {
    if (!amount || tokenDecimals == null) return null
    try {
      return parseUnits(amount, tokenDecimals)
    } catch {
      return null
    }
  }, [amount, tokenDecimals])

  const refreshVaultIds = useCallback(async () => {
    if (!publicClient || !vaultManagerAddress || !address) return []
    const ids = await publicClient.readContract({
      address: vaultManagerAddress,
      abi: vaultManagerAbi,
      functionName: "getVaultIdsByOwner",
      args: [address],
    })
    setMyVaultIds(ids)

    // 获取每个 vault 的详细信息
    if (ids.length > 0) {
      setVaultDetailsLoading(true)
      try {
        const details = await Promise.all(
          ids.map(async (vaultId) => {
            const [vault, tokenAddrs] = await Promise.all([
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

            const tokens = await Promise.all(
              tokenAddrs.map(async (tokenAddr) => {
                const [symbol, decimalsRaw, balance] = await Promise.all([
                  publicClient.readContract({
                    address: tokenAddr,
                    abi: erc20Abi,
                    functionName: "symbol",
                  }).catch(() => "???"),
                  publicClient.readContract({
                    address: tokenAddr,
                    abi: erc20Abi,
                    functionName: "decimals",
                  }).catch(() => 18),
                  publicClient.readContract({
                    address: vaultManagerAddress,
                    abi: vaultManagerAbi,
                    functionName: "vaultTokenBalance",
                    args: [vaultId, tokenAddr],
                  }),
                ])
                const decimals = typeof decimalsRaw === "bigint" ? Number(decimalsRaw) : decimalsRaw
                return { address: tokenAddr as Address, symbol: symbol as string, decimals, balance }
              })
            )

            return {
              id: vaultId.toString(),
              owner: ((vault as any).owner ?? (vault as any)[0]) as Address,
              unlockTimestamp: ((vault as any).unlockTimestamp ?? (vault as any)[1]) as bigint,
              broken: ((vault as any).broken ?? (vault as any)[2]) as boolean,
              tokens,
            }
          })
        )

        const newMap = new Map<string, typeof details[number]>()
        for (const d of details) {
          newMap.set(d.id, d)
        }
        setVaultDetails(newMap)
      } finally {
        setVaultDetailsLoading(false)
      }
    } else {
      setVaultDetails(new Map())
    }

    return ids
  }, [address, publicClient, vaultManagerAddress])

  const refreshWhitelist = useCallback(async () => {
    setWhitelistError(null)
    setWhitelistLoading(true)

    try {
      if (!publicClient || !vaultManagerAddress) {
        setWhitelistedTokens([])
        return
      }

      const tokens = await publicClient.readContract({
        address: vaultManagerAddress,
        abi: vaultManagerAbi,
        functionName: "getWhitelistedTokens",
      })

      const infos = await Promise.all(
        tokens.map(async (token) => {
          let symbol: string | null = null
          try {
            symbol = await publicClient.readContract({
              address: token,
              abi: erc20Abi,
              functionName: "symbol",
            })
          } catch {
            symbol = null
          }
          return { address: token as Address, symbol }
        }),
      )

      setWhitelistedTokens(infos)
    } catch (err) {
      const message = toErrorMessage(err)
      if (message.includes("getWhitelistedTokens") && message.includes("reverted")) {
        setWhitelistError("合约不支持 getWhitelistedTokens（旧版本/地址或网络不匹配），请重新部署最新版 VaultManager 并更新地址")
      } else {
        setWhitelistError(message)
      }
      setWhitelistedTokens([])
    } finally {
      setWhitelistLoading(false)
    }
  }, [publicClient, vaultManagerAddress])

  const refreshTokenInfo = useCallback(async () => {
    setTokenSymbol(null)
    setTokenDecimals(null)
    setTokenWhitelisted(null)
    setAllowance(null)
    setTokenBalance(null)

    if (!publicClient || !vaultManagerAddress || !tokenAddressTyped) return

    const [decimalsRaw, symbol, whitelisted] = await Promise.all([
      publicClient.readContract({
        address: tokenAddressTyped,
        abi: erc20Abi,
        functionName: "decimals",
      }),
      publicClient.readContract({
        address: tokenAddressTyped,
        abi: erc20Abi,
        functionName: "symbol",
      }),
      publicClient.readContract({
        address: vaultManagerAddress,
        abi: vaultManagerAbi,
        functionName: "isTokenWhitelisted",
        args: [tokenAddressTyped],
      }),
    ])

    const decimals = typeof decimalsRaw === "bigint" ? Number(decimalsRaw) : decimalsRaw
    setTokenDecimals(decimals)
    setTokenSymbol(symbol)
    setTokenWhitelisted(whitelisted)

    if (!address) return
    const [currentAllowance, balance] = await Promise.all([
      publicClient.readContract({
        address: tokenAddressTyped,
        abi: erc20Abi,
        functionName: "allowance",
        args: [address, vaultManagerAddress],
      }),
      publicClient.readContract({
        address: tokenAddressTyped,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [address],
      }),
    ])
    setAllowance(currentAllowance)
    setTokenBalance(balance)
  }, [address, publicClient, tokenAddressTyped, vaultManagerAddress])

  useEffect(() => {
    refreshWhitelist().catch(() => undefined)
  }, [refreshWhitelist])

  useEffect(() => {
    if (!tokenAddress.trim() && whitelistedTokens.length) {
      setTokenAddress(whitelistedTokens[0].address)
    }
  }, [tokenAddress, whitelistedTokens])

  useEffect(() => {
    setError(null)
    if (!tokenAddressValid) {
      setTokenSymbol(null)
      setTokenDecimals(null)
      setTokenWhitelisted(null)
      setAllowance(null)
      return
    }
    refreshTokenInfo().catch((err) => setError(toErrorMessage(err)))
  }, [refreshTokenInfo, tokenAddressValid])

  useEffect(() => {
    if (!isConnected) {
      setMyVaultIds([])
      setLastCreatedVaultId(null)
      return
    }
    refreshVaultIds().catch(() => undefined)
  }, [isConnected, refreshVaultIds])

  const formatAddress = useCallback((addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`
  }, [])

  const approve = useCallback(async () => {
    setError(null)
    setStatus("")

    if (!isConnected || !address) return setError("请先连接钱包")
    if (!walletClient || !publicClient) return setError("钱包客户端未就绪")
    if (!vaultManagerAddress) return setError("当前网络未配置 VaultManager 地址")
    if (!tokenAddressTyped) return setError("Token 地址不合法")
    if (!parsedAmount || parsedAmount <= 0n) return setError("金额不合法")

    try {
      setBusy(true)
      setStatus("授权中（Approve）…")

      const hash = await (walletClient as any).writeContract({
        address: tokenAddressTyped,
        abi: erc20Abi,
        functionName: "approve",
        args: [vaultManagerAddress, parsedAmount],
        account: address,
      })

      setTxHash(hash)
      await publicClient.waitForTransactionReceipt({ hash })
      setStatus("授权已确认")

      await refreshTokenInfo()
    } catch (err) {
      setError(toErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }, [
    address,
    isConnected,
    parsedAmount,
    publicClient,
    refreshTokenInfo,
    tokenAddressTyped,
    vaultManagerAddress,
    walletClient,
  ])

  const createVaultAndDeposit = useCallback(async () => {
    setError(null)
    setStatus("")

    if (!isConnected || !address) return setError("请先连接钱包")
    if (!walletClient || !publicClient) return setError("钱包客户端未就绪")
    if (!vaultManagerAddress) return setError("当前网络未配置 VaultManager 地址")
    if (!tokenAddressTyped) return setError("Token 地址不合法")
    if (!unlockTimestamp) return setError("解锁时间不合法")
    if (!parsedAmount || parsedAmount <= 0n) return setError("金额不合法")
    if (tokenWhitelisted === false) return setError("该 Token 未被 VaultManager 加入白名单")
    if (allowance != null && allowance < parsedAmount) return setError("授权额度不足，请先 Approve")

    try {
      setBusy(true)
      setStatus("创建 Vault 并存入中…")

      const hash = await (walletClient as any).writeContract({
        address: vaultManagerAddress,
        abi: vaultManagerAbi,
        functionName: "createVaultAndDeposit",
        args: [unlockTimestamp, tokenAddressTyped, parsedAmount],
        account: address,
      })

      setTxHash(hash)
      await publicClient.waitForTransactionReceipt({ hash })
      setStatus("交易已确认")

      const ids = await refreshVaultIds()
      const last = ids.at(-1) ?? null
      setLastCreatedVaultId(last)
      await refreshTokenInfo()
    } catch (err) {
      setError(toErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }, [
    address,
    allowance,
    isConnected,
    parsedAmount,
    publicClient,
    refreshTokenInfo,
    refreshVaultIds,
    tokenAddressTyped,
    tokenWhitelisted,
    unlockTimestamp,
    vaultManagerAddress,
    walletClient,
  ])

  const previewBreakVault = useCallback(async () => {
    setBreakVaultPreview(null)
    if (!publicClient || !vaultManagerAddress) return

    try {
      const vaultId = BigInt(breakVaultId.trim())
      const vault = await publicClient.readContract({
        address: vaultManagerAddress,
        abi: vaultManagerAbi,
        functionName: "getVault",
        args: [vaultId],
      })

      setBreakVaultPreview({
        owner: ((vault as any).owner ?? (vault as any)[0]) as Address,
        unlockTimestamp: ((vault as any).unlockTimestamp ?? (vault as any)[1]) as bigint,
        broken: ((vault as any).broken ?? (vault as any)[2]) as boolean,
      })
    } catch {
      setBreakVaultPreview(null)
    }
  }, [breakVaultId, publicClient, vaultManagerAddress])

  useEffect(() => {
    if (!breakVaultId.trim()) {
      setBreakVaultPreview(null)
      return
    }
    previewBreakVault().catch(() => undefined)
  }, [breakVaultId, previewBreakVault])

  const breakVault = useCallback(async () => {
    setError(null)
    setStatus("")

    if (!isConnected || !address) return setError("请先连接钱包")
    if (!walletClient || !publicClient) return setError("钱包客户端未就绪")
    if (!vaultManagerAddress) return setError("当前网络未配置 VaultManager 地址")

    let vaultId: bigint
    try {
      vaultId = BigInt(breakVaultId.trim())
    } catch {
      return setError("Vault ID 不合法")
    }

    try {
      setBusy(true)
      setStatus("Break 中…")

      const hash = await (walletClient as any).writeContract({
        address: vaultManagerAddress,
        abi: vaultManagerAbi,
        functionName: "breakVault",
        args: [vaultId],
        account: address,
      })

      setTxHash(hash)
      await publicClient.waitForTransactionReceipt({ hash })
      setStatus("已 Break")
      await refreshVaultIds()
      await previewBreakVault()
    } catch (err) {
      setError(toErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }, [
    address,
    breakVaultId,
    isConnected,
    previewBreakVault,
    publicClient,
    refreshVaultIds,
    vaultManagerAddress,
    walletClient,
  ])

  const allowanceHuman = useMemo(() => {
    if (allowance == null || tokenDecimals == null) return null
    return formatUnits(allowance, tokenDecimals)
  }, [allowance, tokenDecimals])

  const tokenBalanceHuman = useMemo(() => {
    if (tokenBalance == null || tokenDecimals == null) return null
    return formatUnits(tokenBalance, tokenDecimals)
  }, [tokenBalance, tokenDecimals])

  const handleMaxClick = useCallback(() => {
    if (tokenBalanceHuman != null) {
      setAmount(tokenBalanceHuman)
    }
  }, [tokenBalanceHuman])

  const nowSeconds = Math.floor(Date.now() / 1000)
  const unlockHuman = useMemo(() => {
    if (!unlockTimestamp) return null
    return new Date(Number(unlockTimestamp) * 1000).toLocaleString()
  }, [unlockTimestamp])

  return (
    <Card className="w-full max-w-2xl border-2 border-[#28a0f0]/20 bg-gradient-to-br from-background to-[#28a0f0]/5">
      <CardHeader>
        <CardTitle className="text-xl">VaultManager 演示</CardTitle>
        <CardDescription>
          创建时间锁 Vault，存入 ERC20，到期后 Break 全额取回；提前 Break 则返还 95%，5% 作为项目收益留在合约里。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="rounded-xl bg-muted/40 p-4 text-sm space-y-1">
          <div>
            <span className="text-muted-foreground">ChainId：</span> <span className="font-mono">{chainId}</span>
          </div>
          <div className="break-all">
            <span className="text-muted-foreground">VaultManager：</span>{" "}
            <span className="font-mono">{vaultManagerAddress ?? "(not configured)"}</span>
          </div>
          {!vaultManagerAddress && (
            <div className="text-muted-foreground">
              请配置合约地址：提交 `contracts/deployments/vault-manager.json`（`node contracts/scripts/sync-deployments.mjs`）
              或设置 <span className="font-mono">NEXT_PUBLIC_VAULT_MANAGER_ADDRESS</span>（或按链设置{" "}
              <span className="font-mono">NEXT_PUBLIC_VAULT_MANAGER_ADDRESS_ARBITRUM</span> /{" "}
              <span className="font-mono">NEXT_PUBLIC_VAULT_MANAGER_ADDRESS_MAINNET</span>）。
            </div>
          )}
        </div>

        <div className="space-y-3">
          <div className="text-sm font-semibold">创建 Vault 并存入（单笔交易）</div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">多少分钟后解锁</label>
              <Input value={unlockMinutes} onChange={(e) => setUnlockMinutes(e.target.value)} inputMode="numeric" />
            </div>
            <div className="sm:col-span-2 space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs text-muted-foreground">ERC20 Token（自动读取白名单）</label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => refreshWhitelist().catch((err) => setWhitelistError(toErrorMessage(err)))}
                  disabled={whitelistLoading || busy || !vaultManagerAddress}
                >
                  {whitelistLoading ? "刷新中…" : "刷新白名单"}
                </Button>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-between bg-transparent"
                    disabled={!vaultManagerAddress || whitelistLoading || !whitelistedTokens.length}
                  >
                    {tokenAddressValid && tokenSymbol ? (
                      <span>
                        {tokenSymbol} <span className="text-muted-foreground">({formatAddress(tokenAddressTyped!)})</span>
                      </span>
                    ) : whitelistedTokens.length ? (
                      <span className="text-muted-foreground">选择白名单 Token</span>
                    ) : whitelistLoading ? (
                      <span className="text-muted-foreground">加载白名单中…</span>
                    ) : (
                      <span className="text-muted-foreground">暂无白名单 Token</span>
                    )}
                    <ChevronDown className="h-4 w-4 opacity-70" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="max-h-72 overflow-auto">
                  {whitelistedTokens.map((t) => (
                    <DropdownMenuItem key={t.address} onClick={() => setTokenAddress(t.address)}>
                      <span className="font-medium">{t.symbol ?? "Unknown"}</span>
                      <span className="ml-2 font-mono text-xs text-muted-foreground">{formatAddress(t.address)}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              <div className="text-xs text-muted-foreground">
                白名单数量：{whitelistedTokens.length}
                {whitelistError ? <span className="ml-2 text-destructive">{whitelistError}</span> : null}
              </div>

              {whitelistedTokens.length ? (
                <div className="flex flex-wrap gap-2">
                  {whitelistedTokens.map((t) => (
                    <span key={t.address} className="rounded bg-muted px-2 py-1 text-xs">
                      <span className="font-medium">{t.symbol ?? "Unknown"}</span>{" "}
                      <span className="font-mono text-muted-foreground">{formatAddress(t.address)}</span>
                    </span>
                  ))}
                </div>
              ) : null}

              <div className="pt-2">
                <label className="text-xs text-muted-foreground">或手动输入 Token 地址</label>
                <Input
                  value={tokenAddress}
                  onChange={(e) => setTokenAddress(e.target.value)}
                  placeholder="0x…"
                  className={tokenAddress && !tokenAddressValid ? "border-destructive" : ""}
                />
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs text-muted-foreground">数量</label>
                {tokenBalanceHuman != null && (
                  <span className="text-xs text-muted-foreground">
                    余额: {tokenBalanceHuman} {tokenSymbol}
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <Input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.0" inputMode="decimal" className="flex-1" />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleMaxClick}
                  disabled={tokenBalanceHuman == null}
                  className="shrink-0"
                >
                  Max
                </Button>
              </div>
            </div>
            <div className="sm:col-span-2 space-y-1">
              <label className="text-xs text-muted-foreground">信息</label>
              <div className="rounded-md border bg-background px-3 py-2 text-xs text-muted-foreground space-y-1">
                <div>
                  Token：{" "}
                  {tokenAddressValid ? (
                    <span className="font-mono">{tokenAddressTyped}</span>
                  ) : (
                    <span>(不合法)</span>
                  )}{" "}
                  {tokenSymbol ? <span>({tokenSymbol})</span> : null}
                </div>
                <div>Decimals：{tokenDecimals ?? "-"}</div>
                <div>白名单：{tokenWhitelisted == null ? "-" : tokenWhitelisted ? "是" : "否"}</div>
                <div>Allowance：{allowanceHuman ?? "-"}</div>
                <div>
                  解锁时间戳：{" "}
                  {unlockTimestamp ? (
                    <>
                      <span className="font-mono">{unlockTimestamp.toString()}</span> ({unlockHuman}){" "}
                      {unlockTimestamp <= BigInt(nowSeconds) ? <span className="text-destructive">(不合法)</span> : null}
                    </>
                  ) : (
                    "-"
                  )}
                </div>
                <div className="text-[11px]">
                  说明：任何人都可以给 Vault 存入，但 Break 时会把资产退回给 Vault 创建者（owner）。
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={approve} disabled={busy || !isConnected}>
              授权（Approve）
            </Button>
            <Button onClick={createVaultAndDeposit} disabled={busy || !isConnected}>
              创建并存入
            </Button>
          </div>
        </div>

        <div className="space-y-3">
          <div className="text-sm font-semibold">Break Vault（取回）</div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Vault ID</label>
              <Input value={breakVaultId} onChange={(e) => setBreakVaultId(e.target.value)} inputMode="numeric" />
            </div>
            <div className="sm:col-span-2 space-y-1">
              <label className="text-xs text-muted-foreground">预览</label>
              <div className="rounded-md border bg-background px-3 py-2 text-xs text-muted-foreground space-y-1">
                {breakVaultPreview ? (
                  <>
                    <div className="break-all">
                      Owner：<span className="font-mono">{breakVaultPreview.owner}</span>
                    </div>
                    <div>Unlock：{breakVaultPreview.unlockTimestamp.toString()}</div>
                    <div>Broken：{breakVaultPreview.broken ? "是" : "否"}</div>
                  </>
                ) : (
                  <div>-</div>
                )}
              </div>
            </div>
          </div>
          <Button onClick={breakVault} disabled={busy || !isConnected}>
            Break
          </Button>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">我的 Vault 列表</div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => refreshVaultIds().catch((err) => setError(toErrorMessage(err)))}
              disabled={!isConnected || busy || vaultDetailsLoading}
            >
              <RefreshCw className={`h-4 w-4 ${vaultDetailsLoading ? "animate-spin" : ""}`} />
            </Button>
          </div>
          {myVaultIds.length ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {myVaultIds.map((id) => {
                const detail = vaultDetails.get(id.toString())
                const isUnlocked = detail ? detail.unlockTimestamp <= BigInt(nowSeconds) : false
                const unlockDate = detail ? new Date(Number(detail.unlockTimestamp) * 1000) : null

                return (
                  <div
                    key={id.toString()}
                    className={`rounded-lg border p-3 text-xs space-y-2 ${
                      detail?.broken
                        ? "bg-muted/50 opacity-60"
                        : isUnlocked
                        ? "border-green-500/50 bg-green-500/5"
                        : "bg-background"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">Vault #{id.toString()}</span>
                      {detail?.broken ? (
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">已取回</span>
                      ) : isUnlocked ? (
                        <span className="rounded bg-green-500/20 px-1.5 py-0.5 text-[10px] text-green-600">可取回</span>
                      ) : (
                        <span className="rounded bg-yellow-500/20 px-1.5 py-0.5 text-[10px] text-yellow-600">锁定中</span>
                      )}
                    </div>

                    {detail ? (
                      <>
                        <div className="text-muted-foreground">
                          解锁时间：{unlockDate?.toLocaleString()}
                          {!isUnlocked && detail.unlockTimestamp > BigInt(nowSeconds) && (
                            <span className="ml-1">
                              (剩余 {Math.ceil((Number(detail.unlockTimestamp) - nowSeconds) / 60)} 分钟)
                            </span>
                          )}
                        </div>

                        {detail.tokens.length > 0 ? (
                          <div className="space-y-1">
                            <div className="text-muted-foreground">存入资产：</div>
                            {detail.tokens.map((token) => (
                              <div key={token.address} className="flex items-center justify-between rounded bg-muted/50 px-2 py-1">
                                <span className="font-medium">{token.symbol}</span>
                                <span className="font-mono">{formatUnits(token.balance, token.decimals)}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-muted-foreground">暂无存入资产</div>
                        )}

                        {!detail.broken && (
                          <Button
                            size="sm"
                            variant={isUnlocked ? "default" : "outline"}
                            className="w-full mt-2"
                            onClick={async () => {
                              setBreakVaultId(id.toString())
                              // 直接使用当前 id 调用合约
                              if (!walletClient || !publicClient || !vaultManagerAddress) return
                              setError(null)
                              setStatus("")
                              try {
                                setBusy(true)
                                setStatus("Break 中…")
                                const hash = await (walletClient as any).writeContract({
                                  address: vaultManagerAddress,
                                  abi: vaultManagerAbi,
                                  functionName: "breakVault",
                                  args: [id],
                                  account: address,
                                })
                                setTxHash(hash)
                                await publicClient.waitForTransactionReceipt({ hash })
                                setStatus("已 Break")
                                await refreshVaultIds()
                              } catch (err) {
                                setError(toErrorMessage(err))
                              } finally {
                                setBusy(false)
                              }
                            }}
                            disabled={busy}
                          >
                            {isUnlocked ? "取回（100%）" : "提前取回（95%）"}
                          </Button>
                        )}
                      </>
                    ) : vaultDetailsLoading ? (
                      <div className="text-muted-foreground">加载中...</div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="rounded-md border bg-background px-3 py-2 text-xs text-muted-foreground">
              暂无 Vault
            </div>
          )}
          {lastCreatedVaultId != null && (
            <div className="text-xs text-muted-foreground">
              最近创建：<span className="font-mono">#{lastCreatedVaultId.toString()}</span>
            </div>
          )}
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
