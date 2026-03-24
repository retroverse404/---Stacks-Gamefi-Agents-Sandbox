/**
 * GameShell – creates the PixiJS canvas, initialises the Game engine,
 * and hosts all overlay UI panels (HUD, ModeToggle, ChatPanel, editors).
 */
import { Game } from "../engine/Game.ts";
import { HUD } from "./HUD.ts";
import { ModeToggle } from "./ModeToggle.ts";
import { ChatPanel } from "./ChatPanel.ts";
import { MapBrowser } from "./MapBrowser.ts";
import { MapEditorPanel } from "../editor/MapEditorPanel.ts";
import { SpriteEditorPanel } from "../sprited/SpriteEditorPanel.ts";
import { CharacterPanel } from "./CharacterPanel.ts";
import { AgentsPanel } from "./AgentsPanel.ts";
import { NpcEditorPanel } from "./NpcEditorPanel.ts";
import { ItemEditorPanel } from "./ItemEditorPanel.ts";
import type { AppMode, ProfileData } from "../engine/types.ts";
import { getConvexClient } from "../lib/convexClient.ts";
import { X402RequestError, resolveX402Url, x402Fetch } from "../lib/x402.ts";
import { api } from "../../convex/_generated/api";
import {
  extendGateUnlockedBy,
  getGateRemainingMs,
  isGateEnabled,
  isGateUnlocked,
} from "../lib/gateAccess.ts";
import {
  APP_SESSION_CONTINUATION_OFFER_KEY,
  ensureRuntimeSessionStarted,
  getRuntimePaidSessionDurationMs,
  getRuntimeSessionModeLabel,
  getRuntimeSessionRemainingMs,
  grantRuntimePaidContinuation,
  isRuntimeSessionPaywallEnabled,
  setRuntimeSessionPaywallOverride,
} from "../lib/runtimeSession.ts";
import "./GameShell.css";

type PremiumOfferRecord = {
  offerKey: string;
  title: string;
  description: string;
  priceAsset: string;
  priceAmount: string;
  network?: string;
  endpointPath?: string;
  status: string;
};

function formatSessionOfferPrice(offer: PremiumOfferRecord) {
  return `${offer.priceAmount} ${offer.priceAsset}`;
}

function getUiErrorMessage(error: unknown) {
  if (error instanceof X402RequestError) {
    const detail =
      typeof error.details === "string"
        ? error.details
        : typeof (error.details as any)?.message === "string"
          ? (error.details as any).message
          : "";
    return detail || error.message;
  }
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unknown session continuation error.";
}

export class GameShell {
  readonly el: HTMLElement;
  private canvas: HTMLCanvasElement;
  private game: Game | null = null;
  private ambientLightEl: HTMLDivElement | null = null;
  private launchLightEl: HTMLDivElement | null = null;
  private mode: AppMode = "play";
  private profile: ProfileData;
  private debugPanel: HTMLElement | null = null;
  private debugTimer: ReturnType<typeof setInterval> | null = null;
  private sessionHudTimer: ReturnType<typeof setInterval> | null = null;
  private sessionPaywallEl: HTMLDivElement | null = null;
  private sessionPaywallPending = false;

  // UI panels
  private hud!: HUD;
  private modeToggle!: ModeToggle;
  private chatPanel!: ChatPanel;
  private mapBrowser!: MapBrowser;
  private mapEditor!: MapEditorPanel;
  private spriteEditor!: SpriteEditorPanel;
  private npcEditor!: NpcEditorPanel;
  private itemEditor!: ItemEditorPanel;
  private characterPanel!: CharacterPanel;
  private agentsPanel!: AgentsPanel;

