import { arbitrum, mainnet } from "wagmi/chains"

import deployments from "@/contracts/deployments/vault-manager.json"

export type Address = `0x${string}`

function asAddress(value: string | undefined): Address | undefined {
  if (!value) return undefined
  return value as Address
}

function getDeploymentAddress(chainId: number | undefined): Address | undefined {
  if (!chainId) return undefined
  const byChainId = (deployments as Record<string, string | undefined>)[String(chainId)]
  return asAddress(byChainId)
}

export const vaultManagerAddressByChainId: Partial<Record<number, Address>> = {
  [arbitrum.id]: asAddress(process.env.NEXT_PUBLIC_VAULT_MANAGER_ADDRESS_ARBITRUM),
  [mainnet.id]: asAddress(process.env.NEXT_PUBLIC_VAULT_MANAGER_ADDRESS_MAINNET),
}

export function getVaultManagerAddress(chainId: number | undefined): Address | undefined {
  const override = asAddress(process.env.NEXT_PUBLIC_VAULT_MANAGER_ADDRESS)
  if (override) return override

  const deployed = getDeploymentAddress(chainId)
  if (deployed) return deployed

  if (!chainId) return undefined
  return vaultManagerAddressByChainId[chainId]
}
