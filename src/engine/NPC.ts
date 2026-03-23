import {
  Container,
  AnimatedSprite,
  Spritesheet,
  Text,
  TextStyle,
  Graphics,
} from "pixi.js";
import { loadSpriteSheet } from "./SpriteLoader.ts";
import type { Direction } from "./types.ts";

const ANIM_SPEED = 0.08;

/** Default direction-to-animation mapping (villager4 layout) */
const DEFAULT_DIR_ANIM: Record<Direction, string> = {
  down: "row0",
  up: "row1",
  right: "row2",
  left: "row3",
};

/** NPC wander state machine */
type WanderState = "idle" | "walking";

export interface NPCConfig {
  /** Unique id */
  id: string;
  /** Display name */
  name: string;
  /** Sprite sheet JSON path (under /assets/sprites/) */
  spriteSheet: string;
  /** Starting position in world pixels */
  x: number;
  y: number;
  /** Movement speed (px/sec) */
  speed?: number;
  /** Maximum wander radius from spawn point (in pixels) */
  wanderRadius?: number;
  /** Direction-to-animation row mapping (override if sheet layout differs) */
  directionMap?: Record<Direction, string>;
  /** Rendering scale multiplier */
  scale?: number;
  /** Dialogue lines for this NPC */
  dialogue: DialogueLine[];
  /** Sound to play when the player starts chatting (e.g. chicken cluck) */
  interactSoundUrl?: string;
  /** Ambient sound that loops near this NPC */
  ambientSoundUrl?: string;
  ambientSoundRadius?: number;
  ambientSoundVolume?: number;
  /**
   * When true, the NPC does not run its own wander AI.
   * Position is set externally via setServerPosition().
   */
  serverDriven?: boolean;
}

export interface DialogueLine {
  id: string;
  text: string;
  responses?: { text: string; nextId: string }[];
  nextId?: string;
}

/**
 * A non-player character with animated sprite, simple wander AI,
 * and dialogue data.
 */
export class NPC {
  readonly id: string;
  name: string;
  readonly container: Container;
  readonly uiContainer: Container;
  dialogue: DialogueLine[];
  interactSoundUrl?: string;
  ambientSoundUrl?: string;
  ambientSoundRadius: number;
  ambientSoundVolume: number;

  x: number;
  y: number;
  direction: Direction = "down";

  private spawnX: number;
  private spawnY: number;
  private speed: number;
  private wanderRadius: number;
  private dirMap: Record<Direction, string>;
  private scale: number;

  private sprite: AnimatedSprite | null = null;
  private spritesheet: Spritesheet | null = null;
  private nameLabel: Text;
  private promptLabel: Text;
  private fallback: Graphics | null = null;
  private speechBubble: Container | null = null;
  private speechBubbleBg: Graphics | null = null;
  private speechBubbleText: Text | null = null;
  private speechExpiresAt = 0;
  private promptLabelText = "[E] Talk";
  private speechLift = 0;

  // Server-driven mode (position set externally, no local AI)
  readonly serverDriven: boolean;
  /** Server-provided target position for interpolation */
  private serverX: number;
  private serverY: number;
  private serverVX = 0;
  private serverVY = 0;
  private serverTime = 0; // performance.now() when last server update arrived
  private lastServerDir: Direction = "down";
  private serverIsMoving = false;
  private static readonly SERVER_MOVE_EPSILON_PX = 0.75;
  private static readonly SERVER_SPEED_EPSILON = 4;

  // Wander AI state (only used when !serverDriven)
  private state: WanderState = "idle";
  private stateTimer = 0;
  private moveDir: { dx: number; dy: number } = { dx: 0, dy: 0 };

  // Interaction
  private _showPrompt = false;

