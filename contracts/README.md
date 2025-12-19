# Contracts (Foundry)

## Setup

Install Foundry on your machine, then:

```bash
cd contracts
forge test
```

### Install Foundry

```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup
```

## Deploy (example)

```bash
cd contracts
export PRIVATE_KEY=...
forge script script/DeployVaultManager.s.sol:DeployVaultManager --rpc-url <RPC_URL> --broadcast
```

After deployment, copy the deployed address into the frontend env (see root `README.md`).

### Post-deploy: whitelist tokens

`VaultManager` only accepts deposits for whitelisted ERC20 tokens. After deployment, run:

```bash
cast send <VAULT_MANAGER_ADDRESS> "setTokenWhitelist(address,bool)" <TOKEN_ADDRESS> true \
  --private-key $PRIVATE_KEY --rpc-url <RPC_URL>
```

### Withdraw protocol fees (owner only)

Early break keeps 5% as protocol fees per token. Contract owner (deployer) can withdraw:

```bash
cast send <VAULT_MANAGER_ADDRESS> "withdrawFees(address,address,uint256)" <TOKEN_ADDRESS> <TO> <AMOUNT> \
  --private-key $PRIVATE_KEY --rpc-url <RPC_URL>
```

## VaultManager overview

- `createVault(unlockTimestamp)` creates a vault owned by `msg.sender`.
- `deposit(vaultId, token, amount)` lets anyone deposit whitelisted ERC20s into a vault.
- `breakVault(vaultId)` can be called only by the vault owner:
  - if `block.timestamp >= unlockTimestamp`, returns 100% of each token to the owner
  - otherwise returns 95% to the owner and keeps 5% as protocol fees
- `withdrawFees(token, to, amount)` can be called only by the contract deployer (`owner`).
