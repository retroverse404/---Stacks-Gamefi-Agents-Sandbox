import "./env.js";
import type { Request, Response } from "express";
import express from "express";
import { STXtoMicroSTX, getPayment, paymentMiddleware } from "x402-stacks";
import { AlexSDK, Currency } from "alex-sdk";

const alex = new AlexSDK();
import { registerLocalFacilitatorRoutes } from "./facilitator.js";
import { getHiroNodeBaseUrl, isHiroConfigured } from "./hiro.js";
import {
  grantPremiumAccess,
  logPremiumAccessWorldEvent,
  notifyAgentEarning,
  type PremiumAccessGrantConfig,
} from "./premiumAccess.js";

const app = express();
const port = Number(process.env.PORT || 4020);
const networkName = (process.env.NETWORK || "testnet").toLowerCase();
const serverAddress = process.env.SERVER_ADDRESS || "";
const facilitatorUrl = process.env.FACILITATOR_URL || "";
const guidePremiumPrice = Number(process.env.GUIDE_PREMIUM_PRICE_STX || "1");
const marketPremiumPrice = Number(process.env.MARKET_PREMIUM_PRICE_STX || "0.001");
const melPremiumPrice = Number(
  process.env.MEL_PREMIUM_PRICE_STX || guidePremiumPrice.toString(),
);
const network = networkName === "mainnet" ? "mainnet" : "testnet";
const marketNetworkName = (process.env.MARKET_NETWORK || networkName).toLowerCase();
const marketNetwork = marketNetworkName === "testnet" ? "testnet" : "mainnet";
const marketServerAddress = process.env.MARKET_SERVER_ADDRESS || serverAddress;
// Each agent receives payments to their own wallet — they earn from their role.
const guideServerAddress = process.env.GUIDE_SERVER_ADDRESS || serverAddress;
const melServerAddress = process.env.MEL_SERVER_ADDRESS || serverAddress;
const questsServerAddress = process.env.QUESTS_SERVER_ADDRESS || serverAddress;
const resolvedFacilitatorUrl = facilitatorUrl || `http://127.0.0.1:${port}`;

const GUIDE_PREMIUM_ACCESS: Omit<PremiumAccessGrantConfig, "payerPrincipal" | "paymentTxid"> = {
  agentDisplayName: "guide.btc",
  agentInstanceName: "guide-btc",
  resourceId: "guide-btc-premium-brief",
};

const BOOKSHELF_PREMIUM_ACCESS: Omit<PremiumAccessGrantConfig, "payerPrincipal" | "paymentTxid"> = {
  agentDisplayName: "guide.btc",
  agentInstanceName: "guide-btc",
  resourceId: "cozy-cabin-bookshelf-brief",
};

const MARKET_PREMIUM_ACCESS: Omit<PremiumAccessGrantConfig, "payerPrincipal" | "paymentTxid"> = {
  agentDisplayName: "market.btc",
  agentInstanceName: "market-btc",
  resourceId: "market-btc-live-quote",
};

const MEL_PREMIUM_ACCESS: Omit<PremiumAccessGrantConfig, "payerPrincipal" | "paymentTxid"> = {
  agentDisplayName: "Mel",
  agentInstanceName: "mel-curator",
  resourceId: "mel-curator-signal",
};

const WAX_CYLINDER_PREMIUM_ACCESS: Omit<PremiumAccessGrantConfig, "payerPrincipal" | "paymentTxid"> = {
  agentDisplayName: "Mel",
  agentInstanceName: "mel-curator",
  resourceId: "cozy-cabin-wax-cylinder-memory",
};

async function finalizePremiumAccess(
  req: Request,
  config: Omit<PremiumAccessGrantConfig, "payerPrincipal" | "paymentTxid">,
  amountMicroStx?: number,
) {
  const payment = getPayment(req);
  const payerPrincipal = payment?.payer;
  if (!payerPrincipal) {
    throw new Error("Verified x402 payment did not include a payer principal.");
  }

  const paymentTxid = payment.transaction || "";
  const grant = await grantPremiumAccess({
    ...config,
    payerPrincipal,
    paymentTxid,
  });

  let worldEventLogged = false;
  try {
    await logPremiumAccessWorldEvent({
      ...config,
      payerPrincipal,
      paymentTxid,
      grantAccessTxid: grant.txid,
    });
    worldEventLogged = true;
  } catch (error) {
    console.warn("[x402-api] premium access granted, but world event logging failed", error);
  }

  // Record agent earning in Convex (fire-and-forget — don't block the response)
  if (amountMicroStx) {
    notifyAgentEarning({
      agentId: config.agentInstanceName,
      agentDisplayName: config.agentDisplayName,
      amountMicroStx,
      payerPrincipal,
      paymentTxid,
      resourceId: config.resourceId,
      mapName: "Cozy Cabin",
    }).catch((err) => {
      console.warn("[x402-api] agent earning notification failed", err);
    });
  }

  return {
    payerPrincipal,
    paymentTxid,
    grantAccessExplorerUrl: grant.explorerUrl,
    grantAccessTxid: grant.txid,
    resourceId: config.resourceId,
    worldEventLogged,
  };
}

