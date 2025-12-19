# AGENTS

## Commands

```bash
pnpm dev          # Start development server
pnpm build        # Production build
pnpm lint         # Run ESLint
pnpm start        # Start production server
```

## Architecture

This is a Next.js 16 Web3 dapp using the App Router with Wagmi for Ethereum wallet integration.

### Core Stack
- **Next.js 16** with App Router (React 19)
- **Wagmi 3** + **viem** for Web3 wallet connections
- **TanStack Query** for async state management
- **shadcn/ui** (new-york style) with Radix UI primitives
- **Tailwind CSS 4** for styling

### Web3 Setup
- `lib/wagmi-config.ts` - Wagmi configuration with Arbitrum and Mainnet chains, connectors (injected, MetaMask, Coinbase)
- `components/web3-provider.tsx` - Client-side provider wrapping WagmiProvider and QueryClientProvider
- `components/connect-wallet.tsx` - Wallet connection UI with balance display and network switching

### Key Patterns
- All Web3 components are client components (`"use client"`)
- `@/` path alias maps to project root
- UI components live in `components/ui/` (shadcn/ui managed)
- Utility function `cn()` in `lib/utils.ts` for className merging

### Adding shadcn/ui Components
```bash
npx shadcn@latest add [component-name]
```
Configuration in `components.json` uses new-york style with lucide icons.
