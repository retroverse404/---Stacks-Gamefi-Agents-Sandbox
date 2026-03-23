import "./GuideNpcSplash.css";
import { getConvexClient } from "../../lib/convexClient.ts";
import { api } from "../../../convex/_generated/api";
import type { SplashScreen, SplashScreenCallbacks } from "../SplashTypes.ts";
import {
  GUIDE_BTC_BRIEFING_INTRO,
  GUIDE_BTC_TOPICS,
  GUIDE_BTC_VERIFIED_CONTEXT,
  type GuideTopic,
} from "../../story/content/stacksGuideContext.ts";
import { getLocalAiFallbackLine, isMissingBraintrustConfig } from "../../lib/aiFallback.ts";
import {
  formatStacksProvider,
  getCachedStacksAddress,
  getCachedStacksProviderId,
} from "../../lib/stacksWallet.ts";
import { X402RequestError, resolveX402Url, x402Fetch } from "../../lib/x402.ts";

export interface GuideNpcSplashProps extends SplashScreenCallbacks {
  npcName: string;
}

type SnapshotPayload = {
  users?: any[];
  bounties?: any[];
  grants?: any[];
  quests?: any[];
  syncLog?: any[];
};

const GUIDE_MAP_NAME = "Cozy Cabin";
const GUIDE_ZONE_KEY = "guide-desk";
const GUIDE_OBJECT_KEY = "guide-post";

function renderClassifiedCard(
  container: HTMLElement,
  receipt: Record<string, unknown>,
  za: { bounties?: any[]; grants?: any[]; quests?: any[] },
  payerAddress: string,
) {
  container.textContent = "";
  container.classList.remove("is-loading");
  container.style.whiteSpace = "normal";

  function row(label: string, value: string) {
    const el = document.createElement("div");
    el.className = "gns-clf-row";
    const l = document.createElement("span");
    l.className = "gns-clf-label";
    l.textContent = label;
    const v = document.createElement("span");
    v.className = "gns-clf-value";
    v.textContent = value;
    el.appendChild(l);
    el.appendChild(v);
    return el;
  }

  function section(title: string) {
    const el = document.createElement("div");
    el.className = "gns-clf-section";
    const h = document.createElement("div");
    h.className = "gns-clf-section-title";
    h.textContent = title;
    el.appendChild(h);
    return el;
  }

  // RECEIPT
  const receiptSec = section("RECEIPT");
  const deliveredAt = typeof receipt.deliveredAt === "number"
    ? new Date(receipt.deliveredAt).toISOString().replace("T", " ").slice(0, 19) + " UTC"
    : "—";
  receiptSec.appendChild(row("Network", String(receipt.network ?? "testnet")));
  receiptSec.appendChild(row("Asset", String(receipt.asset ?? "STX")));
  receiptSec.appendChild(row("Price", `${receipt.priceStx ?? "1"} STX`));
  receiptSec.appendChild(row("Payer", payerAddress ? payerAddress.slice(0, 8) + "…" + payerAddress.slice(-4) : "—"));
  receiptSec.appendChild(row("Delivered", deliveredAt));
  container.appendChild(receiptSec);

  // TOP OPPORTUNITIES from ZA
  const allOpps = [
    ...(za.bounties ?? []).map((o: any) => ({ ...o, _type: "BOUNTY" })),
    ...(za.grants ?? []).map((o: any) => ({ ...o, _type: "GRANT" })),
    ...(za.quests ?? []).map((o: any) => ({ ...o, _type: "QUEST" })),
  ].slice(0, 5);

  if (allOpps.length > 0) {
    const oppSec = section("TOP OPPORTUNITIES");
    for (const opp of allOpps) {
      const item = document.createElement("div");
      item.className = "gns-clf-opp";
      const badge = document.createElement("span");
      badge.className = "gns-clf-opp-type";
      badge.textContent = opp._type;
      const title = document.createElement("span");
      title.className = "gns-clf-opp-title";
      title.textContent = opp.title ?? "Untitled";
      const reward = document.createElement("span");
      reward.className = "gns-clf-opp-reward";
      if (opp.rewardAmount) {
        reward.textContent = `${opp.rewardAmount} ${opp.rewardUnit ?? ""}`.trim();
      }
      item.appendChild(badge);
      item.appendChild(title);
      if (opp.rewardAmount) item.appendChild(reward);
      oppSec.appendChild(item);
    }
    container.appendChild(oppSec);
  }

  // AGENT NOTE
  const noteSec = section("AGENT NOTE");
  const note = document.createElement("div");
  note.className = "gns-clf-note";
  note.textContent =
    "guide.btc: This briefing is a live snapshot of Stacks ecosystem opportunities. " +
    "Data is sourced from Zero Authority and verified on-chain via x402. " +
    "Use this intel to prioritize your next move.";
  noteSec.appendChild(note);
  container.appendChild(noteSec);
}

