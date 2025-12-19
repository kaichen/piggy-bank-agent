import { HeaderWallet } from "@/components/header-wallet"
import { VaultManagerDemo } from "@/components/vault-manager-demo"

export default function ConsolePage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-background via-background to-[#28a0f0]/5">
      {/* Header */}
      <header className="border-b border-border/40 backdrop-blur-sm sticky top-0 z-50 bg-background/80">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#28a0f0]">
              <span className="text-sm font-bold text-white">🐷</span>
            </div>
            <span className="text-xl font-bold">小猪存钱罐</span>
          </div>
          <HeaderWallet />
        </div>
      </header>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-16">
        {/* Contract Demo */}
        <div className="flex justify-center">
          <VaultManagerDemo />
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-border/40 py-6 mt-auto">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          Built by 年年有余队 • imHackathon
        </div>
      </footer>
    </main>
  )
}