function sendGrantAccessFailure(res: Response, error: unknown) {
  res.status(502).json({
    error: "premium_access_grant_failed",
    message:
      error instanceof Error && error.message
        ? error.message
        : "Failed to record premium access onchain.",
  });
}

app.use(express.json());
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.header("Access-Control-Allow-Origin", origin);
    res.header("Vary", "Origin");
  }
  res.header("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.header(
    "Access-Control-Allow-Headers",
    "Content-Type,payment-signature,payment-response",
  );
  res.header(
    "Access-Control-Expose-Headers",
    "payment-required,payment-response",
  );

  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }

  next();
});

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "stacks2d-x402-api",
    network: networkName,
    configured: Boolean(serverAddress),
    facilitatorUrl: resolvedFacilitatorUrl,
    facilitatorMode: facilitatorUrl ? "external" : "local-fallback",
    hiroApiKeyConfigured: isHiroConfigured(),
    hiroNodeBaseUrl: getHiroNodeBaseUrl(networkName === "mainnet" ? "mainnet" : "testnet"),
  });
});

app.get("/api/premium/guide-btc/metadata", (_req, res) => {
  res.json({
    name: "guide.btc classified briefing",
    description: "Premium Stacks ecosystem briefing for the guide desk.",
    network: networkName,
    asset: "STX",
    priceStx: guidePremiumPrice,
    resource: "/api/premium/guide-btc",
    facilitatorUrl: resolvedFacilitatorUrl,
    status: facilitatorUrl ? "external-facilitator" : "local-facilitator-fallback",
  });
});

app.get("/api/premium/guide-btc/bookshelf-brief/metadata", (_req, res) => {
  res.json({
    name: "Cozy Cabin bookshelf brief",
    description: "Premium lore packet and research brief unlocked from the Cozy Cabin study shelf.",
    network: networkName,
    asset: "STX",
    priceStx: guidePremiumPrice,
    resource: "/api/premium/guide-btc/bookshelf-brief",
    facilitatorUrl: resolvedFacilitatorUrl,
    status: facilitatorUrl ? "external-facilitator" : "local-facilitator-fallback",
  });
});

app.get("/api/premium/market-btc/metadata", (_req, res) => {
  res.json({
    name: "market-btc live quote",
    description: "Pay-per-call live swap quote from ALEX DEX on Stacks.",
    network: marketNetworkName,
    asset: "STX",
    priceStx: marketPremiumPrice,
    resource: "/api/premium/market-btc/quote",
    facilitatorUrl: resolvedFacilitatorUrl,
    status: facilitatorUrl ? "external-facilitator" : "local-facilitator-fallback",
  });
});

app.get("/api/premium/mel/metadata", (_req, res) => {
  res.json({
    name: "Mel curator signal",
    description: "Premium curator signal from Mel's curation desk.",
    network: networkName,
    asset: "STX",
    priceStx: melPremiumPrice,
    resource: "/api/premium/mel/signal",
    facilitatorUrl: resolvedFacilitatorUrl,
    status: facilitatorUrl ? "external-facilitator" : "local-facilitator-fallback",
  });
});

app.get("/api/premium/mel/wax-cylinder-memory/metadata", (_req, res) => {
  res.json({
    name: "Wax cylinder memory fragment",
    description: "Premium playback from the Cozy Cabin phonograph archive.",
    network: networkName,
    asset: "STX",
    priceStx: melPremiumPrice,
    resource: "/api/premium/mel/wax-cylinder-memory",
    facilitatorUrl: resolvedFacilitatorUrl,
    status: facilitatorUrl ? "external-facilitator" : "local-facilitator-fallback",
  });
});

registerLocalFacilitatorRoutes(app, { network });

