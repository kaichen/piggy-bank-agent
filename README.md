# Web3 dapp with Wagmi

*Automatically synced with your [v0.app](https://v0.app) deployments*

[![Deployed on Vercel](https://img.shields.io/badge/Deployed%20on-Vercel-black?style=for-the-badge&logo=vercel)](https://vercel.com/kais-projects-f8bf7b3f/v0-web3-dapp-with-wagmi)
[![Built with v0](https://img.shields.io/badge/Built%20with-v0.app-black?style=for-the-badge)](https://v0.app/chat/cGC2qNPYCIN)

## Overview

This repository will stay in sync with your deployed chats on [v0.app](https://v0.app).
Any changes you make to your deployed app will be automatically pushed to this repository from [v0.app](https://v0.app).

## Deployment

Your project is live at:

**[https://vercel.com/kais-projects-f8bf7b3f/v0-web3-dapp-with-wagmi](https://vercel.com/kais-projects-f8bf7b3f/v0-web3-dapp-with-wagmi)**

## Build your app

Continue building your app on:

**[https://v0.app/chat/cGC2qNPYCIN](https://v0.app/chat/cGC2qNPYCIN)**

## How It Works

1. Create and modify your project using [v0.app](https://v0.app)
2. Deploy your chats from the v0 interface
3. Changes are automatically pushed to this repository
4. Vercel deploys the latest version from this repository

## Contracts

Foundry contracts live under `contracts/`. See `contracts/README.md` for deploy + admin commands.

### Frontend config

Set the deployed VaultManager address for the target chain:

```bash
# Arbitrum One (chainId=42161)
NEXT_PUBLIC_VAULT_MANAGER_ADDRESS_ARBITRUM=0x...

# Ethereum Mainnet (chainId=1)
NEXT_PUBLIC_VAULT_MANAGER_ADDRESS_MAINNET=0x...
```
