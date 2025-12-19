import fs from "node:fs/promises"
import path from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"

function isHexAddress(value) {
  return typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value)
}

function extractVaultManagerAddress(runJson) {
  const txs = Array.isArray(runJson?.transactions) ? runJson.transactions : []
  const createsWithAddress = txs.filter((t) => isHexAddress(t?.contractAddress))

  const byName =
    createsWithAddress.find((t) => t?.contractName === "VaultManager") ??
    createsWithAddress.find((t) => t?.contractName === "VaultManagerTest") // defensive

  return byName?.contractAddress ?? createsWithAddress.at(-1)?.contractAddress ?? null
}

async function main() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url))
  const contractsRoot = path.resolve(scriptDir, "..")
  const broadcastRoot = path.join(contractsRoot, "broadcast", "DeployVaultManager.s.sol")
  const deploymentsPath = path.join(contractsRoot, "deployments", "vault-manager.json")

  const entries = await fs.readdir(broadcastRoot, { withFileTypes: true })
  const chainDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name)

  if (chainDirs.length === 0) {
    throw new Error(`No deployments found under ${broadcastRoot}`)
  }

  const deployments = {}

  for (const chainId of chainDirs) {
    const runLatestPath = path.join(broadcastRoot, chainId, "run-latest.json")
    let content
    try {
      content = await fs.readFile(runLatestPath, "utf8")
    } catch {
      continue
    }

    const runJson = JSON.parse(content)
    const addr = extractVaultManagerAddress(runJson)
    if (!addr) continue
    deployments[chainId] = addr
  }

  const keys = Object.keys(deployments)
  if (keys.length === 0) {
    throw new Error(`No VaultManager contractAddress found in ${broadcastRoot}`)
  }

  await fs.mkdir(path.dirname(deploymentsPath), { recursive: true })
  await fs.writeFile(deploymentsPath, JSON.stringify(deployments, null, 2) + "\n", "utf8")

  console.log(`Wrote ${deploymentsPath}`)
  for (const chainId of keys.sort((a, b) => Number(a) - Number(b))) {
    console.log(`- chainId=${chainId} VaultManager=${deployments[chainId]}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