export function createGuideNpcSplash(props: GuideNpcSplashProps): SplashScreen {
  const { npcName, onClose } = props;
  const premiumOfferKey = "guide-btc-premium-brief";
  const requestClose = () => onClose();
  const handleKeydown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      requestClose();
    }
  };
  window.addEventListener("keydown", handleKeydown);

  const el = document.createElement("div");
  el.className = "gns-overlay";

  const card = document.createElement("div");
  card.className = "gns-card";
  el.appendChild(card);
  el.addEventListener("click", (event) => {
    if (event.target === el) requestClose();
  });
  card.addEventListener("click", (event) => event.stopPropagation());

  const topBar = document.createElement("div");
  topBar.className = "gns-top-bar";
  card.appendChild(topBar);

  const hero = document.createElement("div");
  hero.className = "gns-hero";
  topBar.appendChild(hero);

  const eyebrow = document.createElement("div");
  eyebrow.className = "gns-eyebrow";
  eyebrow.textContent = "Ecosystem";
  hero.appendChild(eyebrow);

  const title = document.createElement("div");
  title.className = "gns-title-row";
  hero.appendChild(title);

  const speaker = document.createElement("h2");
  speaker.className = "gns-name";
  speaker.textContent = npcName;
  title.appendChild(speaker);

  const subtitle = document.createElement("div");
  subtitle.className = "gns-subtitle";
  subtitle.textContent = "Zero Authority · x402";
  title.appendChild(subtitle);

  const intro = document.createElement("p");
  intro.className = "gns-intro";
  intro.textContent =
    "Sourced briefings and live Zero Authority data from inside the world.";
  hero.appendChild(intro);

  const heroMeta = document.createElement("div");
  heroMeta.className = "gns-pills";
  hero.appendChild(heroMeta);

  const makePill = (label: string) => {
    const pill = document.createElement("div");
    pill.className = "gns-pill";
    pill.textContent = label;
    return pill;
  };

  heroMeta.appendChild(makePill("Zero Authority"));
  heroMeta.appendChild(makePill("Stacks docs"));
  heroMeta.appendChild(makePill("Classified · x402"));

  const topActions = document.createElement("div");
  topActions.className = "gns-top-actions";
  topBar.appendChild(topActions);

  const status = document.createElement("div");
  status.className = "gns-status-box";
  status.textContent = "Connecting…";
  topActions.appendChild(status);

  const topCloseBtn = document.createElement("button");
  topCloseBtn.className = "gns-close-btn";
  topCloseBtn.textContent = "Close ×";
  topCloseBtn.title = "Close guide.btc (Esc)";
  topCloseBtn.addEventListener("click", () => requestClose());
  topActions.appendChild(topCloseBtn);

  const main = document.createElement("div");
  main.className = "gns-main";
  card.appendChild(main);

  const contentColumn = document.createElement("div");
  contentColumn.className = "gns-content-col";
  main.appendChild(contentColumn);

  const summaryPanel = document.createElement("div");
  summaryPanel.className = "gns-summary-grid";
  contentColumn.appendChild(summaryPanel);

  const answerCard = document.createElement("div");
  answerCard.className = "gns-answer-card";
  contentColumn.appendChild(answerCard);

  const answerHeader = document.createElement("div");
  answerHeader.className = "gns-answer-head";
  answerCard.appendChild(answerHeader);

  const answerTitle = document.createElement("div");
  answerTitle.className = "gns-answer-title-col";
  answerHeader.appendChild(answerTitle);

  const answerEyebrow = document.createElement("div");
  answerEyebrow.className = "gns-answer-eyebrow";
  answerEyebrow.textContent = "Briefing";
  answerTitle.appendChild(answerEyebrow);

  const answerHeading = document.createElement("div");
  answerHeading.className = "gns-answer-heading";
  answerHeading.textContent = "Select a topic";
  answerTitle.appendChild(answerHeading);

  const sourceTag = document.createElement("div");
  sourceTag.className = "gns-source-tag";
  sourceTag.textContent = "verified context";
  answerHeader.appendChild(sourceTag);

  const answer = document.createElement("div");
  answer.className = "gns-answer-body";
  answer.textContent = GUIDE_BTC_BRIEFING_INTRO;
  answerCard.appendChild(answer);

  const answerFooter = document.createElement("div");
  answerFooter.className = "gns-answer-footer";
  answerFooter.textContent = "Verified context. Not financial advice.";
  answerCard.appendChild(answerFooter);

  const topicsWrap = document.createElement("div");
  topicsWrap.className = "gns-topics-grid";
  contentColumn.appendChild(topicsWrap);

  const rail = document.createElement("div");
  rail.className = "gns-rail";
  main.appendChild(rail);

  const livePanel = document.createElement("div");
  livePanel.className = "gns-panel";
  rail.appendChild(livePanel);

  const liveTitle = document.createElement("div");
  liveTitle.className = "gns-panel-title";
  liveTitle.textContent = "Network pulse";
  livePanel.appendChild(liveTitle);

  const liveBody = document.createElement("div");
  liveBody.className = "gns-live-body";
  livePanel.appendChild(liveBody);

  const premiumWrap = document.createElement("div");
  premiumWrap.className = "gns-premium-panel";
  rail.appendChild(premiumWrap);

  const premiumTitle = document.createElement("div");
  premiumTitle.className = "gns-panel-title";
  premiumTitle.textContent = "Classified";
  premiumWrap.appendChild(premiumTitle);

  const premiumBody = document.createElement("div");
  premiumBody.className = "gns-premium-body";
  premiumBody.textContent = "Checking authorization…";
  premiumWrap.appendChild(premiumBody);

  const premiumBtn = document.createElement("button");
  premiumBtn.className = "gns-premium-btn";
  premiumBtn.textContent = "Unlock Premium Content";
  premiumWrap.appendChild(premiumBtn);

  const footer = document.createElement("div");
  footer.className = "gns-footer";
  card.appendChild(footer);

  const note = document.createElement("div");
  note.className = "gns-footer-note";
  note.textContent = "Esc to close";
  footer.appendChild(note);

  const closeBtn = document.createElement("button");
  closeBtn.className = "gns-footer-close";
  closeBtn.textContent = "Close guide";
  closeBtn.addEventListener("click", () => requestClose());
  footer.appendChild(closeBtn);

  let pending = false;
  let selectedTopic: GuideTopic | null = null;
  let liveContext: string | null = null;
  let snapshotCache: SnapshotPayload | null = null;
  let premiumOffer: any = null;
  let agentState: any = null;
  const topicResponseCache = new Map<string, string>();
  const buttons: HTMLButtonElement[] = [];
  let activeBtn: HTMLButtonElement | null = null;

  const setPending = (next: boolean) => {
    pending = next;
    for (const btn of buttons) btn.disabled = next;
    premiumBtn.disabled = next;
  };

  const buildStatCard = (label: string, value: string) => {
    const cardEl = document.createElement("div");
    cardEl.className = "gns-stat-card";

    const valueEl = document.createElement("div");
    valueEl.className = "gns-stat-value";
    valueEl.textContent = value;
    cardEl.appendChild(valueEl);

    const labelEl = document.createElement("div");
    labelEl.className = "gns-stat-label";
    labelEl.textContent = label;
    cardEl.appendChild(labelEl);
    return cardEl;
  };

  const formatPayerAddress = (address: string | null | undefined) => {
    if (!address) return "connected payer";
    return address.length > 12 ? `${address.slice(0, 5)}...${address.slice(-6)}` : address;
  };

  const safeJsonParse = (value: string | null | undefined) => {
    if (!value) return null;
    try {
      return JSON.parse(value) as Record<string, unknown>;
    } catch {
      return null;
    }
  };

  const unlockFactKeyFor = (payerAddress: string) => `guide-premium-unlocked:${payerAddress}`;

  const renderPremiumOfferCopy = (offer: any) => {
    premiumBody.textContent =
      `${offer.description} Target demo price: ${offer.priceAmount} ${offer.priceAsset} on ${offer.network ?? "unknown"}. ` +
      "The x402 challenge is live. Paid unlocks are now recorded into world state.";
    premiumBtn.textContent = "Unlock Premium Content";
  };

  const applyStoredPremiumAccess = (receipt: Record<string, unknown>, payerAddress: string) => {
    const deliveredAt =
      typeof receipt.deliveredAt === "number" ? new Date(receipt.deliveredAt).toLocaleString() : "recently";
    const providerLabel = formatStacksProvider(
      (typeof receipt.providerId === "string" ? receipt.providerId : null) ?? getCachedStacksProviderId(),
    );
    premiumBody.textContent =
      `Unlocked for ${formatPayerAddress(payerAddress)} via ${providerLabel}. ` +
      `Last premium delivery: ${deliveredAt}. The world feed now records this paid unlock at the guide desk.`;
    premiumBtn.textContent = "Pay Again / Refresh";
  };

  const syncPremiumAccessState = async (offerOverride?: any) => {
    const offer = offerOverride ?? premiumOffer;
    if (!offer) return;

    const payerAddress = getCachedStacksAddress();
    if (!payerAddress) {
      renderPremiumOfferCopy(offer);
      return;
    }

    const convex = getConvexClient();
    const facts = (await convex.query((api as any).worldState.listFacts, {
      mapName: GUIDE_MAP_NAME,
    })) as any[];
    const unlockFact = facts.find((row) => row.factKey === unlockFactKeyFor(payerAddress));

    if (!unlockFact) {
      renderPremiumOfferCopy(offer);
      return;
    }

    const receipt = safeJsonParse(unlockFact.valueJson);
    if (!receipt) {
      renderPremiumOfferCopy(offer);
      return;
    }

    applyStoredPremiumAccess(receipt, payerAddress);
  };

  const transitionGuideState = async (
    nextState: string,
    options: {
      currentIntent?: string;
      memorySummary?: string;
      contextJson?: string;
    } = {},
  ) => {
    const convex = getConvexClient();
    agentState = await convex.mutation((api as any)["agents/stateMachine"].transition, {
      agentId: "guide-btc",
      nextState,
      currentIntent: options.currentIntent,
      memorySummary: options.memorySummary,
      contextJson: options.contextJson,
    });
    return agentState;
  };

  const persistPremiumUnlock = async (
    offer: any,
    result: Record<string, unknown>,
    payerAddress: string | null,
  ) => {
    const convex = getConvexClient();
    const providerId = getCachedStacksProviderId();
    const deliveredAt = typeof result.deliveredAt === "number" ? result.deliveredAt : Date.now();
    const receipt = {
      offerKey: premiumOfferKey,
      title: typeof result.title === "string" ? result.title : offer.title,
      classification: typeof result.classification === "string" ? result.classification : "premium",
      payerAddress,
      providerId,
      network: typeof result.network === "string" ? result.network : offer.network ?? "testnet",
      asset: typeof result.asset === "string" ? result.asset : offer.priceAsset,
      priceAmount: offer.priceAmount,
      deliveredAt,
    };

    const mutations: Promise<unknown>[] = [
      convex.mutation((api as any).worldState.upsertFact, {
        mapName: GUIDE_MAP_NAME,
        factKey: "guide-premium-last-delivery",
        factType: "status",
        valueJson: JSON.stringify(receipt),
        scope: "agent",
        subjectId: "guide-btc",
        source: "x402",
      }),
      convex.mutation((api as any).worldState.appendEvent, {
        mapName: GUIDE_MAP_NAME,
        eventType: "paid-unlock",
        actorId: payerAddress ?? undefined,
        targetId: "guide-btc",
        objectKey: GUIDE_OBJECT_KEY,
        zoneKey: GUIDE_ZONE_KEY,
        summary: `guide.btc delivered a classified briefing to ${formatPayerAddress(payerAddress)}.`,
        detailsJson: JSON.stringify(receipt),
      }),
    ];

    if (payerAddress) {
      mutations.push(
        convex.mutation((api as any).worldState.upsertFact, {
          mapName: GUIDE_MAP_NAME,
          factKey: unlockFactKeyFor(payerAddress),
          factType: "access",
          valueJson: JSON.stringify(receipt),
          scope: "player",
          subjectId: payerAddress,
          source: "x402",
        }),
      );
    }

    await Promise.all(mutations);

    if (payerAddress) {
      applyStoredPremiumAccess(receipt, payerAddress);
    }
  };

  const renderSummaryPanel = (snapshot: SnapshotPayload | null) => {
    summaryPanel.replaceChildren();
    const users = snapshot?.users ?? [];
    const bounties = snapshot?.bounties ?? [];
    const grants = snapshot?.grants ?? [];
    const quests = snapshot?.quests ?? [];

    summaryPanel.appendChild(buildStatCard("Builders surfaced", String(users.length)));
    summaryPanel.appendChild(buildStatCard("Bounties cached", String(bounties.length)));
    summaryPanel.appendChild(buildStatCard("Grants cached", String(grants.length)));
    summaryPanel.appendChild(buildStatCard("Quests cached", String(quests.length)));
  };

  const renderListCard = (titleText: string, items: string[]) => {
    const wrap = document.createElement("div");
    wrap.className = "gns-list-card";

    const heading = document.createElement("div");
    heading.className = "gns-list-heading";
    heading.textContent = titleText;
    wrap.appendChild(heading);

    if (items.length === 0) {
      const empty = document.createElement("div");
      empty.className = "gns-list-empty";
      empty.textContent = "No cached entries yet.";
      wrap.appendChild(empty);
      return wrap;
    }

    for (const item of items) {
      const row = document.createElement("div");
      row.className = "gns-list-row";
      row.textContent = item;
      wrap.appendChild(row);
    }

    return wrap;
  };

  const renderLivePanel = (snapshot: SnapshotPayload | null) => {
    liveBody.replaceChildren();
    if (!snapshot) {
      liveBody.appendChild(renderListCard("Snapshot", ["Loading live cache…"]));
      return;
    }

    const truncAddr = (a: string) => a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
    const users = (snapshot.users ?? []).slice(0, 3).map((u: any) =>
      `${u.username}${u.stxAddress ? ` · ${truncAddr(u.stxAddress)}` : ""}`,
    );
    const bounties = (snapshot.bounties ?? []).slice(0, 3).map((item: any) => {
      const reward = item.rewardUnit && item.rewardAmount != null
        ? ` · ${item.rewardAmount} ${item.rewardUnit}`
        : "";
      return `${item.title}${reward}`;
    });
    const grants = (snapshot.grants ?? []).slice(0, 2).map((item: any) => item.title);
    const sync = Array.isArray(snapshot.syncLog) ? snapshot.syncLog[0] : null;

    liveBody.appendChild(renderListCard("Builders", users));
    liveBody.appendChild(renderListCard("Bounties", bounties));
    liveBody.appendChild(renderListCard("Grants", grants));

    if (sync?.finishedAt) {
      const stamp = document.createElement("div");
      stamp.className = "gns-sync-stamp";
      stamp.textContent = `Last Zero Authority sync: ${new Date(sync.finishedAt).toLocaleString()}`;
      liveBody.appendChild(stamp);
    }
  };

  const buildLiveContext = (snapshot: SnapshotPayload) => {
    const users = Array.isArray(snapshot?.users) ? snapshot.users.slice(0, 5) : [];
    const bounties = Array.isArray(snapshot?.bounties) ? snapshot.bounties.slice(0, 4) : [];
    const grants = Array.isArray(snapshot?.grants) ? snapshot.grants.slice(0, 4) : [];
    const quests = Array.isArray(snapshot?.quests) ? snapshot.quests.slice(0, 4) : [];
    const syncLog = Array.isArray(snapshot?.syncLog) ? snapshot.syncLog[0] : null;

    const fmtOpportunity = (item: any) =>
      [
        item?.title,
        item?.organizationName ? `org=${item.organizationName}` : null,
        item?.rewardUnit ? `reward=${item.rewardAmount ?? "?"} ${item.rewardUnit}` : null,
        item?.status ? `status=${item.status}` : null,
      ]
        .filter(Boolean)
        .join(" | ");

    return [
      "Live cached Zero Authority snapshot:",
      syncLog?.finishedAt ? `lastSync=${new Date(syncLog.finishedAt).toISOString()}` : "lastSync=unknown",
      users.length > 0
        ? `users=${users.map((u: any) => `${u.username}${u.stxAddress ? ` (${u.stxAddress})` : ""}`).join("; ")}`
        : "users=none",
      bounties.length > 0 ? `bounties=${bounties.map((item: any) => fmtOpportunity(item)).join(" || ")}` : "bounties=none",
      grants.length > 0 ? `grants=${grants.map((item: any) => fmtOpportunity(item)).join(" || ")}` : "grants=none",
      quests.length > 0 ? `quests=${quests.map((item: any) => fmtOpportunity(item)).join(" || ")}` : "quests=none",
    ].join("\n");
  };

  const ensureLiveContext = async () => {
    if (liveContext && snapshotCache) return liveContext;

    const convex = getConvexClient();
    const snapshot = await convex.query((api as any)["integrations/zeroAuthority"].guideSnapshot, {});
    snapshotCache = snapshot;
    liveContext = buildLiveContext(snapshot);
    renderSummaryPanel(snapshot);
    renderLivePanel(snapshot);
    status.textContent = "Zero Authority cache loaded.";
    return liveContext;
  };

  const ensureOfferContext = async () => {
    if (premiumOffer && agentState) {
      await syncPremiumAccessState(premiumOffer);
      return { premiumOffer, agentState };
    }

    const convex = getConvexClient();
    const [offer, state] = await Promise.all([
      convex.query((api as any)["integrations/x402"].getOffer, { offerKey: premiumOfferKey }),
      convex.query((api as any)["agents/stateMachine"].get, { agentId: "guide-btc" }),
    ]);

    premiumOffer = offer;
    agentState = state;

    if (offer) {
      await syncPremiumAccessState(offer);
    } else {
      premiumBody.textContent = "No premium offer is configured yet.";
      premiumBtn.disabled = true;
    }

    return { premiumOffer, agentState };
  };

  const setSelectedTopic = (topic: GuideTopic) => {
    selectedTopic = topic;
    answerHeading.textContent = topic.label;
    answerEyebrow.textContent = topic.eyebrow;
    sourceTag.textContent = topic.sourceLabel;
  };

  const askTopic = async (topic: GuideTopic) => {
    if (pending) return;
    setSelectedTopic(topic);

    // Serve from cache if available
    const cached = topicResponseCache.get(topic.id);
    if (cached) {
      answer.textContent = cached;
      sourceTag.textContent = topic.sourceLabel;
      status.textContent = liveContext ? "Live context." : "Authored notes.";
      return;
    }

    setPending(true);
    status.textContent = `Loading ${topic.label.toLowerCase()}…`;
    answer.textContent = "Retrieving briefing…";
    answer.classList.add("is-loading");

    try {
      const convex = getConvexClient();
      let systemPrompt = `${GUIDE_BTC_VERIFIED_CONTEXT}\n\n${topic.authoredContext}`;

      try {
        const snapshotContext = await ensureLiveContext();
        systemPrompt = `${GUIDE_BTC_VERIFIED_CONTEXT}\n\n${topic.authoredContext}\n\n${snapshotContext}`;
        status.textContent = "Zero Authority context loaded.";
      } catch (snapshotError) {
        console.warn("guide.btc snapshot unavailable", snapshotError);
        status.textContent = "Live cache offline. Using authored notes.";
      }

      const text = await convex.action((api as any)["story/storyAi"].generateDialogue, {
        agentId: "guide-btc",
        systemPrompt,
        userMessage: topic.userPrompt,
        conversationHistory: [],
      });

      answer.classList.remove("is-loading");
      const result =
        typeof text === "string" && text.trim().length > 0
          ? text.trim()
          : "No verified response for that topic yet.";
      answer.textContent = result;
      topicResponseCache.set(topic.id, result);
      status.textContent = liveContext ? "Live context." : "Authored notes.";
    } catch (error: any) {
      answer.classList.remove("is-loading");
      if (isMissingBraintrustConfig(error)) {
        const fallback = topic.fallbackAnswer.trim();
        answer.textContent = fallback;
        topicResponseCache.set(topic.id, fallback);
        status.textContent = getLocalAiFallbackLine("guide.btc");
      } else {
        answer.textContent = "The AI briefing failed. The backend path may be offline.";
        status.textContent = "AI request failed";
      }
    } finally {
      setPending(false);
    }
  };

  for (const topic of GUIDE_BTC_TOPICS) {
    const btn = document.createElement("button");
    btn.className = "gns-topic-btn";

    const btnEyebrow = document.createElement("div");
    btnEyebrow.className = "gns-topic-eyebrow";
    btnEyebrow.textContent = topic.eyebrow;
    btn.appendChild(btnEyebrow);

    const btnLabel = document.createElement("div");
    btnLabel.className = "gns-topic-label";
    btnLabel.textContent = topic.label;
    btn.appendChild(btnLabel);

    const btnDescription = document.createElement("div");
    btnDescription.className = "gns-topic-desc";
    btnDescription.textContent = topic.description;
    btn.appendChild(btnDescription);

    btn.addEventListener("click", () => {
      if (activeBtn) activeBtn.classList.remove("active");
      btn.classList.add("active");
      activeBtn = btn;
      void askTopic(topic);
    });
    buttons.push(btn);
    topicsWrap.appendChild(btn);
  }

  premiumBtn.addEventListener("click", () => {
    void (async () => {
      if (pending) return;
      setPending(true);
      status.textContent = "Checking x402 offer…";
      answerEyebrow.textContent = "Classified";
      answerHeading.textContent = "Classified";
      sourceTag.textContent = "x402 contract";

      try {
        const convex = getConvexClient();
        const { premiumOffer: offer, agentState: state } = await ensureOfferContext();
        const payerAddress = getCachedStacksAddress();
        const payerLabel = formatPayerAddress(payerAddress);
        if (!offer) {
          answer.textContent = "No premium offer is configured yet.";
          status.textContent = "No offer configured.";
          return;
        }

        if (state && state.state !== "offering-premium") {
          agentState = await convex.mutation((api as any)["agents/stateMachine"].transition, {
            agentId: "guide-btc",
            nextState: "offering-premium",
            currentIntent: "offer-premium-content",
          });
        } else {
          agentState = state;
        }

        if (agentState?.state !== "awaiting-payment") {
          agentState = await transitionGuideState("awaiting-payment", {
            currentIntent: "await-x402-payment",
            memorySummary: `Waiting for x402 settlement from ${payerLabel}.`,
            contextJson: JSON.stringify({
              offerKey: premiumOfferKey,
              payerAddress,
            }),
          });
        }

        const network = offer.network === "mainnet" ? "mainnet" : "testnet";
        const endpointUrl = resolveX402Url(offer.endpointPath ?? "/api/premium/guide-btc");

        answer.textContent =
          `${offer.title}\n\n${offer.description}\n\n` +
          `Target demo price: ${offer.priceAmount} ${offer.priceAsset}\n` +
          `Provider: ${offer.provider}\n` +
          `Network: ${offer.network ?? "unknown"}\n` +
          `Endpoint: ${endpointUrl}\n\n` +
          "Requesting the x402 premium endpoint. If a wallet prompt appears, sign without broadcasting.";
        status.textContent = "Requesting x402 challenge…";

        const result = await x402Fetch<Record<string, unknown>>(endpointUrl, network);
        await transitionGuideState("delivering-premium", {
          currentIntent: "deliver-premium-briefing",
          memorySummary: `Delivering classified briefing to ${payerLabel}.`,
          contextJson: JSON.stringify({
            offerKey: premiumOfferKey,
            payerAddress,
          }),
        });
        await persistPremiumUnlock(offer, result, payerAddress);
        await transitionGuideState("idle", {
          currentIntent: "resume-guidance",
          memorySummary: `Delivered premium briefing to ${payerLabel}.`,
          contextJson: JSON.stringify({
            offerKey: premiumOfferKey,
            payerAddress,
            deliveredAt:
              typeof result.deliveredAt === "number" ? result.deliveredAt : Date.now(),
          }),
        });
        let zaSnapshot: { bounties?: any[]; grants?: any[]; quests?: any[] } = {};
        try {
          zaSnapshot = await convex.query(
            (api as any)["integrations/zeroAuthority"].guideSnapshot,
            {},
          );
        } catch {
          // non-fatal: render without ZA data if offline
        }
        renderClassifiedCard(answer, result, zaSnapshot, payerAddress ?? "");
        status.textContent = "Premium content delivered.";
      } catch (error: any) {
        if (agentState?.state === "awaiting-payment" || agentState?.state === "delivering-premium") {
          try {
            await transitionGuideState("idle", {
              currentIntent: "resume-guidance",
              memorySummary: "x402 payment attempt ended without premium delivery.",
            });
          } catch (transitionError) {
            console.warn("Failed to recover guide.btc state after x402 error", transitionError);
          }
        }

        if (error instanceof X402RequestError) {
          const detail =
            typeof error.details === "string"
              ? error.details
              : error.details
                ? JSON.stringify(error.details, null, 2)
                : "";
          answer.textContent =
            `x402 request failed.\n\nHTTP ${error.status}\n\n${detail || error.message}`;
          status.textContent =
            error.status === 500
              ? "Settlement failed. Check facilitator availability."
              : `x402 request failed (${error.status}).`;
          return;
        }

        answer.textContent =
          error?.message ??
          "Failed to load premium content metadata.";
        status.textContent = "Premium content request failed";
      } finally {
        setPending(false);
      }
    })();
  });

  renderSummaryPanel(null);
  renderLivePanel(null);

  void ensureLiveContext().catch((error) => {
    console.warn("guide.btc snapshot unavailable", error);
    status.textContent = "Offline. Authored notes available.";
  });

  void ensureOfferContext().catch((error) => {
    console.warn("guide.btc premium offer unavailable", error);
  });

  return {
    el,
    destroy() {
      window.removeEventListener("keydown", handleKeydown);
      el.remove();
    },
  };
}
