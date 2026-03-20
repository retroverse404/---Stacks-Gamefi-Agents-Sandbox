import { Application, Container } from "pixi.js";
import { Camera } from "./Camera.ts";
import { MapRenderer } from "./MapRenderer.ts";
import { EntityLayer } from "./EntityLayer.ts";
import { ObjectLayer } from "./ObjectLayer.ts";
import { WorldItemLayer } from "./WorldItemLayer.ts";
import { InputManager } from "./InputManager.ts";
import { AudioManager, type MusicPlaybackSnapshot } from "./AudioManager.ts";
import { getConvexClient } from "../lib/convexClient.ts";
import { isLocalConvexUrl } from "../lib/runtimeEnv.ts";
import { X402RequestError, resolveX402Url, x402Fetch } from "../lib/x402.ts";
import { api } from "../../convex/_generated/api";
import type { AppMode, MapData, Portal, ProfileData, PresenceData } from "./types.ts";
import type { Id } from "../../convex/_generated/dataModel";
import { splashManager } from "../splash/SplashManager.ts";
import {
  createRetroCaptchaSplash,
  pickRetroCaptchaVariant,
  type RetroCaptchaAnswer,
  type RetroCaptchaVariant,
} from "../splash/screens/RetroCaptchaSplash.ts";

const PRESENCE_INTERVAL_MS = 250;   // how often to push position to Convex
const SAVE_INTERVAL_MS = 30_000;   // how often to persist position to profile (was 10s)
const PRESENCE_MOVE_THRESHOLD = 2; // px — skip presence update if player hasn't moved
const DEFAULT_ITEM_PICKUP_SFX = "/assets/audio/take-item.mp3";
const DEFAULT_MAP_MUSIC_VOLUME = 0.15;
const COZY_CABIN_MUSIC_URL = "/assets/audio/Nardis%20%28Miles%20Davis%29%20HipHop%20Remix.mp3";
const COZY_CABIN_MUSIC_VOLUME = 0.34;
const COZY_CABIN_MUSIC_CREDIT = {
  title: "Nardis (HipHop Remix)",
  artist: "Jackie Coleman",
  context: "Cozy Cabin theme",
  sourceUrl: "https://www.youtube.com/watch?v=V0Z1vG04YQg",
} as const;
const RETRO_CAPTCHA_RUG_OBJECT_KEY = "central-rug-captcha";
const DUAL_STACKING_VIDEO_OBJECT_KEY = "dual-stacking-screen";
const COZY_CABIN_PIT_BLOCK_TILES: ReadonlyArray<readonly [number, number]> = [
  [62, 40],
  [63, 40],
  [64, 40],
  [62, 41],
  [63, 41],
  [64, 41],
  [62, 42],
  [63, 42],
  [64, 42],
];
const BUILTIN_MAP_ALIASES: Record<string, string> = {
  "Cozy Cabin": "cozy-cabin",
  "cozy-cabin": "Cozy Cabin",
};

type SemanticInteractableMeta = {
  tile?: { x: number; y: number };
  trigger?: "proximity" | "interact" | "timed" | "payment-complete";
  proximityCooldownMs?: number;
  oncePerSession?: boolean;
  freeActions?: string[];
  paidActions?: string[];
  interactionPrompt?: string;
  interactionSummary?: string;
  eventBindings?: {
    inspect?: string;
    interact?: string;
    paid?: string;
  };
  premiumOfferKey?: string;
  itemDefName?: string;
  roomLabel?: string;
  videoUrl?: string;
  videoProvider?: string;
  videoTitle?: string;
  pauseWorldMusic?: boolean;
};

type PremiumOfferMeta = {
  objectKey?: string;
  zoneKey?: string;
  delivery?: string;
  unlockEventType?: string;
  unlockFactKey?: string;
  resourceId?: string;
  videoUrl?: string;
  videoProvider?: string;
  videoTitle?: string;
  pauseWorldMusic?: boolean;
};

type PremiumOfferRecord = {
  offerKey: string;
  agentId: string;
  title: string;
  description: string;
  provider: string;
  priceAsset: string;
  priceAmount: string;
  network?: string;
  endpointPath?: string;
  status: string;
  metadataJson?: string;
};

type MapMusicCredit = {
  title: string;
  artist: string;
  context?: string;
  sourceUrl?: string;
};

type AgentChatterDetails = {
  displayName?: string;
  replyToDisplayName?: string;
};

type AgentChatterEvent = {
  _id: string;
  eventType: string;
  actorId?: string;
  summary: string;
  detailsJson?: string;
  timestamp: number;
};

type SemanticInteractable = {
  objectKey: string;
  label: string;
  objectType: string;
  zoneKey?: string;
  x?: number;
  y?: number;
  metadata: SemanticInteractableMeta;
};

type PremiumVideoPayload = {
  videoUrl: string;
  videoProvider: "youtube" | "video";
  title: string;
  summary: string;
  sourceLabel: string;
  pauseWorldMusic: boolean;
};

function parseJsonObject<T>(json: string | undefined): T | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

function resolveOfferNetwork(network?: string): "mainnet" | "testnet" {
  return network === "mainnet" || network === "stacks:1" ? "mainnet" : "testnet";
}

function getYouTubeVideoId(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("youtu.be")) {
      return parsed.pathname.replace("/", "") || null;
    }
    return parsed.searchParams.get("v");
  } catch {
    return null;
  }
}

function buildYouTubeEmbedUrl(url: string) {
  const videoId = getYouTubeVideoId(url);
  if (!videoId) return null;
  return `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&mute=0&controls=1&playsinline=1&rel=0&modestbranding=1&enablejsapi=1`;
}

function formatOfferPrice(offer: PremiumOfferRecord) {
  return `${offer.priceAmount} ${offer.priceAsset}`;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unknown premium interaction error.";
}

/**
 * Main game class. Manages the PixiJS application, camera, map rendering,
 * entity layer, input, and audio. Now profile-aware for multiplayer.
 */
export class Game {
  app: Application;
  camera: Camera;
  mapRenderer!: MapRenderer;
  entityLayer!: EntityLayer;
  worldUiLayer!: Container;
  objectLayer!: ObjectLayer;
  worldItemLayer!: WorldItemLayer;
  input: InputManager;
  audio: AudioManager;
  mode: AppMode = "play";

  /** The current player profile (from Convex) */
  profile: ProfileData;
  currentMapName = "Cozy Cabin";  // overwritten by profile's mapName on init

  /** True when the player is an unauthenticated guest (read-only mode) */
  get isGuest() { return this.profile.role === "guest"; }

  private canvas: HTMLCanvasElement;
  private resizeObserver: ResizeObserver | null = null;
  private initialized = false;
  private unlockHandler: (() => void) | null = null;

  // Multiplayer
  private presenceTimer: ReturnType<typeof setInterval> | null = null;
  private saveTimer: ReturnType<typeof setInterval> | null = null;
  private presenceUnsub: (() => void) | null = null;
  private lastPresenceX = 0;
  private lastPresenceY = 0;

  // Live map-object subscription (static objects)
  private mapObjectsUnsub: (() => void) | null = null;
  private mapObjectsLoading = false;
  private mapObjectsFirstCallback = true;  // skip the initial fire (already loaded)
  private mapObjectsDirty = false;          // set during build mode when subscription fires; triggers re-subscribe on exit

  // Live world items subscription
  private worldItemsUnsub: (() => void) | null = null;
  private semanticInteractables: SemanticInteractable[] = [];
  private activeProximityObjectKeys = new Set<string>();
  private proximityTriggerState = new Map<
    string,
    { lastTriggeredAt: number; lastResolvedAt?: number; triggeredCount: number }
  >();
  private semanticPromptEl: HTMLDivElement | null = null;
  private premiumPanelEl: HTMLDivElement | null = null;
  private premiumVideoOverlayEl: HTMLDivElement | null = null;
  private premiumVideoMusicSnapshot: MusicPlaybackSnapshot | null = null;
  private premiumInteractionPending = false;

  // Live NPC state subscription
  private npcStateUnsub: (() => void) | null = null;
  private agentChatterUnsub: (() => void) | null = null;
  /** Cached sprite definitions for NPC rendering */
  private spriteDefCache: Map<string, any> = new Map();

  constructor(canvas: HTMLCanvasElement, profile: ProfileData) {
    this.canvas = canvas;
    this.profile = profile;
    this.app = new Application();
    this.camera = new Camera();
    this.input = new InputManager(canvas);
    this.audio = new AudioManager();
  }

  async init() {
    const parent = this.canvas.parentElement!;
    await this.app.init({
      canvas: this.canvas,
      width: parent.clientWidth,
      height: parent.clientHeight,
      backgroundColor: 0x0a0a12,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
      antialias: false,
    });

    // Now that PixiJS is initialized, create rendering layers
    this.mapRenderer = new MapRenderer(this);
    this.objectLayer = new ObjectLayer();
    this.objectLayer.setAudio(this.audio);
    this.worldItemLayer = new WorldItemLayer();
    this.entityLayer = new EntityLayer(this);
    this.worldUiLayer = this.entityLayer.worldUiContainer;

    // Add layers to stage
    // Order: map base -> worldItems -> objects -> entities -> map overlays -> world UI
    this.app.stage.addChild(this.mapRenderer.container);        // base map tiles
    this.app.stage.addChild(this.worldItemLayer.container);      // pickups
    this.app.stage.addChild(this.objectLayer.container);         // placed objects
    this.app.stage.addChild(this.entityLayer.container);         // player + NPCs
    this.app.stage.addChild(this.mapRenderer.overlayLayerContainer); // overlay tiles (above entities)
    this.app.stage.addChild(this.worldUiLayer);                  // speech/name/prompt UI above overlays
    this.app.stage.sortableChildren = true;

    // Resize handling
    this.resizeObserver = new ResizeObserver(() => {
      const w = parent.clientWidth;
      const h = parent.clientHeight;
      this.app.renderer.resize(w, h);
      this.camera.setViewport(w, h);
    });
    this.resizeObserver.observe(parent);
    this.camera.setViewport(parent.clientWidth, parent.clientHeight);

    // Main game loop
    this.app.ticker.add(() => {
      this.update();
    });

    // Unlock audio on first user interaction (autoplay policy)
    this.unlockHandler = () => {
      this.audio.unlock();
      document.removeEventListener("click", this.unlockHandler!);
      document.removeEventListener("keydown", this.unlockHandler!);
    };
    document.addEventListener("click", this.unlockHandler);
    document.addEventListener("keydown", this.unlockHandler);

    // Mute toggle with M key
    document.addEventListener("keydown", (e) => {
      if (e.key === "m" || e.key === "M") {
        this.audio.toggleMute();
      }
    });

    this.initialized = true;

    // Seed any static JSON maps that aren't yet in Convex (skip for guests — read-only)
    if (!this.isGuest) {
      await this.seedStaticMaps();
      if (isLocalConvexUrl(import.meta.env.VITE_CONVEX_URL as string | undefined)) {
        try {
          const convex = getConvexClient();
          await convex.mutation((api as any).localDev.ensureDemoNpc, { mapName: "Cozy Cabin" });
        } catch (e) {
          console.warn("Local demo NPC seed failed:", e);
        }
      }
    }

    // Auto-load the default map
    await this.loadDefaultMap();

    // Clean up any stale presence rows, then start broadcasting
    // (guests are read-only — skip presence mutations but still subscribe)
    if (!this.isGuest) {
      try {
        const convex = getConvexClient();
        await convex.mutation(api.presence.cleanup, { staleThresholdMs: 5000 });
      } catch (e) {
        console.warn("Presence cleanup failed (OK on first run):", e);
      }
    }
    this.startPresence();
  }

