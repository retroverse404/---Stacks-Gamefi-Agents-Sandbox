import type { Express, Request, Response } from "express";
import { hexToBytes } from "@stacks/common";
import {
  addressFromVersionHash,
  addressHashModeToVersion,
  addressToString,
  deserializeTransaction,
  isTokenTransferPayload,
} from "@stacks/transactions";
import {
  STACKS_NETWORKS,
  X402_ERROR_CODES,
  networkFromCAIP2,
  type FacilitatorSettleRequestV2,
  type FacilitatorVerifyRequestV2,
  type PaymentRequirementsV2,
  type SupportedResponse,
} from "x402-stacks";
import { getHiroHeaders, getHiroNodeBaseUrl, type StacksNetworkName } from "./hiro.js";

type ValidationSuccess = {
  ok: true;
  payer: string;
  network: PaymentRequirementsV2["network"];
  signedTransactionHex: string;
};

type ValidationFailure = {
  ok: false;
  invalidReason: string;
  payer?: string;
};

type ValidationResult = ValidationSuccess | ValidationFailure;

type FacilitatorOptions = {
  network: StacksNetworkName;
};

function getConfiguredCaip2Network(network: StacksNetworkName) {
  return network === "mainnet" ? STACKS_NETWORKS.MAINNET : STACKS_NETWORKS.TESTNET;
}

function resolveRequestedNetwork(
  body: FacilitatorVerifyRequestV2 | FacilitatorSettleRequestV2,
): StacksNetworkName | null {
  try {
    return networkFromCAIP2(body?.paymentRequirements?.network);
  } catch {
    return null;
  }
}

function normalizeTransactionHex(transactionHex: string) {
  return transactionHex.startsWith("0x") ? transactionHex.slice(2) : transactionHex;
}

function resolvePayerAddress(transaction: ReturnType<typeof deserializeTransaction>) {
  const spendingCondition = transaction.auth.spendingCondition;
  if (
    !spendingCondition ||
    !("hashMode" in spendingCondition) ||
    !("signer" in spendingCondition)
  ) {
    return null;
  }

  const txNetwork = transaction.chainId === 1 ? "mainnet" : "testnet";

  return addressToString(
    addressFromVersionHash(
      addressHashModeToVersion(
        spendingCondition.hashMode,
        txNetwork,
      ),
      spendingCondition.signer,
    ),
  );
}

function validatePaymentRequest(
  body: FacilitatorVerifyRequestV2 | FacilitatorSettleRequestV2,
): ValidationResult {
  if (body?.x402Version !== 2) {
    return { ok: false, invalidReason: X402_ERROR_CODES.INVALID_X402_VERSION };
  }

  const signedTransactionHex = body?.paymentPayload?.payload?.transaction;
  if (!signedTransactionHex || typeof signedTransactionHex !== "string") {
    return { ok: false, invalidReason: X402_ERROR_CODES.INVALID_PAYLOAD };
  }

  const paymentRequirements = body.paymentRequirements;
  if (
    !paymentRequirements ||
    paymentRequirements.asset !== "STX" ||
    !paymentRequirements.payTo ||
    !paymentRequirements.amount
  ) {
    return { ok: false, invalidReason: X402_ERROR_CODES.INVALID_PAYMENT_REQUIREMENTS };
  }

  const requestedNetwork = resolveRequestedNetwork(body);
  if (!requestedNetwork) {
    return { ok: false, invalidReason: X402_ERROR_CODES.INVALID_NETWORK };
  }

  const transaction = (() => {
    try {
      return deserializeTransaction(normalizeTransactionHex(signedTransactionHex));
    } catch {
      return null;
    }
  })();

  if (!transaction || !isTokenTransferPayload(transaction.payload)) {
    return { ok: false, invalidReason: X402_ERROR_CODES.INVALID_PAYLOAD };
  }

  const payer = resolvePayerAddress(transaction);
  if (!payer) {
    return { ok: false, invalidReason: X402_ERROR_CODES.INVALID_PAYLOAD };
  }

  const transactionNetwork = transaction.chainId === 1 ? "mainnet" : "testnet";
  if (transactionNetwork !== requestedNetwork) {
    return { ok: false, invalidReason: X402_ERROR_CODES.INVALID_NETWORK };
  }

  try {
    transaction.verifyOrigin();
  } catch {
    return {
      ok: false,
      invalidReason: X402_ERROR_CODES.INVALID_PAYLOAD,
      payer,
    };
  }

  const recipientRaw = transaction.payload.recipient;
  const recipient = typeof recipientRaw === "string"
    ? recipientRaw
    : (recipientRaw as any).value ?? addressToString((recipientRaw as any).address);
  if (recipient !== paymentRequirements.payTo) {
    return {
      ok: false,
      invalidReason: X402_ERROR_CODES.RECIPIENT_MISMATCH,
      payer,
    };
  }

  const requiredAmount = BigInt(paymentRequirements.amount);
  if (transaction.payload.amount < requiredAmount) {
    return {
      ok: false,
      invalidReason: X402_ERROR_CODES.AMOUNT_INSUFFICIENT,
      payer,
    };
  }

  return {
    ok: true,
    payer,
    network: paymentRequirements.network,
    signedTransactionHex: normalizeTransactionHex(signedTransactionHex),
  };
}

