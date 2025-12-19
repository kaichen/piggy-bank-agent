import fs from "node:fs/promises"
import path from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"

function normalizeBytecode(value) {
  if (typeof value !== "string") return null
  if (!value.length) return null
  return value.startsWith("0x") ? value : `0x${value}`
}

async function main() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url))
  const contractsRoot = path.resolve(scriptDir, "..")
  const repoRoot = path.resolve(contractsRoot, "..")

  const artifactPath = path.join(contractsRoot, "out", "VaultManager.sol", "VaultManager.json")
  const outPath = path.join(repoRoot, "lib", "contracts", "vault-manager-bytecode.ts")

  const artifactRaw = await fs.readFile(artifactPath, "utf8")
  const artifact = JSON.parse(artifactRaw)

  const bytecode = normalizeBytecode(artifact?.bytecode?.object)
  if (!bytecode || bytecode.length <= 2) {
    throw new Error(`Invalid bytecode in ${artifactPath}`)
  }

  const content = `export const vaultManagerBytecode = ${JSON.stringify(bytecode)} as const\n`
  await fs.writeFile(outPath, content, "utf8")

  console.log(`Wrote ${outPath}`)
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})