  constructor(config: NPCConfig) {
    this.id = config.id;
    this.name = config.name;
    this.x = config.x;
    this.y = config.y;
    this.spawnX = config.x;
    this.spawnY = config.y;
    this.speed = config.speed ?? 40;
    this.wanderRadius = config.wanderRadius ?? 80;
    this.dirMap = config.directionMap ?? DEFAULT_DIR_ANIM;
    this.scale = config.scale ?? 1;
    this.dialogue = config.dialogue;
    this.interactSoundUrl = config.interactSoundUrl;
    this.ambientSoundUrl = config.ambientSoundUrl;
    this.ambientSoundRadius = config.ambientSoundRadius ?? 200;
    this.ambientSoundVolume = config.ambientSoundVolume ?? 0.5;
    this.serverDriven = config.serverDriven ?? false;
    this.serverX = config.x;
    this.serverY = config.y;

    this.container = new Container();
    this.container.x = this.x;
    this.container.y = this.y;
    this.uiContainer = new Container();
    this.uiContainer.x = this.x;
    this.uiContainer.y = this.y;
    this.uiContainer.label = `${this.id}-world-ui`;

    // Name label
    this.nameLabel = new Text({
      text: this.name,
      style: new TextStyle({
        fontSize: 14,
        fill: 0xffd700, // gold for NPCs
        fontFamily: "Inter, sans-serif",
        fontWeight: "bold",
        stroke: { color: 0x000000, width: 3 },
      }),
    });
    this.nameLabel.anchor.set(0.5, 1);
    this.nameLabel.y = -26;
    this.uiContainer.addChild(this.nameLabel);

    // Interaction prompt (hidden by default)
    this.promptLabel = new Text({
      text: this.promptLabelText,
      style: new TextStyle({
        fontSize: 13,
        fill: 0xffffff,
        fontFamily: "Inter, sans-serif",
        fontWeight: "700",
        stroke: { color: 0x000000, width: 3 },
      }),
    });
    this.promptLabel.anchor.set(0.5, 1);
    this.promptLabel.y = -42;
    this.promptLabel.visible = false;
    this.uiContainer.addChild(this.promptLabel);

    // Fallback square until sprite loads
    this.fallback = new Graphics();
    this.fallback.rect(-8, -8, 16, 16);
    this.fallback.fill(0xffd700);
    this.container.addChild(this.fallback);

    // Load sprite
    this.loadSprite(config.spriteSheet);

    // Start with a random idle duration
    this.stateTimer = 1 + Math.random() * 3;
  }

  private async loadSprite(sheetPath: string) {
    try {
      const sheet = await loadSpriteSheet(sheetPath);
      this.spritesheet = sheet;

      if (!this.spritesheet.animations) return;

      const frames = this.spritesheet.animations["row0"];
      if (!frames || frames.length === 0) return;

      this.sprite = new AnimatedSprite(frames);
      this.sprite.animationSpeed = ANIM_SPEED;
      this.sprite.anchor.set(0.5, 1);
      this.sprite.scale.set(this.scale);
      this.sprite.gotoAndStop(Math.min(1, Math.max(0, this.sprite.totalFrames - 1))); // use the same idle frame convention as the player

      // Remove fallback
      if (this.fallback) {
        this.container.removeChild(this.fallback);
        this.fallback.destroy();
        this.fallback = null;
      }

      this.container.addChild(this.sprite);

      // Reposition labels for sprite height
      this.nameLabel.y = -48 * this.scale - 2;
      this.promptLabel.y = -60 * this.scale - 2;
      this.updateSpeechBubbleAnchor();
    } catch (err) {
      console.warn(`Failed to load NPC sprite: ${sheetPath}`, err);
    }
  }

  /** Called every frame. Pass a collision checker (px,py) => blocked */
  update(dt: number, isBlocked?: (px: number, py: number) => boolean) {
    if (this.serverDriven) {
      this.updateServerDriven(dt);
    } else {
      this.updateLocalAI(dt, isBlocked);
    }

    this.container.x = this.x;
    this.container.y = this.y;
    this.uiContainer.x = this.x;
    this.uiContainer.y = this.y;

    if (this.speechBubble?.visible && this.speechExpiresAt > 0 && performance.now() >= this.speechExpiresAt) {
      this.hideSpeech();
    }
  }

  /** Server-driven: interpolate toward server position */
  private updateServerDriven(dt: number) {
    const now = performance.now();
    const elapsed = (now - this.serverTime) / 1000;

    // Extrapolate server position based on velocity (clamp to 0.6s)
    const t = Math.min(elapsed, 0.6);
    const predictedX = this.serverX + this.serverVX * t;
    const predictedY = this.serverY + this.serverVY * t;

    // Smoothly blend toward predicted position
    const blend = 1 - Math.pow(0.001, dt);
    this.x += (predictedX - this.x) * blend;
    this.y += (predictedY - this.y) * blend;

    // Drive animation from server velocity: play when moving, stand when idle
    if (this.serverIsMoving && this.sprite && !this.sprite.playing) {
      this.sprite.play();
    } else if (!this.serverIsMoving && this.sprite?.playing) {
      this.sprite.gotoAndStop(Math.min(1, Math.max(0, this.sprite.totalFrames - 1)));
    }
  }