  private muteKeyHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor(profile: ProfileData) {
    this.profile = profile;
    this.el = document.createElement("div");
    this.el.className = "game-shell";

    this.canvas = document.createElement("canvas");
    this.canvas.className = "game-canvas";
    this.el.appendChild(this.canvas);

    this.ambientLightEl = document.createElement("div");
    this.ambientLightEl.className = "game-ambient-light";
    this.el.appendChild(this.ambientLightEl);

    this.launchLightEl = document.createElement("div");
    this.launchLightEl.className = "game-launch-light";
    this.el.appendChild(this.launchLightEl);

    const sceneLogo = document.createElement("img");
    sceneLogo.className = "game-scene-logo";
    sceneLogo.src = "/assets/graphics-misc/logo-1a.png";
    sceneLogo.alt = "Dungeons and Agents";
    this.el.appendChild(sceneLogo);

    this.initEngine();
  }

  private async initEngine() {
    try {
      const game = new Game(this.canvas, this.profile);
      this.game = game;
      await game.init();
      this.revealSceneLighting();
      this.buildUI();
    } catch (err) {
      console.error("Game initialization failed:", err);
      this.showError(
        err instanceof Error ? err.message : "Failed to initialize game engine"
      );
    }
  }

  private revealSceneLighting() {
    if (!this.launchLightEl) return;
    window.setTimeout(() => {
      this.launchLightEl?.classList.add("is-revealed");
    }, 140);
  }

  private buildUI() {
    const game = this.game!;

    const isAdmin = this.profile.role === "superuser";
    const isGuest = this.profile.role === "guest";

    // Map browser overlay (guests can still browse maps via portals, but not the browser)
    if (!isGuest) {
      this.mapBrowser = new MapBrowser({
        onTravel: (mapName) => {
          game.changeMap(mapName, "start1");
        },
        getCurrentMap: () => game.currentMapName,
        getProfileId: () => this.profile._id,
        isAdmin,
      });
      this.el.appendChild(this.mapBrowser.el);
    }

    // Wire up map change callback so editor/chat update
    game.onMapChanged = (mapName) => {
      this.chatPanel?.setContext(this.profile, mapName);
      this.mapEditor?.loadPlacedObjects(mapName);
      this.mapEditor?.loadPlacedItems(mapName);
      this.hud?.setNowPlaying(game.getCurrentMusicCredit());
      this.agentsPanel?.setContext(mapName);
    };

    // Mode toggle (top-left) with sound button
    this.modeToggle = new ModeToggle({
      initialMode: this.mode,
      isAdmin,
      onChange: (m) => this.setMode(m),
      onToggleSound: () => {
        game.audio.unlock(); // ensure unlocked on click
        return game.audio.toggleMute();
      },
      onOpenMaps: isGuest ? undefined : () => this.mapBrowser?.toggle(),
    });
    this.el.appendChild(this.modeToggle.el);

    // Sync the M-key mute shortcut with the button icon
    this.muteKeyHandler = (e: KeyboardEvent) => {
      if (e.key === "m" || e.key === "M") {
        this.modeToggle?.setSoundIcon(game.audio.muted);
      }
    };
    document.addEventListener("keydown", this.muteKeyHandler);

    // HUD overlay
    this.hud = new HUD(this.mode, {
      onOpenAgents: () => this.agentsPanel?.toggle(),
    });
    this.el.appendChild(this.hud.el);
    this.hud.setNowPlaying(game.getCurrentMusicCredit());
    this.hud.subscribeRuntimePolicy();
    game.onPresenceSummaryChange = (summary) => this.hud?.setPresenceStatus(summary);
    this.startSessionHud();

    if (import.meta.env.DEV) {
      this.buildDebugPanel();
    }

    // --- Guests get a minimal play-only UI (no chat, editors, or character panel) ---
    if (!isGuest) {
      // Chat panel (play mode only)
      this.chatPanel = new ChatPanel();
      this.chatPanel.setContext(this.profile, game.currentMapName);
      this.el.appendChild(this.chatPanel.el);

      // Map editor panel (build mode only)
      this.mapEditor = new MapEditorPanel();
      this.mapEditor.setGame(game);
      this.mapEditor.loadPlacedObjects(game.currentMapName);
      this.mapEditor.loadPlacedItems(game.currentMapName);
      this.el.appendChild(this.mapEditor.el);

      // Sprite editor panel (sprite-edit mode only)
      this.spriteEditor = new SpriteEditorPanel();
      this.spriteEditor.setGame(game);
      this.el.appendChild(this.spriteEditor.el);

      // NPC editor panel (npc-edit mode only)
      this.npcEditor = new NpcEditorPanel();
      this.npcEditor.setGame(game);
      this.el.appendChild(this.npcEditor.el);

      // Item editor panel (item-edit mode only)
      this.itemEditor = new ItemEditorPanel();
      this.itemEditor.setGame(game);
      this.el.appendChild(this.itemEditor.el);

      // Character panel (available in play mode)
      this.characterPanel = new CharacterPanel();
      this.characterPanel.setGame(game);
      this.el.appendChild(this.characterPanel.el);

      this.agentsPanel = new AgentsPanel({
        onStatsChange: (stats) => this.hud?.setAgentStatus(stats),
      });
      this.agentsPanel.setContext(game.currentMapName);
      this.el.appendChild(this.agentsPanel.el);
    }

    this.syncVisibility();
  }