  // ===========================================================================
  // Map loading
  // ===========================================================================

  /** Known static JSON maps that should be seeded into Convex if missing */
  private static readonly STATIC_MAPS = ["cozy-cabin", "camineet", "mage-city", "palma"];

  private applyBuiltInMapFixups(mapData: MapData) {
    const isCozyCabin = mapData.name === "Cozy Cabin" || mapData.id === "cozy-cabin";
    if (!isCozyCabin) return;

    // Keep the local Cozy Cabin soundtrack aligned even when the map has
    // already been seeded into Convex with an older music URL.
    mapData.musicUrl = COZY_CABIN_MUSIC_URL;

    // The bedroom passage on the east side of Cozy Cabin is visually open but
    // ships with blocked collision tiles in the saved map/static seed.
    const clearCollision = (tileX: number, tileY: number) => {
      if (
        tileX < 0 ||
        tileY < 0 ||
        tileX >= mapData.width ||
        tileY >= mapData.height
      ) {
        return;
      }
      mapData.collisionMask[tileY * mapData.width + tileX] = false;
    };
    const blockCollision = (tileX: number, tileY: number) => {
      if (
        tileX < 0 ||
        tileY < 0 ||
        tileX >= mapData.width ||
        tileY >= mapData.height
      ) {
        return;
      }
      mapData.collisionMask[tileY * mapData.width + tileX] = true;
    };

    for (let tileY = 17; tileY <= 26; tileY++) {
      for (const tileX of [67, 68] as const) {
        clearCollision(tileX, tileY);
      }
    }

    for (const [tileX, tileY] of COZY_CABIN_PIT_BLOCK_TILES) {
      blockCollision(tileX, tileY);
    }
  }

  private getBuiltInMapCandidates(mapName: string) {
    return Array.from(new Set([mapName, BUILTIN_MAP_ALIASES[mapName]].filter(Boolean))) as string[];
  }

  private isPlaceholderCozyCabinMap(saved: any) {
    const normalizedName = String(saved?.name ?? "").toLowerCase();
    const isCozyCabin =
      normalizedName === "cozy cabin" || normalizedName === "cozy-cabin";
    if (!isCozyCabin) return false;

    // Emergency local-dev placeholder created during Convex recovery. It should
    // never win over the authored static Cozy Cabin map.
    return (
      saved?.width === 40 &&
      saved?.height === 30 &&
      saved?.tileWidth === 32 &&
      saved?.tileHeight === 32 &&
      saved?.tilesetUrl === "/assets/tilesets/cozy-cabin.png" &&
      Array.isArray(saved?.labels) &&
      saved.labels.length === 0
    );
  }

  private getMapMusicConfig(mapData: MapData) {
    const isCozyCabin = mapData.name === "Cozy Cabin" || mapData.id === "cozy-cabin";
    return {
      url: mapData.musicUrl || "/assets/audio/cozy.m4a",
      volume: isCozyCabin ? COZY_CABIN_MUSIC_VOLUME : DEFAULT_MAP_MUSIC_VOLUME,
    };
  }

  private getMapMusicCredit(mapData: MapData | null): MapMusicCredit | null {
    if (!mapData) return null;
    const isCozyCabin = mapData.name === "Cozy Cabin" || mapData.id === "cozy-cabin";
    if (isCozyCabin) {
      return { ...COZY_CABIN_MUSIC_CREDIT };
    }
    return null;
  }

  getCurrentMusicCredit(): MapMusicCredit | null {
    return this.getMapMusicCredit(this.currentMapData);
  }

  private playMapMusic(mapData: MapData) {
    const { url, volume } = this.getMapMusicConfig(mapData);
    this.audio.volume = volume;
    if (url) {
      this.audio.loadAndPlay(url);
    }
  }

  /**
   * Check each known static map — if it doesn't exist in Convex yet,
   * seed it from the static JSON file. Maps that already exist in Convex
   * are never overwritten — the database is the source of truth once seeded.
   *
   * Static maps ship WITHOUT portals — portals are created in-game via
   * the map editor and stored only in Convex.
   */
  private async seedStaticMaps() {
    const convex = getConvexClient();
    for (const name of Game.STATIC_MAPS) {
      try {
        const candidates = this.getBuiltInMapCandidates(name);
        let existing = null;
        for (const candidate of candidates) {
          existing = await convex.query(api.maps.getByName, { name: candidate });
          if (existing) break;
        }
        if (existing) continue; // Already in Convex — don't overwrite

        const resp = await fetch(`/assets/maps/${name}.json`);
        if (!resp.ok) continue;

        const mapData = (await resp.json()) as MapData;
        mapData.portals = mapData.portals ?? [];

        console.log(`Seeding static map "${name}" into Convex...`);
        await this.seedMapToConvex(mapData);
      } catch (err) {
        console.warn(`Failed to seed static map "${name}":`, err);
      }
    }
  }

  private async loadDefaultMap() {
    try {
      let mapData: MapData | null = null;
      let loadedStaticMap = false;

      // Cozy Cabin is the canonical sandbox entry point. Saved profile map state
      // should not override the first world a user boots into.
      const targetMap = "Cozy Cabin";
      const mapCandidates = this.getBuiltInMapCandidates(targetMap);
      console.log(`Loading map: "${targetMap}" (profile.mapName=${this.profile.mapName})`);

      // 1) Try to load from Convex first (saved edits)
      try {
        const convex = getConvexClient();
        console.log(`[loadDefaultMap] querying Convex for map candidates: ${mapCandidates.join(", ")}...`);
        let saved = null;
        for (const candidate of mapCandidates) {
          saved = await convex.query(api.maps.getByName, { name: candidate });
          if (saved) break;
        }
        if (saved) {
          if (this.isPlaceholderCozyCabinMap(saved)) {
            console.warn(
              `[loadDefaultMap] ignoring placeholder Cozy Cabin map in Convex and falling back to static JSON`,
            );
          } else {
          console.log(`[loadDefaultMap] found "${saved.name}" in Convex (id: ${saved._id})`);
          mapData = this.convexMapToMapData(saved);
          }
        } else {
          console.warn(`[loadDefaultMap] Convex returned null for "${targetMap}" — map not found by that name`);
        }
      } catch (convexErr) {
        console.error(
          `[loadDefaultMap] Convex query FAILED for "${targetMap}":`,
          convexErr,
        );
      }

      // 2) Fall back to static JSON file
      if (!mapData) {
        for (const candidate of mapCandidates) {
          try {
            const resp = await fetch(`/assets/maps/${candidate}.json`);
            if (!resp.ok) continue;

            const contentType = resp.headers.get("content-type") ?? "";
            if (!contentType.includes("application/json")) {
              console.warn(
                `[loadDefaultMap] static candidate "${candidate}" returned non-JSON content (${contentType || "unknown"})`,
              );
              continue;
            }

            mapData = (await resp.json()) as MapData;
            mapData.portals = mapData.portals ?? [];
            loadedStaticMap = true;
            console.warn(
              `Loaded map "${candidate}" from static JSON (Convex missing/unavailable)`,
            );
            break;
          } catch (staticErr) {
            console.warn(
              `[loadDefaultMap] failed to parse static map candidate "${candidate}":`,
              staticErr,
            );
          }
        }

        if (!mapData) {
          console.warn(`Static JSON not found for map candidates: ${mapCandidates.join(", ")}`);
        }
      }

      // 3) Ultimate fallback: cozy-cabin static JSON
      if (!mapData) {
        const resp = await fetch("/assets/maps/cozy-cabin.json");
        if (resp.ok) {
          const contentType = resp.headers.get("content-type") ?? "";
          if (contentType.includes("application/json")) {
            mapData = (await resp.json()) as MapData;
            mapData.portals = mapData.portals ?? [];
            loadedStaticMap = true;
            console.warn(`Fell back to "cozy-cabin" static JSON`);
          } else {
            console.warn(
              `[loadDefaultMap] final cozy-cabin fallback returned non-JSON content (${contentType || "unknown"})`,
            );
          }
        } else {
          console.warn(
            `Static fallback map JSON not found (status ${resp.status})`,
          );
        }
      }

      if (!mapData) {
        console.warn("No map could be loaded");
        return;
      }

      if (loadedStaticMap && !this.isGuest) {
        try {
          await this.seedMapToConvex(mapData);
          if (isLocalConvexUrl(import.meta.env.VITE_CONVEX_URL as string | undefined)) {
            const convex = getConvexClient();
            await convex.mutation((api as any).localDev.ensureDemoNpc, { mapName: mapData.name });
          }
        } catch (e) {
          console.warn("Failed to reseed local static map state:", e);
        }
      }

      this.applyBuiltInMapFixups(mapData);
      await this.loadMap(mapData!);
      this.currentMapName = mapData!.name || "Cozy Cabin";
      this.currentMapData = mapData!;
      this.currentPortals = mapData!.portals ?? [];
      console.log(`[Init] Map "${this.currentMapName}" loaded — ${this.currentPortals.length} portals, isGuest=${this.isGuest}`,
        this.currentPortals.map(p => `"${p.name}" at (${p.x},${p.y}) ${p.width}x${p.height} -> ${p.targetMap}`)
      );

      // Tell ObjectLayer the tile size so it can compute door collision tiles
      this.objectLayer.tileWidth = mapData!.tileWidth;
      this.objectLayer.tileHeight = mapData!.tileHeight;

      // Set up door collision callback
      this.objectLayer.onDoorCollisionChange = (tiles, blocked) => {
        for (const t of tiles) {
          if (blocked) {
            this.mapRenderer.setCollisionOverride(t.x, t.y, true);
          } else {
            this.mapRenderer.setCollisionOverride(t.x, t.y, false);
          }
        }
      };

      // Position player — use saved profile position if on this map, else start label
      if (
        this.profile.mapName === this.currentMapName &&
        this.profile.x != null &&
        this.profile.y != null
      ) {
        this.entityLayer.playerX = this.profile.x;
        this.entityLayer.playerY = this.profile.y;
        if (this.profile.direction) {
          this.entityLayer.playerDirection = this.profile.direction as any;
        }
      } else {
        const preferredStartLabel = this.profile.startLabel || "start1";
        const startLabel = mapData!.labels?.find(
          (l: { name: string }) => l.name === preferredStartLabel,
        ) ?? mapData!.labels?.find(
          (l: { name: string }) => l.name === "start1",
        ) ?? mapData!.labels?.[0];
        if (startLabel && this.entityLayer) {
          this.entityLayer.playerX =
            startLabel.x * mapData!.tileWidth + mapData!.tileWidth / 2;
          this.entityLayer.playerY =
            startLabel.y * mapData!.tileHeight + mapData!.tileHeight / 2;
        }
      }

      // Load placed objects from Convex and subscribe to changes
      await this.loadPlacedObjects(this.currentMapName);
      this.subscribeToMapObjects(this.currentMapName);

      // Load and subscribe to world items
      await this.loadWorldItems(this.currentMapName);
      this.subscribeToWorldItems(this.currentMapName);
      await this.loadSemanticInteractables(this.currentMapName);

      // Subscribe to server-authoritative NPC state
      await this.loadSpriteDefs();
      this.subscribeToNpcState(this.currentMapName);
      this.subscribeToAgentChatter(this.currentMapName);

      // Ensure the NPC tick loop is running on the server (skip for guests)
      if (!this.isGuest) {
        try {
          const convex = getConvexClient();
          await convex.mutation(api.npcEngine.ensureLoop, {});
        } catch (e) {
          console.warn("NPC ensureLoop failed (OK on first run):", e);
        }
      }

      // Start background music (use map's musicUrl, fallback to default)
      this.playMapMusic(mapData!);
    } catch (err) {
      console.warn("Failed to load default map:", err);
    }
  }