if (!guideServerAddress) {
  app.get("/api/premium/guide-btc", (_req, res) => {
    res.status(503).json({
      error: "x402_api_not_configured",
      message:
        "SERVER_ADDRESS is not set. Configure the x402 API before enabling paid guide access.",
    });
  });
  app.get("/api/premium/guide-btc/bookshelf-brief", (_req, res) => {
    res.status(503).json({
      error: "x402_api_not_configured",
      message:
        "SERVER_ADDRESS is not set. Configure the x402 API before enabling paid bookshelf access.",
    });
  });
} else {
  app.get(
    "/api/premium/guide-btc",
    paymentMiddleware({
      amount: STXtoMicroSTX(guidePremiumPrice),
      payTo: guideServerAddress,
      network,
      facilitatorUrl: resolvedFacilitatorUrl,
      description: "guide.btc classified briefing",
      tokenType: "STX",
    }),
    async (req, res) => {
      try {
        const premiumAccess = await finalizePremiumAccess(req, GUIDE_PREMIUM_ACCESS, STXtoMicroSTX(guidePremiumPrice));
        res.json({
          title: "guide.btc classified briefing",
          classification: "premium",
          summary:
            "This endpoint is the narrow x402 payment boundary for premium guide content.",
          network: networkName,
          asset: "STX",
          priceStx: guidePremiumPrice,
          deliveredAt: Date.now(),
          ...premiumAccess,
        });
      } catch (error) {
        sendGrantAccessFailure(res, error);
      }
    },
  );

  app.get(
    "/api/premium/guide-btc/bookshelf-brief",
    paymentMiddleware({
      amount: STXtoMicroSTX(guidePremiumPrice),
      payTo: guideServerAddress,
      network,
      facilitatorUrl: resolvedFacilitatorUrl,
      description: "Cozy Cabin bookshelf premium brief",
      tokenType: "STX",
    }),
    async (req, res) => {
      try {
        const premiumAccess = await finalizePremiumAccess(req, BOOKSHELF_PREMIUM_ACCESS, STXtoMicroSTX(guidePremiumPrice));
        res.json({
          title: "Cozy Cabin bookshelf brief",
          classification: "premium",
          delivery: "lore-packet",
          objectKey: "bookshelf-lore",
          zoneKey: "study-wing",
          summary:
            "The shelf opens into a deeper guide.btc lesson tying Stacks, agentic worlds, and premium object-driven interactions together.",
          sections: [
            {
              heading: "Stacks",
              body:
                "Stacks gives agent worlds durable identity, payment rails, and programmable access without forcing every interaction fully onchain.",
            },
            {
              heading: "Objects",
              body:
                "This bookshelf is a world-native premium terminal: inspect for free, pay only when you want the deeper packet, and keep the result in the world feed.",
            },
            {
              heading: "Next clue",
              body:
                "The study shelf points toward the phonograph corner, where lost recordings and wax-cylinder artifacts can become collectible premium moments.",
            },
          ],
          network: networkName,
          asset: "STX",
          priceStx: guidePremiumPrice,
          deliveredAt: Date.now(),
          ...premiumAccess,
        });
      } catch (error) {
        sendGrantAccessFailure(res, error);
      }
    },
  );
}

