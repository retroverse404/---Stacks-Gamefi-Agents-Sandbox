/**
 * World feed panel – collapsible event log backed by Convex world events.
 */
import { getConvexClient } from "../lib/convexClient.ts";
import { api } from "../../convex/_generated/api";
import type { ProfileData } from "../engine/types.ts";
import { IconChat } from "../lib/icons.ts";
import "./ChatPanel.css";

interface WorldEvent {
  _id: string;
  eventType: string;
  actorId?: string;
  targetId?: string;
  objectKey?: string;
  zoneKey?: string;
  summary: string;
  payloadJson?: string;
  detailsJson?: string;
  timestamp: number;
}

interface EventDetails {
  displayName?: string;
  chatterKind?: string;
  replyToDisplayName?: string;
  replyToRoleKey?: string;
  roleKey?: string;
}

interface LedgerRow {
  agentId: string;
  displayName: string;
  roleKey: string;
  walletAddress: string | null;
  network: string;
  permissionTier: string;
  totalEarnedStx: number;
  earningCount: number;
  lastEarningAt: number | null;
  lastEarningTxid: string | null;
}

interface LedgerEvent {
  eventType: string;
  summary: string;
  timestamp: number;
  actorId: string | null;
  actorDisplayName?: string | null;
  txid: string | null;
  secondaryTxid: string | null;
  amountStx: number | null;
  resourceId: string | null;
  objectKey: string | null;
  zoneKey: string | null;
}

interface EconomySnapshot {
  leaderboard: LedgerRow[];
  totalEarnedStx: number;
  recentEconomicEvents: LedgerEvent[];
  totalEconomicEvents: number;
}

interface CastEntry {
  registry?: { agentId: string; displayName?: string; roleKey?: string };
  state?: { state?: string; mood?: string; currentIntent?: string };
  binding?: { walletAddress?: string; network?: string };
}

interface WalletIdentity {
  walletId: string;
  network: string;
  address: string;
  ownerType: string;
  ownerId: string;
  walletRole: string;
  provider?: string;
  custodyType: string;
  status: string;
}

interface WalletLinkPayload {
  profileId?: string;
  network?: string;
  address?: string;
  provider?: string | null;
  walletRole?: string;
}

interface SpotlightLine {
  speaker: string;
  text: string;
}

interface ConversationSpotlight {
  id: string;
  kicker: string;
  lines: SpotlightLine[];
}

export class ChatPanel {
  readonly el: HTMLElement;
  private isOpen = false;
  private toggleBtn: HTMLButtonElement;
  private panel: HTMLElement;
  private contentEl: HTMLElement;
  private messagesEl: HTMLElement;
  private emptyEl: HTMLElement;
  private rosterEl: HTMLElement;
  private chatterEl: HTMLElement;
  private spotlightEl: HTMLElement;
  private ledgerEl: HTMLElement;
  private walletEl: HTMLElement;
  private ledgerUnsub: (() => void) | null = null;
  private walletUnsub: (() => void) | null = null;
  private spotlightTimer: ReturnType<typeof setTimeout> | null = null;
  private spotlightTypingTimer: ReturnType<typeof setTimeout> | null = null;
  private seenSpotlightEventIds = new Set<string>();
  private spotlightQueue: ConversationSpotlight[] = [];
  private activeSpotlightId: string | null = null;

  private profile: ProfileData | null = null;
  private mapName: string | null = null;
  private unsub: (() => void) | null = null;
  private rosterUnsub: (() => void) | null = null;
  private events: WorldEvent[] = [];
  private unreadCount = 0;
  private badgeEl: HTMLElement;
  private joinedAt = Date.now();
  private didHydrate = false;
  private seenEventIds = new Set<string>();
  private castNameByAgentId = new Map<string, string>();

