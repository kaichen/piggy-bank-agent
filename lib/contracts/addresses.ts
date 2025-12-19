import { arbitrum, mainnet } from "wagmi/chains"

export type Address = `0x${string}`

function asAddress(value: string | undefined): Address | undefined {
  if (!value) return undefined
  return value as Address
}

export const vaultManagerAddressByChainId: Partial<Record<number, Address>> = {
  [arbitrum.id]: asAddress(process.env.NEXT_PUBLIC_VAULT_MANAGER_ADDRESS_ARBITRUM),
  [mainnet.id]: asAddress(process.env.NEXT_PUBLIC_VAULT_MANAGER_ADDRESS_MAINNET),
}

export function getVaultManagerAddress(chainId: number | undefined): Address | undefined {
  const override = asAddress(process.env.NEXT_PUBLIC_VAULT_MANAGER_ADDRESS)
  if (override) return override
  if (!chainId) return undefined
  return vaultManagerAddressByChainId[chainId]
}