  // ===========================================================================
  // Map change (multi-map portal transitions)
  // ===========================================================================

  /** Convert a Convex map document to a client-side MapData */
  private convexMapToMapData(saved: any): MapData {
    return {
      id: saved._id,
      name: saved.name,
      width: saved.width,
      height: saved.height,
      tileWidth: saved.tileWidth,
      tileHeight: saved.tileHeight,
      tilesetUrl: saved.tilesetUrl ?? "/assets/tilesets/fantasy-interior.png",
      tilesetPxW: saved.tilesetPxW,
      tilesetPxH: saved.tilesetPxH,
      layers: saved.layers.map((l: any) => ({
        name: l.name,
        type: l.type,
        tiles: JSON.parse(l.tiles),
        visible: l.visible,
      })),
      collisionMask: JSON.parse(saved.collisionMask),
      labels: saved.labels,
      animatedTiles: [],
      animationUrl: saved.animationUrl,
      portals: saved.portals ?? [],
      musicUrl: saved.musicUrl,
      ambientSoundUrl: saved.ambientSoundUrl,
      combatEnabled: saved.combatEnabled,
      status: saved.status,
      editors: saved.editors?.map((e: any) => String(e)) ?? [],
      creatorProfileId: saved.creatorProfileId ? String(saved.creatorProfileId) : undefined,
    };
  }

  /** Whether a map change is currently in progress */
  private changingMap = false;

  /** Current portals on the active map (for collision detection) */
  currentPortals: Portal[] = [];

  /** Current map data reference */
  currentMapData: MapData | null = null;

  private clampCameraToCurrentMap() {
    if (!this.currentMapData) return;

    const worldW = this.currentMapData.width * this.currentMapData.tileWidth;
    const worldH = this.currentMapData.height * this.currentMapData.tileHeight;
    this.camera.clampToWorld(worldW, worldH);
  }

  /**
   * Change to a different map. Handles unloading, loading, fade transition,
   * and resubscribing to all Convex queries.
   */
  async changeMap(targetMapName: string, spawnLabel: string, direction?: string) {
    if (this.changingMap) return;
    this.changingMap = true;
    // Reset the portal-empty warning flag for the new map
    (this as any)._portalEmptyWarned = false;

    console.log(`[MapChange] ${this.currentMapName} -> ${targetMapName} (spawn: ${spawnLabel}, isGuest: ${this.isGuest})`);

    try {
      // 1) Fade out
      console.log("[MapChange] step 1: fade out");
      await this.fadeOverlay(true);

      // 2) Save current position before leaving (skip for guests)
      const convex = getConvexClient();
      if (!this.isGuest) {
        console.log("[MapChange] step 2: saving position");
        const profileId = this.profile._id as Id<"profiles">;
        const pos = this.entityLayer.getPlayerPosition();
        await convex.mutation(api.profiles.savePosition, {
          id: profileId,
          mapName: this.currentMapName,
          x: pos.x,
          y: pos.y,
          direction: pos.direction,
        }).catch(() => {});
      } else {
        console.log("[MapChange] step 2: skipped (guest)");
      }

      // 3) Unsubscribe from current map's data
      console.log("[MapChange] step 3: unsubscribing");
      this.mapObjectsUnsub?.();
      this.mapObjectsUnsub = null;
      this.worldItemsUnsub?.();
      this.worldItemsUnsub = null;
      this.npcStateUnsub?.();
      this.npcStateUnsub = null;
      this.agentChatterUnsub?.();
      this.agentChatterUnsub = null;

      // 4) Clear rendering layers
      console.log("[MapChange] step 4: clearing layers");
      this.worldItemLayer.clear();
      this.objectLayer.clear();
      this.entityLayer.removeAllPlacedNPCs();

      // 5) Load new map from Convex (or fallback to static JSON)
      console.log("[MapChange] step 5: loading map from Convex...");
      let mapData: MapData | null = null;
      try {
        const saved = await convex.query(api.maps.getByName, { name: targetMapName });
        if (saved) {
          console.log(`[MapChange] step 5: loaded "${targetMapName}" from Convex`);
          mapData = this.convexMapToMapData(saved);
        } else {
          console.log(`[MapChange] step 5: "${targetMapName}" not in Convex, trying static JSON`);
        }
      } catch (convexErr) {
        console.error("[MapChange] step 5: Convex query failed:", convexErr);
      }

      if (!mapData) {
        // Try static JSON fallback and seed it into Convex
        try {
          const resp = await fetch(`/assets/maps/${targetMapName}.json`);
          if (resp.ok) {
            mapData = (await resp.json()) as MapData;
            mapData.portals = mapData.portals ?? [];
            console.log(`[MapChange] step 5: loaded "${targetMapName}" from static JSON`);
            // Auto-seed to Convex so future loads come from there (skip for guests)
            if (!this.isGuest) {
              this.seedMapToConvex(mapData).catch((e) =>
                console.warn("Failed to seed map to Convex:", e),
              );
            }
          } else {
            console.warn(
              `[MapChange] step 5: static JSON not found for "${targetMapName}" (status ${resp.status})`,
            );
          }
        } catch (fetchErr) {
          console.error("[MapChange] step 5: static JSON fetch failed:", fetchErr);
        }
      }

      if (!mapData) {
        console.warn(`[MapChange] ABORT: map "${targetMapName}" not found anywhere`);
        await this.fadeOverlay(false);
        this.changingMap = false;
        return;
      }

      this.applyBuiltInMapFixups(mapData);
      console.log(`[MapChange] step 6: loadMap (portals: ${(mapData.portals ?? []).length}, labels: ${(mapData.labels ?? []).length})`);
      await this.loadMap(mapData);
      this.currentMapName = mapData.name;
      this.currentMapData = mapData;
      this.currentPortals = mapData.portals ?? [];

      // Clear collision overrides from previous map and set tile size
      this.mapRenderer.clearAllCollisionOverrides();
      this.objectLayer.tileWidth = mapData.tileWidth;
      this.objectLayer.tileHeight = mapData.tileHeight;
      this.objectLayer.onDoorCollisionChange = (tiles, blocked) => {
        for (const t of tiles) {
          this.mapRenderer.setCollisionOverride(t.x, t.y, blocked);
        }
      };

      // 6) Position player at spawn label
      const spawn = mapData.labels?.find((l) => l.name === spawnLabel) ?? mapData.labels?.[0];
      console.log(`[MapChange] step 7: spawn label="${spawnLabel}" found=${!!spawn} pos=${spawn ? `(${spawn.x},${spawn.y})` : "none"}`);
      if (spawn) {
        this.entityLayer.playerX = spawn.x * mapData.tileWidth + mapData.tileWidth / 2;
        this.entityLayer.playerY = spawn.y * mapData.tileHeight + mapData.tileHeight / 2;
      }
      if (direction) {
        this.entityLayer.playerDirection = direction as any;
      }

      // 7) Reload objects and subscribe
      console.log("[MapChange] step 8: loading objects/items/NPCs");
      await this.loadPlacedObjects(this.currentMapName);
      this.subscribeToMapObjects(this.currentMapName);

      await this.loadWorldItems(this.currentMapName);
      this.subscribeToWorldItems(this.currentMapName);
      await this.loadSemanticInteractables(this.currentMapName);

      await this.loadSpriteDefs();
      this.subscribeToNpcState(this.currentMapName);
      this.subscribeToAgentChatter(this.currentMapName);

      // 8) Restart presence on new map
      console.log("[MapChange] step 9: restarting presence");
      this.stopPresence();
      this.startPresence();

      // 9) Start NPC loop (skip for guests — they can't trigger mutations)
      if (!this.isGuest) {
        await convex.mutation(api.npcEngine.ensureLoop, {}).catch(() => {});
      }

      // 10) Switch music if the new map has a different track
      this.playMapMusic(mapData);

      // 11) Notify editor / chat of map change
      this.onMapChanged?.(this.currentMapName);

      // 12) Fade in
      console.log("[MapChange] step 10: fade in — SUCCESS");
      await this.fadeOverlay(false);
    } catch (err) {
      console.error("[MapChange] FAILED at some step:", err);
      await this.fadeOverlay(false);
    }

    this.changingMap = false;
  }

  /** Callback for UI panels to know when the map changes */
  onMapChanged: ((mapName: string) => void) | null = null;

  /** Seed a static JSON map into Convex (so future loads come from there) */
  private async seedMapToConvex(mapData: MapData) {
    const convex = getConvexClient();
    const existing = await convex.query(api.maps.getByName, { name: mapData.name });
    if (existing) {
      console.warn(
        `Skipping seed for "${mapData.name}" (already exists in Convex)`,
      );
      return;
    }
    const profileId = this.profile._id as Id<"profiles">;
    await convex.mutation(api.maps.saveFullMap, {
      profileId,
      name: mapData.name,
      width: mapData.width,
      height: mapData.height,
      tileWidth: mapData.tileWidth,
      tileHeight: mapData.tileHeight,
      tilesetUrl: mapData.tilesetUrl,
      tilesetPxW: mapData.tilesetPxW,
      tilesetPxH: mapData.tilesetPxH,
      layers: mapData.layers.map((l) => ({
        name: l.name,
        type: l.type as "bg" | "obj" | "overlay",
        tiles: JSON.stringify(l.tiles),
        visible: l.visible,
      })),
      collisionMask: JSON.stringify(mapData.collisionMask),
      labels: mapData.labels.map((l) => ({
        name: l.name,
        x: l.x,
        y: l.y,
        width: l.width ?? 1,
        height: l.height ?? 1,
      })),
      portals: (mapData.portals ?? []).map((p) => ({
        name: p.name,
        x: p.x,
        y: p.y,
        width: p.width,
        height: p.height,
        targetMap: p.targetMap,
        targetSpawn: p.targetSpawn,
        direction: p.direction,
        transition: p.transition,
      })),
      ...(mapData.animationUrl ? { animationUrl: mapData.animationUrl } : {}),
      musicUrl: mapData.musicUrl,
      combatEnabled: mapData.combatEnabled,
      status: mapData.status ?? "published",
      // Static maps are seeded as "system" maps
      mapType: "system",
    });
    console.log(`Map "${mapData.name}" seeded to Convex as system map`);
  }

  // ---------------------------------------------------------------------------
  // Fade overlay for transitions
  // ---------------------------------------------------------------------------

