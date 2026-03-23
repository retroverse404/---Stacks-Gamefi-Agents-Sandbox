import { getConvexClient } from "../lib/convexClient.ts";
import { api } from "../../convex/_generated/api";
import "./AgentsPanel.css";

type RuntimeCastEntry = {
  registry?: {
    agentId?: string;
    displayName?: string;
    roleKey?: string;
    permissionTier?: string;
    network?: string;
    walletAddress?: string;
    walletStatus?: string;
    walletProvider?: string;
  };
  role?: {
    displayRole?: string;
    behaviorMode?: string;
  } | null;
  state?: {
    state?: string;
    mood?: string;
    currentIntent?: string;
    memorySummary?: string;
    updatedAt?: number;
  } | null;
  binding?: {
    walletProvider?: string;
    walletStatus?: string;
    canTradeAssets?: boolean;
  } | null;
  wallets?: Array<{
    provider?: string;
    walletRole?: string;
    network?: string;
    status?: string;
    address?: string;
  }>;
};

type LedgerRow = {
  agentId: string;
  displayName?: string;
  roleKey?: string;
  walletAddress?: string | null;
  network?: string | null;
  permissionTier?: string | null;
  totalEarnedStx: number;
  earningCount: number;
  lastEarningAt: number | null;
  lastEarningTxid: string | null;
};

type LedgerEvent = {
  eventType: string;
  summary: string;
  actorId: string | null;
  actorDisplayName?: string | null;
  txid: string | null;
  amountStx: number | null;
};

type EconomySnapshot = {
  leaderboard: LedgerRow[];
  totalEarnedStx: number;
  recentEconomicEvents: LedgerEvent[];
};

type PremiumOfferRecord = {
  offerKey: string;
  agentId: string;
  title: string;
  priceAmount: string;
  priceAsset: string;
  network?: string;
  receiverAddress?: string | null;
  deliveryType?: string;
  status?: string;
};

type AgentPanelStats = {
  total: number;
  walletReady: number;
  executionReady: number;
};

type AgentsPanelOptions = {
  onStatsChange?: (stats: AgentPanelStats) => void;
};

