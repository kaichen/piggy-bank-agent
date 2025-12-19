"use client"

import { useAccount, useConnect, useDisconnect, useChainId, useSwitchChain } from "wagmi"
import { arbitrum } from "wagmi/chains"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Wallet, LogOut, ChevronDown } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export function HeaderWallet() {
  const { address, isConnected, connector } = useAccount()
  const { connect, connectors, isPending } = useConnect()
  const { disconnect } = useDisconnect()
  const chainId = useChainId()
  const { switchChain } = useSwitchChain()

  const formatAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`

  if (!isConnected) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            <Wallet className="h-4 w-4" />
            连接钱包
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {connectors.map((c) => (
            <DropdownMenuItem
              key={c.uid}
              onClick={() => connect({ connector: c })}
              disabled={isPending}
            >
              {c.name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <Badge
        variant={chainId === arbitrum.id ? "default" : "secondary"}
        className={chainId === arbitrum.id ? "bg-[#28a0f0] hover:bg-[#28a0f0]/80" : "cursor-pointer"}
        onClick={() => chainId !== arbitrum.id && switchChain({ chainId: arbitrum.id })}
      >
        {chainId === arbitrum.id ? "Arbitrum" : "切换网络"}
      </Badge>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            <Wallet className="h-4 w-4 text-[#28a0f0]" />
            {formatAddress(address!)}
            <ChevronDown className="h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <div className="px-2 py-1.5 text-xs text-muted-foreground">
            通过 {connector?.name} 连接
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => switchChain({ chainId: arbitrum.id })}>
            Arbitrum One
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => switchChain({ chainId: 1 })}>
            Ethereum Mainnet
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => disconnect()} className="text-destructive">
            <LogOut className="mr-2 h-4 w-4" />
            断开连接
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
