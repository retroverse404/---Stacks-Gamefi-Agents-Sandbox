import "./MarketNpcSplash.css";
import { getConvexClient } from "../../lib/convexClient.ts";
import { api } from "../../../convex/_generated/api";
import type { SplashScreen, SplashScreenCallbacks } from "../SplashTypes.ts";
import { X402RequestError, resolveX402Url, x402Fetch } from "../../lib/x402.ts";
import { getLocalAiFallbackLine, isMissingBraintrustConfig } from "../../lib/aiFallback.ts";

export interface MarketNpcSplashProps extends SplashScreenCallbacks {
  npcName: string;
}

type MarketTickerPayload = {
  source?: string;
  syncedAt?: number;
  items?: Array<{
    symbol: string;
    price: number;
    priceLabel: string;
    change24h: number;
  }>;
};

type MarketOfferPayload = {
  title?: string;
  description?: string;
  priceAsset?: string;
  priceAmount?: string;
  network?: string;
  endpointPath?: string;
  status?: string;
};

type QuoteResponsePayload = {
  tokenX?: string;
  tokenY?: string;
  amountIn?: string;
  expectedAmountOut?: string | null;
  source?: string;
  agentAddress?: string;
  network?: string;
  deliveredAt?: number;
};

type TraceStepState = "idle" | "pending" | "success" | "error";

type MarketProfilePayload = {
  displayName?: string;
  title?: string;
  personality?: string;
  dialogueStyle?: string;
  systemPrompt?: string;
  knowledge?: string;
};