  /**
   * Called by EntityLayer when a new server snapshot arrives.
   * Updates the interpolation target and direction.
   */
  setServerPosition(x: number, y: number, vx: number, vy: number, direction: string) {
    const snapshotDx = x - this.serverX;
    const snapshotDy = y - this.serverY;
    const snapshotDistance = Math.hypot(snapshotDx, snapshotDy);
    const distanceFromRender = Math.hypot(x - this.x, y - this.y);
    const speed = Math.hypot(vx, vy);

    this.serverX = x;
    this.serverY = y;
    this.serverVX = vx;
    this.serverVY = vy;
    this.serverTime = performance.now();
    this.serverIsMoving =
      speed >= NPC.SERVER_SPEED_EPSILON &&
      (snapshotDistance >= NPC.SERVER_MOVE_EPSILON_PX ||
        distanceFromRender >= NPC.SERVER_MOVE_EPSILON_PX);

    // Update facing direction
    const dir = direction as Direction;
    if (dir !== this.lastServerDir) {
      this.lastServerDir = dir;
      this.setDirection(dir);
    }
  }

  updateSemanticPresentation(config: {
    name?: string;
    dialogue?: DialogueLine[];
  }) {
    if (config.name && config.name !== this.name) {
      this.name = config.name;
      this.nameLabel.text = config.name;
    }

    if (config.dialogue && config.dialogue.length > 0) {
      this.dialogue = config.dialogue;
    }
  }

  /** Local wander AI (original logic, only used when !serverDriven) */
  private updateLocalAI(dt: number, isBlocked?: (px: number, py: number) => boolean) {
    this.stateTimer -= dt;

    if (this.stateTimer <= 0) {
      this.transitionState();
    }

    if (this.state === "walking") {
      const nx = this.x + this.moveDir.dx * this.speed * dt;
      const ny = this.y + this.moveDir.dy * this.speed * dt;

      // Stay within wander radius of spawn
      const distSq =
        (nx - this.spawnX) ** 2 + (ny - this.spawnY) ** 2;
      const hitWall = isBlocked ? isBlocked(nx, ny) : false;

      if (distSq < this.wanderRadius ** 2 && !hitWall) {
        this.x = nx;
        this.y = ny;
      } else {
        // Hit wall or boundary — go idle and pick a new direction next time
        this.state = "idle";
        this.stateTimer = 1 + Math.random() * 2;
        this.stopWalkAnim();
      }
    }
  }

  private transitionState() {
    if (this.state === "idle") {
      // Start walking in a random direction
      this.state = "walking";
      this.stateTimer = 1 + Math.random() * 3;
      this.pickRandomDirection();
      this.startWalkAnim();
    } else {
      // Go idle
      this.state = "idle";
      this.stateTimer = 2 + Math.random() * 4;
      this.stopWalkAnim();
    }
  }

  private pickRandomDirection() {
    const dirs: { dx: number; dy: number; dir: Direction }[] = [
      { dx: 0, dy: -1, dir: "up" },
      { dx: 0, dy: 1, dir: "down" },
      { dx: -1, dy: 0, dir: "left" },
      { dx: 1, dy: 0, dir: "right" },
    ];
    const pick = dirs[Math.floor(Math.random() * dirs.length)];
    this.moveDir = { dx: pick.dx, dy: pick.dy };
    this.setDirection(pick.dir);
  }

  private setDirection(dir: Direction) {
    this.direction = dir;
    if (this.sprite && this.spritesheet?.animations) {
      const animKey = this.dirMap[dir];
      const frames = this.spritesheet.animations[animKey];
      if (frames && frames.length > 0) {
        this.sprite.textures = frames;
        const idleFrame = Math.min(1, Math.max(0, frames.length - 1));
        const shouldWalk = this.serverDriven ? this.serverIsMoving : this.state === "walking";
        if (shouldWalk) {
          this.sprite.play();
        } else {
          this.sprite.gotoAndStop(idleFrame);
        }
      }
    }
  }

  private startWalkAnim() {
    if (this.sprite) {
      this.sprite.play();
    }
  }

