export type StacksNetworkName = "mainnet" | "testnet";

const HIRO_MAINNET_BASE_URL = "https://api.hiro.so";
const HIRO_TESTNET_BASE_URL = "https://api.testnet.hiro.so";

export function getHiroApiKey() {
  return process.env.HIRO_API_KEY || "";
}

export function getHiroNodeBaseUrl(network: StacksNetworkName) {
  const customBaseUrl = process.env.HIRO_API_BASE_URL || "";
  if (customBaseUrl) return customBaseUrl.replace(/\/$/, "");
  return network === "mainnet" ? HIRO_MAINNET_BASE_URL : HIRO_TESTNET_BASE_URL;
}

export function getHiroHeaders() {
  const apiKey = getHiroApiKey();
  return apiKey ? { "x-api-key": apiKey } : {};
}

export function isHiroConfigured() {
  return Boolean(getHiroApiKey());
}
