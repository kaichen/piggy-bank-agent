# AGENTS

## Commands

### Frontend (Next.js)
```bash
pnpm dev          # Start development server
pnpm build        # Production build
pnpm lint         # Run ESLint
pnpm start        # Start production server
```

### Smart Contracts (Foundry)
```bash
cd contracts
forge build       # Compile contracts
forge test        # Run tests
forge fmt         # Format Solidity code
```

## Architecture

This is a Next.js 16 Web3 dapp using the App Router with Wagmi for Ethereum wallet integration, featuring a Solidity smart contract for vault management.

### Core Stack
- **Next.js 16** with App Router (React 19)
- **Wagmi 3** + **viem** for Web3 wallet connections
- **TanStack Query** for async state management
- **shadcn/ui** (new-york style) with Radix UI primitives
- **Tailwind CSS 4** for styling
- **Foundry** for Solidity smart contract development (Solc 0.8.24)

### Smart Contracts (`contracts/`)
- `src/VaultManager.sol` - Main contract for time-locked token vaults
  - `createVault(unlockTimestamp)` - Create a vault with unlock time
  - `deposit(vaultId, token, amount)` - Deposit whitelisted ERC20 tokens
  - `breakVault(vaultId)` - Withdraw tokens (5% fee if early)
- `test/VaultManager.t.sol` - Foundry tests
- `script/DeployVaultManager.s.sol` - Deployment script

### Contract Integration (`lib/contracts/`)
- `vault-manager.ts` - VaultManager ABI for frontend integration
- `erc20.ts` - ERC20 ABI for token interactions
- `addresses.ts` - Contract addresses per chain (via env vars)

### Web3 Setup
- `lib/wagmi-config.ts` - Wagmi configuration with Arbitrum and Mainnet chains, connectors (injected, MetaMask, Coinbase)
- `components/web3-provider.tsx` - Client-side provider wrapping WagmiProvider and QueryClientProvider
- `components/connect-wallet.tsx` - Wallet connection UI with balance display and network switching
- `components/vault-manager-demo.tsx` - Demo component for VaultManager interactions

### Environment Variables
```bash
NEXT_PUBLIC_VAULT_MANAGER_ADDRESS=0x...           # Override for all chains
NEXT_PUBLIC_VAULT_MANAGER_ADDRESS_ARBITRUM=0x...  # Arbitrum specific
NEXT_PUBLIC_VAULT_MANAGER_ADDRESS_MAINNET=0x...   # Mainnet specific
```

### Key Patterns
- All Web3 components are client components (`"use client"`)
- `@/` path alias maps to project root
- UI components live in `components/ui/` (shadcn/ui managed)
- Utility function `cn()` in `lib/utils.ts` for className merging
- Contract ABIs are TypeScript const assertions for type safety

### Adding shadcn/ui Components
```bash
npx shadcn@latest add [component-name]
```
Configuration in `components.json` uses new-york style with lucide icons.