  private stopWalkAnim() {
    if (this.sprite) {
      this.sprite.gotoAndStop(Math.min(1, Math.max(0, this.sprite.totalFrames - 1)));
    }
  }

  /** Distance to a point (for interaction checks) */
  distanceTo(px: number, py: number): number {
    return Math.sqrt((this.x - px) ** 2 + (this.y - py) ** 2);
  }

  setPromptText(text: string) {
    const trimmed = text.trim();
    this.promptLabelText = trimmed || "[E] Talk";
    this.promptLabel.text = this.promptLabelText;
  }

  /** Show/hide the NPC interaction prompt */
  setPromptVisible(visible: boolean, promptText?: string) {
    if (promptText) {
      this.setPromptText(promptText);
    }
    this._showPrompt = visible;
    this.promptLabel.visible = visible && !this.hasVisibleSpeech();

    // Face the player when they're close
    // (We'll handle this from EntityLayer with the player's relative position)
  }

  /** Turn to face a point (the player) */
  faceToward(px: number, py: number) {
    const dx = px - this.x;
    const dy = py - this.y;
    if (Math.abs(dx) > Math.abs(dy)) {
      this.setDirection(dx > 0 ? "right" : "left");
    } else {
      this.setDirection(dy > 0 ? "down" : "up");
    }
    // Stop walking when interacting
    if (this.state === "walking") {
      this.state = "idle";
      this.stateTimer = 3;
      this.stopWalkAnim();
    }
  }

  showSpeech(text: string, durationMs = 10_000) {
    const trimmed = text.replace(/\s+/g, " ").trim();
    if (!trimmed) return;

    this.ensureSpeechBubble();

    const content = trimmed.length > 160 ? `${trimmed.slice(0, 159).trimEnd()}…` : trimmed;
    this.speechBubbleText!.text = content;

    const padX = 14;
    const padY = 10;
    const bubbleWidth = Math.max(140, Math.min(280, this.speechBubbleText!.width + padX * 2));
    const bubbleHeight = Math.max(42, this.speechBubbleText!.height + padY * 2);

    this.speechBubbleBg!.clear();
    const bubbleRadius = Math.min(28, bubbleHeight / 2);
    this.speechBubbleBg!.roundRect(-bubbleWidth / 2, -bubbleHeight, bubbleWidth, bubbleHeight, bubbleRadius);
    this.speechBubbleBg!.fill({ color: 0x0b1220, alpha: 0.76 });
    this.speechBubbleBg!.stroke({ color: 0xf4f1de, alpha: 0.14, width: 1.25 });

    this.speechBubbleText!.x = 0;
    this.speechBubbleText!.y = -bubbleHeight / 2;
    this.speechBubble!.visible = true;
    this.promptLabel.visible = false;
    this.speechExpiresAt = performance.now() + durationMs;
  }

  hideSpeech() {
    this.speechExpiresAt = 0;
    if (this.speechBubble) {
      this.speechBubble.visible = false;
    }
    this.promptLabel.visible = this._showPrompt;
  }

  hasVisibleSpeech() {
    return Boolean(this.speechBubble?.visible);
  }

  setSpeechLift(lift: number) {
    this.speechLift = Math.max(0, lift);
    this.updateSpeechBubbleAnchor();
  }

  private ensureSpeechBubble() {
    if (this.speechBubble) return;

    this.speechBubble = new Container();
    this.speechBubble.visible = false;

    this.speechBubbleBg = new Graphics();
    this.speechBubble.addChild(this.speechBubbleBg);

    this.speechBubbleText = new Text({
      text: "",
      style: new TextStyle({
        fontSize: 14,
        fill: 0xf4f1de,
        fontFamily: "Inter, sans-serif",
        align: "center",
        wordWrap: true,
        wordWrapWidth: 248,
        lineHeight: 20,
        stroke: { color: 0x000000, width: 2 },
      }),
    });
    this.speechBubbleText.anchor.set(0.5);
    this.speechBubble.addChild(this.speechBubbleText);

    this.uiContainer.addChild(this.speechBubble);
    this.updateSpeechBubbleAnchor();
  }

  private updateSpeechBubbleAnchor() {
    if (!this.speechBubble) return;
    this.speechBubble.x = 0;
    this.speechBubble.y = this.promptLabel.y - 18 - this.speechLift;
  }

  destroy() {
    this.uiContainer.destroy({ children: true });
    this.container.destroy({ children: true });
  }
}
