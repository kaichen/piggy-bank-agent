import { ConnectWallet } from "@/components/connect-wallet"
import { VaultManagerDemo } from "@/components/vault-manager-demo"

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-background via-background to-[#28a0f0]/5">
      {/* Header */}
      <header className="border-b border-border/40 backdrop-blur-sm">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#28a0f0]">
              <span className="text-sm font-bold text-white">W3</span>
            </div>
            <span className="text-xl font-bold">Web3 DApp</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Powered by</span>
            <span className="font-semibold text-[#28a0f0]">Arbitrum</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-16">
        <div className="flex flex-col items-center text-center mb-12">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl mb-4 text-balance">
            欢迎来到 <span className="text-[#28a0f0]">Web3</span> 世界
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl text-pretty">
            使用您喜欢的钱包连接到 Arbitrum 网络，查看您的 ETH 余额并开始探索去中心化应用
          </p>
        </div>

        {/* Wallet Card */}
        <div className="flex justify-center">
          <ConnectWallet />
        </div>

        {/* Contract Demo */}
        <div className="mt-10 flex justify-center">
          <VaultManagerDemo />
        </div>

        {/* Features */}
        <div className="mt-16 grid gap-6 sm:grid-cols-3 max-w-4xl mx-auto">
          <div className="rounded-xl border bg-card p-6 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#28a0f0]/10">
              <span className="text-2xl">🔒</span>
            </div>
            <h3 className="font-semibold mb-2">安全连接</h3>
            <p className="text-sm text-muted-foreground">支持多种主流钱包，确保您的资产安全</p>
          </div>
          <div className="rounded-xl border bg-card p-6 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#28a0f0]/10">
              <span className="text-2xl">⚡</span>
            </div>
            <h3 className="font-semibold mb-2">Arbitrum 网络</h3>
            <p className="text-sm text-muted-foreground">享受低gas费和快速交易确认</p>
          </div>
          <div className="rounded-xl border bg-card p-6 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#28a0f0]/10">
              <span className="text-2xl">💰</span>
            </div>
            <h3 className="font-semibold mb-2">实时余额</h3>
            <p className="text-sm text-muted-foreground">实时查看您的 ETH 余额变化</p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-border/40 py-6 mt-auto">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          Built with wagmi & Next.js • Arbitrum Network
        </div>
      </footer>
    </main>
  )
}