export function createMarketNpcSplash(props: MarketNpcSplashProps): SplashScreen {
  const { npcName, onClose } = props;
  const offerKey = "market-btc-live-quote";
  const requestClose = () => onClose();
  const handleKeydown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      requestClose();
    }
  };
  window.addEventListener("keydown", handleKeydown);

  const el = document.createElement("div");
  el.className = "mns-overlay";
  el.addEventListener("click", (event) => {
    if (event.target === el) requestClose();
  });

  const card = document.createElement("div");
  card.className = "mns-card";
  card.addEventListener("click", (event) => event.stopPropagation());
  el.appendChild(card);

  const header = document.createElement("div");
  header.className = "mns-header";
  card.appendChild(header);

  const headingWrap = document.createElement("div");
  headingWrap.className = "mns-heading-wrap";
  header.appendChild(headingWrap);

  const eyebrow = document.createElement("div");
  eyebrow.className = "mns-eyebrow";
  eyebrow.textContent = "Market surface";
  headingWrap.appendChild(eyebrow);

  const title = document.createElement("h2");
  title.className = "mns-title";
  title.textContent = npcName;
  headingWrap.appendChild(title);

  const subtitle = document.createElement("div");
  subtitle.className = "mns-subtitle";
  subtitle.textContent = "Tenero-backed token pulse for the Stacks ecosystem";
  headingWrap.appendChild(subtitle);

  const closeBtn = document.createElement("button");
  closeBtn.className = "mns-close";
  closeBtn.textContent = "Close ×";
  closeBtn.addEventListener("click", () => requestClose());
  header.appendChild(closeBtn);

  const summary = document.createElement("div");
  summary.className = "mns-summary";
  card.appendChild(summary);

  const sourcePill = document.createElement("div");
  sourcePill.className = "mns-summary-card";
  sourcePill.textContent = "Loading market source…";
  summary.appendChild(sourcePill);

  const syncPill = document.createElement("div");
  syncPill.className = "mns-summary-card";
  syncPill.textContent = "Waiting for snapshot…";
  summary.appendChild(syncPill);

  const body = document.createElement("div");
  body.className = "mns-body";
  card.appendChild(body);

  const lead = document.createElement("p");
  lead.className = "mns-lead";
  lead.textContent =
    "market.btc watches live Stacks token surfaces and distills them into a compact desk view.";
  body.appendChild(lead);

  const list = document.createElement("div");
  list.className = "mns-list";
  body.appendChild(list);

  const briefWrap = document.createElement("section");
  briefWrap.className = "mns-brief";
  body.appendChild(briefWrap);

  const briefEyebrow = document.createElement("div");
  briefEyebrow.className = "mns-brief-eyebrow";
  briefEyebrow.textContent = "Briefing";
  briefWrap.appendChild(briefEyebrow);

  const briefTitle = document.createElement("div");
  briefTitle.className = "mns-brief-title";
  briefTitle.textContent = "Ask market.btc";
  briefWrap.appendChild(briefTitle);

  const briefInput = document.createElement("textarea");
  briefInput.className = "mns-brief-input";
  briefInput.rows = 3;
  briefInput.placeholder = "Ask about market conditions, relative movers, or token context…";
  briefWrap.appendChild(briefInput);

  const briefActions = document.createElement("div");
  briefActions.className = "mns-brief-actions";
  briefWrap.appendChild(briefActions);

  const askBtns = [
    "What matters in Stacks markets right now?",
    "What are the strongest signals here?",
    "How should I read STX, sBTC, and USDCx together?",
  ].map((label) => {
    const btn = document.createElement("button");
    btn.className = "mns-prompt-btn";
    btn.textContent = label;
    briefActions.appendChild(btn);
    return btn;
  });

  const briefSend = document.createElement("button");
  briefSend.className = "mns-brief-send";
  briefSend.textContent = "Ask market.btc";
  briefWrap.appendChild(briefSend);

  const briefAnswer = document.createElement("div");
  briefAnswer.className = "mns-brief-answer";
  briefAnswer.textContent = "No briefing requested yet.";
  briefWrap.appendChild(briefAnswer);

  const offerWrap = document.createElement("section");
  offerWrap.className = "mns-offer";
  body.appendChild(offerWrap);

  const offerHeader = document.createElement("div");
  offerHeader.className = "mns-offer-header";
  offerWrap.appendChild(offerHeader);

  const offerEyebrow = document.createElement("div");
  offerEyebrow.className = "mns-offer-eyebrow";
  offerEyebrow.textContent = "Paid quote";
  offerHeader.appendChild(offerEyebrow);

  const offerTitle = document.createElement("div");
  offerTitle.className = "mns-offer-title";
  offerTitle.textContent = "Loading quote offer…";
  offerHeader.appendChild(offerTitle);

  const offerBody = document.createElement("div");
  offerBody.className = "mns-offer-body";
  offerBody.textContent = "Checking Convex offer registry…";
  offerWrap.appendChild(offerBody);

  const offerActions = document.createElement("div");
  offerActions.className = "mns-offer-actions";
  offerWrap.appendChild(offerActions);

  const quoteBtn = document.createElement("button");
  quoteBtn.className = "mns-quote-btn";
  quoteBtn.textContent = "Request live quote";
  quoteBtn.disabled = true;
  offerActions.appendChild(quoteBtn);

  const quoteResult = document.createElement("div");
  quoteResult.className = "mns-quote-result";
  quoteResult.textContent = "No quote requested yet.";
  offerWrap.appendChild(quoteResult);

  const trace = document.createElement("div");
  trace.className = "mns-trace";
  offerWrap.appendChild(trace);

  const traceConfig = document.createElement("div");
  traceConfig.className = "mns-trace-row";
  trace.appendChild(traceConfig);

  const traceChallenge = document.createElement("div");
  traceChallenge.className = "mns-trace-row";
  trace.appendChild(traceChallenge);

  const tracePayment = document.createElement("div");
  tracePayment.className = "mns-trace-row";
  trace.appendChild(tracePayment);

  const traceDelivery = document.createElement("div");
  traceDelivery.className = "mns-trace-row";
  trace.appendChild(traceDelivery);

  const footer = document.createElement("div");
  footer.className = "mns-footer";
  footer.textContent = "This surface is for market context, not financial advice.";
  card.appendChild(footer);

  const convex = getConvexClient();
  const teneroApi: any = (api as any)["integrations/tenero"];
  let unsubTicker: (() => void) | null = null;
  let unsubOffer: (() => void) | null = null;
  let currentOffer: MarketOfferPayload | null = null;
  let pendingQuote = false;
  let pendingBrief = false;
  let tickerCache: MarketTickerPayload = { items: [] };
  let marketProfile: MarketProfilePayload | null = null;

  function renderTraceRow(
    container: HTMLElement,
    label: string,
    state: TraceStepState,
    detail: string,
  ) {
    container.innerHTML = "";
    const dot = document.createElement("span");
    dot.className = `mns-trace-dot is-${state}`;
    const textWrap = document.createElement("div");
    textWrap.className = "mns-trace-copy";
    const title = document.createElement("div");
    title.className = "mns-trace-label";
    title.textContent = label;
    const meta = document.createElement("div");
    meta.className = "mns-trace-detail";
    meta.textContent = detail;
    textWrap.append(title, meta);
    container.append(dot, textWrap);
  }

  function resetTrace() {
    renderTraceRow(traceConfig, "Offer loaded", "idle", "Waiting for offer details.");
    renderTraceRow(traceChallenge, "402 challenge", "idle", "No request sent yet.");
    renderTraceRow(tracePayment, "Wallet payment", "idle", "No signature requested yet.");
    renderTraceRow(traceDelivery, "Quote delivered", "idle", "No quote returned yet.");
  }

  function renderTicker(payload: MarketTickerPayload) {
    tickerCache = payload;
    const items = Array.isArray(payload.items) ? payload.items : [];
    sourcePill.textContent =
      payload.source === "tenero" ? "Live source: Tenero" : "Source: market preview";
    syncPill.textContent = payload.syncedAt
      ? `Snapshot: ${new Date(payload.syncedAt).toLocaleString()}`
      : "Snapshot unavailable";

    list.replaceChildren();
    if (items.length === 0) {
      const empty = document.createElement("div");
      empty.className = "mns-empty";
      empty.textContent = "No market rows available.";
      list.appendChild(empty);
      return;
    }

    for (const item of items) {
      const row = document.createElement("div");
      row.className = "mns-row";

      const sym = document.createElement("div");
      sym.className = "mns-symbol";
      sym.textContent = prettifySymbol(item.symbol);

      const price = document.createElement("div");
      price.className = "mns-price";
      price.textContent = `$${item.priceLabel}`;

      const change = document.createElement("div");
      change.className = `mns-change ${item.change24h >= 0 ? "is-up" : "is-down"}`;
      change.textContent = `${item.change24h >= 0 ? "+" : ""}${item.change24h.toFixed(2)}%`;

      row.append(sym, price, change);
      list.appendChild(row);
    }
  }

  function renderOffer(offer: MarketOfferPayload | null) {
    currentOffer = offer;
    if (!offer) {
      offerTitle.textContent = "No paid quote configured";
      offerBody.textContent = "market.btc does not currently have an active paid quote offer in Convex.";
      quoteBtn.disabled = true;
      return;
    }

    const asset = offer.priceAsset ?? "STX";
    const amount = offer.priceAmount ?? "0.001";
    const network = offer.network ?? "mainnet";
    const endpoint = offer.endpointPath ?? "/api/premium/market-btc/quote";

    offerTitle.textContent = offer.title ?? "Live market quote";
    offerBody.replaceChildren();

    const description = document.createElement("p");
    description.className = "mns-offer-copy";
    description.textContent =
      offer.description ??
      "Pay to retrieve a structured market quote from the market.btc service surface.";
    offerBody.appendChild(description);

    const meta = document.createElement("div");
    meta.className = "mns-offer-meta";
    meta.innerHTML =
      `<span>${amount} ${asset}</span><span>${network}</span><span>${endpoint}</span>`;
    offerBody.appendChild(meta);
    renderTraceRow(traceConfig, "Offer loaded", "success", `${amount} ${asset} on ${network}.`);
    quoteBtn.disabled = pendingQuote ? true : false;
  }

  function setQuotePending(next: boolean) {
    pendingQuote = next;
    quoteBtn.disabled = next || !currentOffer;
    quoteBtn.textContent = next ? "Requesting…" : "Request live quote";
  }

  function setBriefPending(next: boolean) {
    pendingBrief = next;
    briefSend.disabled = next;
    briefSend.textContent = next ? "Thinking…" : "Ask market.btc";
    for (const btn of askBtns) btn.disabled = next;
  }

  function buildMarketContext() {
    const items = Array.isArray(tickerCache.items) ? tickerCache.items.slice(0, 6) : [];
    const lines = [
      marketProfile?.knowledge ?? "market.btc tracks token movement and relative context.",
      items.length
        ? `Live ticker snapshot: ${items
            .map((item) => `${prettifySymbol(item.symbol)}=$${item.priceLabel} (${item.change24h >= 0 ? "+" : ""}${item.change24h.toFixed(2)}%)`)
            .join("; ")}`
        : "Live ticker snapshot unavailable.",
      "Stay concise, analytical, and grounded. Do not give financial advice.",
    ];
    return lines.join("\n");
  }

  async function askMarket(question: string) {
    if (pendingBrief) return;
    setBriefPending(true);
    briefAnswer.textContent = "market.btc is preparing a briefing…";

    try {
      const convex = getConvexClient();
      if (!marketProfile) {
        marketProfile = await convex.query((api as any).npcProfiles.getByName, {
          name: "market-btc",
        });
      }

      const systemPrompt =
        marketProfile?.systemPrompt ??
        `${buildMarketContext()}\n\nRespond like market.btc: concise, analytical, system-like.`;

      const text = await convex.action((api as any)["story/storyAi"].generateDialogue, {
        agentId: "market-btc",
        systemPrompt,
        userMessage: question,
        conversationHistory: [],
      });

      briefAnswer.textContent =
        typeof text === "string" && text.trim().length > 0
          ? text.trim()
          : "No briefing available right now.";
    } catch (error: any) {
      briefAnswer.textContent =
        isMissingBraintrustConfig(error)
          ? getLocalAiFallbackLine("market.btc")
          : "The market briefing path is unavailable right now.";
    } finally {
      setBriefPending(false);
    }
  }

  function renderQuoteResult(result: QuoteResponsePayload) {
    const deliveredAt = result.deliveredAt
      ? new Date(result.deliveredAt).toLocaleString()
      : "just now";
    quoteResult.textContent =
      `Quote delivered.\n` +
      `Pair: ${result.tokenX ?? "STX"} -> ${result.tokenY ?? "ALEX"}\n` +
      `Amount in: ${result.amountIn ?? "1000000"}\n` +
      `Expected out: ${result.expectedAmountOut ?? "pending live alex-sdk wiring"}\n` +
      `Source: ${result.source ?? "market-btc-m1"}\n` +
      `Delivered: ${deliveredAt}`;
    renderTraceRow(traceChallenge, "402 challenge", "success", "Challenge issued and retried.");
    renderTraceRow(tracePayment, "Wallet payment", "success", "Wallet approved the x402 request.");
    renderTraceRow(traceDelivery, "Quote delivered", "success", `${result.tokenX ?? "STX"} -> ${result.tokenY ?? "ALEX"}.`);
  }

  if (teneroApi?.tickerRows) {
    unsubTicker = convex.onUpdate(teneroApi.tickerRows, {}, (payload: any) => {
      renderTicker(payload as MarketTickerPayload);
    });
  } else {
    renderTicker({ source: "fallback", items: [] });
  }

  unsubOffer = convex.onUpdate((api as any)["integrations/x402"].getOffer, { offerKey }, (offer: any) => {
    renderOffer(offer as MarketOfferPayload | null);
  });

  resetTrace();

  void (async () => {
    try {
      marketProfile = await convex.query((api as any).npcProfiles.getByName, {
        name: "market-btc",
      });
    } catch {
      // non-fatal
    }
  })();

  for (const btn of askBtns) {
    btn.addEventListener("click", () => {
      briefInput.value = btn.textContent ?? "";
      void askMarket(briefInput.value);
    });
  }

  briefSend.addEventListener("click", () => {
    const question = briefInput.value.trim();
    if (!question) return;
    void askMarket(question);
  });

  quoteBtn.addEventListener("click", () => {
    void (async () => {
      if (pendingQuote || !currentOffer) return;
      setQuotePending(true);
      const network = currentOffer.network === "mainnet" ? "mainnet" : "testnet";
      const endpointUrl = resolveX402Url(
        `${currentOffer.endpointPath ?? "/api/premium/market-btc/quote"}?tokenX=STX&tokenY=ALEX&amountIn=1000000`,
      );

      quoteResult.textContent =
        `Requesting paid quote.\n` +
        `Network: ${network}\n` +
        `Endpoint: ${endpointUrl}\n` +
        `If a wallet prompt appears, approve the x402 payment request.`;
      renderTraceRow(traceChallenge, "402 challenge", "pending", "Waiting for payment requirements.");
      renderTraceRow(tracePayment, "Wallet payment", "pending", "Waiting for wallet prompt.");
      renderTraceRow(traceDelivery, "Quote delivered", "idle", "No quote returned yet.");

      try {
        const result = await x402Fetch<QuoteResponsePayload>(endpointUrl, network);
        renderQuoteResult(result);
      } catch (error: any) {
        if (error instanceof X402RequestError) {
          const detail =
            typeof error.details === "string"
              ? error.details
              : error.details
                ? JSON.stringify(error.details, null, 2)
                : error.message;
          quoteResult.textContent = `Quote request failed.\nHTTP ${error.status}\n${detail}`;
          renderTraceRow(traceChallenge, "402 challenge", "error", `HTTP ${error.status}.`);
          renderTraceRow(tracePayment, "Wallet payment", "error", "Payment flow did not complete.");
          renderTraceRow(traceDelivery, "Quote delivered", "error", "No quote returned.");
        } else {
          quoteResult.textContent = error?.message ?? "Quote request failed.";
          renderTraceRow(traceChallenge, "402 challenge", "error", "Request failed before delivery.");
          renderTraceRow(tracePayment, "Wallet payment", "error", "Payment flow interrupted.");
          renderTraceRow(traceDelivery, "Quote delivered", "error", "No quote returned.");
        }
      } finally {
        setQuotePending(false);
      }
    })();
  });

  return {
    el,
    destroy() {
      unsubTicker?.();
      unsubOffer?.();
      window.removeEventListener("keydown", handleKeydown);
      el.remove();
    },
  };
}

function prettifySymbol(symbol: string) {
  switch (symbol) {
    case "SBTC":
      return "sBTC";
    case "USDCX":
      return "USDCx";
    default:
      return symbol;
  }
}
