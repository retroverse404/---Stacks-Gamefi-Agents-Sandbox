import {
  Container,
  Graphics,
  Text,
  TextStyle,
  AnimatedSprite,
  Spritesheet,
} from "pixi.js";
import { loadSpriteSheet } from "./SpriteLoader.ts";
import type { Game } from "./Game.ts";
import type { InputManager } from "./InputManager.ts";
import type { PresenceData, Direction } from "./types.ts";
import { NPC } from "./NPC.ts";
import type { NPCConfig, DialogueLine } from "./NPC.ts";
import { splashManager } from "../splash/SplashManager.ts";
import { createDialogueSplash } from "../splash/screens/DialogueSplash.ts";
import type { DialogueNode } from "../splash/screens/DialogueSplash.ts";
import { createGuideNpcSplash } from "../splash/screens/GuideNpcSplash.ts";
import { createMarketNpcSplash } from "../splash/screens/MarketNpcSplash.ts";
import { createQuestsNpcSplash } from "../splash/screens/QuestsNpcSplash.ts";
import { createMelNpcSplash } from "../splash/screens/MelNpcSplash.ts";
import { getConvexClient } from "../lib/convexClient.ts";
import { api } from "../../convex/_generated/api";

const MOVE_SPEED = 120; // pixels per second
const SPRINT_MULTIPLIER = 1.5; // hold Shift to move faster
const ANIM_SPEED = 0.12; // frames per tick (PixiJS AnimatedSprite)
const NPC_INTERACT_RADIUS = 64; // pixels
const CHARACTER_COLLISION_RADIUS = 18; // keep bodies from ghosting through each other
const MAX_AGENT_CHATTER_CHARS = 160;
// ---------------------------------------------------------------------------
// Remote player interpolation
// ---------------------------------------------------------------------------
// Instead of extrapolating into the future (which amplifies velocity noise),
// we buffer the last few server snapshots and render in the *recent past*,
// smoothly lerping between two known positions.  This gives perfectly smooth
// movement at the cost of INTERP_DELAY_MS of visual latency — imperceptible
// in a co-op world.
const INTERP_DELAY_MS = 300;       // render this far behind "now"
const INTERP_MAX_SNAPSHOTS = 6;    // keep a small ring buffer per player
const REMOTE_SNAP_DISTANCE_PX = 96; // snap if correction is enormous (teleport)

/** A position snapshot received from the server */
interface RemoteSnapshot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  direction: string;
  animation: string;
  time: number; // performance.now() when we received it
}

// Player collision box (relative to anchor at bottom-center of sprite).
// The original checks two points per direction to form a thin bounding box
// around the character's feet.
const COL_HALF_W = 5;  // slightly narrower to reduce snagging on tight corners
const COL_TOP = -10;   // keep collision focused on the player's feet
const COL_BOT = 0;     // bottom of collision box (at feet)

type CharacterCollider = {
  x: number;
  y: number;
};

type AgentChatterEntry = {
  id: string;
  speaker: string;
  summary: string;
  replyToDisplayName?: string | null;
};

/** Maps our Direction to the villager sprite sheet row animations */
const DIR_ANIM: Record<Direction, string> = {
  down: "row0",
  up: "row1",
  right: "row2",
  left: "row3",
};

/**
 * Manages the player entity, NPCs, and other players (from presence data).
 */
export class EntityLayer {
  container: Container;
  worldUiContainer: Container;
  private game: Game;

  // Local player
  playerX = 64;
  playerY = 64;
  playerDirection: Direction = "down";
  private isMoving = false;
  /** Current velocity in px/s (computed each frame for presence broadcasts) */
  playerVX = 0;
  playerVY = 0;

  // Player visual
  private playerContainer: Container;
  private playerSprite: AnimatedSprite | null = null;
  private playerFallback: Graphics | null = null;
  private playerLabel: Text;
  private playerLabelOffsetY = -10;
  private spritesheet: Spritesheet | null = null;

  // NPCs
  private npcs: NPC[] = [];
  private nearestNPC: NPC | null = null;
  inDialogue = false;
  private npcAmbientHandles = new Map<string, import("./AudioManager.ts").SfxHandle>();
  private seenChatterEventIds = new Set<string>();
  private recentNpcGreetingAt = new Map<string, number>();

  // Remote players
  private remotePlayers: Map<
    string,
    {
      container: Container;
      sprite: AnimatedSprite | null;
      spritesheet: Spritesheet | null;
      spriteUrl: string;
      label: Text;
      // Interpolation buffer (newest at end)
      snapshots: RemoteSnapshot[];
      // Rendered (smoothed) position
      renderX: number;
      renderY: number;
      // Current visual state (debounced)
      direction: string;
      animation: string;
      directionHoldFrames: number; // frames the current direction has been consistent
      labelOffsetY: number;
    }
  > = new Map();

  constructor(game: Game) {
    this.game = game;
    this.container = new Container();
    this.container.label = "entities";
    this.container.zIndex = 50;
    this.worldUiContainer = new Container();
    this.worldUiContainer.label = "world-ui";
    this.worldUiContainer.zIndex = 70;
    this.worldUiContainer.sortableChildren = true;

    // Create local player container
    this.playerContainer = new Container();
    this.playerContainer.x = this.playerX;
    this.playerContainer.y = this.playerY;

    // Name label
    this.playerLabel = new Text({
      text: this.game.profile?.name ?? "You",
      style: new TextStyle({
        fontSize: 10,
        fill: 0xe8e8f0,
        fontFamily: "Inter, sans-serif",
      }),
    });
    this.playerLabel.anchor.set(0.5, 1);
    this.playerLabel.x = this.playerX;
    this.playerLabel.y = this.playerY + this.playerLabelOffsetY;
    this.worldUiContainer.addChild(this.playerLabel);

    // Fallback square
    this.showFallback();

    this.container.addChild(this.playerContainer);

    // Load the character sprite
    this.loadCharacterSprite();
  }

