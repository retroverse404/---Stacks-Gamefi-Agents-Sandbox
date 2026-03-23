import {
  connectStacksWallet,
  formatStacksProvider,
  getCachedStacksProviderId,
  signStacksTransaction,
  type StacksAppNetwork,
} from "./stacksWallet.ts";

type AppNetwork = StacksAppNetwork;
const X402_FETCH_TIMEOUT_MS = 12000;

interface PaymentRequirementsV2 {
  scheme: string;
  network: string;
  amount: string;
  asset: string;
  payTo: string;
  maxTimeoutSeconds?: number;
  extra?: Record<string, unknown>;
}

interface ResourceInfo {
  url: string;
  description?: string;
  mimeType?: string;
}

interface PaymentRequiredV2 {
  x402Version: number;
  resource: ResourceInfo;
  accepts: PaymentRequirementsV2[];
}

interface PaymentPayloadV2 {
  x402Version: number;
  resource?: ResourceInfo;
  accepted: PaymentRequirementsV2;
  payload: {
    transaction: string;
  };
}

export const X402_HEADERS = {
  PAYMENT_REQUIRED: "payment-required",
  PAYMENT_SIGNATURE: "payment-signature",
  PAYMENT_RESPONSE: "payment-response",
} as const;

export class X402RequestError extends Error {
  status: number;
  details: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = "X402RequestError";
    this.status = status;
    this.details = details;
  }
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "";
}

function resolvePaymentNetwork(
  requestedNetwork: string | undefined,
  fallbackNetwork: AppNetwork,
): AppNetwork {
  switch (requestedNetwork) {
    case "mainnet":
    case "stacks:1":
      return "mainnet";
    case "testnet":
    case "stacks:2147483648":
      return "testnet";
    default:
      return fallbackNetwork;
  }
}

function isWalletNetworkMismatch(error: unknown, network: AppNetwork) {
  const message = getErrorMessage(error);
  if (!message) return false;

  const wrongNetworkMarker =
    network === "testnet"
      ? "mainnet Stacks address"
      : "testnet Stacks address";
  const missingAccountMarker =
    network === "testnet"
      ? "usable testnet STX account"
      : "usable mainnet STX account";

  return (
    message.includes(wrongNetworkMarker) ||
    message.includes(missingAccountMarker) ||
    message.includes("Mismatched Network")
  );
}

function formatWalletNetworkRetryMessage(network: AppNetwork, error: unknown) {
  const message = getErrorMessage(error);
  const expectedNetwork = network === "testnet" ? "Stacks testnet" : "Stacks mainnet";
  if (!message) {
    return `This paid action requires ${expectedNetwork}. Reconnect a wallet on that network and try again.`;
  }

  if (message.includes("Switch the wallet")) {
    return `${message} If the extension is already on ${expectedNetwork}, reconnect it from the wallet controls and retry the payment.`;
  }

  return `${message} Reconnect a wallet on ${expectedNetwork} and retry the payment.`;
}

async function connectWalletForPayment(network: AppNetwork) {
  const cachedProviderId = getCachedStacksProviderId() ?? undefined;
  const attempts = [
    { providerId: cachedProviderId },
    ...(cachedProviderId ? [{ forceWalletSelect: true, providerId: cachedProviderId }] : []),
    { forceWalletSelect: true as const },
  ];

  let lastMismatchError: unknown = null;

  for (const attempt of attempts) {
    try {
      return await connectStacksWallet(network, attempt);
    } catch (error) {
      if (!isWalletNetworkMismatch(error, network)) {
        throw error;
      }
      lastMismatchError = error;
    }
  }

  throw new Error(formatWalletNetworkRetryMessage(network, lastMismatchError));
}

function encodePayload(payload: PaymentPayloadV2): string {
  return btoa(JSON.stringify(payload));
}

function decode402Header(headerValue: string | null): PaymentRequiredV2 | null {
  if (!headerValue) return null;

  try {
    return JSON.parse(atob(headerValue)) as PaymentRequiredV2;
  } catch {
    return null;
  }
}