async function broadcastViaHiro(
  signedTransactionHex: string,
  network: StacksNetworkName,
) {
  const url = `${getHiroNodeBaseUrl(network)}/v2/transactions`;
  const rawTransaction = hexToBytes(signedTransactionHex);
  const headers = new Headers({
    "Content-Type": "application/octet-stream",
  });
  for (const [key, value] of Object.entries(getHiroHeaders())) {
    headers.set(key, value);
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: rawTransaction,
  });

  const text = await response.text();
  let parsed: unknown = text;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    // keep raw text as-is
  }

  if (!response.ok) {
    return {
      error: typeof parsed === "string" ? parsed : JSON.stringify(parsed),
      reason: typeof parsed === "string" ? parsed : JSON.stringify(parsed),
    };
  }

  return parsed;
}

function getBroadcastFailureReason(result: Awaited<ReturnType<typeof broadcastViaHiro>>) {
  const candidate = result as { reason?: unknown; error?: unknown };
  if (typeof candidate.reason === "string" && candidate.reason) {
    return candidate.reason;
  }
  if (typeof candidate.error === "string" && candidate.error) {
    return candidate.error;
  }
  return X402_ERROR_CODES.BROADCAST_FAILED;
}

function sendSupported(res: Response, network: StacksNetworkName) {
  const response: SupportedResponse = {
    kinds: [
      {
        x402Version: 2,
        scheme: "exact",
        network: getConfiguredCaip2Network(network),
      },
      {
        x402Version: 2,
        scheme: "exact",
        network: getConfiguredCaip2Network(network === "mainnet" ? "testnet" : "mainnet"),
      },
    ],
    extensions: [],
    signers: {},
  };

  res.json(response);
}

async function verifyPayment(
  req: Request<unknown, unknown, FacilitatorVerifyRequestV2>,
  res: Response,
  _network: StacksNetworkName,
) {
  const validation = validatePaymentRequest(req.body);
  if (!validation.ok) {
    res.json({
      isValid: false,
      invalidReason: validation.invalidReason,
      payer: validation.payer,
    });
    return;
  }

  res.json({
    isValid: true,
    payer: validation.payer,
  });
}

async function settlePayment(
  req: Request<unknown, unknown, FacilitatorSettleRequestV2>,
  res: Response,
  network: StacksNetworkName,
) {
  const validation = validatePaymentRequest(req.body);
  if (!validation.ok) {
    const requestedNetwork = resolveRequestedNetwork(req.body) ?? network;
    res.json({
      success: false,
      errorReason: validation.invalidReason,
      payer: validation.payer,
      transaction: "",
      network: getConfiguredCaip2Network(requestedNetwork),
    });
    return;
  }

  try {
    const requestedNetwork = resolveRequestedNetwork(req.body) ?? network;
    const result = await broadcastViaHiro(validation.signedTransactionHex, requestedNetwork);
    const txid = typeof result === "string" ? result : (result as any).txid;
    if (txid) {
      res.json({
        success: true,
        payer: validation.payer,
        transaction: txid,
        network: validation.network,
      });
      return;
    }

    res.json({
      success: false,
      errorReason: getBroadcastFailureReason(result),
      payer: validation.payer,
      transaction: "",
      network: validation.network,
    });
  } catch (error) {
    res.json({
      success: false,
      errorReason:
        error instanceof Error && error.message
          ? error.message
          : X402_ERROR_CODES.UNEXPECTED_SETTLE_ERROR,
      payer: validation.payer,
      transaction: "",
      network: validation.network,
    });
  }
}

export function registerLocalFacilitatorRoutes(
  app: Express,
  options: FacilitatorOptions,
) {
  app.get("/supported", (_req, res) => sendSupported(res, options.network));
  app.post("/verify", (req, res) => verifyPayment(req, res, options.network));
  app.post("/settle", (req, res) => settlePayment(req, res, options.network));
}
