import { ConnectWallet } from "@/components/connect-wallet"
import { DeployVaultManager } from "@/components/admin/deploy-vault-manager"
import { TokenWhitelistManager } from "@/components/admin/token-whitelist-manager"

export default function Admin() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-background via-background to-[#28a0f0]/5">
      <header className="border-b border-border/40 backdrop-blur-sm">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#28a0f0]">
              <span className="text-sm font-bold text-white">PB</span>
            </div>
            <span className="text-xl font-bold">管理后台</span>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-12 space-y-10">
        <div className="flex justify-center">
          <ConnectWallet />
        </div>
        <div className="flex justify-center">
          <DeployVaultManager />
        </div>
        <div className="flex justify-center">
          <TokenWhitelistManager />
        </div>
      </div>
    </main>
  )
}