  private fadeEl: HTMLDivElement | null = null;

  private fadeOverlay(fadeIn: boolean): Promise<void> {
    return new Promise((resolve) => {
      if (!this.fadeEl) {
        this.fadeEl = document.createElement("div");
        this.fadeEl.style.cssText =
          "position:absolute;top:0;left:0;width:100%;height:100%;background:#000;" +
          "pointer-events:none;z-index:9999;transition:opacity 0.4s ease;opacity:0;";
        this.canvas.parentElement?.appendChild(this.fadeEl);
      }

      if (fadeIn) {
        this.fadeEl.style.opacity = "1";
      } else {
        this.fadeEl.style.opacity = "0";
      }

      setTimeout(resolve, 420); // slightly longer than transition
    });
  }

  // ===========================================================================
  // Game loop
  // ===========================================================================

  update() {
    if (!this.initialized) return;

    const dt = this.app.ticker.deltaMS / 1000;

    if (this.mode === "play") {
      this.entityLayer.update(dt, this.input);
      this.checkPortals();

      // Update world items (glow, bob, proximity)
      this.worldItemLayer.update(
        dt,
        this.entityLayer.playerX,
        this.entityLayer.playerY,
      );

      // Update toggleable object interaction (glow + prompt)
      this.objectLayer.updateToggleInteraction(
        dt,
        this.entityLayer.playerX,
        this.entityLayer.playerY,
      );

      this.handleSemanticProximityTriggers();

      // Handle item pickup with E key (only if no toggleable object is near)
      // Guests can't interact — skip all mutations
      if (!this.isGuest) {
        if (!this.objectLayer.getNearestToggleableId()) {
          this.handleItemPickup();
        } else {
          this.handleObjectToggle();
        }
        this.handleSemanticInteraction();
      }
    }

    // In build mode, still update world items for visual feedback (but no pickup)
    if (this.mode === "build") {
      this.hideSemanticPrompt();
      this.worldItemLayer.update(dt, -9999, -9999); // no proximity in build mode
    }

    // Update spatial audio (ambient sounds fade by distance from player)
    this.objectLayer.updateAmbientVolumes(
      this.entityLayer.playerX,
      this.entityLayer.playerY,
    );

    // Update camera follow target first.
    this.camera.update();

    // In build mode, allow panning with keyboard.
    if (this.mode === "build") {
      const panSpeed = 300;
      if (this.input.isDown("ArrowLeft") || this.input.isDown("a")) {
        this.camera.x -= panSpeed * dt;
      }
      if (this.input.isDown("ArrowRight") || this.input.isDown("d")) {
        this.camera.x += panSpeed * dt;
      }
      if (this.input.isDown("ArrowUp") || this.input.isDown("w")) {
        this.camera.y -= panSpeed * dt;
      }
      if (this.input.isDown("ArrowDown") || this.input.isDown("s")) {
        this.camera.y += panSpeed * dt;
      }
    }

    this.clampCameraToCurrentMap();

    // Apply the final camera transform after follow, pan, and clamping.
    this.app.stage.x = -this.camera.x + this.camera.viewportW / 2;
    this.app.stage.y = -this.camera.y + this.camera.viewportH / 2;

    // Clear just-pressed keys at the very end of the frame, so all systems
    // (entity movement, NPC dialogue, toggle, pickup) can read them first.
    this.input.endFrame();
  }

  /** Check if the player is standing in a portal zone and trigger map change */
  private checkPortals() {
    if (this.changingMap) {
      // Uncomment below for verbose debugging:
      // console.log("[Portal:check] skipped — changingMap is true");
      return;
    }
    if (this.currentPortals.length === 0) {
      // Only log once per map to avoid spam
      if (!(this as any)._portalEmptyWarned) {
        console.warn("[Portal:check] No portals on current map:", this.currentMapName);
        (this as any)._portalEmptyWarned = true;
      }
      return;
    }
    if (!this.currentMapData) return;

    const px = this.entityLayer.playerX;
    const py = this.entityLayer.playerY;
    const tw = this.currentMapData.tileWidth;
    const th = this.currentMapData.tileHeight;

    // Convert player position to tile coordinates
    const ptx = px / tw;
    const pty = py / th;

    for (const portal of this.currentPortals) {
      if (
        ptx >= portal.x &&
        ptx < portal.x + portal.width &&
        pty >= portal.y &&
        pty < portal.y + portal.height
      ) {
        // Player entered the portal zone!
        console.log(`[Portal] HIT "${portal.name}" -> map "${portal.targetMap}" spawn "${portal.targetSpawn}" | isGuest=${this.isGuest}`);
        this.changeMap(portal.targetMap, portal.targetSpawn, portal.direction);
        return; // only trigger one portal per frame
      }
    }
  }

  setMode(mode: AppMode) {
    const wasBuild = this.mode === "build";
    this.mode = mode;
    if (mode === "build") {
      this.camera.stopFollowing();
      // Show portal zones so the editor can see them
      this.mapRenderer.setPortalOverlayVisible(true);
    } else {
      this.mapRenderer.setPortalOverlayVisible(false);
      this.mapRenderer.setCollisionOverlayVisible(false);
      this.mapRenderer.highlightLayer(-1); // restore all layers to full opacity
      this.mapRenderer.hidePortalGhost();
      this.mapRenderer.hideLabelGhost();
      this.mapRenderer.hideTileGhost();

      // When leaving build mode, if objects changed (editor saved), re-subscribe
      // so we pick up new Convex _ids for freshly placed objects.
      // Existing objects keep their IDs (bulkSave patches in place) so toggle
      // state is preserved.
      if (wasBuild && this.mapObjectsDirty) {
        this.subscribeToMapObjects(this.currentMapName, /* skipFirst */ false);
      }

      // Also reload world items so freshly placed items get their Convex _ids
      // (needed for pickup to work — pickup sends the _id to the mutation).
      if (wasBuild) {
        this.loadWorldItems(this.currentMapName);
        this.subscribeToWorldItems(this.currentMapName);
      }
    }
  }

  // ===========================================================================
  // Multiplayer presence
  // ===========================================================================

  private startPresence() {
    const convex = getConvexClient();
    const profileId = this.profile._id as Id<"profiles">;
    console.log(`[Presence] Starting for profile "${this.profile.name}" (${profileId}) on map "${this.currentMapName}"${this.isGuest ? " [GUEST — read-only]" : ""}`);

    // Guests don't broadcast their position or save it, but still see others
    if (!this.isGuest) {
      // 1) Push local position + velocity periodically (delta-only to reduce DB writes)
      this.presenceTimer = setInterval(() => {
        const pos = this.entityLayer.getPlayerPosition();
        const dx = pos.x - this.lastPresenceX;
        const dy = pos.y - this.lastPresenceY;
        // Skip update if player hasn't moved beyond threshold (reduces mutations ~50-90%)
        if (dx * dx + dy * dy < PRESENCE_MOVE_THRESHOLD * PRESENCE_MOVE_THRESHOLD) return;
        this.lastPresenceX = pos.x;
        this.lastPresenceY = pos.y;
        convex
          .mutation(api.presence.update, {
            profileId,
            mapName: this.currentMapName,
            x: pos.x,
            y: pos.y,
            vx: pos.vx,
            vy: pos.vy,
            direction: pos.direction,
            animation: this.entityLayer.isPlayerMoving() ? "walk" : "idle",
            spriteUrl: this.profile.spriteUrl,
            name: this.profile.name,
          })
          .catch((err) => console.warn("Presence update failed:", err));
      }, PRESENCE_INTERVAL_MS);
    }

    // 2) Subscribe to presence of others on this map (guests included — read-only)
    this.presenceUnsub = convex.onUpdate(
      api.presence.listByMap,
      { mapName: this.currentMapName },
      (presenceList) => {
        const mapped: PresenceData[] = presenceList.map((p) => ({
          profileId: p.profileId,
          name: p.name,
          spriteUrl: p.spriteUrl,
          x: p.x,
          y: p.y,
          vx: p.vx ?? 0,
          vy: p.vy ?? 0,
          direction: p.direction,
          animation: p.animation,
          lastSeen: p.lastSeen,
        }));
        this.entityLayer.updatePresence(mapped, profileId);
      },
      (err) => {
        console.warn("Presence subscription error:", err);
      },
    );

    if (!this.isGuest) {
      // 3) Save position to profile periodically (for resume on reload)
      this.saveTimer = setInterval(() => {
        const pos = this.entityLayer.getPlayerPosition();
        convex
          .mutation(api.profiles.savePosition, {
            id: profileId,
            mapName: this.currentMapName,
            x: pos.x,
            y: pos.y,
            direction: pos.direction,
          })
          .catch((err) => console.warn("Position save failed:", err));
      }, SAVE_INTERVAL_MS);

      // 4) Clean up presence on tab close
      window.addEventListener("beforeunload", this.handleUnload);
      window.addEventListener("pagehide", this.handleUnload);
    }
  }

  private handleUnload = () => {
    if (this.isGuest) return;
    const convex = getConvexClient();
    const profileId = this.profile._id as Id<"profiles">;
    // Best-effort: fire-and-forget cleanup
    convex.mutation(api.presence.remove, { profileId }).catch(() => {});
  };

  private stopPresence() {
    if (this.presenceTimer) {
      clearInterval(this.presenceTimer);
      this.presenceTimer = null;
    }
    if (this.saveTimer) {
      clearInterval(this.saveTimer);
      this.saveTimer = null;
    }
    if (this.presenceUnsub) {
      this.presenceUnsub();
      this.presenceUnsub = null;
    }
    window.removeEventListener("beforeunload", this.handleUnload);
    window.removeEventListener("pagehide", this.handleUnload);

    // Remove presence row and release profile (not for guests)
    if (!this.isGuest) {
      const convex = getConvexClient();
      const profileId = this.profile._id as Id<"profiles">;
      convex.mutation(api.presence.remove, { profileId }).catch(() => {});
    }
  }

  // ===========================================================================
  // Placed objects
  // ===========================================================================

  /** Load sprite definitions from Convex (cached for NPC creation) */
  private async loadSpriteDefs() {
    try {
      const convex = getConvexClient();
      const defs = await convex.query(api.spriteDefinitions.list, {});
      this.spriteDefCache = new Map(defs.map((d) => [d.name, d]));
    } catch (err) {
      console.warn("Failed to load sprite definitions:", err);
    }
  }