  constructor() {
    this.el = document.createElement("div");

    this.toggleBtn = document.createElement("button");
    this.toggleBtn.className = "chat-toggle";
    this.toggleBtn.title = "Open World Feed";
    this.toggleBtn.setAttribute("aria-label", "Open world feed");
    this.toggleBtn.innerHTML = IconChat;

    this.badgeEl = document.createElement("span");
    this.badgeEl.className = "chat-badge";
    this.badgeEl.style.display = "none";
    this.toggleBtn.appendChild(this.badgeEl);

    this.toggleBtn.addEventListener("click", () => this.open());
    this.el.appendChild(this.toggleBtn);

    this.panel = document.createElement("div");
    this.panel.className = "chat-panel";
    this.panel.style.display = "none";

    const header = document.createElement("div");
    header.className = "chat-header";

    const headerCopy = document.createElement("div");
    headerCopy.className = "chat-header-copy";

    const headerLabel = document.createElement("span");
    headerLabel.className = "chat-header-title";
    headerLabel.textContent = "World Feed";

    const headerSub = document.createElement("span");
    headerSub.className = "chat-header-subtitle";
    headerSub.textContent = "Recent world events and agent activity";

    headerCopy.append(headerLabel, headerSub);

    const closeBtn = document.createElement("button");
    closeBtn.className = "chat-close";
    closeBtn.textContent = "\u00D7";
    closeBtn.addEventListener("click", () => this.close());
    header.append(headerCopy, closeBtn);
    this.panel.appendChild(header);

    this.contentEl = document.createElement("div");
    this.contentEl.className = "chat-content";
    this.panel.appendChild(this.contentEl);

    this.rosterEl = document.createElement("div");
    this.rosterEl.className = "chat-roster";
    this.contentEl.appendChild(this.rosterEl);

    this.chatterEl = document.createElement("div");
    this.chatterEl.className = "chat-chatter";
    this.contentEl.appendChild(this.chatterEl);

    this.walletEl = document.createElement("div");
    this.walletEl.className = "chat-wallet";
    this.contentEl.appendChild(this.walletEl);

    this.spotlightEl = document.createElement("div");
    this.spotlightEl.className = "chat-spotlight";
    this.spotlightEl.style.display = "none";
    this.el.appendChild(this.spotlightEl);

    this.ledgerEl = document.createElement("div");
    this.ledgerEl.className = "chat-ledger";
    this.contentEl.appendChild(this.ledgerEl);

    this.messagesEl = document.createElement("div");
    this.messagesEl.className = "chat-messages";
    this.emptyEl = document.createElement("p");
    this.emptyEl.className = "chat-empty";
    this.emptyEl.textContent = "No world events yet.";
    this.messagesEl.appendChild(this.emptyEl);
    this.contentEl.appendChild(this.messagesEl);

    this.el.appendChild(this.panel);
  }

  setContext(profile: ProfileData, mapName: string) {
    const isSameProfile = this.profile?._id === profile._id;
    const isSameMap = this.mapName === mapName;
    this.profile = profile;
    this.mapName = mapName;

    if (isSameProfile && isSameMap && this.unsub) return;

    this.joinedAt = Date.now();
    this.didHydrate = false;
    this.seenEventIds.clear();
    this.seenSpotlightEventIds.clear();
    this.unreadCount = 0;
    this.updateBadge();
    if (this.spotlightTimer) {
      clearTimeout(this.spotlightTimer);
      this.spotlightTimer = null;
    }
    if (this.spotlightTypingTimer) {
      clearTimeout(this.spotlightTypingTimer);
      this.spotlightTypingTimer = null;
    }
    this.spotlightEl.style.display = "none";
    this.spotlightEl.classList.remove("is-visible", "is-hiding");
    this.spotlightQueue = [];
    this.activeSpotlightId = null;
    this.subscribe();
    this.subscribeRoster();
    this.subscribeWallet();
    this.subscribeLedger();
  }

