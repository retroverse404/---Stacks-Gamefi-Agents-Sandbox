#!/usr/bin/env node
/**
 * init-gamefi.mjs
 *
 * Seeds the deployed `sft-items` contract with its default item classes if they
 * have not already been seeded, and prints the current `qtc-token` status.
 *
 * Uses the same STACKS_PRIVATE_KEY / .env.deploy convention as deploy-contract.mjs.
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const envFile = resolve(__dirname, "../.env.deploy");
try {
  const lines = readFileSync(envFile, "utf8").split("\n");
  for (const line of lines) {
    const [key, ...rest] = line.split("=");
    if (key && rest.length && !process.env[key.trim()]) {
      process.env[key.trim()] = rest.join("=").trim();
    }
  }
} catch {
  // no .env.deploy present; rely on process environment
}

const privateKey = process.env.STACKS_PRIVATE_KEY;
if (!privateKey) {
  console.error(
    "Error: STACKS_PRIVATE_KEY is not set.\n" +
    "Run: STACKS_PRIVATE_KEY=your_key node scripts/init-gamefi.mjs\n" +
    "Or create a .env.deploy file with STACKS_PRIVATE_KEY=your_key"
  );
  process.exit(1);
}

const {
  makeContractCall,
  broadcastTransaction,
  callReadOnlyFunction,
  AnchorMode,
  getAddressFromPrivateKey,
  cvToJSON,
} = await import("@stacks/transactions");

const network = "testnet";
const ownerAddress = getAddressFromPrivateKey(privateKey, network);

async function readOnly(contractName, functionName) {
  const result = await callReadOnlyFunction({
    contractAddress: ownerAddress,
    contractName,
    functionName,
    functionArgs: [],
    senderAddress: ownerAddress,
    network,
  });
  return cvToJSON(result);
}

async function publicCall(contractName, functionName) {
  const tx = await makeContractCall({
    contractAddress: ownerAddress,
    contractName,
    functionName,
    functionArgs: [],
    senderKey: privateKey,
    network,
    anchorMode: AnchorMode.Any,
  });

  const txid = tx.txid();
  console.log(`Broadcasting ${contractName}.${functionName}()`);
  console.log(`Local txid: ${txid}`);

  const result = await broadcastTransaction({ transaction: tx, network });

  if ("error" in result) {
    throw new Error(`${result.error}${result.reason ? `: ${result.reason}` : ""}`);
  }

  console.log(`Success: https://explorer.hiro.so/txid/${result.txid}?chain=testnet`);
  return result.txid;
}

console.log(`Using deployer: ${ownerAddress}`);

const defaultsSeeded = await readOnly("sft-items", "defaults-seeded");
console.log("sft-items.defaults-seeded =", defaultsSeeded.value);

if (defaultsSeeded.value !== true) {
  await publicCall("sft-items", "seed-default-item-classes");
} else {
  console.log("Default SFT item classes are already seeded.");
}

const qtcSupply = await readOnly("qtc-token", "get-total-supply");
const qtcPeg = await readOnly("qtc-token", "get-peg-config");

console.log("qtc-token total supply =", qtcSupply.value);
console.log("qtc-token peg config =", JSON.stringify(qtcPeg.value));
console.log("Done.");