  private async loadPlacedObjects(mapName: string) {
    try {
      const convex = getConvexClient();

      const defs = await convex.query(api.spriteDefinitions.list, {});
      const objs = await convex.query(api.mapObjects.listByMap, { mapName });

      if (objs.length === 0 || defs.length === 0) return;

      console.log(`Loading ${objs.length} placed objects for map "${mapName}"`);

      const defByName = new Map(defs.map((d) => [d.name, d]));

      // Only load static (non-NPC) objects here.
      // NPCs are managed by the npcState subscription.
      const staticObjs: {
        id: string;
        spriteDefName: string;
        x: number;
        y: number;
        layer: number;
        isOn?: boolean;
      }[] = [];
      const staticDefs: import("./ObjectLayer.ts").SpriteDefInfo[] = [];
      const defsSeen = new Set<string>();

      for (const o of objs) {
        const def = defByName.get(o.spriteDefName);
        if (!def) continue;

        // Skip NPCs — they're handled by npcState subscription
        if (def.category === "npc") continue;

        staticObjs.push({
          id: o._id,
          spriteDefName: o.spriteDefName,
          x: o.x,
          y: o.y,
          layer: o.layer ?? 0,
          isOn: (o as any).isOn,
        });
        if (!defsSeen.has(def.name)) {
          defsSeen.add(def.name);
          staticDefs.push({
            name: def.name,
            spriteSheetUrl: def.spriteSheetUrl,
            defaultAnimation: def.defaultAnimation,
            scale: def.scale,
            frameWidth: def.frameWidth,
            frameHeight: def.frameHeight,
            ambientSoundUrl: def.ambientSoundUrl ?? undefined,
            ambientSoundRadius: def.ambientSoundRadius ?? undefined,
            ambientSoundVolume: def.ambientSoundVolume ?? undefined,
            interactSoundUrl: def.interactSoundUrl ?? undefined,
            toggleable: def.toggleable ?? undefined,
            onAnimation: def.onAnimation ?? undefined,
            offAnimation: def.offAnimation ?? undefined,
            onSoundUrl: def.onSoundUrl ?? undefined,
            isDoor: def.isDoor ?? undefined,
            doorClosedAnimation: def.doorClosedAnimation ?? undefined,
            doorOpeningAnimation: def.doorOpeningAnimation ?? undefined,
            doorOpenAnimation: def.doorOpenAnimation ?? undefined,
            doorClosingAnimation: def.doorClosingAnimation ?? undefined,
            doorOpenSoundUrl: def.doorOpenSoundUrl ?? undefined,
            doorCloseSoundUrl: def.doorCloseSoundUrl ?? undefined,
          });
        }
      }

      if (staticObjs.length > 0) {
        await this.objectLayer.loadAll(staticObjs, staticDefs);
      }
    } catch (err) {
      console.warn("Failed to load placed objects:", err);
    }
  }

  // ===========================================================================
  // Live map-object subscription
  // ===========================================================================

  private subscribeToMapObjects(mapName: string, skipFirst = true) {
    this.mapObjectsUnsub?.();

    const convex = getConvexClient();

    // Subscribe to mapObjects table — fires whenever objects are added/removed/moved
    this.mapObjectsFirstCallback = skipFirst;
    this.mapObjectsDirty = false;
    this.mapObjectsUnsub = convex.onUpdate(
      api.mapObjects.listByMap,
      { mapName },
      (objs) => {
        // Skip the initial callback when we already loaded objects above
        if (this.mapObjectsFirstCallback) {
          this.mapObjectsFirstCallback = false;
          return;
        }
        // Skip if we're already processing (prevent re-entrant loads)
        if (this.mapObjectsLoading) return;
        // In build mode, mark dirty so we re-subscribe when returning to play.
        if (this.mode === "build") {
          this.mapObjectsDirty = true;
          return;
        }
        console.log(`[MapObjects] Subscription fired: ${objs.length} objects`);
        this.reloadPlacedObjects(mapName, objs);
      },
      (err) => {
        console.warn("MapObjects subscription error:", err);
      },
    );
  }

  /**
   * Called by the subscription when placed objects change.
   * Clears current static objects, then re-renders from data.
   * NPCs are NOT handled here — they come from the npcState subscription.
   */
  private async reloadPlacedObjects(
    mapName: string,
    objs: { _id: string; spriteDefName: string; x: number; y: number; layer?: number; isOn?: boolean }[],
  ) {
    this.mapObjectsLoading = true;
    try {
      const convex = getConvexClient();

      // Fetch latest sprite definitions (may have changed too)
      const defs = await convex.query(api.spriteDefinitions.list, {});
      const defByName = new Map(defs.map((d) => [d.name, d]));

      // Update the sprite def cache for NPC rendering
      this.spriteDefCache = new Map(defs.map((d) => [d.name, d]));

      // Clear existing placed static objects only
      this.objectLayer.clear();

      const staticObjs: { id: string; spriteDefName: string; x: number; y: number; layer: number; isOn?: boolean }[] = [];
      const staticDefs: import("./ObjectLayer.ts").SpriteDefInfo[] = [];
      const defsSeen = new Set<string>();

      for (const o of objs) {
        const def = defByName.get(o.spriteDefName);
        if (!def) continue;

        // Skip NPCs — handled by npcState subscription
        if (def.category === "npc") continue;

        staticObjs.push({
          id: o._id, spriteDefName: o.spriteDefName, x: o.x, y: o.y,
          layer: o.layer ?? 0, isOn: (o as any).isOn,
        });
        if (!defsSeen.has(def.name)) {
          defsSeen.add(def.name);
          staticDefs.push({
            name: def.name,
            spriteSheetUrl: def.spriteSheetUrl,
            defaultAnimation: def.defaultAnimation,
            scale: def.scale,
            frameWidth: def.frameWidth,
            frameHeight: def.frameHeight,
            ambientSoundUrl: def.ambientSoundUrl ?? undefined,
            ambientSoundRadius: def.ambientSoundRadius ?? undefined,
            ambientSoundVolume: def.ambientSoundVolume ?? undefined,
            interactSoundUrl: def.interactSoundUrl ?? undefined,
            toggleable: def.toggleable ?? undefined,
            onAnimation: def.onAnimation ?? undefined,
            offAnimation: def.offAnimation ?? undefined,
            onSoundUrl: def.onSoundUrl ?? undefined,
            isDoor: def.isDoor ?? undefined,
            doorClosedAnimation: def.doorClosedAnimation ?? undefined,
            doorOpeningAnimation: def.doorOpeningAnimation ?? undefined,
            doorOpenAnimation: def.doorOpenAnimation ?? undefined,
            doorClosingAnimation: def.doorClosingAnimation ?? undefined,
            doorOpenSoundUrl: def.doorOpenSoundUrl ?? undefined,
            doorCloseSoundUrl: def.doorCloseSoundUrl ?? undefined,
          });
        }
      }

      if (staticObjs.length > 0) {
        // Clear collision overrides before reloading (doors will re-register)
        this.mapRenderer.clearAllCollisionOverrides();
        await this.objectLayer.loadAll(staticObjs, staticDefs);
      }
    } catch (err) {
      console.warn("Failed to reload placed objects:", err);
    }
    this.mapObjectsLoading = false;
  }

  // ===========================================================================
  // World items (pickups placed on the map)
  // ===========================================================================

  /** Map Convex worldItem docs (with _id) to WorldItemInstance (with id) */
  private mapWorldItems(items: any[]) {
    return items.map((i: any) => ({
      id: i._id ?? i.id,
      itemDefName: i.itemDefName,
      x: i.x,
      y: i.y,
      quantity: i.quantity,
      respawn: i.respawn,
      pickedUpAt: i.pickedUpAt,
    }));
  }

  private async loadWorldItems(mapName: string) {
    try {
      const convex = getConvexClient();
      const result = await convex.query(api.worldItems.listByMap, { mapName });
      this.worldItemLayer.clear();
      await this.worldItemLayer.loadAll(this.mapWorldItems(result.items), result.defs);
      console.log(`[WorldItems] Loaded ${result.items.length} items on "${mapName}"`);
    } catch (err) {
      console.warn("Failed to load world items:", err);
    }
  }

  private async loadSemanticInteractables(mapName: string) {
    try {
      this.hideSemanticPrompt();
      const convex = getConvexClient();
      const objects = await convex.query(api.semantics.listObjects, { mapName });
      this.semanticInteractables = (objects ?? [])
        .filter((object: any) => typeof object.x === "number" && typeof object.y === "number")
        .map((object: any) => {
          const parsedMeta =
            typeof object.metadataJson === "string" && object.metadataJson.length > 0
              ? parseJsonObject<SemanticInteractableMeta>(object.metadataJson) ?? {}
              : {};
          const eventBindings = {
            inspect: object.inspectEventType ?? parsedMeta.eventBindings?.inspect,
            interact: object.interactEventType ?? parsedMeta.eventBindings?.interact,
            paid: object.paidEventType ?? parsedMeta.eventBindings?.paid,
          };
          const metadata: SemanticInteractableMeta = {
            ...parsedMeta,
            trigger: object.triggerType ?? parsedMeta.trigger,
            freeActions:
              Array.isArray(object.freeActions) && object.freeActions.length > 0
                ? object.freeActions
                : parsedMeta.freeActions,
            paidActions:
              Array.isArray(object.paidActions) && object.paidActions.length > 0
                ? object.paidActions
                : parsedMeta.paidActions,
            interactionPrompt: object.interactionPrompt ?? parsedMeta.interactionPrompt,
            interactionSummary: object.interactionSummary ?? parsedMeta.interactionSummary,
            premiumOfferKey: object.premiumOfferKey ?? parsedMeta.premiumOfferKey,
            itemDefName: object.itemDefName ?? parsedMeta.itemDefName,
            roomLabel: object.roomLabel ?? parsedMeta.roomLabel,
            eventBindings,
          };
          return {
            objectKey: object.objectKey,
            label: object.label,
            objectType: object.objectType,
            zoneKey: object.zoneKey ?? undefined,
            x: object.x ?? undefined,
            y: object.y ?? undefined,
            metadata,
          } satisfies SemanticInteractable;
        });
    } catch (err) {
      console.warn("Failed to load semantic interactables:", err);
      this.semanticInteractables = [];
    }
  }

  private handleSemanticProximityTriggers() {
    if (
      this.mode !== "play" ||
      this.entityLayer.inDialogue ||
      this.premiumPanelEl ||
      this.premiumVideoOverlayEl ||
      splashManager.isActive()
    ) {
      return;
    }

    const playerTile = this.mapRenderer.worldToTile(
      this.entityLayer.playerX,
      this.entityLayer.playerY,
    );
    const currentKeys = new Set<string>();

    for (const object of this.semanticInteractables) {
      if (object.metadata.trigger !== "proximity") continue;
      const tile = object.metadata.tile;
      if (!tile) continue;
      if (tile.x !== playerTile.tileX || tile.y !== playerTile.tileY) continue;
      currentKeys.add(object.objectKey);
      if (
        !this.activeProximityObjectKeys.has(object.objectKey) &&
        this.canOpenSemanticProximityTrigger(object)
      ) {
        void this.openSemanticProximityTrigger(object);
      }
    }

    this.activeProximityObjectKeys = currentKeys;
  }

  private proximityTriggerStateKey(object: SemanticInteractable) {
    return `${String(this.profile._id ?? this.profile.name)}:${this.currentMapName}:${object.objectKey}`;
  }

  private canOpenSemanticProximityTrigger(object: SemanticInteractable) {
    const state = this.proximityTriggerState.get(this.proximityTriggerStateKey(object));
    if (!state) return true;
    if (object.metadata.oncePerSession) return false;
    const cooldownMs =
      typeof object.metadata.proximityCooldownMs === "number"
        ? object.metadata.proximityCooldownMs
        : object.objectKey === RETRO_CAPTCHA_RUG_OBJECT_KEY
          ? 45_000
          : 0;
    return cooldownMs <= 0 || Date.now() - state.lastTriggeredAt >= cooldownMs;
  }