  private subscribeRoster() {
    this.rosterUnsub?.();
    const convex = getConvexClient();
    const runtimeApi: any = (api as any)["agents/runtime"];
    if (!runtimeApi?.listRuntimeCast) return;
    this.rosterUnsub = convex.onUpdate(
      runtimeApi.listRuntimeCast,
      { mapName: this.mapName ?? undefined },
      (cast: unknown) => this.renderRoster(cast as CastEntry[]),
    );
  }

  private subscribeLedger() {
    this.ledgerUnsub?.();
    const convex = getConvexClient();
    const economicsApi: any = (api as any)["agents/agentEconomics"];
    if (!economicsApi?.getEconomySnapshot) return;
    this.ledgerUnsub = convex.onUpdate(
      economicsApi.getEconomySnapshot,
      { mapName: this.mapName ?? undefined },
      (snapshot: unknown) => this.renderLedger(snapshot as EconomySnapshot),
    );
  }

  private subscribeWallet() {
    this.walletUnsub?.();
    if (!this.profile?._id) {
      this.walletEl.innerHTML = "";
      return;
    }

    const convex = getConvexClient();
    this.walletUnsub = convex.onUpdate(
      api.wallets.listWalletIdentities,
      { ownerType: "player", ownerId: this.profile._id },
      (rows) => this.renderWallet(rows as unknown as WalletIdentity[]),
    );
  }

  private renderWallet(rows: WalletIdentity[]) {
    this.walletEl.innerHTML = "";

    const wallet = (rows ?? []).find((row) => row.walletRole === "payer" && row.status === "active");
    if (!wallet) return;

    const card = document.createElement("div");
    card.className = "chat-wallet-card";

    const header = document.createElement("div");
    header.className = "chat-wallet-header";

    const title = document.createElement("div");
    title.className = "chat-wallet-title";
    title.textContent = "Player Wallet";

    const status = document.createElement("div");
    status.className = "chat-wallet-status";
    status.textContent = "linked";

    header.append(title, status);

    const meta = document.createElement("div");
    meta.className = "chat-wallet-meta";
    meta.textContent = `${this.formatWalletProvider(wallet.provider)} · ${wallet.network} · ${wallet.walletRole}`;

    const address = document.createElement("div");
    address.className = "chat-wallet-address";
    address.textContent = this.shortenAddress(wallet.address);

    card.append(header, meta, address);
    this.walletEl.appendChild(card);
  }

