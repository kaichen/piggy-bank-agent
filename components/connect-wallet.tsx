"use client"

import { useAccount, useConnect, useDisconnect, useBalance, useChainId, useSwitchChain } from "wagmi"
import { arbitrum } from "wagmi/chains"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Wallet, LogOut, RefreshCw, ChevronDown } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

export function ConnectWallet() {
  const { address, isConnected, connector } = useAccount()
  const { connect, connectors, isPending } = useConnect()
  const { disconnect } = useDisconnect()
  const chainId = useChainId()
  const { switchChain } = useSwitchChain()

  const {
    data: balance,
    isLoading: balanceLoading,
    refetch,
  } = useBalance({
    address: address,
    chainId: arbitrum.id,
  })

  const formatAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`
  }

  const formatBalance = (value: bigint, decimals: number) => {
    const divisor = BigInt(10 ** decimals)
    const integerPart = value / divisor
    const fractionalPart = value % divisor
    const fractionalStr = fractionalPart.toString().padStart(decimals, "0").slice(0, 4)
    return `${integerPart}.${fractionalStr}`
  }

  // 未连接状态
  if (!isConnected) {
    return (
      <Card className="w-full max-w-md border-2 border-[#28a0f0]/20 bg-gradient-to-br from-background to-[#28a0f0]/5">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#28a0f0]/10">
            <Wallet className="h-8 w-8 text-[#28a0f0]" />
          </div>
          <CardTitle className="text-2xl">连接钱包</CardTitle>
          <CardDescription>选择一个钱包连接到 Arbitrum 网络</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {connectors.map((c) => (
            <Button
              key={c.uid}
              variant="outline"
              className="w-full justify-start gap-3 h-12 hover:bg-[#28a0f0]/10 hover:border-[#28a0f0]/50 transition-all bg-transparent"
              onClick={() => connect({ connector: c })}
              disabled={isPending}
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
                <Wallet className="h-4 w-4" />
              </div>
              <span className="font-medium">{c.name}</span>
              {isPending && <RefreshCw className="ml-auto h-4 w-4 animate-spin" />}
            </Button>
          ))}
        </CardContent>
      </Card>
    )
  }

  // 已连接状态
  return (
    <Card className="w-full max-w-md border-2 border-[#28a0f0]/30 bg-gradient-to-br from-background to-[#28a0f0]/5">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#28a0f0]/20">
              <Wallet className="h-5 w-5 text-[#28a0f0]" />
            </div>
            <div>
              <CardTitle className="text-lg">{formatAddress(address!)}</CardTitle>
              <CardDescription className="text-xs">通过 {connector?.name} 连接</CardDescription>
            </div>
          </div>
          <Badge
            variant={chainId === arbitrum.id ? "default" : "secondary"}
            className={chainId === arbitrum.id ? "bg-[#28a0f0] hover:bg-[#28a0f0]/80" : ""}
          >
            {chainId === arbitrum.id ? "Arbitrum" : "其他网络"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 余额显示 */}
        <div className="rounded-xl bg-muted/50 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">ETH 余额 (Arbitrum)</span>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => refetch()}>
              <RefreshCw className={`h-3 w-3 ${balanceLoading ? "animate-spin" : ""}`} />
            </Button>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-[#28a0f0]">
              {balanceLoading ? "..." : balance ? formatBalance(balance.value, balance.decimals) : "0.0000"}
            </span>
            <span className="text-lg text-muted-foreground">ETH</span>
          </div>
        </div>

        {/* 网络切换提示 */}
        {chainId !== arbitrum.id && (
          <Button
            className="w-full bg-[#28a0f0] hover:bg-[#28a0f0]/80"
            onClick={() => switchChain({ chainId: arbitrum.id })}
          >
            切换到 Arbitrum 网络
          </Button>
        )}

        {/* 操作按钮 */}
        <div className="flex gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="flex-1 bg-transparent">
                网络 <ChevronDown className="ml-2 h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => switchChain({ chainId: arbitrum.id })}>Arbitrum One</DropdownMenuItem>
              <DropdownMenuItem onClick={() => switchChain({ chainId: 1 })}>Ethereum Mainnet</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="destructive" className="flex-1" onClick={() => disconnect()}>
            <LogOut className="mr-2 h-4 w-4" />
            断开连接
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