async function parseJsonIfPossible(response: Response) {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function parse402Response(response: Response, body: unknown): PaymentRequiredV2 {
  const fromHeader = decode402Header(response.headers.get(X402_HEADERS.PAYMENT_REQUIRED));
  if (fromHeader?.accepts?.length) return fromHeader;

  if (
    body &&
    typeof body === "object" &&
    "accepts" in body &&
    Array.isArray((body as PaymentRequiredV2).accepts) &&
    (body as PaymentRequiredV2).accepts.length > 0
  ) {
    return body as PaymentRequiredV2;
  }

  throw new Error("No valid x402 payment requirements found in 402 response.");
}

async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), X402_FETCH_TIMEOUT_MS);
  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(
        "The x402 service did not respond in time. Retry in a moment. If this keeps happening, the payment service is unavailable.",
      );
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function signX402Payment(
  paymentRequired: PaymentRequiredV2,
  accepted: PaymentRequirementsV2,
  network: AppNetwork,
): Promise<string> {
  if (!accepted.payTo) {
    throw new Error("x402 payment request is missing a payTo address.");
  }

  const { bytesToHex } = await import("@stacks/common");
  const { makeUnsignedSTXTokenTransfer } = await import("@stacks/transactions");
  const paymentNetwork = resolvePaymentNetwork(accepted.network, network);
  const account = await connectWalletForPayment(paymentNetwork);

  const unsignedTx = await makeUnsignedSTXTokenTransfer({
    publicKey: account.publicKey,
    recipient: accepted.payTo,
    amount: BigInt(accepted.amount),
    network: paymentNetwork,
  });
  const serializedTx = unsignedTx.serialize();
  const txHex =
    typeof serializedTx === "string" ? serializedTx : bytesToHex(serializedTx);

  let signResult: { transaction?: string };
  try {
    signResult = await signStacksTransaction(txHex, account.providerId);
  } catch (error: any) {
    if (
      error?.code === 4001 ||
      error?.code === -32002 ||
      error?.message === "Wallet access denied." ||
      (typeof error?.message === "string" && error.message.includes("Access denied"))
    ) {
      throw new Error(
        `${formatStacksProvider(account.providerId)} denied the transaction-signing request. Reconnect that wallet and approve the payment prompt.`,
      );
    }
    throw error;
  }

  if (!signResult.transaction) {
    throw new Error("Wallet did not return a signed transaction.");
  }

  return encodePayload({
    x402Version: 2,
    resource: paymentRequired.resource,
    accepted,
    payload: {
      transaction: signResult.transaction,
    },
  });
}

export function resolveX402Url(endpointPath: string) {
  const configuredBaseUrl = import.meta.env.VITE_X402_API_URL as string | undefined;
  if (configuredBaseUrl) {
    return new URL(endpointPath, configuredBaseUrl).toString();
  }

  if (typeof window !== "undefined") {
    const hostname = window.location.hostname;
    const protocol = window.location.protocol === "https:" ? "https:" : "http:";
    const isDevHost =
      hostname === "127.0.0.1" ||
      hostname === "localhost" ||
      window.location.port === "5173" ||
      window.location.port === "5174";

    if (isDevHost) {
      return new URL(endpointPath, `${protocol}//${hostname}:4020`).toString();
    }
  }

  return endpointPath;
}

export async function x402Fetch<T>(
  endpointUrl: string,
  network: AppNetwork,
  init?: RequestInit,
): Promise<T> {
  const firstResponse = await fetchWithTimeout(endpointUrl, init);
  if (firstResponse.status !== 402) {
    const body = await parseJsonIfPossible(firstResponse);
    if (!firstResponse.ok) {
      throw new X402RequestError(
        `Request failed with HTTP ${firstResponse.status}.`,
        firstResponse.status,
        body,
      );
    }
    return body as T;
  }

  const firstBody = await parseJsonIfPossible(firstResponse);
  const paymentRequired = parse402Response(firstResponse, firstBody);
  const accepted = paymentRequired.accepts[0];
  if (!accepted) {
    throw new Error("No accepted payment method was returned by the x402 service.");
  }

  const encodedPayload = await signX402Payment(paymentRequired, accepted, network);

  const retryResponse = await fetchWithTimeout(endpointUrl, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      [X402_HEADERS.PAYMENT_SIGNATURE]: encodedPayload,
    },
  });

  const retryBody = await parseJsonIfPossible(retryResponse);
  if (!retryResponse.ok) {
    throw new X402RequestError(
      `Paid request failed with HTTP ${retryResponse.status}.`,
      retryResponse.status,
      retryBody,
    );
  }

  return retryBody as T;
}