  private renderLedger(snapshot: EconomySnapshot) {
    this.ledgerEl.innerHTML = "";

    const header = document.createElement("div");
    header.className = "chat-ledger-header";

    const title = document.createElement("div");
    title.className = "chat-ledger-title";
    title.textContent = "Agent Ledger";

    const stats = document.createElement("div");
    stats.className = "chat-ledger-stats";
    stats.textContent = `${(snapshot?.totalEarnedStx ?? 0).toFixed(4)} STX tracked`;

    header.append(title, stats);
    this.ledgerEl.appendChild(header);

    const leaderboard = snapshot?.leaderboard ?? [];
    const ledgerEvents = snapshot?.recentEconomicEvents ?? [];

    if (leaderboard.length === 0 && ledgerEvents.length === 0) {
      const empty = document.createElement("div");
      empty.className = "chat-ledger-empty";
      empty.textContent = "No agent transactions yet.";
      this.ledgerEl.appendChild(empty);
      return;
    }

    const board = document.createElement("div");
    board.className = "chat-ledger-board";
    this.ledgerEl.appendChild(board);

    for (const [index, row] of leaderboard.slice(0, 5).entries()) {
      const entry = document.createElement("div");
      entry.className = "chat-ledger-entry";

      const rank = document.createElement("div");
      rank.className = "chat-ledger-rank";
      rank.textContent = `#${index + 1}`;

      const body = document.createElement("div");
      body.className = "chat-ledger-body";

      const top = document.createElement("div");
      top.className = "chat-ledger-top";

      const name = document.createElement("span");
      name.className = "chat-ledger-name";
      name.textContent = row.displayName;

      const amount = document.createElement("span");
      amount.className = "chat-ledger-amount";
      amount.textContent = `${row.totalEarnedStx.toFixed(4)} STX`;

      top.append(name, amount);

      const meta = document.createElement("div");
      meta.className = "chat-ledger-meta";
      meta.textContent = `${row.roleKey} · ${row.earningCount} payment${row.earningCount === 1 ? "" : "s"} · ${this.shortenAddress(row.walletAddress)}`;

      body.append(top, meta);
      entry.append(rank, body);
      board.appendChild(entry);
    }

    if (ledgerEvents.length > 0) {
      const recentLabel = document.createElement("div");
      recentLabel.className = "chat-ledger-recent-label";
      recentLabel.textContent = "Recent economic events";
      this.ledgerEl.appendChild(recentLabel);

      const recentList = document.createElement("div");
      recentList.className = "chat-ledger-recent";
      this.ledgerEl.appendChild(recentList);

      for (const event of ledgerEvents.slice(0, 6)) {
        const row = document.createElement("div");
        row.className = "chat-ledger-event";

        const top = document.createElement("div");
        top.className = "chat-ledger-event-top";

        const label = document.createElement("span");
        label.className = "chat-ledger-event-type";
        label.textContent = this.formatEventType(event.eventType);

        const time = document.createElement("span");
        time.className = "chat-ledger-event-time";
        time.textContent = this.formatTime(event.timestamp);

        top.append(label, time);

        const summary = document.createElement("div");
        summary.className = "chat-ledger-event-summary";
        summary.textContent = event.summary;

        const meta = document.createElement("div");
        meta.className = "chat-ledger-event-meta";
        const parts: string[] = [];
        if (typeof event.amountStx === "number") {
          parts.push(`${event.amountStx.toFixed(4)} STX`);
        }
        if (event.txid) {
          parts.push(`tx ${this.shortenTxid(event.txid)}`);
        }
        if (event.secondaryTxid) {
          parts.push(`pay ${this.shortenTxid(event.secondaryTxid)}`);
        }
        if (event.actorDisplayName) {
          parts.push(String(event.actorDisplayName));
        }
        meta.textContent = parts.join(" · ");

        row.append(top, summary, meta);
        recentList.appendChild(row);
      }
    }
  }

  private renderRoster(cast: CastEntry[]) {
    this.rosterEl.innerHTML = "";
    this.castNameByAgentId.clear();
    if (!cast || cast.length === 0) return;

    const label = document.createElement("div");
    label.className = "chat-roster-label";
    label.textContent = "Active agents";
    this.rosterEl.appendChild(label);

    const pills = document.createElement("div");
    pills.className = "chat-roster-pills";
    this.rosterEl.appendChild(pills);

    for (const entry of cast) {
      const agentId = entry.registry?.agentId;
      const displayName = entry.registry?.displayName ?? agentId ?? "Agent";
      if (agentId) this.castNameByAgentId.set(agentId, displayName);

      const pill = document.createElement("div");
      pill.className = "chat-roster-pill";

      const name = document.createElement("span");
      name.className = "chat-roster-name";
      name.textContent = displayName;

      const mood = document.createElement("span");
      mood.className = "chat-roster-mood";
      mood.textContent = entry.state?.mood ?? entry.state?.state ?? "active";

      pill.append(name, mood);
      pills.appendChild(pill);
    }

    this.renderChatter();
  }