  // ---------------------------------------------------------------------------
  // Player sprite loading
  // ---------------------------------------------------------------------------

  private showFallback() {
    const size = 16;
    this.playerFallback = new Graphics();
    this.playerFallback.rect(-size / 2, -size / 2, size, size);
    this.playerFallback.fill(0x6c5ce7);
    this.playerContainer.addChild(this.playerFallback);
    this.playerLabelOffsetY = -size / 2 - 2;
  }

  private async loadCharacterSprite() {
    try {
      const spriteUrl = this.game.profile?.spriteUrl ?? "/assets/characters/villager4.json";
      const sheet = await loadSpriteSheet(spriteUrl);
      this.spritesheet = sheet;
      if (!this.spritesheet.animations) return;

      const downFrames = this.spritesheet.animations["row0"];
      if (!downFrames || downFrames.length === 0) return;

      this.playerSprite = new AnimatedSprite(downFrames);
      this.playerSprite.animationSpeed = ANIM_SPEED;
      this.playerSprite.anchor.set(0.5, 1);
      this.playerSprite.play();

      if (this.playerFallback) {
        this.playerContainer.removeChild(this.playerFallback);
        this.playerFallback.destroy();
        this.playerFallback = null;
      }

      this.playerContainer.addChild(this.playerSprite);
      this.playerLabelOffsetY = -48 - 2;
    } catch (err) {
      console.warn("Failed to load character sprite:", err);
    }
  }

  private setDirection(dir: Direction) {
    if (this.playerDirection === dir && this.isMoving) return;
    this.playerDirection = dir;

    if (this.playerSprite && this.spritesheet?.animations) {
      const animKey = DIR_ANIM[dir];
      const frames = this.spritesheet.animations[animKey];
      if (frames && frames.length > 0) {
        this.playerSprite.textures = frames;
        this.playerSprite.play();
      }
    }
  }

  // ---------------------------------------------------------------------------
  // NPC management
  // ---------------------------------------------------------------------------

  /** Add an NPC to the scene */
  addNPC(config: NPCConfig): NPC {
    const npc = new NPC(config);
    this.npcs.push(npc);
    this.container.addChild(npc.container);
    this.worldUiContainer.addChild(npc.uiContainer);

    // Start ambient sound if defined
    if (npc.ambientSoundUrl) {
      this.game.audio.playAmbient(npc.ambientSoundUrl, 0).then((handle) => {
        if (handle) this.npcAmbientHandles.set(npc.id, handle);
      });
    }

    return npc;
  }

