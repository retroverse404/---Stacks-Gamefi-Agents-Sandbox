#!/usr/bin/env node
/**
 * deploy-contract.mjs
 * Deploy a Clarity contract to Stacks testnet.
 *
 * Usage:
 *   STACKS_PRIVATE_KEY=<your-key> node scripts/deploy-contract.mjs
 *
 * Your private key never leaves this machine.
 * Get your testnet private key from Xverse:
 *   Xverse -> Settings -> Backup wallet -> reveal seed phrase
 *   Then derive the key with: npx @stacks/cli make_keychain -t
 *   Or export directly from Leather: Settings -> Secret Key -> derive
 *
 * Alternatively set the key in a local .env.deploy file (never commit it):
 *   echo "STACKS_PRIVATE_KEY=your_key_here" > .env.deploy
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env.deploy if present
const envFile = resolve(__dirname, "../.env.deploy");
try {
  const lines = readFileSync(envFile, "utf8").split("\n");
  for (const line of lines) {
    const [key, ...rest] = line.split("=");
    if (key && rest.length) process.env[key.trim()] = rest.join("=").trim();
  }
} catch {
  // no .env.deploy — use environment variable directly
}

const privateKey = process.env.STACKS_PRIVATE_KEY;
if (!privateKey) {
  console.error(
    "Error: STACKS_PRIVATE_KEY is not set.\n" +
    "Run: STACKS_PRIVATE_KEY=your_key node scripts/deploy-contract.mjs\n" +
    "Or create a .env.deploy file with STACKS_PRIVATE_KEY=your_key"
  );
  process.exit(1);
}

const contractSource = readFileSync(
  resolve(__dirname, "../contracts/premium-access.clar"),
  "utf8"
);

const {
  makeContractDeploy,
  broadcastTransaction,
  AnchorMode,
  getAddressFromPrivateKey,
} = await import("@stacks/transactions");

const network = "testnet";
const contractName = "premium-access";
const deployerAddress = getAddressFromPrivateKey(privateKey, network);

console.log(`Deploying ${contractName} to ${network}...`);

const tx = await makeContractDeploy({
  contractName,
  codeBody: contractSource,
  senderKey: privateKey,
  network,
  anchorMode: AnchorMode.Any,
  clarityVersion: 4,
});

console.log(`Transaction ID (local): ${tx.txid()}`);
console.log("Broadcasting...");

const result = await broadcastTransaction({ transaction: tx, network });

if ("error" in result) {
  console.error("Broadcast failed:", result.error, result.reason ?? "");
  process.exit(1);
}

console.log("\nSuccess!");
console.log(`txid:     ${result.txid}`);
console.log(`contract: ${deployerAddress}.${contractName}`);
console.log(`explorer: https://explorer.hiro.so/txid/${result.txid}?chain=testnet`);