  private subscribe() {
    this.unsub?.();
    const convex = getConvexClient();
    this.unsub = convex.onUpdate(
      api.worldState.listEvents,
      { mapName: this.mapName ?? undefined, limit: 40 },
      (rows) => {
        const next = [...(rows as unknown as WorldEvent[])].reverse();

        if (!this.didHydrate) {
          this.events = next;
          this.renderEvents();
          for (const event of next) this.seenEventIds.add(String(event._id));
          this.didHydrate = true;
          return;
        }

        let newUnread = 0;
        for (const event of next) {
          const id = String(event._id);
          const isNewForClient = !this.seenEventIds.has(id);
          if (isNewForClient && event.timestamp > this.joinedAt && !this.isOpen) {
            newUnread += 1;
          }
        }

        this.events = next;
        this.renderEvents();
        for (const event of next) this.seenEventIds.add(String(event._id));

        if (newUnread > 0) {
          this.unreadCount += newUnread;
          this.updateBadge();
        }

        const newestSpotlight = [...next]
          .reverse()
          .find((event) =>
            !this.seenSpotlightEventIds.has(String(event._id)) &&
            event.eventType.startsWith("agent-thought:"),
          );
        if (newestSpotlight) {
          const spotlight = this.buildConversationSpotlight(newestSpotlight, next);
          this.seenSpotlightEventIds.add(String(newestSpotlight._id));
          if (spotlight) {
            this.enqueueConversationSpotlight(spotlight);
          }
        }
      },
    );
  }

  private renderEvents() {
    this.messagesEl.innerHTML = "";
    this.renderChatter();

    if (this.events.length === 0) {
      this.messagesEl.appendChild(this.emptyEl);
      return;
    }

    let lastDateKey: string | null = null;
    for (const event of this.events) {
      const currentDateKey = this.dateKey(event.timestamp);
      if (currentDateKey !== lastDateKey) {
        const divider = document.createElement("div");
        divider.className = "chat-date-divider";
        divider.textContent = this.formatDateDivider(event.timestamp);
        this.messagesEl.appendChild(divider);
        lastDateKey = currentDateKey;
      }

      const row = document.createElement("div");
      row.className = "chat-msg chat-msg--event";
      if (event.eventType.startsWith("agent-thought:")) {
        row.classList.add("chat-msg--chatter");
      }

      const meta = document.createElement("div");
      meta.className = "chat-msg-meta";

      const typeEl = document.createElement("span");
      typeEl.className = "chat-msg-type";
      typeEl.textContent = this.formatEventType(event.eventType);

      const scopeEl = document.createElement("span");
      scopeEl.className = "chat-msg-scope";
      scopeEl.textContent = this.formatScope(event);

      const timeEl = document.createElement("span");
      timeEl.className = "chat-msg-time";
      timeEl.textContent = this.formatTime(event.timestamp);

      meta.append(typeEl, scopeEl, timeEl);

      const textEl = document.createElement("div");
      textEl.className = "chat-msg-text";
      textEl.textContent = event.summary;

      row.append(meta, textEl);
      this.messagesEl.appendChild(row);
    }

    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }

  private renderChatter() {
    this.chatterEl.innerHTML = "";

    const chatterEvents = this.events
      .filter((event) => event.eventType.startsWith("agent-thought:"))
      .slice(-5)
      .reverse();

    if (chatterEvents.length === 0) return;

    const header = document.createElement("div");
    header.className = "chat-chatter-header";

    const title = document.createElement("div");
    title.className = "chat-chatter-title";
    title.textContent = "Agent Chatter";

    const subtitle = document.createElement("div");
    subtitle.className = "chat-chatter-subtitle";
    subtitle.textContent = "Ambient conversation happening in the room";

    header.append(title, subtitle);
    this.chatterEl.appendChild(header);

    const list = document.createElement("div");
    list.className = "chat-chatter-list";
    this.chatterEl.appendChild(list);

    for (const event of chatterEvents) {
      const details = this.parseEventDetails(event.detailsJson);
      const row = document.createElement("div");
      row.className = "chat-chatter-entry";

      const top = document.createElement("div");
      top.className = "chat-chatter-top";

      const speaker = document.createElement("span");
      speaker.className = "chat-chatter-speaker";
      speaker.textContent = this.resolveEventSpeaker(event, details);

      const meta = document.createElement("span");
      meta.className = "chat-chatter-meta";
      meta.textContent = details.replyToDisplayName
        ? `replying to ${details.replyToDisplayName} · ${this.formatTime(event.timestamp)}`
        : this.formatTime(event.timestamp);

      top.append(speaker, meta);

      const body = document.createElement("div");
      body.className = "chat-chatter-body";
      body.textContent = event.summary;

      row.append(top, body);
      list.appendChild(row);
    }
  }