function shortenAddress(address?: string | null) {
  if (!address) return "No wallet";
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function formatRelativeTime(updatedAt?: number | null) {
  if (!updatedAt) return "idle";
  const ageMs = Date.now() - updatedAt;
  if (ageMs < 60_000) return "just now";
  const minutes = Math.floor(ageMs / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function titleCase(value?: string | null) {
  if (!value) return "unknown";
  return value
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function bindingLabelForRail(permissionTier?: string | null) {
  const normalized = (permissionTier ?? "").toLowerCase();
  if (normalized === "execution") return "execution warrant";
  if (normalized === "identity") return "identity seal";
  if (normalized) return titleCase(normalized);
  return "unknown tier";
}

export class AgentsPanel {
  readonly el: HTMLElement;
  private panel: HTMLElement;
  private summaryEl: HTMLElement;
  private railsEl: HTMLElement;
  private flowEl: HTMLElement;
  private listEl: HTMLElement;
  private castUnsub: (() => void) | null = null;
  private ledgerUnsub: (() => void) | null = null;
  private offersUnsub: (() => void) | null = null;
  private mapName: string | null = null;
  private isOpen = false;
  private options: AgentsPanelOptions;
  private lastCast: RuntimeCastEntry[] = [];
  private economyByAgentId = new Map<string, LedgerRow>();
  private offersByAgentId = new Map<string, PremiumOfferRecord[]>();
  private sessionOffer: PremiumOfferRecord | null = null;
  private recentEvents: LedgerEvent[] = [];
  private totalTrackedStx = 0;

  constructor(options: AgentsPanelOptions = {}) {
    this.options = options;
    this.el = document.createElement("div");
    this.el.className = "agents-panel-shell";

    this.panel = document.createElement("aside");
    this.panel.className = "agents-panel";
    this.panel.style.display = "none";

    const header = document.createElement("div");
    header.className = "agents-panel-header";

    const titleWrap = document.createElement("div");
    const eyebrow = document.createElement("div");
    eyebrow.className = "agents-panel-eyebrow";
    eyebrow.textContent = "Operator Codex";
    const title = document.createElement("h2");
    title.className = "agents-panel-title";
    title.textContent = "Guild Ledger";
    const subtitle = document.createElement("p");
    subtitle.className = "agents-panel-subtitle";
    subtitle.textContent = "Read the live cast, revenue rails, and active authority without leaving the cabin.";
    titleWrap.append(eyebrow, title, subtitle);

    const closeBtn = document.createElement("button");
    closeBtn.className = "agents-panel-close";
    closeBtn.textContent = "Close ×";
    closeBtn.addEventListener("click", () => this.close());

    header.append(titleWrap, closeBtn);

    this.summaryEl = document.createElement("div");
    this.summaryEl.className = "agents-panel-summary";

    this.railsEl = document.createElement("div");
    this.railsEl.className = "agents-panel-rails";

    this.flowEl = document.createElement("div");
    this.flowEl.className = "agents-panel-flow";

    this.listEl = document.createElement("div");
    this.listEl.className = "agents-panel-list";
    this.listEl.innerHTML = `<div class="agents-panel-empty">Loading runtime cast...</div>`;
    this.listEl.addEventListener("wheel", (event) => {
      event.stopPropagation();
    });
    this.listEl.addEventListener("touchmove", (event) => {
      event.stopPropagation();
    });

    this.panel.append(header, this.summaryEl, this.railsEl, this.flowEl, this.listEl);
    this.el.appendChild(this.panel);
  }

  setContext(mapName?: string | null) {
    this.mapName = mapName ?? null;
    this.subscribe();
  }

  toggle() {
    if (this.isOpen) {
      this.close();
      return;
    }
    this.open();
  }

  close() {
    this.isOpen = false;
    this.panel.style.display = "none";
  }

  setVisible(visible: boolean) {
    if (!visible) this.close();
  }

  destroy() {
    this.castUnsub?.();
    this.ledgerUnsub?.();
    this.offersUnsub?.();
    this.el.remove();
  }

  private open() {
    this.isOpen = true;
    this.panel.style.display = "";
  }

  private subscribe() {
    this.castUnsub?.();
    this.ledgerUnsub?.();
    this.offersUnsub?.();
    const runtimeApi: any = (api as any)["agents/runtime"];
    const economicsApi: any = (api as any)["agents/agentEconomics"];
    const offersApi: any = (api as any)["integrations/x402"];
    if (!runtimeApi?.listRuntimeCast) return;

    const convex = getConvexClient();
    this.castUnsub = convex.onUpdate(
      runtimeApi.listRuntimeCast,
      { mapName: this.mapName ?? undefined },
      (payload: unknown) => this.render(payload as RuntimeCastEntry[]),
    );

    if (economicsApi?.getEconomySnapshot) {
      this.ledgerUnsub = convex.onUpdate(
        economicsApi.getEconomySnapshot,
        { mapName: this.mapName ?? undefined },
        (payload: unknown) => this.consumeEconomy(payload as EconomySnapshot),
      );
    }

    if (offersApi?.listOffers) {
      this.offersUnsub = convex.onUpdate(
        offersApi.listOffers,
        {},
        (payload: unknown) => this.consumeOffers(payload as PremiumOfferRecord[]),
      );
    }
  }

  private consumeEconomy(snapshot: EconomySnapshot) {
    this.economyByAgentId = new Map((snapshot?.leaderboard ?? []).map((row) => [row.agentId, row]));
    this.recentEvents = snapshot?.recentEconomicEvents ?? [];
    this.totalTrackedStx = snapshot?.totalEarnedStx ?? 0;
    this.render(this.lastCast);
  }

  private consumeOffers(rows: PremiumOfferRecord[]) {
    const offers = Array.isArray(rows) ? rows : [];
    this.offersByAgentId = new Map<string, PremiumOfferRecord[]>();
    this.sessionOffer = null;

    for (const offer of offers) {
      if (offer.status && offer.status !== "active") continue;
      if (offer.offerKey === "stackshub-session-continuation") {
        this.sessionOffer = offer;
      }
      const bucket = this.offersByAgentId.get(offer.agentId) ?? [];
      bucket.push(offer);
      this.offersByAgentId.set(offer.agentId, bucket);
    }

    this.render(this.lastCast);
  }

  private render(rows: RuntimeCastEntry[]) {
    const cast = Array.isArray(rows) ? rows : [];
    this.lastCast = cast;
    const walletReady = cast.filter(
      (entry) =>
        Boolean(entry.binding?.walletStatus) &&
        (entry.wallets?.some((wallet) => wallet.status === "active") ?? false),
    ).length;
    const executionReady = cast.filter((entry) => entry.binding?.canTradeAssets).length;

    this.options.onStatsChange?.({
      total: cast.length,
      walletReady,
      executionReady,
    });

    this.summaryEl.innerHTML = "";
    const summaryItems = [
      { label: "Cast", value: String(cast.length) },
      { label: "Wallet Ready", value: String(walletReady) },
      { label: "Executors", value: String(executionReady) },
      { label: "STX Ledger", value: this.totalTrackedStx.toFixed(4) },
    ];
    for (const item of summaryItems) {
      const chip = document.createElement("div");
      chip.className = "agents-panel-chip";
      const value = document.createElement("div");
      value.className = "agents-panel-chip-value";
      value.textContent = item.value;
      const label = document.createElement("div");
      label.className = "agents-panel-chip-label";
      label.textContent = item.label;
      chip.append(value, label);
      this.summaryEl.appendChild(chip);
    }

    this.renderFlowStrip();
    this.renderRevenueRails(cast);

    this.listEl.innerHTML = "";
    if (cast.length === 0) {
      this.listEl.innerHTML = `<div class="agents-panel-empty">No active cast on this map yet.</div>`;
      return;
    }

    for (const entry of cast) {
      const registry = entry.registry ?? {};
      const state = entry.state ?? {};
      const binding = entry.binding ?? {};
      const wallet = (entry.wallets ?? []).find((row) => row.status === "active") ?? entry.wallets?.[0];
      const economy = registry.agentId ? this.economyByAgentId.get(registry.agentId) : undefined;
      const primaryOffer =
        (registry.agentId ? this.offersByAgentId.get(registry.agentId)?.[0] : undefined) ?? null;
      const receiverAddress =
        primaryOffer?.receiverAddress ??
        economy?.walletAddress ??
        wallet?.address ??
        registry.walletAddress ??
        null;
      const receiverNetwork =
        primaryOffer?.network ?? economy?.network ?? wallet?.network ?? registry.network ?? "unknown-network";
      const receiverRole = primaryOffer
        ? primaryOffer.deliveryType === "session-extension"
          ? "Session Treasury"
          : "Revenue Rail"
        : binding.canTradeAssets
          ? "Execution Wallet"
          : "Identity Wallet";

      const card = document.createElement("article");
      card.className = "agents-panel-card";

      const top = document.createElement("div");
      top.className = "agents-panel-card-top";

      const heading = document.createElement("div");
      const name = document.createElement("div");
      name.className = "agents-panel-card-name";
      name.textContent = registry.displayName ?? registry.agentId ?? "Unknown agent";
      const role = document.createElement("div");
      role.className = "agents-panel-card-role";
      role.textContent = `${entry.role?.displayRole ?? titleCase(registry.roleKey)} · ${titleCase(registry.permissionTier)}`;
      heading.append(name, role);

      const stateBadge = document.createElement("div");
      stateBadge.className = "agents-panel-state";
      stateBadge.textContent = titleCase(state.state);

      top.append(heading, stateBadge);

      const meta = document.createElement("div");
      meta.className = "agents-panel-meta";
      meta.textContent = [
        binding.walletProvider ?? wallet?.provider ?? "no-provider",
        wallet?.walletRole ?? "no-wallet-role",
        wallet?.network ?? registry.network ?? "unknown-network",
      ]
        .map((part) => titleCase(part))
        .join(" · ");

      const authority = document.createElement("div");
      authority.className = `agents-panel-authority ${binding.canTradeAssets ? "is-execution" : "is-identity"}`;
      authority.textContent = binding.canTradeAssets ? "Execution Warrant" : "Identity Seal";

      const intent = document.createElement("div");
      intent.className = "agents-panel-intent";
      intent.textContent = state.currentIntent
        ? `Live intent · ${titleCase(state.currentIntent)}`
        : "Live intent · Holding posture";

      const memory = document.createElement("div");
      memory.className = "agents-panel-memory";
      memory.textContent = state.memorySummary ?? "No memory summary yet.";

      const flow = document.createElement("div");
      flow.className = "agents-panel-flowline";
      flow.textContent = economy
        ? `${economy.totalEarnedStx.toFixed(4)} STX tracked · ${economy.earningCount} payment${economy.earningCount === 1 ? "" : "s"}${economy.lastEarningTxid ? ` · tx ${this.shortenTxid(economy.lastEarningTxid)}` : ""}`
        : "No tracked inflow yet.";

      const footer = document.createElement("div");
      footer.className = "agents-panel-footer";

      const walletLine = document.createElement("div");
      walletLine.className = "agents-panel-wallet";
      walletLine.textContent = `${receiverRole} · ${shortenAddress(receiverAddress)} · ${titleCase(receiverNetwork)}`;

      const updated = document.createElement("div");
      updated.className = "agents-panel-updated";
      updated.textContent = `Updated ${formatRelativeTime(state.updatedAt)}`;

      footer.append(walletLine, updated);
      card.append(top, meta, authority, intent, memory, flow, footer);
      this.listEl.appendChild(card);
    }
  }

  private renderRevenueRails(cast: RuntimeCastEntry[]) {
    this.railsEl.innerHTML = "";

    const heading = document.createElement("div");
    heading.className = "agents-panel-rails-heading";
    heading.textContent = "Revenue Rails";
    this.railsEl.appendChild(heading);

    const list = document.createElement("div");
    list.className = "agents-panel-rails-list";
    this.railsEl.appendChild(list);

    if (this.sessionOffer?.receiverAddress) {
      const row = document.createElement("div");
      row.className = "agents-panel-rail";
      row.innerHTML = `
          <div class="agents-panel-rail-left">
          <div class="agents-panel-rail-name">Session continuation tithe</div>
          <div class="agents-panel-rail-meta">${this.sessionOffer.priceAmount} ${this.sessionOffer.priceAsset} · ${titleCase(this.sessionOffer.network ?? "testnet")} · treasury sink</div>
        </div>
        <div class="agents-panel-rail-address">${shortenAddress(this.sessionOffer.receiverAddress)}</div>
      `;
      list.appendChild(row);
    }

    for (const entry of cast.slice(0, 5)) {
      const registry = entry.registry ?? {};
      if (!registry.agentId) continue;
      const offer = this.offersByAgentId.get(registry.agentId)?.[0];
      const economy = this.economyByAgentId.get(registry.agentId);
      const receiverAddress = offer?.receiverAddress ?? economy?.walletAddress ?? registry.walletAddress ?? null;
      if (!receiverAddress) continue;

      const row = document.createElement("div");
      row.className = "agents-panel-rail";

      const left = document.createElement("div");
      left.className = "agents-panel-rail-left";

      const name = document.createElement("div");
      name.className = "agents-panel-rail-name";
      name.textContent = registry.displayName ?? registry.agentId;

      const meta = document.createElement("div");
      meta.className = "agents-panel-rail-meta";
      meta.textContent = [
        bindingLabelForRail(registry.permissionTier),
        offer ? `${offer.priceAmount} ${offer.priceAsset}` : "no live premium rail",
        titleCase(offer?.network ?? registry.network ?? "testnet"),
      ].join(" · ");

      const address = document.createElement("div");
      address.className = "agents-panel-rail-address";
      address.textContent = shortenAddress(receiverAddress);

      left.append(name, meta);
      row.append(left, address);
      list.appendChild(row);
    }

    if (!list.childElementCount) {
      const empty = document.createElement("div");
      empty.className = "agents-panel-flow-empty";
      empty.textContent = "No active payment rails configured yet.";
      list.appendChild(empty);
    }
  }

  private renderFlowStrip() {
    this.flowEl.innerHTML = "";

    const heading = document.createElement("div");
    heading.className = "agents-panel-flow-heading";
    heading.textContent = "Recent Flow";
    this.flowEl.appendChild(heading);

    const rows = this.recentEvents.slice(0, 4);
    if (rows.length === 0) {
      const empty = document.createElement("div");
      empty.className = "agents-panel-flow-empty";
      empty.textContent = "No economic events recorded yet.";
      this.flowEl.appendChild(empty);
      return;
    }

    const list = document.createElement("div");
    list.className = "agents-panel-flow-list";
    this.flowEl.appendChild(list);

    for (const event of rows) {
      const row = document.createElement("div");
      row.className = "agents-panel-flow-row";

      const left = document.createElement("div");
      left.className = "agents-panel-flow-left";

      const who = document.createElement("div");
      who.className = "agents-panel-flow-who";
      who.textContent = event.actorDisplayName ?? event.actorId ?? "Unknown agent";

      const what = document.createElement("div");
      what.className = "agents-panel-flow-what";
      what.textContent = event.summary;

      left.append(who, what);

      const right = document.createElement("div");
      right.className = "agents-panel-flow-right";
      const parts: string[] = [];
      if (typeof event.amountStx === "number") parts.push(`${event.amountStx.toFixed(4)} STX`);
      if (event.txid) parts.push(this.shortenTxid(event.txid));
      right.textContent = parts.join(" · ") || titleCase(event.eventType);

      row.append(left, right);
      list.appendChild(row);
    }
  }

  private shortenTxid(txid?: string | null) {
    if (!txid) return "tx pending";
    if (txid.length <= 12) return txid;
    return `${txid.slice(0, 6)}…${txid.slice(-4)}`;
  }
}