  private setMode(newMode: AppMode) {
    this.mode = newMode;
    this.game?.setMode(newMode);
    this.hud?.setMode(newMode);
    this.game?.worldItemLayer.setBuildMode(newMode === "build");
    this.syncVisibility();
  }

  private syncVisibility() {
    this.chatPanel?.toggle(this.mode === "play");
    this.mapEditor?.toggle(this.mode === "build");
    this.spriteEditor?.toggle(this.mode === "sprite-edit");
    this.npcEditor?.toggle(this.mode === "npc-edit");
    this.itemEditor?.toggle(this.mode === "item-edit");
    this.characterPanel?.toggle(this.mode === "play");
    this.agentsPanel?.setVisible(this.mode === "play");
  }

  private showError(message: string) {
    const wrap = document.createElement("div");
    wrap.style.cssText =
      "display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:12px;padding:24px;";

    const h = document.createElement("h2");
    h.style.color = "var(--danger)";
    h.textContent = "Engine Error";

    const p = document.createElement("p");
    p.style.cssText = "color:var(--text-secondary);text-align:center;";
    p.textContent = message;

    const hint = document.createElement("p");
    hint.style.cssText = "color:var(--text-muted);font-size:13px;";
    hint.textContent =
      "This may happen in embedded browsers with limited WebGL support. Try opening in Chrome or Firefox.";

    wrap.append(h, p, hint);
    this.el.appendChild(wrap);
  }

  private buildDebugPanel() {
    this.debugPanel = document.createElement("div");
    this.debugPanel.className = "debug-panel";
    this.el.appendChild(this.debugPanel);

    this.debugTimer = setInterval(() => {
      const game = this.game;
      if (!game || !this.debugPanel) return;

      const x = Math.round(game.entityLayer.playerX);
      const y = Math.round(game.entityLayer.playerY);
      const collision = game.entityLayer.getCollisionDebugInfo();
      const tile = collision.center;
      const cornerSummary = [
        `TL:${collision.corners.tl.tileX},${collision.corners.tl.tileY}${collision.corners.tl.blocked ? "#" : ""}`,
        `TR:${collision.corners.tr.tileX},${collision.corners.tr.tileY}${collision.corners.tr.blocked ? "#" : ""}`,
        `BL:${collision.corners.bl.tileX},${collision.corners.bl.tileY}${collision.corners.bl.blocked ? "#" : ""}`,
        `BR:${collision.corners.br.tileX},${collision.corners.br.tileY}${collision.corners.br.blocked ? "#" : ""}`,
      ].join(" ");

      this.debugPanel.textContent =
        `Map: ${game.currentMapName} | X:${x} Y:${y} | Tile:${tile.tileX},${tile.tileY} | Center:${collision.centerBlocked ? "yes" : "no"} | Box:${collision.boxBlocked ? "yes" : "no"} | ${cornerSummary}`;
    }, 150);
  }