  private buildConversationSpotlight(event: WorldEvent, events: WorldEvent[]) {
    const details = this.parseEventDetails(event.detailsJson);
    if (!details.replyToDisplayName) return null;
    const speaker = this.resolveEventSpeaker(event, details);

    const candidateEvents = [...events].reverse();
    const counterpartEvent = details.replyToDisplayName
      ? candidateEvents.find((candidate) => {
        if (candidate._id === event._id) return false;
        if (!candidate.eventType.startsWith("agent-thought:")) return false;
        if (candidate.timestamp > event.timestamp) return false;
        const candidateSpeaker = this.resolveEventSpeaker(candidate, this.parseEventDetails(candidate.detailsJson));
        return candidateSpeaker === details.replyToDisplayName;
      })
      : null;
    if (!counterpartEvent) return null;

    const lines: SpotlightLine[] = [];
    lines.push({
      speaker: this.resolveEventSpeaker(counterpartEvent, this.parseEventDetails(counterpartEvent.detailsJson)),
      text: counterpartEvent.summary,
    });
    lines.push({ speaker, text: event.summary });

    return {
      id: String(event._id),
      kicker: "Conversation Nearby",
      lines: lines.slice(-2),
    } satisfies ConversationSpotlight;
  }

  private enqueueConversationSpotlight(spotlight: ConversationSpotlight) {
    if (this.activeSpotlightId === spotlight.id) return;
    if (this.spotlightQueue.some((queued) => queued.id === spotlight.id)) return;
    this.spotlightQueue.push(spotlight);
    if (!this.activeSpotlightId) {
      this.showNextConversationSpotlight();
    }
  }

  private showNextConversationSpotlight() {
    const spotlight = this.spotlightQueue.shift();
    if (!spotlight) {
      this.activeSpotlightId = null;
      return;
    }
    this.activeSpotlightId = spotlight.id;
    this.showConversationSpotlight(spotlight);
  }

  private showConversationSpotlight(spotlight: ConversationSpotlight) {
    this.spotlightEl.innerHTML = "";

    const card = document.createElement("div");
    card.className = "chat-spotlight-card";

    const header = document.createElement("div");
    header.className = "chat-spotlight-header";

    const kicker = document.createElement("span");
    kicker.className = "chat-spotlight-kicker";
    kicker.textContent = spotlight.kicker;

    const time = document.createElement("span");
    time.className = "chat-spotlight-time";
    time.textContent = "live";

    header.append(kicker, time);
    card.appendChild(header);

    const list = document.createElement("div");
    list.className = "chat-spotlight-list";
    card.appendChild(list);

    for (const line of spotlight.lines) {
      const row = document.createElement("div");
      row.className = "chat-spotlight-row";

      const name = document.createElement("div");
      name.className = "chat-spotlight-speaker";
      name.textContent = line.speaker;

      const body = document.createElement("div");
      body.className = "chat-spotlight-text";
      body.textContent = line.text;

      row.append(name, body);
      list.appendChild(row);
    }

    this.spotlightEl.appendChild(card);
    this.spotlightEl.style.display = "";
    this.spotlightEl.classList.remove("is-hiding");
    this.spotlightEl.classList.add("is-visible");

    if (this.spotlightTimer) clearTimeout(this.spotlightTimer);
    this.spotlightTimer = setTimeout(() => {
      this.spotlightEl.classList.remove("is-visible");
      this.spotlightEl.classList.add("is-hiding");
      window.setTimeout(() => {
        if (!this.spotlightEl.classList.contains("is-visible")) {
          this.spotlightEl.style.display = "none";
        }
      }, 240);
    }, 9000);
  }