  /** Remove an NPC by id */
  /** Find the nearest NPC to a world position, returns { id, dist } or null */
  findNearestNPCAt(worldX: number, worldY: number, maxRadius: number): { id: string; dist: number } | null {
    let best: { id: string; dist: number } | null = null;
    for (const npc of this.npcs) {
      const dx = npc.x - worldX;
      const dy = npc.y - worldY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < maxRadius && (!best || dist < best.dist)) {
        best = { id: npc.id, dist };
      }
    }
    return best;
  }

  /**
   * Re-sync ambient/interact sounds for all NPCs whose name matches the given
   * sprite-definition name.  Called after a sprite definition is re-saved so
   * that live NPCs pick up sound changes immediately.
   */
  refreshNPCSounds(
    defName: string,
    sounds: {
      ambientSoundUrl?: string;
      ambientSoundRadius?: number;
      ambientSoundVolume?: number;
      interactSoundUrl?: string;
    },
  ) {
    for (const npc of this.npcs) {
      if (npc.name !== defName) continue;

      // Update interact sound (just swap the URL – used at dialogue time)
      npc.interactSoundUrl = sounds.interactSoundUrl;

      // --- ambient sound ---
      const oldHandle = this.npcAmbientHandles.get(npc.id);
      const hadAmbient = !!oldHandle;
      const wantsAmbient = !!sounds.ambientSoundUrl;

      // Stop previous ambient if it was playing
      if (hadAmbient) {
        oldHandle!.stop();
        this.npcAmbientHandles.delete(npc.id);
      }

      // Update NPC properties
      npc.ambientSoundUrl = sounds.ambientSoundUrl;
      npc.ambientSoundRadius = sounds.ambientSoundRadius ?? 200;
      npc.ambientSoundVolume = sounds.ambientSoundVolume ?? 0.5;

      // Start new ambient if one is now defined
      if (wantsAmbient) {
        this.game.audio.playAmbient(sounds.ambientSoundUrl!, 0).then((handle) => {
          if (handle) this.npcAmbientHandles.set(npc.id, handle);
        });
      }
    }
  }

  /**
   * Remove all NPCs that were spawned from placed map objects (Convex IDs).
   * Keeps hardcoded NPCs like "jane".
   */
  removeAllPlacedNPCs() {
    const toRemove = this.npcs.filter((n) => n.serverDriven === true);
    for (const npc of toRemove) {
      this.removeNPC(npc.id);
    }
    this.seenChatterEventIds.clear();
  }

  // ---------------------------------------------------------------------------
  // Server-driven NPC state (from npcState subscription)
  // ---------------------------------------------------------------------------

  /**
   * Called when the npcState subscription fires with a full list of NPC states
   * for the current map. Creates, updates, or removes NPC instances as needed.
   */
  updateNpcStates(
    states: {
      _id: string;
      mapObjectId: string;
      spriteDefName: string;
      instanceName?: string;
      npcProfile?: {
        displayName?: string;
        title?: string;
        personality?: string;
        knowledge?: string;
        desiredItem?: string;
        currencies?: Record<string, number>;
        items?: { name: string; quantity: number }[];
      } | null;
      currentIntent?: string;
      intentDetail?: string;
      mood?: string;
      x: number;
      y: number;
      vx: number;
      vy: number;
      direction: string;
      speed: number;
      wanderRadius: number;
    }[],
    /** Sprite definitions keyed by name — used to configure new NPCs */
    defsMap: Map<
      string,
      {
        name: string;
        spriteSheetUrl: string;
        npcSpeed?: number;
        npcWanderRadius?: number;
        npcDirDown?: string;
        npcDirUp?: string;
        npcDirLeft?: string;
        npcDirRight?: string;
        scale?: number;
        npcGreeting?: string;
        interactSoundUrl?: string;
        ambientSoundUrl?: string;
        ambientSoundRadius?: number;
        ambientSoundVolume?: number;
      }
    >,
  ) {
    const activeIds = new Set<string>();

    for (const s of states) {
      const npcId = s._id; // use npcState row ID as the NPC instance ID
      activeIds.add(npcId);

      const existing = this.npcs.find((n) => n.id === npcId);
      const def = defsMap.get(s.spriteDefName);

      if (existing) {
        // Update position via server-driven interpolation
        if (existing.serverDriven) {
          existing.setServerPosition(s.x, s.y, s.vx, s.vy, s.direction);
        }

        const displayName =
          s.npcProfile?.displayName || s.instanceName || existing.name;
        const greeting = this.buildNpcGreeting(displayName, def?.npcGreeting, s.npcProfile);
        const loreText = this.buildNpcLore(s.npcProfile, s.currentIntent, s.intentDetail);
        const tradeText = this.buildNpcTradeStatus(s.npcProfile, s.currentIntent);

        existing.updateSemanticPresentation({
          name: displayName,
          dialogue: [
            {
              id: "greet",
              text: greeting,
              responses: [
                { text: "Nice to meet you!", nextId: "bye" },
                { text: "Tell me more about this place.", nextId: "lore" },
                { text: "What are you up to?", nextId: "trade" },
                { text: "See you around.", nextId: "bye" },
              ],
            },
            {
              id: "lore",
              text: loreText,
              responses: [
                { text: "I'll keep exploring then.", nextId: "bye" },
                { text: "Thanks for the hint.", nextId: "bye" },
              ],
            },
            {
              id: "trade",
              text: tradeText,
              responses: [
                { text: "Interesting.", nextId: "bye" },
                { text: "Tell me more about this place.", nextId: "lore" },
              ],
            },
            {
              id: "bye",
              text: "Take care! Come chat anytime.",
            },
          ],
        });
      } else {
        // Guard: skip if an NPC with the same instanceName already exists (duplicate npcState rows)
        if (s.instanceName && this.npcs.some((n) => n.name === s.instanceName)) {
          console.warn(`[EntityLayer] Skipping duplicate NPC instanceName="${s.instanceName}" (_id=${s._id})`);
          continue;
        }

        // Create new NPC instance
        if (!def) continue;

        // Use instance name when available, otherwise fall back to sprite def name
        const displayName =
          s.npcProfile?.displayName || s.instanceName || def.name;
        const greeting = this.buildNpcGreeting(displayName, def.npcGreeting, s.npcProfile);
        const loreText = this.buildNpcLore(s.npcProfile, s.currentIntent, s.intentDetail);
        const tradeText = this.buildNpcTradeStatus(s.npcProfile, s.currentIntent);

        const dialogue: DialogueLine[] = [
          {
            id: "greet",
            text: greeting,
            responses: [
              { text: "Nice to meet you!", nextId: "bye" },
              { text: "Tell me more about this place.", nextId: "lore" },
              { text: "What are you up to?", nextId: "trade" },
              { text: "See you around.", nextId: "bye" },
            ],
          },
          {
            id: "lore",
            text: loreText,
            responses: [
              { text: "I'll keep exploring then.", nextId: "bye" },
              { text: "Thanks for the hint.", nextId: "bye" },
            ],
          },
          {
            id: "trade",
            text: tradeText,
            responses: [
              { text: "Interesting.", nextId: "bye" },
              { text: "Tell me more about this place.", nextId: "lore" },
            ],
          },
          {
            id: "bye",
            text: "Take care! Come chat anytime.",
          },
        ];

        this.addNPC({
          id: npcId,
          name: displayName,
          spriteSheet: def.spriteSheetUrl,
          x: s.x,
          y: s.y,
          speed: def.npcSpeed ?? 30,
          wanderRadius: def.npcWanderRadius ?? 60,
          directionMap: {
            down: def.npcDirDown ?? "row0",
            up: def.npcDirUp ?? "row1",
            left: def.npcDirLeft ?? "row3",
            right: def.npcDirRight ?? "row2",
          },
          scale: def.scale ?? 1,
          interactSoundUrl: def.interactSoundUrl,
          ambientSoundUrl: def.ambientSoundUrl,
          ambientSoundRadius: def.ambientSoundRadius,
          ambientSoundVolume: def.ambientSoundVolume,
          dialogue,
          serverDriven: true,
        });
      }
    }

    // Remove NPCs that are no longer in the server state
    // (but keep non-server-driven NPCs like hardcoded "jane")
    const toRemove = this.npcs.filter(
      (n) => n.serverDriven && !activeIds.has(n.id),
    );
    for (const npc of toRemove) {
      this.removeNPC(npc.id);
    }
  }

  private buildNpcGreeting(
    displayName: string,
    defaultGreeting?: string,
    profile?: {
      title?: string;
      personality?: string;
    } | null,
  ) {
    const title = profile?.title?.trim();
    const personality = profile?.personality?.trim();
    if (defaultGreeting) return defaultGreeting;
    if (title && personality) {
      return `I'm ${displayName}, the ${title}. People say I'm ${personality}.`;
    }
    if (title) {
      return `I'm ${displayName}, the ${title}. Welcome.`;
    }
    return `Hello! I'm ${displayName}.`;
  }

  private buildNpcLore(
    profile?: { knowledge?: string } | null,
    currentIntent?: string,
    intentDetail?: string,
  ) {
    const knowledge = profile?.knowledge?.trim();
    if (knowledge && intentDetail) return `${knowledge} Right now I'm ${currentIntent ?? "busy"}: ${intentDetail}.`;
    if (knowledge) return knowledge;
    if (intentDetail) return `Right now I'm ${currentIntent ?? "busy"}: ${intentDetail}.`;
    return "There's not much I know yet... but I'm sure the world will reveal its secrets in time.";
  }

  private buildNpcTradeStatus(
    profile?: {
      desiredItem?: string;
      currencies?: Record<string, number>;
      items?: { name: string; quantity: number }[];
    } | null,
    currentIntent?: string,
  ) {
    const desiredItem = profile?.desiredItem;
    const coins = profile?.currencies?.coins ?? 0;
    const inventory =
      profile?.items?.map((item) => `${item.quantity} ${item.name}`).join(", ") || "nothing much";
    if (currentIntent === "trading") {
      return `I'm in the middle of a trade. I have ${inventory} and ${coins} coins right now.`;
    }
    if (desiredItem) {
      return `I'm currently ${currentIntent === "seeking-trade" ? "looking around" : "thinking"} for ${desiredItem}. I have ${inventory} and ${coins} coins.`;
    }
    return `I'm carrying ${inventory} and ${coins} coins.`;
  }

  removeNPC(id: string) {
    const idx = this.npcs.findIndex((n) => n.id === id);
    if (idx >= 0) {
      const npc = this.npcs[idx];
      this.container.removeChild(npc.container);
      this.worldUiContainer.removeChild(npc.uiContainer);
      npc.destroy();
      this.npcs.splice(idx, 1);
      // Stop ambient sound
      const handle = this.npcAmbientHandles.get(id);
      if (handle) {
        handle.stop();
        this.npcAmbientHandles.delete(id);
      }
    }
  }

  applyAgentChatter(entries: AgentChatterEntry[]) {
    const unseen = entries.filter((entry) => !this.seenChatterEventIds.has(entry.id));
    if (unseen.length === 0) return;

    const entry = unseen[unseen.length - 1];
    const npc = this.findNpcByName(entry.speaker);
    if (!npc) return;

    for (const other of this.npcs) {
      if (other.id !== npc.id) other.hideSpeech();
    }

    const peer =
      (entry.replyToDisplayName ? this.findNpcByName(entry.replyToDisplayName) : null) ??
      this.findClosestPeer(npc);

    if (peer) {
      npc.faceToward(peer.x, peer.y);
    }

    const compactSummary = entry.summary.replace(/\s+/g, " ").trim();
    const conciseSummary =
      compactSummary.length > MAX_AGENT_CHATTER_CHARS
        ? `${compactSummary.slice(0, MAX_AGENT_CHATTER_CHARS - 1).trimEnd()}…`
        : compactSummary;

    npc.showSpeech(conciseSummary, entry.replyToDisplayName ? 10_000 : 7_000);
    for (const seen of unseen) {
      this.seenChatterEventIds.add(seen.id);
    }

    if (this.seenChatterEventIds.size > 120) {
      this.seenChatterEventIds = new Set(Array.from(this.seenChatterEventIds).slice(-60));
    }
  }

  private findNpcByName(name: string | null | undefined) {
    if (!name) return null;
    return this.npcs.find((npc) => npc.name === name) ?? null;
  }

  private findClosestPeer(source: NPC) {
    let nearest: NPC | null = null;
    let nearestDist = Number.POSITIVE_INFINITY;

    for (const npc of this.npcs) {
      if (npc.id === source.id) continue;
      const dx = npc.x - source.x;
      const dy = npc.y - source.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < nearestDist) {
        nearest = npc;
        nearestDist = dist;
      }
    }

    return nearest;
  }

  // ---------------------------------------------------------------------------
  // Game loop
  // ---------------------------------------------------------------------------

  update(dt: number, input: InputManager) {
    // Don't process player input while in dialogue
    if (!this.inDialogue) {
      this.updatePlayerMovement(dt, input);
      this.updateNPCInteraction(input);
    }

    // NPCs near the player should pause and face them instead of wandering through the interaction.
    const npcAttentionRadius = NPC_INTERACT_RADIUS * 2.4;
    for (const npc of this.npcs) {
      const dist = npc.distanceTo(this.playerX, this.playerY);
      npc.setProximityFocus(dist <= npcAttentionRadius, this.playerX, this.playerY);
    }

    // NPCs wander outside the interaction radius for ambiance.
    const collisionCheck = (px: number, py: number) => this.isBlocked(px, py);
    for (const npc of this.npcs) {
      npc.update(dt, collisionCheck);

      // Update NPC ambient sound volume based on distance
      const ambHandle = this.npcAmbientHandles.get(npc.id);
      if (ambHandle) {
        const dx = npc.x - this.playerX;
        const dy = npc.y - this.playerY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const radius = npc.ambientSoundRadius;
        if (dist >= radius) {
          ambHandle.setVolume(0);
        } else {
          const t = 1 - dist / radius;
          ambHandle.setVolume(t * npc.ambientSoundVolume);
        }
      }
    }

    // Update player visual position
    this.playerContainer.x = this.playerX;
    this.playerContainer.y = this.playerY;
    this.playerLabel.x = this.playerX;
    this.playerLabel.y = this.playerY + this.playerLabelOffsetY;

    // Camera follows the player during play, but build mode should allow free panning.
    if (this.game.mode === "build") {
      this.game.camera.stopFollowing();
    } else {
      this.game.camera.follow(this.playerX, this.playerY);
    }

    // Interpolate remote players from their snapshot buffers.
    // We render at (now - INTERP_DELAY_MS) so we always have two snapshots
    // to lerp between, giving perfectly smooth movement.
    const now = performance.now();
    const renderTime = now - INTERP_DELAY_MS;

    for (const [, remote] of this.remotePlayers) {
      const snaps = remote.snapshots;
      let targetX: number;
      let targetY: number;
      let interpDir: string = remote.direction;
      let interpAnim: string = remote.animation;

      if (snaps.length >= 2) {
        // Find the two snapshots that bracket renderTime
        let i = snaps.length - 1;
        while (i > 0 && snaps[i].time > renderTime) i--;
        const a = snaps[i];
        const b = snaps[Math.min(i + 1, snaps.length - 1)];

        if (a === b || a.time === b.time) {
          // Only one usable snapshot — hold at its position (no prediction)
          targetX = a.x;
          targetY = a.y;
          interpDir = a.direction;
          interpAnim = a.animation;
        } else {
          // Lerp between a and b — pure interpolation, no velocity
          const t = Math.max(0, Math.min(1, (renderTime - a.time) / (b.time - a.time)));
          targetX = a.x + (b.x - a.x) * t;
          targetY = a.y + (b.y - a.y) * t;
          interpDir = t < 0.5 ? a.direction : b.direction;
          interpAnim = t < 0.5 ? a.animation : b.animation;
        }
      } else if (snaps.length === 1) {
        // Only one snapshot — hold at its position (no prediction)
        targetX = snaps[0].x;
        targetY = snaps[0].y;
        interpDir = snaps[0].direction;
        interpAnim = snaps[0].animation;
      } else {
        // No snapshots — do nothing
        continue;
      }

      // Snap if teleport-level correction, otherwise move directly
      // (interpolation is already smooth, no need for extra blending)
      const cdx = targetX - remote.renderX;
      const cdy = targetY - remote.renderY;
      if (cdx * cdx + cdy * cdy > REMOTE_SNAP_DISTANCE_PX * REMOTE_SNAP_DISTANCE_PX) {
        remote.renderX = targetX;
        remote.renderY = targetY;
      } else {
        remote.renderX = targetX;
        remote.renderY = targetY;
      }

      remote.container.x = remote.renderX;
      remote.container.y = remote.renderY;
      remote.label.x = remote.renderX;
      remote.label.y = remote.renderY + remote.labelOffsetY;

      // Debounce direction changes — only apply after 2 consistent frames
      // to prevent one-frame direction flickers from swapping sprites
      if (interpDir !== remote.direction) {
        remote.directionHoldFrames++;
        if (remote.directionHoldFrames >= 2) {
          this.applyRemoteDirection(remote, interpDir);
          remote.direction = interpDir;
          remote.directionHoldFrames = 0;
        }
      } else {
        remote.directionHoldFrames = 0;
      }

      // Smooth animation state: only toggle walk↔idle after direction is stable
      if (interpAnim !== remote.animation) {
        if (remote.sprite) {
          if (interpAnim === "walk" && !remote.sprite.playing) {
            remote.sprite.play();
          } else if (interpAnim === "idle" && remote.sprite.playing) {
            remote.sprite.gotoAndStop(0);
          }
        }
        remote.animation = interpAnim;
      }
    }

    // NOTE: Do NOT call input.endFrame() here — it must be called once
    // at the very end of Game.update() so other systems (toggle, pickup)
    // can still read justPressed keys this frame.
  }

  private updatePlayerMovement(dt: number, input: InputManager) {
    let dx = 0;
    let dy = 0;

    if (input.isDown("ArrowLeft") || input.isDown("a")) dx -= 1;
    if (input.isDown("ArrowRight") || input.isDown("d")) dx += 1;
    if (input.isDown("ArrowUp") || input.isDown("w")) dy -= 1;
    if (input.isDown("ArrowDown") || input.isDown("s")) dy += 1;

    const wasMoving = this.isMoving;
    this.isMoving = dx !== 0 || dy !== 0;

    if (dy < 0) this.setDirection("up");
    else if (dy > 0) this.setDirection("down");
    else if (dx < 0) this.setDirection("left");
    else if (dx > 0) this.setDirection("right");

    if (!this.isMoving && wasMoving && this.playerSprite) {
      this.playerSprite.gotoAndStop(1);
    }
    if (this.isMoving && !wasMoving && this.playerSprite) {
      this.playerSprite.play();
    }

    if (dx !== 0 && dy !== 0) {
      const len = Math.sqrt(dx * dx + dy * dy);
      dx /= len;
      dy /= len;
    }

    const prevX = this.playerX;
    const prevY = this.playerY;

    const isSprinting = input.isDown("Shift");
    const speed = MOVE_SPEED * (isSprinting ? SPRINT_MULTIPLIER : 1);
    const newX = this.playerX + dx * speed * dt;
    const newY = this.playerY + dy * speed * dt;

    // Check collision using a bounding box around the player's feet.
    // We check all four corners of the box for the proposed position.
    const canMoveXY = !this.isBlocked(newX, newY);
    if (canMoveXY) {
      this.playerX = newX;
      this.playerY = newY;
    } else {
      // Wall sliding: try each axis independently
      if (!this.isBlocked(newX, this.playerY)) {
        this.playerX = newX;
      }
      if (!this.isBlocked(this.playerX, newY)) {
        this.playerY = newY;
      }
    }

    this.resolveCharacterOverlap();

    // Track intended velocity (px/s) for presence broadcasts.
    // We send the INPUT-derived direction × speed, NOT the collision-adjusted
    // displacement.  The old approach produced wildly noisy velocity when the
    // player was sliding along walls (oscillating between 0 and full speed each
    // frame), which caused remote-player extrapolation to jitter.
    this.playerVX = dx * speed;
    this.playerVY = dy * speed;
  }

  /**
   * Check if a position is blocked by testing all four corners
   * of the player's collision box (around the feet).
   */
  private isBlocked(px: number, py: number): boolean {
    return this.isMapBlocked(px, py) || this.isCharacterBlocked(px, py);
  }

  private isMapBlocked(px: number, py: number): boolean {
    const mr = this.game.mapRenderer;
    const left = px - COL_HALF_W;
    const right = px + COL_HALF_W;
    const top = py + COL_TOP;
    const bot = py + COL_BOT;

    const tl = mr.worldToTile(left, top);
    const tr = mr.worldToTile(right, top);
    const bl = mr.worldToTile(left, bot);
    const br = mr.worldToTile(right, bot);

    return (
      mr.isCollision(tl.tileX, tl.tileY) ||
      mr.isCollision(tr.tileX, tr.tileY) ||
      mr.isCollision(bl.tileX, bl.tileY) ||
      mr.isCollision(br.tileX, br.tileY)
    );
  }

  private getCharacterColliders(): CharacterCollider[] {
    const colliders: CharacterCollider[] = [];

    for (const npc of this.npcs) {
      colliders.push({ x: npc.x, y: npc.y });
    }

    for (const [, remote] of this.remotePlayers) {
      colliders.push({ x: remote.renderX, y: remote.renderY });
    }

    return colliders;
  }

  private isCharacterBlocked(px: number, py: number): boolean {
    const radiusSq = CHARACTER_COLLISION_RADIUS * CHARACTER_COLLISION_RADIUS;
    const currentX = this.playerX;
    const currentY = this.playerY;

    for (const collider of this.getCharacterColliders()) {
      const nextDx = collider.x - px;
      const nextDy = collider.y - py;
      const nextDistSq = nextDx * nextDx + nextDy * nextDy;
      if (nextDistSq >= radiusSq) continue;

      const currentDx = collider.x - currentX;
      const currentDy = collider.y - currentY;
      const currentDistSq = currentDx * currentDx + currentDy * currentDy;

      // If we're already overlapping a character, allow movement that
      // increases separation so the player can slide out instead of getting stuck.
      if (currentDistSq < radiusSq && nextDistSq > currentDistSq) continue;

      return true;
    }

    return false;
  }

  private resolveCharacterOverlap() {
    const colliders = this.getCharacterColliders();
    const minDistance = CHARACTER_COLLISION_RADIUS + 1;

    for (const collider of colliders) {
      let dx = this.playerX - collider.x;
      let dy = this.playerY - collider.y;
      let dist = Math.sqrt(dx * dx + dy * dy);

      if (dist >= minDistance) continue;

      if (dist < 0.001) {
        dx = 1;
        dy = 0;
        dist = 1;
      }

      const push = minDistance - dist;
      const pushX = (dx / dist) * push;
      const pushY = (dy / dist) * push;

      const nextX = this.playerX + pushX;
      const nextY = this.playerY + pushY;

      if (!this.isMapBlocked(nextX, nextY)) {
        this.playerX = nextX;
        this.playerY = nextY;
        continue;
      }

      if (!this.isMapBlocked(nextX, this.playerY)) {
        this.playerX = nextX;
        continue;
      }

      if (!this.isMapBlocked(this.playerX, nextY)) {
        this.playerY = nextY;
      }
    }
  }

  getCollisionDebugInfo(px = this.playerX, py = this.playerY) {
    const mr = this.game.mapRenderer;
    const center = mr.worldToTile(px, py);
    const left = px - COL_HALF_W;
    const right = px + COL_HALF_W;
    const top = py + COL_TOP;
    const bot = py + COL_BOT;

    const tl = mr.worldToTile(left, top);
    const tr = mr.worldToTile(right, top);
    const bl = mr.worldToTile(left, bot);
    const br = mr.worldToTile(right, bot);

    return {
      center,
      centerBlocked: mr.isCollision(center.tileX, center.tileY),
      corners: {
        tl: { ...tl, blocked: mr.isCollision(tl.tileX, tl.tileY) },
        tr: { ...tr, blocked: mr.isCollision(tr.tileX, tr.tileY) },
        bl: { ...bl, blocked: mr.isCollision(bl.tileX, bl.tileY) },
        br: { ...br, blocked: mr.isCollision(br.tileX, br.tileY) },
      },
      boxBlocked: this.isMapBlocked(px, py),
    };
  }

  hasNearbyNpc(): boolean {
    return this.nearestNPC !== null;
  }

  private updateNPCInteraction(input: InputManager) {
    // Find nearest NPC within interact radius
    let nearest: NPC | null = null;
    let nearestDist = NPC_INTERACT_RADIUS;
    const previousNearest = this.nearestNPC;

    for (const npc of this.npcs) {
      const dist = npc.distanceTo(this.playerX, this.playerY);
      if (dist < nearestDist) {
        nearest = npc;
        nearestDist = dist;
      }
    }

    // Update prompt visibility
    if (previousNearest && previousNearest !== nearest) {
      previousNearest.setPromptVisible(false);
    }
    this.nearestNPC = nearest;
    if (nearest) {
      nearest.setPromptVisible(true, "Press E to speak");
    }

    if (nearest && previousNearest !== nearest) {
      this.maybeTriggerNpcGreeting(nearest);
    }

    // Guests are read-only, but dialogue is safe and should still work.
    if (nearest && (input.wasJustPressed("e") || input.wasJustPressed("E"))) {
      void this.startDialogue(nearest);
    }
  }

  private async startDialogue(npc: NPC) {
    this.inDialogue = true;

    // Play greeting / interact sound
    if (npc.interactSoundUrl) {
      this.game.audio.playOneShot(npc.interactSoundUrl, 0.7);
    }

    // NPC faces the player
    npc.faceToward(this.playerX, this.playerY);

    if (npc.name === "guide.btc") {
      void this.appendWorldEvent("guide-surface-opened", npc, {
        summary: `${this.profileLabel()} opened the guide desk briefing with ${npc.name}.`,
      });
      splashManager.push({
        id: `guide-btc-${npc.id}`,
        create: (props) =>
          createGuideNpcSplash({
            ...props,
            npcName: npc.name,
          }),
        transparent: true,
        pausesGame: true,
        onClose: () => {
          this.inDialogue = false;
        },
      });
      return;
    }

    if (npc.name === "market.btc") {
      void this.appendWorldEvent("market-surface-opened", npc, {
        summary: `${this.profileLabel()} opened the Tenero-backed market surface with ${npc.name}.`,
      });
      splashManager.push({
        id: `market-btc-${npc.id}`,
        create: (props) =>
          createMarketNpcSplash({
            ...props,
            npcName: npc.name,
          }),
        transparent: true,
        pausesGame: true,
        onClose: () => {
          this.inDialogue = false;
        },
      });
      return;
    }

    if (npc.name === "quests.btc") {
      void this.appendWorldEvent("opportunity-surface-opened", npc, {
        summary: `${this.profileLabel()} opened the Zero Authority opportunity surface with ${npc.name}.`,
      });
      splashManager.push({
        id: `quests-btc-${npc.id}`,
        create: (props) =>
          createQuestsNpcSplash({
            ...props,
            npcName: npc.name,
          }),
        transparent: true,
        pausesGame: true,
        onClose: () => {
          this.inDialogue = false;
        },
      });
      return;
    }

    if (npc.name === "Mel") {
      void this.appendWorldEvent("curation-surface-opened", npc, {
        summary: `${this.profileLabel()} opened the Mel curation desk.`,
      });
      splashManager.push({
        id: `mel-curator-${npc.id}`,
        create: (props) =>
          createMelNpcSplash({
            ...props,
            npcName: npc.name,
          }),
        transparent: true,
        pausesGame: true,
        onClose: () => {
          this.inDialogue = false;
        },
      });
      return;
    }

    void this.appendWorldEvent("npc-interacted", npc, {
      summary: `${this.profileLabel()} opened ${npc.name}.`,
    });

    // Convert NPC dialogue to DialogueNode format
    const nodes: DialogueNode[] = npc.dialogue.map((line) => ({
      id: line.id,
      text: line.text,
      speaker: npc.name,
      responses: line.responses?.map((r) => ({
        text: r.text,
        nextNodeId: r.nextId,
      })),
      nextNodeId: line.nextId,
    }));

    splashManager.push({
      id: `dialogue-${npc.id}`,
      create: (props) =>
        createDialogueSplash({
          ...props,
          nodes,
          startNodeId: nodes[0]?.id,
          npcName: npc.name,
          onChoice: (nodeId, responseIndex) => {
            const node = nodes.find((entry) => entry.id === nodeId);
            const response = node?.responses?.[responseIndex];
            if (!response) return;
            void this.appendWorldEvent("dialogue-choice", npc, {
              summary: `${this.profileLabel()} chose "${response.text}" while speaking with ${npc.name}.`,
              detailsJson: JSON.stringify({
                nodeId,
                responseIndex,
                responseText: response.text,
              }),
            });
          },
        }),
      transparent: true,
      // Keep the current speaker anchored during conversation. Without pausing
      // the game loop, server-driven NPCs continue moving while the splash is open.
      pausesGame: true,
      onClose: () => {
        this.inDialogue = false;
      },
    });
  }

  private maybeTriggerNpcGreeting(npc: NPC) {
    const now = Date.now();
    const lastAt = this.recentNpcGreetingAt.get(npc.id) ?? 0;
    if (now - lastAt < 12_000) return;

    // Keep proximity chatter readable by showing only one NPC greeting at a time.
    this.hideNpcSpeechExcept(npc);
    npc.faceToward(this.playerX, this.playerY);
    npc.showSpeech(this.getNpcGreetingLine(npc), 8_000);
    this.recentNpcGreetingAt.set(npc.id, now);

    void this.appendWorldEvent("npc-greeting", npc, {
      summary: `${npc.name} notices ${this.profileLabel()} nearby.`,
      detailsJson: JSON.stringify({
        mode: "proximity",
        prompt: "press-e-dialogue",
      }),
    });
  }

  private hideNpcSpeechExcept(owner: NPC | null) {
    for (const other of this.npcs) {
      if (owner && other.id === owner.id) continue;
      if (other.hasVisibleSpeech()) {
        other.hideSpeech();
      }
    }
  }

  private getNpcGreetingLine(npc: NPC) {
    switch (npc.name) {
      case "guide.btc":
        return "New to Stacks? Press E and I’ll walk you through the room.";
      case "market.btc":
        return "Need the latest tape? Press E for the market board.";
      case "quests.btc":
        return "I’ve got fresh opportunities. Press E if you want the short list.";
      case "Mel":
        return "I’ve been curating signals all day. Press E and I’ll show you the good ones.";
      case "Toma":
        return "Still finding Nakamoto? Pull up a chair. Press E if you want the tavern chatter.";
      default:
        return npc.dialogue[0]?.text?.trim() || "Press E to talk.";
    }
  }

  private profileLabel(): string {
    return this.game.profile?.name || "Player";
  }

  private async appendWorldEvent(
    eventType: string,
    npc: NPC,
    {
      summary,
      detailsJson,
    }: {
      summary: string;
      detailsJson?: string;
    },
  ) {
    try {
      const convex = getConvexClient();
      await convex.mutation(api.worldState.appendEvent, {
        mapName: this.game.currentMapName,
        eventType,
        actorId: this.profileLabel(),
        targetId: npc.name,
        objectKey: this.semanticObjectKeyForNpc(npc.name),
        zoneKey: this.semanticZoneKeyForNpc(npc.name),
        summary,
        detailsJson,
      });
    } catch (error) {
      console.warn("Failed to append world event", error);
    }
  }

  private semanticObjectKeyForNpc(npcName: string): string | undefined {
    switch (npcName) {
      case "guide.btc":
        return "guide-post";
      case "Toma":
        return "merchant-post";
      case "market.btc":
        return "market-post";
      case "quests.btc":
        return "quest-post";
      default:
        return undefined;
    }
  }

  private semanticZoneKeyForNpc(npcName: string): string | undefined {
    switch (npcName) {
      case "guide.btc":
        return "guide-desk";
      case "Toma":
        return "merchant-corner";
      case "market.btc":
        return "market-station";
      case "quests.btc":
        return "quest-board";
      default:
        return undefined;
    }
  }

  // ---------------------------------------------------------------------------
  // Remote players (multiplayer presence)
  // ---------------------------------------------------------------------------

  /** Apply a direction change to a remote player's sprite */
  private applyRemoteDirection(
    remote: { sprite: AnimatedSprite | null; spritesheet: Spritesheet | null; animation: string },
    dir: string,
  ) {
    if (!remote.sprite || !remote.spritesheet) return;
    const animKey = DIR_ANIM[dir as Direction] ?? "row0";
    const frames = remote.spritesheet.animations[animKey];
    if (frames && frames.length > 0) {
      remote.sprite.textures = frames;
      if (remote.animation === "walk") remote.sprite.play();
      else remote.sprite.gotoAndStop(0);
    }
  }

  updatePresence(presenceList: PresenceData[], localProfileId: string) {
    const activeIds = new Set<string>();
    const now = performance.now();

    for (const p of presenceList) {
      if (p.profileId === localProfileId) continue;
      activeIds.add(p.profileId);

      let remote = this.remotePlayers.get(p.profileId);
      if (!remote) {
        // New remote player — create container
        const remoteContainer = new Container();
        remoteContainer.x = p.x;
        remoteContainer.y = p.y;

        // Fallback square (will be replaced once sprite loads)
        const graphic = new Graphics();
        graphic.rect(-8, -16, 16, 16);
        graphic.fill(0xa29bfe);
        remoteContainer.addChild(graphic);

        const label = new Text({
          text: p.name || "Player",
          style: new TextStyle({
            fontSize: 10,
            fill: 0xe8e8f0,
            fontFamily: "Inter, sans-serif",
          }),
        });
        label.anchor.set(0.5, 1);
        label.x = p.x;
        label.y = p.y - 48 - 2;
        this.worldUiContainer.addChild(label);

        this.container.addChild(remoteContainer);

        remote = {
          container: remoteContainer,
          sprite: null,
          spritesheet: null,
          spriteUrl: p.spriteUrl,
          label,
          snapshots: [],
          renderX: p.x,
          renderY: p.y,
          direction: p.direction,
          animation: p.animation,
          directionHoldFrames: 0,
          labelOffsetY: -48 - 2,
        };
        this.remotePlayers.set(p.profileId, remote);

        // Load the sprite sheet asynchronously
        this.loadRemotePlayerSprite(p.profileId, p.spriteUrl);
      }

      // Push a new snapshot into the interpolation buffer
      remote.snapshots.push({
        x: p.x,
        y: p.y,
        vx: p.vx,
        vy: p.vy,
        direction: p.direction,
        animation: p.animation,
        time: now,
      });
      // Trim old snapshots (keep only the last N)
      while (remote.snapshots.length > INTERP_MAX_SNAPSHOTS) {
        remote.snapshots.shift();
      }

      remote.label.text = p.name || "Player";
      // Direction and animation are now handled by the interpolation loop
      // in update(), not eagerly here — prevents per-update sprite flicker.
    }

    for (const [id, remote] of this.remotePlayers) {
      if (!activeIds.has(id)) {
        this.container.removeChild(remote.container);
        this.worldUiContainer.removeChild(remote.label);
        remote.label.destroy();
        remote.sprite?.destroy();
        this.remotePlayers.delete(id);
      }
    }
  }

  private async loadRemotePlayerSprite(profileId: string, spriteUrl: string) {
    const remote = this.remotePlayers.get(profileId);
    if (!remote) return;

    try {
      const sheet = await loadSpriteSheet(spriteUrl);
      // Check if remote player is still around
      if (!this.remotePlayers.has(profileId)) return;

      const downFrames = sheet.animations?.["row0"];
      if (!downFrames || downFrames.length === 0) return;

      const sprite = new AnimatedSprite(downFrames);
      sprite.animationSpeed = ANIM_SPEED;
      sprite.anchor.set(0.5, 1);

      if (remote.animation === "walk") {
        sprite.play();
      } else {
        sprite.gotoAndStop(0);
      }

      // Remove fallback graphic (first child is the colored rect)
      if (remote.container.children.length > 0) {
        const fallback = remote.container.children[0];
        if (fallback instanceof Graphics) {
          remote.container.removeChild(fallback);
          fallback.destroy();
        }
      }

      remote.container.addChildAt(sprite, 0);
      remote.sprite = sprite;
      remote.spritesheet = sheet;

      // Apply current direction
      const animKey = DIR_ANIM[remote.direction as Direction] ?? "row0";
      const frames = sheet.animations[animKey];
      if (frames && frames.length > 0) {
        sprite.textures = frames;
        if (remote.animation === "walk") sprite.play();
        else sprite.gotoAndStop(0);
      }
    } catch (err) {
      console.warn(`Failed to load sprite for remote player ${profileId}:`, err);
    }
  }

  getPlayerPosition() {
    return {
      x: this.playerX,
      y: this.playerY,
      vx: this.playerVX,
      vy: this.playerVY,
      direction: this.playerDirection,
    };
  }

  isPlayerMoving(): boolean {
    return this.isMoving;
  }
}
