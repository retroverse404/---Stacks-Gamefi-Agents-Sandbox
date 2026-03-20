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
import { NpcEditorPanel } from "./NpcEditorPanel.ts";
import { ItemEditorPanel } from "./ItemEditorPanel.ts";
import type { AppMode, ProfileData } from "../engine/types.ts";
import { getGateRemainingMs, isGateEnabled, isGateUnlocked } from "../lib/gateAccess.ts";
import "./GameShell.css";

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
    this.hud = new HUD(this.mode);
    this.el.appendChild(this.hud.el);
    this.hud.setNowPlaying(game.getCurrentMusicCredit());
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
    if (!isGateEnabled() || !isGateUnlocked()) {
      this.hud.setSessionCountdown(null);
      return;
    }

    const paint = () => {
      this.hud.setSessionCountdown(getGateRemainingMs());
    };

    paint();
    this.sessionHudTimer = setInterval(paint, 1000);
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
    this.game?.destroy();
    this.game = null;
    this.el.remove();
  }
}