  private formatEventType(eventType: string): string {
    if (eventType.startsWith("agent-thought:")) {
      return "Agent Chatter";
    }
    if (eventType === "player-wallet-linked") {
      return "Wallet Linked";
    }
    return eventType
      .split(/[-_]/g)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  private formatScope(event: WorldEvent): string {
    if (event.eventType.startsWith("agent-thought:")) {
      return this.resolveEventSpeaker(event, this.parseEventDetails(event.detailsJson));
    }
    if (event.eventType === "player-wallet-linked") {
      const payload = this.parseWalletLinkPayload(event.payloadJson);
      const parts: string[] = [];
      if (payload.provider) parts.push(this.formatWalletProvider(payload.provider));
      if (payload.network) parts.push(payload.network);
      return parts.join(" · ") || "player";
    }
    const parts: string[] = [];
    if (event.zoneKey) parts.push(event.zoneKey);
    if (event.objectKey) parts.push(event.objectKey);
    return parts.join(" · ") || (this.mapName ?? "world");
  }

  private formatTime(ts: number): string {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  private parseEventDetails(detailsJson?: string) {
    if (!detailsJson) return {} as EventDetails;
    try {
      return JSON.parse(detailsJson) as EventDetails;
    } catch {
      return {} as EventDetails;
    }
  }

  private parseWalletLinkPayload(payloadJson?: string) {
    if (!payloadJson) return {} as WalletLinkPayload;
    try {
      return JSON.parse(payloadJson) as WalletLinkPayload;
    } catch {
      return {} as WalletLinkPayload;
    }
  }

  private resolveEventSpeaker(event: WorldEvent, details: EventDetails) {
    return details.displayName
      ?? (event.actorId ? this.castNameByAgentId.get(event.actorId) : null)
      ?? event.actorId
      ?? "Agent";
  }

  private shortenAddress(address: string | null | undefined): string {
    if (!address) return "wallet pending";
    if (address.length <= 14) return address;
    return `${address.slice(0, 6)}…${address.slice(-4)}`;
  }

  private formatWalletProvider(provider: string | null | undefined) {
    if (!provider) return "Stacks wallet";
    switch (provider) {
      case "leather":
        return "Leather";
      case "xverse":
        return "Xverse";
      case "asigna":
        return "Asigna";
      case "fordefi":
        return "Fordefi";
      default:
        return provider.charAt(0).toUpperCase() + provider.slice(1);
    }
  }

  private shortenTxid(txid: string): string {
    if (txid.length <= 18) return txid;
    return `${txid.slice(0, 10)}…${txid.slice(-8)}`;
  }

  private dateKey(ts: number): string {
    const d = new Date(ts);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  private formatDateDivider(ts: number): string {
    const d = new Date(ts);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const diffDays = Math.floor((today - msgDay) / 86_400_000);
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    return d.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
  }

  private open() {
    this.isOpen = true;
    this.toggleBtn.style.display = "none";
    this.panel.style.display = "";
    this.unreadCount = 0;
    this.updateBadge();
    requestAnimationFrame(() => {
      this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    });
  }

  private close() {
    this.isOpen = false;
    this.toggleBtn.style.display = "";
    this.panel.style.display = "none";
  }

  private updateBadge() {
    if (this.unreadCount > 0) {
      this.badgeEl.textContent = String(this.unreadCount);
      this.badgeEl.style.display = "";
    } else {
      this.badgeEl.style.display = "none";
    }
  }

  toggle(visible: boolean) {
    this.el.style.display = visible ? "" : "none";
  }

  show() { this.el.style.display = ""; }
  hide() { this.el.style.display = "none"; }

  destroy() {
    this.unsub?.();
    this.rosterUnsub?.();
    this.ledgerUnsub?.();
    this.walletUnsub?.();
    if (this.spotlightTimer) clearTimeout(this.spotlightTimer);
    this.el.remove();
  }
}