  private noteSemanticProximityTriggerOpened(object: SemanticInteractable) {
    const key = this.proximityTriggerStateKey(object);
    const current = this.proximityTriggerState.get(key);
    this.proximityTriggerState.set(key, {
      lastTriggeredAt: Date.now(),
      lastResolvedAt: current?.lastResolvedAt,
      triggeredCount: (current?.triggeredCount ?? 0) + 1,
    });
  }

  private noteSemanticProximityTriggerResolved(object: SemanticInteractable) {
    const key = this.proximityTriggerStateKey(object);
    const current = this.proximityTriggerState.get(key);
    if (!current) return;
    this.proximityTriggerState.set(key, {
      ...current,
      lastResolvedAt: Date.now(),
    });
  }

  private async openSemanticProximityTrigger(object: SemanticInteractable) {
    this.noteSemanticProximityTriggerOpened(object);

    if (object.objectKey !== RETRO_CAPTCHA_RUG_OBJECT_KEY) {
      const summary =
        object.metadata.interactionSummary ||
        `${this.profile.name} stepped into ${object.label}.`;
      await this.appendSemanticWorldEvent(
        object,
        object.metadata.eventBindings?.inspect || "proximity-triggered",
        summary,
        { trigger: "proximity" },
      );
      return;
    }

    const variant = pickRetroCaptchaVariant();
    const summary =
      `${this.profile.name} stepped onto the Cozy Cabin rug and triggered a fake Quantum Time Crystal anti-bot popup.`;

    await this.appendSemanticWorldEvent(
      object,
      object.metadata.eventBindings?.inspect || "captcha-rug-triggered",
      summary,
      {
        trigger: "proximity",
        popupType: "retro-shareware-captcha",
        titleBar: variant.titleBar,
        ctaLabel: variant.ctaLabel,
        visualStyle: variant.visualStyle.label,
      },
    );
    await this.rememberSemanticDiscovery(object, summary);

    splashManager.push({
      id: `retro-captcha-${Date.now()}`,
      transparent: true,
      pausesGame: true,
      create: (callbacks) =>
        createRetroCaptchaSplash({
          ...callbacks,
          variant,
          zoneLabel: object.zoneKey ?? object.metadata.roomLabel ?? "Cozy Cabin",
          onResolve: (answer) => {
            void this.onRetroCaptchaResolved(object, variant, answer);
          },
        }),
    });
  }

  private async onRetroCaptchaResolved(
    object: SemanticInteractable,
    variant: RetroCaptchaVariant,
    answer: RetroCaptchaAnswer,
  ) {
    this.noteSemanticProximityTriggerResolved(object);
    const eventType =
      answer === "dismissed" ? "captcha-rug-dismissed" : "captcha-rug-answered";
    let summary = `${this.profile.name} dismissed the fake anti-bot popup at ${object.label}.`;
    if (answer === "rug") {
      summary =
        `${this.profile.name} correctly identified the Cozy Cabin rug during a fake Quantum Time Crystal verification.`;
    } else if (answer === "not-rug") {
      summary =
        `${this.profile.name} insisted the Cozy Cabin rug was not a rug during the retro shareware popup.`;
    }

    await this.appendSemanticWorldEvent(object, eventType, summary, {
      answer,
      popupType: "retro-shareware-captcha",
      titleBar: variant.titleBar,
      ctaLabel: variant.ctaLabel,
      visualStyle: variant.visualStyle.label,
    });

    if (answer !== "dismissed") {
      await this.rememberSemanticDiscovery(object, summary);
    }

    this.showSemanticNotification(summary);
  }

  private subscribeToWorldItems(mapName: string) {
    this.worldItemsUnsub?.();
    const convex = getConvexClient();
    let firstFire = true;
    this.worldItemsUnsub = convex.onUpdate(
      api.worldItems.listByMap,
      { mapName },
      async (result: any) => {
        if (firstFire) { firstFire = false; return; }
        // In build mode, preserve the editor's unsaved draft state.
        if (this.mode === "build") return;
        console.log(`[WorldItems] Subscription fired: ${result.items.length} items`);
        this.worldItemLayer.clear();
        await this.worldItemLayer.loadAll(this.mapWorldItems(result.items), result.defs);
      },
      (err: any) => {
        console.warn("WorldItems subscription error:", err);
      },
    );
  }

  // ===========================================================================
  // Toggleable object interaction
  // ===========================================================================

  private toggling = false;
  private async handleObjectToggle() {
    if (this.toggling) return;
    const nearestId = this.objectLayer.getNearestToggleableId();
    if (!nearestId) return;
    const ePressed = this.input.wasJustPressed("e") || this.input.wasJustPressed("E");
    if (!ePressed) return;
    if (this.entityLayer.inDialogue) return;

    this.toggling = true;
    try {
      const convex = getConvexClient();
      const result = await convex.mutation(api.mapObjects.toggle, {
        id: nearestId as any,
      });
      if (result.success && typeof result.isOn === "boolean") {
        // Optimistically update the visual
        this.objectLayer.applyToggle(nearestId, result.isOn);
      }
    } catch (err) {
      console.warn("Toggle failed:", err);
    }
    this.toggling = false;
  }

  private pickingUp = false;
  private async handleItemPickup() {
    if (this.pickingUp) return;
    const nearestId = this.worldItemLayer.getNearestItemId();
    if (!nearestId) return;
    if (!(this.input.wasJustPressed("e") || this.input.wasJustPressed("E"))) return;

    // Don't pick up if in dialogue
    if (this.entityLayer.inDialogue) return;

    this.pickingUp = true;
    try {
      const convex = getConvexClient();
      const result = await convex.mutation(api.worldItems.pickup, {
        profileId: this.profile._id as any,
        worldItemId: nearestId as any,
      });
      if (result.success && result.itemName && typeof result.quantity === "number") {
        const name = this.worldItemLayer.getNearestItemName() ?? result.itemName;
        console.log(`[Pickup] Got ${result.quantity}x ${name}`);
        const pickupSfx =
          this.worldItemLayer.getNearestItemPickupSoundUrl() ||
          result.pickupSoundUrl ||
          DEFAULT_ITEM_PICKUP_SFX;
        this.audio.playOneShot(pickupSfx, 0.7);
        // Show a brief pickup notification
        this.showPickupNotification(`+${result.quantity} ${name}`);
        // Optimistically update: fade if respawning, remove if not
        this.worldItemLayer.markPickedUp(nearestId, !!result.respawns);
        // Update the local profile inventory so CharacterPanel reflects the change
        const existing = this.profile.items.find((i) => i.name === result.itemName);
        if (existing) {
          existing.quantity += result.quantity;
        } else {
          this.profile.items.push({ name: result.itemName, quantity: result.quantity });
        }
      } else {
        console.log(`[Pickup] Failed: ${result.reason}`);
      }
    } catch (err) {
      console.warn("Pickup failed:", err);
    }
    this.pickingUp = false;
  }

  private handleSemanticInteraction() {
    if (this.premiumPanelEl || this.premiumVideoOverlayEl) {
      this.hideSemanticPrompt();
      return;
    }
    if (this.entityLayer.inDialogue || this.entityLayer.hasNearbyNpc()) {
      this.hideSemanticPrompt();
      return;
    }
    if (this.objectLayer.getNearestToggleableId()) {
      this.hideSemanticPrompt();
      return;
    }
    if (this.worldItemLayer.getNearestItemId()) {
      this.hideSemanticPrompt();
      return;
    }

    let nearest: SemanticInteractable | null = null;
    let nearestDist = 72;

    for (const object of this.semanticInteractables) {
      if (object.metadata.trigger !== "interact") continue;
      if (typeof object.x !== "number" || typeof object.y !== "number") continue;
      if (object.metadata.itemDefName) continue;

      const dx = object.x - this.entityLayer.playerX;
      const dy = object.y - this.entityLayer.playerY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < nearestDist) {
        nearest = object;
        nearestDist = dist;
      }
    }

    if (!nearest) {
      this.hideSemanticPrompt();
      return;
    }

    const freePrompt =
      nearest.metadata.interactionPrompt ||
      nearest.metadata.freeActions?.[1] ||
      nearest.metadata.freeActions?.[0] ||
      `Use ${nearest.label}`;
    const premiumPrompt = nearest.metadata.paidActions?.[0];
    this.showSemanticPrompt(
      premiumPrompt && nearest.metadata.premiumOfferKey
        ? `[E] ${freePrompt}   [X] ${premiumPrompt}`
        : `[E] ${freePrompt}`,
    );

    if (
      nearest.metadata.premiumOfferKey &&
      nearest.metadata.paidActions?.length &&
      (this.input.wasJustPressed("x") || this.input.wasJustPressed("X"))
    ) {
      void this.openPremiumInteractable(nearest);
      return;
    }

    if (!(this.input.wasJustPressed("e") || this.input.wasJustPressed("E"))) {
      return;
    }

    const eventType = nearest.metadata.eventBindings?.interact || "interact";
    const summary =
      nearest.metadata.interactionSummary ||
      `${this.profile.name} interacted with ${nearest.label}.`;

