import { ConvexHttpClient } from "convex/browser";
import {
  PostConditionMode,
  broadcastTransaction,
  makeContractCall,
  principalCV,
  stringAsciiCV,
} from "@stacks/transactions";
import { api } from "../../../convex/_generated/api.js";
import type { StacksNetworkName } from "./hiro.js";

const PREMIUM_ACCESS_CONTRACT_ADDRESS = "ST2JDN3QED16X524SE8GWQSTP2MW6D2005AEEGJ9S";
const PREMIUM_ACCESS_CONTRACT_NAME = "premium-access-v2";
const PREMIUM_ACCESS_FUNCTION_NAME = "grant-access";
const WORLD_FEED_MAP_NAME = "Cozy Cabin";

export type PremiumAccessGrantConfig = {
  agentDisplayName: string;
  agentInstanceName: string;
  payerPrincipal: string;
  paymentTxid?: string;
  resourceId: string;
};

type PremiumAccessGrantResult = {
  explorerUrl: string;
  txid: string;
};

let convexClient: ConvexHttpClient | null = null;
let convexClientUrl = "";

function resolveStacksNetwork(value: string | undefined): StacksNetworkName {
  return value?.toLowerCase() === "mainnet" ? "mainnet" : "testnet";
}

function getStacksPrivateKey() {
  return process.env.DEPLOYER_PRIVATE_KEY || process.env.STACKS_PRIVATE_KEY || "";
}

function getConvexUrl() {
  return process.env.CONVEX_URL || process.env.VITE_CONVEX_URL || "";
}

function getContractNetwork() {
  return resolveStacksNetwork(
    process.env.PREMIUM_ACCESS_NETWORK || process.env.NETWORK || "testnet",
  );
}

function formatBroadcastError(result: unknown) {
  if (!result || typeof result !== "object") {
    return "Unknown Stacks broadcast failure.";
  }

  const candidate = result as { error?: unknown; reason?: unknown };
  const error = typeof candidate.error === "string" ? candidate.error : "";
  const reason = typeof candidate.reason === "string" ? candidate.reason : "";

  if (error && reason) return `${error}: ${reason}`;
  if (error) return error;
  if (reason) return reason;
  return "Stacks broadcast failed without an error payload.";
}

function getConvexClient() {
  const url = getConvexUrl();
  if (!url) {
    throw new Error(
      "CONVEX_URL is not configured. Set CONVEX_URL or VITE_CONVEX_URL before logging world events.",
    );
  }

  if (!convexClient || convexClientUrl !== url) {
    convexClient = new ConvexHttpClient(url);
    convexClientUrl = url;
  }

  return convexClient;
}

export function getGrantAccessExplorerUrl(txid: string, network = getContractNetwork()) {
  return `https://explorer.hiro.so/txid/${txid}?chain=${network}`;
}

export async function grantPremiumAccess(
  config: PremiumAccessGrantConfig,
): Promise<PremiumAccessGrantResult> {
  const senderKey = getStacksPrivateKey();
  if (!senderKey) {
    throw new Error(
      "No deployer key is configured. Set DEPLOYER_PRIVATE_KEY or STACKS_PRIVATE_KEY before granting access.",
    );
  }

  const network = getContractNetwork();
  const tx = await makeContractCall({
    contractAddress: PREMIUM_ACCESS_CONTRACT_ADDRESS,
    contractName: PREMIUM_ACCESS_CONTRACT_NAME,
    functionName: PREMIUM_ACCESS_FUNCTION_NAME,
    functionArgs: [
      stringAsciiCV(config.resourceId),
      principalCV(config.payerPrincipal),
    ],
    senderKey,
    network,
    postConditionMode: PostConditionMode.Allow,
  });

  const result = await broadcastTransaction({ transaction: tx, network });
  if ("error" in result) {
    throw new Error(formatBroadcastError(result));
  }

  return {
    txid: result.txid,
    explorerUrl: getGrantAccessExplorerUrl(result.txid, network),
  };
}

export async function logPremiumAccessWorldEvent(
  config: PremiumAccessGrantConfig & { grantAccessTxid: string },
) {
  const convex = getConvexClient();
  await convex.mutation((api as any).worldState.appendEvent, {
    mapName: WORLD_FEED_MAP_NAME,
    eventType: "premium-access-granted",
    actorId: config.agentInstanceName,
    summary: `${config.agentDisplayName} granted premium access to ${config.payerPrincipal}`,
    detailsJson: JSON.stringify({
      resourceId: config.resourceId,
      payerPrincipal: config.payerPrincipal,
      txid: config.grantAccessTxid,
      paymentTxid: config.paymentTxid,
      agent: config.agentInstanceName,
    }),
  });
}

export async function notifyAgentEarning(config: {
  agentId: string;
  agentDisplayName: string;
  amountMicroStx: number;
  payerPrincipal: string;
  paymentTxid: string;
  resourceId: string;
  mapName?: string;
}) {
  const convex = getConvexClient();
  await convex.mutation(
    (api as any).agents.agentEconomics.onPremiumPaymentConfirmed,
    config,
  );
}