  show() { this.el.style.display = ""; }
  hide() { this.el.style.display = "none"; }

  private startSessionHud() {
    ensureRuntimeSessionStarted();
    const getRemainingMs = () => {
      const paywallEnabled = isRuntimeSessionPaywallEnabled();
      if (!paywallEnabled) {
        return 0;
      }
      const runtimeRemainingMs = getRuntimeSessionRemainingMs();
      if (isGateEnabled() && isGateUnlocked()) {
        return Math.min(runtimeRemainingMs, getGateRemainingMs());
      }
      return runtimeRemainingMs;
    };

    const paint = () => {
      const paywallEnabled = isRuntimeSessionPaywallEnabled();
      this.hud.setSessionModeLabel(getRuntimeSessionModeLabel());
      if (!paywallEnabled) {
        this.hud.setSessionCountdown(0);
        return;
      }
      const remainingMs = getRemainingMs();
      this.hud.setSessionCountdown(remainingMs);
      if (remainingMs <= 0) {
        this.ensureSessionPaywall();
      }
    };

    paint();
    this.sessionHudTimer = setInterval(paint, 1000);
  }

  private ensureSessionPaywall() {
    if (this.sessionPaywallEl || this.sessionPaywallPending) return;
    this.openSessionPaywall().catch((error) => {
      console.warn("Failed to open session continuation paywall:", error);
    });
  }

  private async openSessionPaywall() {
    const convex = getConvexClient();
    let offer: PremiumOfferRecord | null = null;
    try {
      offer = (await convex.query((api as any)["integrations/x402"].getOffer, {
        offerKey: APP_SESSION_CONTINUATION_OFFER_KEY,
      })) as PremiumOfferRecord | null;
    } catch (error) {
      console.warn("Failed to load session continuation offer:", error);
    }

    if (!offer || !offer.endpointPath) {
      this.continueWithoutSessionPaywall();
      return;
    }

    const overlay = document.createElement("div");
    overlay.className = "game-session-paywall";

    const card = document.createElement("div");
    card.className = "game-session-paywall-card";

    const eyebrow = document.createElement("div");
    eyebrow.className = "game-session-paywall-eyebrow";
    eyebrow.textContent = "Live session complete";

    const title = document.createElement("h2");
    title.className = "game-session-paywall-title";
    title.textContent = "Continue the sandbox";

    const body = document.createElement("p");
    body.className = "game-session-paywall-body";
    body.textContent =
      "Your free live window has ended. Continue exploring agents, DeFi surfaces, and world interactions by approving an x402 session payment.";

    const meta = document.createElement("div");
    meta.className = "game-session-paywall-meta";
    meta.textContent = offer
      ? `${formatSessionOfferPrice(offer)} · ${offer.network ?? "testnet"} · +${Math.round(
          getRuntimePaidSessionDurationMs() / 60000,
        )} min`
      : "Session continuation offer unavailable.";

    const status = document.createElement("div");
    status.className = "game-session-paywall-status";
    status.textContent = offer
      ? "Approve the wallet prompt to keep the session open."
      : "No active session continuation offer is configured.";

    const footnote = document.createElement("p");
    footnote.className = "game-session-paywall-footnote";
    footnote.textContent =
      "* Payments go directly toward ongoing research and development of the project.";

    const actionRow = document.createElement("div");
    actionRow.className = "game-session-paywall-actions";

    const reloadBtn = document.createElement("button");
    reloadBtn.className = "game-session-paywall-secondary";
    reloadBtn.textContent = "Refresh";
    reloadBtn.addEventListener("click", () => window.location.reload());

    const bypassBtn = document.createElement("button");
    bypassBtn.className = "game-session-paywall-secondary";
    bypassBtn.textContent = "Keep Exploring";
    bypassBtn.addEventListener("click", () => {
      this.continueWithoutSessionPaywall({ status, payBtn, reloadBtn, bypassBtn });
    });

    const payBtn = document.createElement("button");
    payBtn.className = "game-session-paywall-primary";
    payBtn.textContent = offer ? `Pay ${formatSessionOfferPrice(offer)}` : "Offer unavailable";
    payBtn.disabled = !offer || !offer.endpointPath;
    payBtn.addEventListener("click", () => {
      if (!offer || !offer.endpointPath) return;
      void this.runSessionContinuationPayment(offer, { status, payBtn, reloadBtn, bypassBtn });
    });

    actionRow.append(reloadBtn, bypassBtn, payBtn);
    card.append(eyebrow, title, body, meta, status, footnote, actionRow);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    this.sessionPaywallEl = overlay;
  }