    void this.appendSemanticWorldEvent(nearest, eventType, summary);
    void this.rememberSemanticDiscovery(nearest, summary);
    this.showSemanticNotification(summary);
  }

  private async openPremiumInteractable(object: SemanticInteractable) {
    if (this.premiumInteractionPending) return;

    const offerKey = object.metadata.premiumOfferKey;
    if (!offerKey) {
      this.showSemanticNotification("No premium offer is configured for this interaction.");
      return;
    }

    try {
      const convex = getConvexClient();
      const offer = await convex.query((api as any)["integrations/x402"].getOffer, {
        offerKey,
      }) as PremiumOfferRecord | null;

      if (!offer || offer.status !== "active" || !offer.endpointPath) {
        this.showSemanticNotification("This premium interaction is not active yet.");
        return;
      }

      this.showPremiumInteractionPanel(object, offer);
    } catch (error) {
      console.warn("Premium interactable lookup failed:", error);
      this.showSemanticNotification("Premium interaction lookup failed.");
    }
  }

  private async appendSemanticWorldEvent(
    object: SemanticInteractable,
    eventType: string,
    summary: string,
    payload?: Record<string, unknown>,
  ) {
    try {
      const convex = getConvexClient();
      await convex.mutation(api.worldState.appendEvent, {
        mapName: this.currentMapName,
        worldId: this.currentMapName,
        sourceType: "interactable",
        sourceId: object.objectKey,
        eventType,
        actorId: this.profile.name,
        objectKey: object.objectKey,
        zoneKey: object.zoneKey,
        tileX: object.metadata.tile?.x,
        tileY: object.metadata.tile?.y,
        summary,
        payloadJson: JSON.stringify({
          label: object.label,
          objectType: object.objectType,
          freeActions: object.metadata.freeActions ?? [],
          premiumOfferKey: object.metadata.premiumOfferKey,
          ...(payload ?? {}),
        }),
      });
    } catch (err) {
      console.warn("Semantic interaction event failed:", err);
    }
  }

  private knowledgeSubjectId() {
    return String(this.profile._id ?? this.profile.name);
  }

  private semanticDiscoveryValue(
    object: SemanticInteractable,
    summary: string,
    extra?: Record<string, unknown>,
  ) {
    return JSON.stringify({
      label: object.label,
      objectType: object.objectType,
      zoneKey: object.zoneKey ?? null,
      roomLabel: object.metadata.roomLabel ?? null,
      freeActions: object.metadata.freeActions ?? [],
      paidActions: object.metadata.paidActions ?? [],
      interactionPrompt: object.metadata.interactionPrompt ?? null,
      premiumOfferKey: object.metadata.premiumOfferKey ?? null,
      latestSummary: summary,
      ...(extra ?? {}),
    });
  }

  private async rememberSemanticDiscovery(object: SemanticInteractable, summary: string) {
    try {
      const convex = getConvexClient();
      const factKey = `knowledge:${object.objectKey}`;
      const valueJson = this.semanticDiscoveryValue(object, summary);

      await Promise.all([
        convex.mutation(api.worldState.recordDiscovery, {
          mapName: this.currentMapName,
          factKey,
          factType: "knowledge",
          scope: "world",
          source: "semantic-interaction",
          objectKey: object.objectKey,
          zoneKey: object.zoneKey,
          summary,
          valueJson,
        }),
        convex.mutation(api.worldState.recordDiscovery, {
          mapName: this.currentMapName,
          factKey,
          factType: "knowledge",
          scope: "player",
          subjectId: this.knowledgeSubjectId(),
          source: "semantic-interaction",
          objectKey: object.objectKey,
          zoneKey: object.zoneKey,
          summary,
          valueJson,
        }),
      ]);
    } catch (error) {
      console.warn("Failed to record semantic discovery:", error);
    }
  }

  private async rememberPremiumDiscovery(
    object: SemanticInteractable,
    offerKey: string,
    summary: string,
    result: Record<string, unknown>,
  ) {
    try {
      const convex = getConvexClient();
      const factKey = `access:${object.objectKey}:premium`;
      const valueJson = this.semanticDiscoveryValue(object, summary, {
        offerKey,
        delivery: "premium",
        result,
      });

      await Promise.all([
        convex.mutation(api.worldState.recordDiscovery, {
          mapName: this.currentMapName,
          factKey,
          factType: "access",
          scope: "world",
          source: "premium-interactable",
          objectKey: object.objectKey,
          zoneKey: object.zoneKey,
          summary,
          valueJson,
        }),
        convex.mutation(api.worldState.recordDiscovery, {
          mapName: this.currentMapName,
          factKey,
          factType: "access",
          scope: "player",
          subjectId: this.knowledgeSubjectId(),
          source: "premium-interactable",
          objectKey: object.objectKey,
          zoneKey: object.zoneKey,
          summary,
          valueJson,
        }),
      ]);
    } catch (error) {
      console.warn("Failed to record premium discovery:", error);
    }
  }

  private showPremiumInteractionPanel(object: SemanticInteractable, offer: PremiumOfferRecord) {
    this.closePremiumInteractionPanel();

    const overlay = document.createElement("div");
    overlay.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(6,10,16,0.64);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10010;
      padding: 20px;
    `;

    const card = document.createElement("div");
    card.style.cssText = `
      width: min(480px, calc(100vw - 32px));
      background: linear-gradient(180deg, rgba(18,24,34,0.98), rgba(10,14,22,0.98));
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 18px;
      box-shadow: 0 24px 60px rgba(0,0,0,0.36);
      color: #f4f1de;
      padding: 18px;
      font-family: Inter, sans-serif;
    `;

    const eyebrow = document.createElement("div");
    eyebrow.textContent = object.zoneKey ? `${object.zoneKey} premium interaction` : "Premium interaction";
    eyebrow.style.cssText = `
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: rgba(244,225,160,0.72);
      margin-bottom: 8px;
    `;

    const title = document.createElement("div");
    title.textContent = `${object.label} • ${offer.title}`;
    title.style.cssText = `
      font-size: 20px;
      font-weight: 700;
      margin-bottom: 8px;
      color: #fff5d6;
    `;

    const description = document.createElement("div");
    description.textContent = offer.description;
    description.style.cssText = `
      font-size: 14px;
      line-height: 1.5;
      color: rgba(255,255,255,0.78);
      margin-bottom: 12px;
    `;

    const actionLabel = object.metadata.paidActions?.[0] ?? "Unlock premium";
    const details = document.createElement("div");
    details.textContent = `${actionLabel} • ${formatOfferPrice(offer)} • ${resolveOfferNetwork(offer.network)}`;
    details.style.cssText = `
      font-size: 13px;
      color: #f7e2a5;
      margin-bottom: 12px;
    `;

    const status = document.createElement("div");
    status.textContent = "Ready to request payment.";
    status.style.cssText = `
      font-size: 13px;
      color: rgba(255,255,255,0.7);
      margin-bottom: 10px;
    `;

    const body = document.createElement("div");
    body.textContent = "Payment is part of this world interaction. Approve the wallet request only if you want the premium unlock.";
    body.style.cssText = `
      font-size: 14px;
      line-height: 1.55;
      white-space: pre-wrap;
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 12px;
      padding: 12px;
      min-height: 100px;
      color: rgba(255,255,255,0.86);
    `;

    const buttonRow = document.createElement("div");
    buttonRow.style.cssText = `
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      margin-top: 14px;
    `;

    const cancelBtn = document.createElement("button");
    cancelBtn.textContent = "Close";
    cancelBtn.style.cssText = `
      border: 1px solid rgba(255,255,255,0.16);
      background: rgba(255,255,255,0.04);
      color: #f4f1de;
      border-radius: 999px;
      padding: 8px 14px;
      font: inherit;
      cursor: pointer;
    `;
    cancelBtn.addEventListener("click", () => this.closePremiumInteractionPanel());

    const confirmBtn = document.createElement("button");
    confirmBtn.textContent = actionLabel;
    confirmBtn.style.cssText = `
      border: 1px solid rgba(248,202,88,0.48);
      background: linear-gradient(180deg, #c48e22, #9f6a0f);
      color: #1a1103;
      border-radius: 999px;
      padding: 8px 14px;
      font: inherit;
      font-weight: 700;
      cursor: pointer;
    `;
    confirmBtn.addEventListener("click", () => {
      void this.runPremiumInteractableFlow(object, offer, {
        status,
        body,
        confirmBtn,
        cancelBtn,
      });
    });

    buttonRow.append(cancelBtn, confirmBtn);
    card.append(eyebrow, title, description, details, status, body, buttonRow);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    this.premiumPanelEl = overlay;
  }

  private closePremiumInteractionPanel() {
    this.premiumPanelEl?.remove();
    this.premiumPanelEl = null;
    this.premiumInteractionPending = false;
  }

  private resolvePremiumVideoPayload(
    object: SemanticInteractable,
    offerMeta: PremiumOfferMeta,
    result: Record<string, unknown>,
  ): PremiumVideoPayload | null {
    const videoUrl =
      (typeof result.videoUrl === "string" && result.videoUrl) ||
      offerMeta.videoUrl ||
      object.metadata.videoUrl ||
      null;
    if (!videoUrl) return null;

    const explicitProvider =
      (typeof result.videoProvider === "string" && result.videoProvider) ||
      offerMeta.videoProvider ||
      object.metadata.videoProvider ||
      "";
    const videoProvider =
      explicitProvider === "video" || (!getYouTubeVideoId(videoUrl) && explicitProvider !== "youtube")
        ? "video"
        : "youtube";

    return {
      videoUrl,
      videoProvider,
      title:
        (typeof result.videoTitle === "string" && result.videoTitle) ||
        offerMeta.videoTitle ||
        object.metadata.videoTitle ||
        (object.objectKey === DUAL_STACKING_VIDEO_OBJECT_KEY ? "Dual Stacking on Bitcoin" : object.label),
      summary:
        (typeof result.summary === "string" && result.summary) ||
        object.metadata.interactionSummary ||
        `${object.label} is now playing.`,
      sourceLabel: videoProvider === "youtube" ? "YouTube" : "Video archive",
      pauseWorldMusic:
        typeof result.pauseWorldMusic === "boolean"
          ? result.pauseWorldMusic
          : (offerMeta.pauseWorldMusic ?? object.metadata.pauseWorldMusic ?? true),
    };
  }

  private closePremiumVideoOverlay(resumeMusic = true) {
    const overlay = this.premiumVideoOverlayEl;
    if (!overlay) return;

    const media = overlay.querySelector("iframe, video") as HTMLIFrameElement | HTMLVideoElement | null;
    if (media instanceof HTMLIFrameElement) {
      media.src = "about:blank";
    } else if (media instanceof HTMLVideoElement) {
      media.pause();
      media.src = "";
    }

    overlay.remove();
    this.premiumVideoOverlayEl = null;

    const snapshot = this.premiumVideoMusicSnapshot;
    this.premiumVideoMusicSnapshot = null;
    if (resumeMusic && snapshot) {
      void this.audio.restorePlaybackSnapshot(snapshot);
    }
  }

  private openPremiumVideoOverlay(payload: PremiumVideoPayload) {
    this.closePremiumVideoOverlay(false);

    if (payload.pauseWorldMusic) {
      this.premiumVideoMusicSnapshot = this.audio.capturePlaybackSnapshot();
      this.audio.pause();
    } else {
      this.premiumVideoMusicSnapshot = null;
    }

    const overlay = document.createElement("div");
    overlay.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(5, 8, 12, 0.82);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10020;
      padding: 20px;
      backdrop-filter: blur(2px);
    `;

    const card = document.createElement("div");
    card.style.cssText = `
      width: min(960px, calc(100vw - 32px));
      max-height: calc(100vh - 40px);
      background: linear-gradient(180deg, rgba(13, 18, 26, 0.98), rgba(8, 12, 18, 0.98));
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 20px;
      box-shadow: 0 28px 80px rgba(0,0,0,0.48);
      color: #f4f1de;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    `;

    const header = document.createElement("div");
    header.style.cssText = `
      padding: 16px 18px 12px;
      border-bottom: 1px solid rgba(255,255,255,0.08);
    `;

    const eyebrow = document.createElement("div");
    eyebrow.textContent = "Premium lesson unlocked";
    eyebrow.style.cssText = `
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.14em;
      color: rgba(247,226,165,0.75);
      margin-bottom: 6px;
    `;

    const title = document.createElement("div");
    title.textContent = payload.title;
    title.style.cssText = `
      font-size: 24px;
      font-weight: 700;
      color: #fff5d6;
      margin-bottom: 6px;
    `;

    const summary = document.createElement("div");
    summary.textContent = payload.summary;
    summary.style.cssText = `
      font-size: 14px;
      line-height: 1.5;
      color: rgba(255,255,255,0.76);
    `;

    header.append(eyebrow, title, summary);

    const mediaWrap = document.createElement("div");
    mediaWrap.style.cssText = `
      position: relative;
      aspect-ratio: 16 / 9;
      background: #000;
    `;

    if (payload.videoProvider === "youtube") {
      const embedUrl = buildYouTubeEmbedUrl(payload.videoUrl);
      if (embedUrl) {
        const iframe = document.createElement("iframe");
        iframe.src = embedUrl;
        iframe.title = payload.title;
        iframe.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
        iframe.referrerPolicy = "strict-origin-when-cross-origin";
        iframe.style.cssText = "width:100%;height:100%;border:0;display:block;";
        mediaWrap.appendChild(iframe);
      }
    } else {
      const video = document.createElement("video");
      video.src = payload.videoUrl;
      video.controls = true;
      video.autoplay = true;
      video.playsInline = true;
      video.style.cssText = "width:100%;height:100%;display:block;background:#000;";
      mediaWrap.appendChild(video);
    }

    const footer = document.createElement("div");
    footer.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 14px 18px 18px;
      border-top: 1px solid rgba(255,255,255,0.08);
      flex-wrap: wrap;
    `;

    const note = document.createElement("div");
    note.textContent = `${payload.sourceLabel} • Cozy Cabin music paused while this lesson is open.`;
    note.style.cssText = `
      font-size: 12px;
      color: rgba(255,255,255,0.62);
    `;

    const closeBtn = document.createElement("button");
    closeBtn.textContent = "Close lesson";
    closeBtn.style.cssText = `
      border: 1px solid rgba(255,255,255,0.16);
      background: rgba(255,255,255,0.06);
      color: #f4f1de;
      border-radius: 999px;
      padding: 10px 16px;
      font: inherit;
      font-weight: 700;
      cursor: pointer;
    `;
    closeBtn.addEventListener("click", () => this.closePremiumVideoOverlay(true));

    footer.append(note, closeBtn);
    card.append(header, mediaWrap, footer);
    overlay.appendChild(card);
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        this.closePremiumVideoOverlay(true);
      }
    });
    document.body.appendChild(overlay);
    this.premiumVideoOverlayEl = overlay;
  }

  private async runPremiumInteractableFlow(
    object: SemanticInteractable,
    offer: PremiumOfferRecord,
    controls: {
      status: HTMLDivElement;
      body: HTMLDivElement;
      confirmBtn: HTMLButtonElement;
      cancelBtn: HTMLButtonElement;
    },
  ) {
    if (this.premiumInteractionPending) return;
    this.premiumInteractionPending = true;

    controls.confirmBtn.disabled = true;
    controls.cancelBtn.disabled = true;
    controls.status.textContent = "Waiting for x402 challenge and wallet approval…";
    controls.body.textContent =
      "The game is requesting the premium payment flow from the mapped offer. If your wallet opens, approve the transaction to continue.";

    const offerMeta = parseJsonObject<PremiumOfferMeta>(offer.metadataJson) ?? {};
    const network = resolveOfferNetwork(offer.network);

    try {
      const result = await x402Fetch<Record<string, unknown>>(
        resolveX402Url(offer.endpointPath || ""),
        network,
      );

      const successEventType =
        object.metadata.eventBindings?.paid ||
        offerMeta.unlockEventType ||
        "premium-unlocked";
      const successSummary =
        typeof result.summary === "string" && result.summary.trim().length > 0
          ? result.summary
          : `${this.profile.name} unlocked premium content from ${object.label}.`;

      await this.appendSemanticWorldEvent(object, successEventType, successSummary, {
        offerKey: offer.offerKey,
        delivery: offerMeta.delivery,
        agentId: offer.agentId,
        result,
      });
      await this.rememberPremiumDiscovery(object, offer.offerKey, successSummary, result);

      if (offerMeta.unlockFactKey) {
        const convex = getConvexClient();
        await convex.mutation(api.worldState.upsertFact, {
          mapName: this.currentMapName,
          factKey: offerMeta.unlockFactKey,
          factType: "access",
          valueJson: JSON.stringify({
            offerKey: offer.offerKey,
            objectKey: object.objectKey,
            unlockedAt: Date.now(),
            result,
          }),
          scope: "player",
          subjectId: this.profile.name,
          source: "premium-interactable",
        });
      }

      this.showSemanticNotification(successSummary);

      const premiumVideoPayload = this.resolvePremiumVideoPayload(object, offerMeta, result);
      if (premiumVideoPayload) {
        controls.status.textContent = "Premium unlock complete. Opening lesson…";
        this.closePremiumInteractionPanel();
        this.openPremiumVideoOverlay(premiumVideoPayload);
        return;
      }

      controls.status.textContent = "Premium unlock complete.";
      controls.body.textContent = this.formatPremiumInteractionResult(result);
      controls.confirmBtn.style.display = "none";
      controls.cancelBtn.disabled = false;
    } catch (error) {
      console.warn("Premium interactable flow failed:", error);
      controls.status.textContent = "Premium unlock failed.";
      controls.body.textContent =
        error instanceof X402RequestError
          ? `HTTP ${error.status}\n${typeof error.details === "string" ? error.details : JSON.stringify(error.details, null, 2)}`
          : getErrorMessage(error);
      controls.confirmBtn.disabled = false;
      controls.cancelBtn.disabled = false;
      controls.confirmBtn.textContent = "Try again";
    } finally {
      this.premiumInteractionPending = false;
    }
  }

  private formatPremiumInteractionResult(result: Record<string, unknown>) {
    const lines: string[] = [];

    if (typeof result.title === "string") lines.push(result.title);
    if (typeof result.summary === "string") lines.push(result.summary);

    if (Array.isArray(result.sections)) {
      for (const section of result.sections) {
        if (!section || typeof section !== "object") continue;
        const heading =
          typeof (section as { heading?: unknown }).heading === "string"
            ? (section as { heading: string }).heading
            : null;
        const body =
          typeof (section as { body?: unknown }).body === "string"
            ? (section as { body: string }).body
            : null;
        if (heading) lines.push(`${heading}\n${body ?? ""}`.trim());
      }
    }

    const grantAccessTxid =
      typeof result.grantAccessTxid === "string" ? result.grantAccessTxid : null;
    if (grantAccessTxid) {
      lines.push(`Grant access tx: ${grantAccessTxid}`);
    }

    if (lines.length === 0) {
      lines.push("Premium content delivered.");
    }

    return lines.join("\n\n");
  }

  /** Show a brief floating text notification for item pickup */
  private showPickupNotification(text: string) {
    const div = document.createElement("div");
    div.textContent = text;
    div.style.cssText = `
      position: fixed;
      top: 80px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0,0,0,0.8);
      color: #44ff88;
      padding: 8px 16px;
      border-radius: 8px;
      font-size: 14px;
      font-family: Inter, sans-serif;
      font-weight: 600;
      z-index: 9999;
      pointer-events: none;
      animation: pickupFadeUp 1.5s ease-out forwards;
    `;
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 1600);
  }

  private showSemanticNotification(text: string) {
    const div = document.createElement("div");
    div.textContent = text;
    div.style.cssText = `
      position: fixed;
      top: 92px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(10,16,24,0.88);
      color: #f7e2a5;
      padding: 12px 18px;
      border-radius: 12px;
      font-size: 16px;
      line-height: 1.45;
      max-width: min(520px, calc(100vw - 32px));
      text-align: center;
      white-space: pre-wrap;
      font-family: Inter, sans-serif;
      font-weight: 600;
      z-index: 9999;
      pointer-events: none;
      animation: pickupFadeUp 1.5s ease-out forwards;
    `;
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 2200);
  }

  private showSemanticPrompt(text: string) {
    if (!this.semanticPromptEl) {
      this.semanticPromptEl = document.createElement("div");
      this.semanticPromptEl.style.cssText = `
        position: fixed;
        left: 50%;
        bottom: 84px;
        transform: translateX(-50%);
        background: rgba(8,12,18,0.86);
        color: #f4f1de;
        border: 1px solid rgba(255,255,255,0.14);
        border-radius: 999px;
        padding: 9px 16px;
        font-size: 14px;
        font-family: Inter, sans-serif;
        font-weight: 600;
        z-index: 9998;
        pointer-events: none;
        box-shadow: 0 8px 22px rgba(0,0,0,0.28);
      `;
      document.body.appendChild(this.semanticPromptEl);
    }
    this.semanticPromptEl.textContent = text;
    this.semanticPromptEl.style.display = "block";
  }

  private hideSemanticPrompt() {
    if (this.semanticPromptEl) {
      this.semanticPromptEl.style.display = "none";
    }
  }

  // ===========================================================================
  // Server-authoritative NPC state subscription
  // ===========================================================================

  private subscribeToNpcState(mapName: string) {
    this.npcStateUnsub?.();

    const convex = getConvexClient();

    this.npcStateUnsub = convex.onUpdate(
      api.npcEngine.listByMap,
      { mapName },
      (states) => {
        // Pass server NPC states + sprite defs to EntityLayer
        this.entityLayer.updateNpcStates(
          states.map((s) => ({
            _id: s._id,
            mapObjectId: s.mapObjectId as string,
            spriteDefName: s.spriteDefName,
            instanceName: s.instanceName ?? undefined,
            npcProfile: (s as any).npcProfile ?? null,
            currentIntent: (s as any).currentIntent ?? undefined,
            intentDetail: (s as any).intentDetail ?? undefined,
            mood: (s as any).mood ?? undefined,
            x: s.x,
            y: s.y,
            vx: s.vx,
            vy: s.vy,
            direction: s.direction,
            speed: s.speed,
            wanderRadius: s.wanderRadius,
          })),
          this.spriteDefCache,
        );
      },
      (err) => {
        console.warn("NPC state subscription error:", err);
      },
    );
  }

  private subscribeToAgentChatter(mapName: string) {
    this.agentChatterUnsub?.();

    const convex = getConvexClient();

    this.agentChatterUnsub = convex.onUpdate(
      api.worldState.listEvents,
      { mapName, limit: 24 },
      (rows) => {
        const cutoff = Date.now() - 5 * 60_000;
        const chatter = (rows as AgentChatterEvent[])
          .filter((row) => row.eventType.startsWith("agent-thought:") && row.timestamp >= cutoff)
          .reverse()
          .slice(-4)
          .map((row) => {
            const details = parseJsonObject<AgentChatterDetails>(row.detailsJson) ?? {};
            return {
              id: String(row._id),
              speaker: details.displayName ?? row.actorId ?? "Agent",
              summary: row.summary,
              replyToDisplayName: details.replyToDisplayName ?? null,
            };
          });

        this.entityLayer.applyAgentChatter(chatter);
      },
      (err) => {
        console.warn("Agent chatter subscription error:", err);
      },
    );
  }

  async loadMap(mapData: MapData) {
    if (this.mapRenderer) {
      await this.mapRenderer.loadMap(mapData);
    }
  }

  destroy() {
    this.stopPresence();
    this.mapObjectsUnsub?.();
    this.mapObjectsUnsub = null;
    this.worldItemsUnsub?.();
    this.worldItemsUnsub = null;
    this.npcStateUnsub?.();
    this.npcStateUnsub = null;
    this.agentChatterUnsub?.();
    this.agentChatterUnsub = null;
    if (this.unlockHandler) {
      document.removeEventListener("click", this.unlockHandler);
      document.removeEventListener("keydown", this.unlockHandler);
    }
    this.premiumPanelEl?.remove();
    this.premiumPanelEl = null;
    this.closePremiumVideoOverlay(false);
    this.semanticPromptEl?.remove();
    this.semanticPromptEl = null;
    this.audio.destroy();
    this.resizeObserver?.disconnect();
    this.input.destroy();
    this.app.destroy(true);
  }
}