if (!melServerAddress) {
  app.get("/api/premium/mel/signal", (_req, res) => {
    res.status(503).json({
      error: "x402_api_not_configured",
      message:
        "MEL_SERVER_ADDRESS is not set. Configure the x402 API before enabling paid Mel access.",
    });
  });
  app.get("/api/premium/mel/wax-cylinder-memory", (_req, res) => {
    res.status(503).json({
      error: "x402_api_not_configured",
      message:
        "MEL_SERVER_ADDRESS is not set. Configure the x402 API before enabling wax-cylinder playback.",
    });
  });
} else {
  app.get(
    "/api/premium/mel/signal",
    paymentMiddleware({
      amount: STXtoMicroSTX(melPremiumPrice),
      payTo: melServerAddress,
      network,
      facilitatorUrl: resolvedFacilitatorUrl,
      description: "Mel curator signal",
      tokenType: "STX",
    }),
    async (req, res) => {
      try {
        const premiumAccess = await finalizePremiumAccess(req, MEL_PREMIUM_ACCESS, STXtoMicroSTX(melPremiumPrice));
        res.json({
          title: "Mel curator signal",
          classification: "premium",
          summary:
            "Mel surfaced a premium curation signal covering projects, creators, and ecosystem momentum.",
          network: networkName,
          asset: "STX",
          priceStx: melPremiumPrice,
          curator: "Mel",
          focus: ["projects", "creators", "content", "signal"],
          deliveredAt: Date.now(),
          ...premiumAccess,
        });
      } catch (error) {
        sendGrantAccessFailure(res, error);
      }
    },
  );

  app.get(
    "/api/premium/mel/wax-cylinder-memory",
    paymentMiddleware({
      amount: STXtoMicroSTX(melPremiumPrice),
      payTo: melServerAddress,
      network,
      facilitatorUrl: resolvedFacilitatorUrl,
      description: "Wax cylinder memory fragment",
      tokenType: "STX",
    }),
    async (req, res) => {
      try {
        const premiumAccess = await finalizePremiumAccess(req, WAX_CYLINDER_PREMIUM_ACCESS, STXtoMicroSTX(melPremiumPrice));
        res.json({
          title: "Wax cylinder memory fragment",
          classification: "premium",
          delivery: "memory-fragment",
          objectKey: "phonograph-player",
          zoneKey: "music-corner",
          artifactKey: "wax-cylinder",
          summary:
            "The phonograph crackles to life and reveals a preserved memory fragment from the Cozy Cabin archive.",
          sections: [
            {
              heading: "Archive note",
              body:
                "This recording was catalogued as a relic of early agentic culture: part music, part memory, part proof that a world can carry history.",
            },
            {
              heading: "Memory fragment",
              body:
                "A warm jazz loop spills through the room while the voice on the cylinder speaks of identity, persistence, and worlds built not just for players, but for agents.",
            },
            {
              heading: "Unlock",
              body:
                "This playback can become the first collectible wax-cylinder artifact, later tied to a GLB reveal, a 3D relic chamber, or an NFT claim.",
            },
          ],
          network: networkName,
          asset: "STX",
          priceStx: melPremiumPrice,
          deliveredAt: Date.now(),
          ...premiumAccess,
        });
      } catch (error) {
        sendGrantAccessFailure(res, error);
      }
    },
  );
}

if (!marketServerAddress) {
  app.get("/api/premium/market-btc/quote", (_req, res) => {
    res.status(503).json({
      error: "x402_api_not_configured",
      message:
        "MARKET_SERVER_ADDRESS is not set. Configure the x402 API before enabling paid market-btc access.",
    });
  });
} else {
  app.get(
    "/api/premium/market-btc/quote",
    paymentMiddleware({
      amount: STXtoMicroSTX(marketPremiumPrice),
      payTo: marketServerAddress,
      network: marketNetwork,
      facilitatorUrl: resolvedFacilitatorUrl,
      description: "market-btc live ALEX DEX quote",
      tokenType: "STX",
    }),
    async (req, res) => {
      const tokenX = (req.query.tokenX as string) || "STX";
      const tokenY = (req.query.tokenY as string) || "ALEX";
      const amountIn = (req.query.amountIn as string) || "1000000";
      let expectedAmountOut: string;

      try {
        const quote = await alex.getAmountTo(
          Currency.STX,
          BigInt(amountIn),
          Currency.ALEX,
        );
        expectedAmountOut = quote.toString();
      } catch (err) {
        res.status(502).json({
          error: "quote_failed",
          message:
            err instanceof Error && err.message
              ? err.message
              : "ALEX SDK quote unavailable.",
          tokenX,
          tokenY,
          amountIn,
          expectedAmountOut: null,
          source: "market-btc-m1",
          network: marketNetworkName,
          deliveredAt: Date.now(),
        });
        return;
      }

      try {
        const premiumAccess = await finalizePremiumAccess(req, MARKET_PREMIUM_ACCESS, STXtoMicroSTX(marketPremiumPrice));
        res.json({
          tokenX,
          tokenY,
          amountIn,
          expectedAmountOut,
          source: "market-btc-m1",
          agentAddress: marketServerAddress,
          network: marketNetworkName,
          deliveredAt: Date.now(),
          ...premiumAccess,
        });
      } catch (err) {
        res.status(502).json({
          error: "premium_access_grant_failed",
          message:
            err instanceof Error && err.message
              ? err.message
              : "Failed to record premium access onchain.",
          tokenX,
          tokenY,
          amountIn,
          expectedAmountOut,
          source: "market-btc-m1",
          network: marketNetworkName,
          deliveredAt: Date.now(),
        });
      }
    },
  );
}

app.listen(port, () => {
  console.log(
    `[stacks2d-x402-api] listening on http://127.0.0.1:${port} (${networkName})`,
  );
});
