import fs from "node:fs/promises"
import path from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"

function isHexAddress(value) {
  return typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value)
}

async function main() {
  const [chainIdRaw, addressRaw] = process.argv.slice(2)
  const chainId = Number(chainIdRaw)
  const address = addressRaw?.trim()

  if (!Number.isInteger(chainId) || chainId <= 0) {
    throw new Error(`Invalid chainId: ${chainIdRaw}`)
  }
  if (!isHexAddress(address)) {
    throw new Error(`Invalid address: ${addressRaw}`)
  }

  const scriptDir = path.dirname(fileURLToPath(import.meta.url))
  const contractsRoot = path.resolve(scriptDir, "..")
  const deploymentsPath = path.join(contractsRoot, "deployments", "vault-manager.json")

  let current = {}
  try {
    const raw = await fs.readFile(deploymentsPath, "utf8")
    current = JSON.parse(raw || "{}")
  } catch {
    current = {}
  }

  const next = { ...current, [String(chainId)]: address }
  await fs.mkdir(path.dirname(deploymentsPath), { recursive: true })
  await fs.writeFile(deploymentsPath, JSON.stringify(next, null, 2) + "\n", "utf8")

  console.log(`Updated ${deploymentsPath}`)
  console.log(`- chainId=${chainId} VaultManager=${address}`)
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})