  private closeSessionPaywall() {
    this.sessionPaywallEl?.remove();
    this.sessionPaywallEl = null;
    this.sessionPaywallPending = false;
  }

  private continueWithoutSessionPaywall(controls?: {
    status?: HTMLElement;
    payBtn?: HTMLButtonElement;
    reloadBtn?: HTMLButtonElement;
    bypassBtn?: HTMLButtonElement;
  }) {
    setRuntimeSessionPaywallOverride("off");
    if (controls?.status) {
      controls.status.textContent = "Payment service unavailable. Continuing without the session paywall.";
    }
    if (controls?.payBtn) controls.payBtn.disabled = true;
    if (controls?.reloadBtn) controls.reloadBtn.disabled = true;
    if (controls?.bypassBtn) controls.bypassBtn.disabled = true;

    window.setTimeout(() => {
      this.closeSessionPaywall();
      this.hud.setSessionModeLabel(getRuntimeSessionModeLabel());
      this.hud.setSessionCountdown(getRuntimeSessionRemainingMs());
    }, 250);
  }

  private async runSessionContinuationPayment(
    offer: PremiumOfferRecord,
    controls: {
      status: HTMLElement;
      payBtn: HTMLButtonElement;
      reloadBtn: HTMLButtonElement;
      bypassBtn: HTMLButtonElement;
    },
  ) {
    if (this.sessionPaywallPending) return;
    this.sessionPaywallPending = true;
    controls.payBtn.disabled = true;
    controls.reloadBtn.disabled = true;
    controls.bypassBtn.disabled = false;
    controls.status.textContent = "Requesting x402 challenge and wallet approval…";

    try {
      const result = await x402Fetch<Record<string, unknown>>(
        resolveX402Url(offer.endpointPath ?? "/api/premium/session/continue"),
        offer.network === "mainnet" ? "mainnet" : "testnet",
      );

      const paymentTxid =
        typeof result.paymentTxid === "string" && result.paymentTxid
          ? result.paymentTxid
          : typeof result.grantAccessTxid === "string" && result.grantAccessTxid
            ? result.grantAccessTxid
            : null;

      grantRuntimePaidContinuation({ paymentTxid });
      if (isGateEnabled() && isGateUnlocked()) {
        extendGateUnlockedBy(getRuntimePaidSessionDurationMs());
      }

      controls.status.textContent = "Session extended. Returning you to the live sandbox…";
      window.setTimeout(() => {
        this.closeSessionPaywall();
        this.hud.setSessionCountdown(getRuntimeSessionRemainingMs());
      }, 650);
    } catch (error) {
      const message = getUiErrorMessage(error);
      controls.status.textContent = message;
      controls.payBtn.disabled = false;
      controls.reloadBtn.disabled = false;
      if (message.includes("payment service is unavailable")) {
        controls.bypassBtn.textContent = "Continue Without Paywall";
      }
      this.sessionPaywallPending = false;
    }
  }

  destroy() {
    if (this.muteKeyHandler) {
      document.removeEventListener("keydown", this.muteKeyHandler);
    }
    if (this.sessionHudTimer) {
      clearInterval(this.sessionHudTimer);
      this.sessionHudTimer = null;
    }
    if (this.debugTimer) {
      clearInterval(this.debugTimer);
      this.debugTimer = null;
    }
    this.closeSessionPaywall();
    this.game?.destroy();
    this.game = null;
    this.el.remove();
  }
}
