import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

export default defineSchema({
  ...authTables,

  // ---------------------------------------------------------------------------
  // Maps & tilesets
  // ---------------------------------------------------------------------------
  maps: defineTable({
    schemaVersion: v.optional(v.number()),   // migration version tracker
    name: v.string(),
    width: v.number(), // in tiles
    height: v.number(), // in tiles
    tileWidth: v.number(), // px
    tileHeight: v.number(), // px
    tilesetUrl: v.optional(v.string()), // URL path to tileset (e.g. /assets/tilesets/...)
    tilesetId: v.optional(v.id("_storage")), // tileset PNG in Convex file storage
    tilesetPxW: v.number(),
    tilesetPxH: v.number(),
    layers: v.array(
      v.object({
        name: v.string(),
        type: v.union(
          v.literal("bg"),
          v.literal("obj"),
          v.literal("overlay")
        ),
        tiles: v.string(), // JSON-encoded flat array of tile indices (-1 = empty)
        visible: v.boolean(),
      })
    ),
    animatedTiles: v.optional(v.array(
      v.object({
        tileIndex: v.number(),
        spriteSheetId: v.id("spriteSheets"),
        animation: v.string(),
        speed: v.number(),
      })
    )),
    collisionMask: v.string(), // JSON-encoded flat boolean array
    labels: v.array(
      v.object({
        name: v.string(),
        x: v.number(),
        y: v.number(),
        width: v.number(),
        height: v.number(),
      })
    ),
    // --- Multi-map fields ---
    portals: v.optional(v.array(
      v.object({
        name: v.string(),             // e.g. "door-to-forest"
        x: v.number(),                // zone position (tile coords)
        y: v.number(),
        width: v.number(),            // zone size in tiles
        height: v.number(),
        targetMap: v.string(),         // destination map name
        targetSpawn: v.string(),       // spawn label on destination map
        direction: v.optional(v.string()),  // facing direction on arrival
        transition: v.optional(v.string()), // "fade" | "instant" (default "fade")
      })
    )),
    animationUrl: v.optional(v.string()),    // URL to animated-tile descriptor JSON
    musicUrl: v.optional(v.string()),        // background music path
    ambientSoundUrl: v.optional(v.string()), // ambient sound loop (rain, wind)
    combatEnabled: v.optional(v.boolean()),  // is combat allowed on this map?
    status: v.optional(v.string()),          // "draft" | "published" (default "published")
    mapType: v.optional(v.string()),         // "public" | "private" | "system" (default "private")
    editors: v.optional(v.array(v.id("profiles"))), // per-map editor list
    creatorProfileId: v.optional(v.id("profiles")),
    createdBy: v.optional(v.id("users")),    // user who created this map (for ownership checks)
    updatedAt: v.number(),
  }).index("by_name", ["name"]),

  // ---------------------------------------------------------------------------
  // Sprite sheets
  // ---------------------------------------------------------------------------
  spriteSheets: defineTable({
    name: v.string(),
    imageId: v.id("_storage"),
    frameWidth: v.number(),
    frameHeight: v.number(),
    // PixiJS spritesheet format — keys are frame names, values are frame rects.
    // Dynamic key-value maps, so we use v.record() rather than v.any().
    frames: v.record(v.string(), v.object({
      frame: v.object({ x: v.number(), y: v.number(), w: v.number(), h: v.number() }),
      rotated: v.optional(v.boolean()),
      trimmed: v.optional(v.boolean()),
      spriteSourceSize: v.optional(v.object({
        x: v.number(), y: v.number(), w: v.number(), h: v.number(),
      })),
      sourceSize: v.optional(v.object({ w: v.number(), h: v.number() })),
    })),
    animations: v.record(v.string(), v.array(v.string())), // { rowName: [frameNames] }
    createdBy: v.id("users"),
  }).index("by_name", ["name"]),

  // ---------------------------------------------------------------------------
  // Sprite definitions (prefabs created in the sprite editor)
  // ---------------------------------------------------------------------------
  spriteDefinitions: defineTable({
    name: v.string(),
    spriteSheetUrl: v.string(),       // path to the JSON sprite sheet
    defaultAnimation: v.string(),     // e.g. "row0"
    animationSpeed: v.number(),       // frames per second (0.1 = slow, 0.5 = fast)
    anchorX: v.number(),              // 0–1, default 0.5
    anchorY: v.number(),              // 0–1, default 1.0 (bottom-center)
    scale: v.number(),                // rendering scale multiplier
    isCollidable: v.boolean(),        // should block player movement?
    category: v.string(),             // "object" | "npc"
    frameWidth: v.number(),           // px
    frameHeight: v.number(),          // px
    // NPC-specific fields (only used when category === "npc")
    npcSpeed: v.optional(v.number()),         // movement speed (px/sec)
    npcWanderRadius: v.optional(v.number()),  // wander radius (px)
    npcDirDown: v.optional(v.string()),       // animation row for facing down
    npcDirUp: v.optional(v.string()),         // animation row for facing up
    npcDirLeft: v.optional(v.string()),       // animation row for facing left
    npcDirRight: v.optional(v.string()),      // animation row for facing right
    npcGreeting: v.optional(v.string()),      // default greeting text
    // Sound fields (any category)
    ambientSoundUrl: v.optional(v.string()),  // looping ambient sound (e.g. fire crackle)
    ambientSoundRadius: v.optional(v.number()), // audible radius in px (default 200)
    ambientSoundVolume: v.optional(v.number()), // base volume 0–1 (default 0.5)
    interactSoundUrl: v.optional(v.string()),   // one-shot sound on interact (e.g. NPC greeting)
    // Toggleable on/off state (e.g. fireplace, lamp)
    toggleable: v.optional(v.boolean()),         // if true, player can toggle on/off
    onAnimation: v.optional(v.string()),         // animation to play when "on" (defaults to defaultAnimation)
    offAnimation: v.optional(v.string()),        // animation to play when "off" (static first frame)
    onSoundUrl: v.optional(v.string()),          // ambient sound when "on" (overrides ambientSoundUrl)
    // Door (4-state: closed → opening → open → closing → closed)
    isDoor: v.optional(v.boolean()),             // if true, this sprite acts as a door
    doorClosedAnimation: v.optional(v.string()), // idle animation when closed
    doorOpeningAnimation: v.optional(v.string()), // transition: closed → open (plays once)
    doorOpenAnimation: v.optional(v.string()),   // idle animation when open
    doorClosingAnimation: v.optional(v.string()), // transition: open → closed (plays once)
    doorOpenSoundUrl: v.optional(v.string()),    // one-shot sound when door opens
    doorCloseSoundUrl: v.optional(v.string()),   // one-shot sound when door closes
    visibilityType: v.optional(v.string()),      // "public" | "private" | "system" (legacy undefined => system)
    createdByUser: v.optional(v.id("users")),    // owner user for private/public assets
    updatedAt: v.number(),
  })
    .index("by_name", ["name"])
    .index("by_visibilityType", ["visibilityType"])
    .index("by_createdByUser", ["createdByUser"]),

  // ---------------------------------------------------------------------------
  // NPC profiles (identity, backstory, personality — for LLM feeding)
  // Keyed by unique instance name, so the same sprite def can have multiple
  // personalities placed across different maps.
  // ---------------------------------------------------------------------------
  npcProfiles: defineTable({
    name: v.string(),                  // unique instance name (e.g. "elara", "bob-merchant")
    spriteDefName: v.string(),         // links to spriteDefinitions.name (the sprite)
    mapName: v.optional(v.string()),   // which map this instance lives on
    displayName: v.string(),           // in-world display name (e.g. "Elara the Herbalist")
    title: v.optional(v.string()),     // short title/role (e.g. "Village Herbalist")
    backstory: v.optional(v.string()), // rich backstory text
    personality: v.optional(v.string()),  // personality traits / description
    dialogueStyle: v.optional(v.string()), // how they speak (formal, cryptic, friendly, etc.)
    systemPrompt: v.optional(v.string()), // full LLM system prompt (auto-generated or hand-written)
    faction: v.optional(v.string()),    // affiliation (e.g. "Merchants Guild", "Forest Druids")
    knowledge: v.optional(v.string()), // things this NPC knows about the world
    secrets: v.optional(v.string()),   // things the NPC hides from players
    relationships: v.optional(v.array(v.object({
      npcName: v.string(),            // instance name of related NPC
      relation: v.string(),           // e.g. "rival", "sibling", "mentor"
      notes: v.optional(v.string()),
    }))),
    stats: v.optional(v.object({       // combat / RPG stats
      hp: v.number(),
      maxHp: v.number(),
      atk: v.number(),
      def: v.number(),
      spd: v.number(),
      level: v.number(),
    })),
    items: v.optional(v.array(v.object({  // NPC inventory (for shops, drops, etc.)
      name: v.string(),
      quantity: v.number(),
    }))),
    currencies: v.optional(v.record(v.string(), v.number())), // simple in-world wallet for NPC trading
    desiredItem: v.optional(v.string()),   // lightweight goal for local agent trading
    tags: v.optional(v.array(v.string())), // general-purpose tags (e.g. "shopkeeper", "quest-giver")
    visibilityType: v.optional(v.string()), // "public" | "private" | "system" (legacy undefined => system)
    createdByUser: v.optional(v.id("users")), // owner user for private/public NPC profiles
    updatedAt: v.number(),
  })
    .index("by_name", ["name"])
    .index("by_spriteDefName", ["spriteDefName"])
    .index("by_visibilityType", ["visibilityType"])
    .index("by_createdByUser", ["createdByUser"]),

  // ---------------------------------------------------------------------------
  // Map objects (sprite instances placed on a map)
  // ---------------------------------------------------------------------------
  mapObjects: defineTable({
    mapName: v.string(),              // which map this object belongs to
    spriteDefName: v.string(),        // references spriteDefinitions.name
    instanceName: v.optional(v.string()), // unique NPC instance name (links to npcProfiles.name)
    x: v.float64(),                   // world-space X (pixels)
    y: v.float64(),                   // world-space Y (pixels)
    scaleOverride: v.optional(v.number()),
    flipX: v.optional(v.boolean()),
    layer: v.number(),                // z-ordering layer (0 = ground, higher = above)
    isOn: v.optional(v.boolean()),    // toggle state for toggleable objects (true = on)
    updatedAt: v.number(),
  })
    .index("by_map", ["mapName"])
    .index("by_map_sprite", ["mapName", "spriteDefName"]),

  // ---------------------------------------------------------------------------
  // Semantic world layer
  // ---------------------------------------------------------------------------
  worldZones: defineTable({
    mapName: v.string(),
    zoneKey: v.string(),               // stable per-map identifier
    name: v.string(),
    description: v.optional(v.string()),
    zoneType: v.string(),              // "guide" | "trade" | "rest" | "entry" | etc.
    x: v.number(),                     // tile-space rect
    y: v.number(),
    width: v.number(),
    height: v.number(),
    tags: v.array(v.string()),
    accessType: v.optional(v.string()), // "public" | "restricted" | "premium"
    metadataJson: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_map", ["mapName"])
    .index("by_map_zoneKey", ["mapName", "zoneKey"]),

  semanticObjects: defineTable({
    mapName: v.string(),
    objectKey: v.string(),             // stable semantic identifier
    label: v.string(),
    objectType: v.string(),            // "npc-post" | "consumable" | "media" | "weapon" | "terminal"
    sourceType: v.string(),            // "mapObject" | "scene" | "virtual"
    mapObjectId: v.optional(v.id("mapObjects")),
    zoneKey: v.optional(v.string()),
    x: v.optional(v.float64()),        // world-space anchor if known
    y: v.optional(v.float64()),
    tags: v.array(v.string()),
    affordances: v.array(v.string()),  // "inspect" | "buy" | "listen" | "query" | etc.
    valueClass: v.optional(v.string()), // "utility" | "premium" | "decor" | "trade"
    linkedAgentId: v.optional(v.string()),
    triggerType: v.optional(v.string()),   // "interact" | "proximity" | "timed" | "payment-complete"
    freeActions: v.optional(v.array(v.string())),
    paidActions: v.optional(v.array(v.string())),
    premiumOfferKey: v.optional(v.string()),
    interactionPrompt: v.optional(v.string()),
    interactionSummary: v.optional(v.string()),
    inspectEventType: v.optional(v.string()),
    interactEventType: v.optional(v.string()),
    paidEventType: v.optional(v.string()),
    roomLabel: v.optional(v.string()),
    itemDefName: v.optional(v.string()),
    stateJson: v.optional(v.string()),
    metadataJson: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_map", ["mapName"])
    .index("by_map_objectKey", ["mapName", "objectKey"])
    .index("by_map_zoneKey", ["mapName", "zoneKey"]),

  npcRoleAssignments: defineTable({
    agentId: v.string(),               // npc profile / agent id, e.g. guide-btc
    mapName: v.string(),
    roleKey: v.string(),               // "guide" | "merchant" | "dj" | etc.
    displayRole: v.optional(v.string()),
    behaviorMode: v.optional(v.string()), // "at-post" | "patrol" | "service"
    homeZoneKey: v.optional(v.string()),
    postObjectKey: v.optional(v.string()),
    permissions: v.array(v.string()),
    metadataJson: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_agentId", ["agentId"])
    .index("by_map_roleKey", ["mapName", "roleKey"]),

  worldFacts: defineTable({
    mapName: v.optional(v.string()),
    factKey: v.string(),
    factType: v.string(),             // "flag" | "status" | "access" | "economy"
    valueJson: v.string(),
    scope: v.optional(v.string()),    // "world" | "agent" | "object" | "player"
    subjectId: v.optional(v.string()),
    source: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_factKey", ["factKey"])
    .index("by_map_factKey", ["mapName", "factKey"]),

  worldEvents: defineTable({
    mapName: v.optional(v.string()),
    worldId: v.optional(v.string()),
    eventType: v.string(),            // "spawned" | "inspected" | "offered" | "paid" | etc.
    sourceType: v.optional(v.string()),
    sourceId: v.optional(v.string()),
    actorId: v.optional(v.string()),
    targetId: v.optional(v.string()),
    objectKey: v.optional(v.string()),
    zoneKey: v.optional(v.string()),
    tileX: v.optional(v.number()),
    tileY: v.optional(v.number()),
    summary: v.string(),
    payloadJson: v.optional(v.string()),
    detailsJson: v.optional(v.string()),
    timestamp: v.number(),
  })
    .index("by_map_time", ["mapName", "timestamp"])
    .index("by_actor_time", ["actorId", "timestamp"]),

  chainhookReceipts: defineTable({
    dedupeKey: v.string(),
    txHash: v.optional(v.string()),
    blockHash: v.optional(v.string()),
    chain: v.string(),
    network: v.string(),
    eventType: v.string(),
    status: v.string(),               // "applied" | "rolled-back"
    source: v.optional(v.string()),
    payloadJson: v.string(),
    relatedFactKey: v.optional(v.string()),
    relatedEventId: v.optional(v.id("worldEvents")),
    updatedAt: v.number(),
  })
    .index("by_dedupeKey", ["dedupeKey"])
    .index("by_txHash", ["txHash"]),

  // ---------------------------------------------------------------------------
  // Profiles (auth-linked player characters)
  // ---------------------------------------------------------------------------
  profiles: defineTable({
    schemaVersion: v.optional(v.number()),     // migration version tracker
    userId: v.optional(v.id("users")),         // owning user (optional during migration)
    name: v.string(),                          // display name
    spriteUrl: v.string(),                     // path to sprite sheet JSON
    color: v.string(),                         // fallback colour hex e.g. "#6c5ce7"
    role: v.optional(v.string()),               // "superuser" | "player"
    stats: v.object({
      hp: v.number(),
      maxHp: v.number(),
      atk: v.number(),
      def: v.number(),
      spd: v.number(),
      level: v.number(),
      xp: v.number(),
    }),
    items: v.array(v.object({                  // basic inventory
      name: v.string(),
      quantity: v.number(),
    })),
    npcsChatted: v.array(v.string()),          // names of NPCs spoken to
    mapName: v.optional(v.string()),           // last map the player was on
    startLabel: v.optional(v.string()),        // preferred spawn label for initial entry
    x: v.optional(v.float64()),               // last known X
    y: v.optional(v.float64()),               // last known Y
    direction: v.optional(v.string()),        // last facing direction
    createdAt: v.number(),
  })
    .index("by_name", ["name"])
    .index("by_user", ["userId"]),

  // ---------------------------------------------------------------------------
  // Players (auth-linked – kept for future real auth)
  // ---------------------------------------------------------------------------
  players: defineTable({
    userId: v.id("users"),
    name: v.string(),
    mapId: v.optional(v.id("maps")),
    x: v.float64(),
    y: v.float64(),
    direction: v.string(),
    spriteSheetId: v.optional(v.id("spriteSheets")),
    animation: v.string(),
    stats: v.object({
      hp: v.number(),
      maxHp: v.number(),
      atk: v.number(),
      def: v.number(),
      spd: v.number(),
      level: v.number(),
      xp: v.number(),
    }),
  })
    .index("by_user", ["userId"])
    .index("by_map", ["mapId"]),

  // ---------------------------------------------------------------------------
  // Presence (ephemeral positions, cleaned up on disconnect)
  // ---------------------------------------------------------------------------
  presence: defineTable({
    profileId: v.id("profiles"),               // which profile is online
    mapName: v.optional(v.string()),           // which map they're on
    x: v.float64(),
    y: v.float64(),
    vx: v.float64(),                           // velocity px/s (for extrapolation)
    vy: v.float64(),                           // velocity px/s (for extrapolation)
    direction: v.string(),
    animation: v.string(),
    spriteUrl: v.string(),                     // for rendering remote players
    name: v.string(),                          // denormalized for display
    lastSeen: v.number(),
  })
    .index("by_map", ["mapName"])
    .index("by_profile", ["profileId"]),

  // ---------------------------------------------------------------------------
  // NPCs (legacy — kept for dialogue tree references)
  // ---------------------------------------------------------------------------
  npcs: defineTable({
    name: v.string(),
    mapId: v.id("maps"),
    x: v.float64(),
    y: v.float64(),
    spriteSheetId: v.optional(v.id("spriteSheets")),
    animation: v.string(),
    systemPrompt: v.optional(v.string()),
    behavior: v.optional(v.string()),
  }).index("by_map", ["mapId"]),

  // ---------------------------------------------------------------------------
  // NPC runtime state (server-authoritative movement)
  // ---------------------------------------------------------------------------
  npcState: defineTable({
    mapName: v.string(),
    mapObjectId: v.id("mapObjects"),      // link to the placed object
    spriteDefName: v.string(),            // for looking up rendering config
    instanceName: v.optional(v.string()), // unique NPC instance name (from mapObjects)
    x: v.float64(),                       // current position
    y: v.float64(),
    spawnX: v.float64(),                  // original placement position
    spawnY: v.float64(),
    direction: v.string(),                // "up" | "down" | "left" | "right"
    vx: v.float64(),                      // current velocity (for client extrapolation)
    vy: v.float64(),
    speed: v.float64(),                   // movement speed px/sec
    wanderRadius: v.float64(),
    targetX: v.optional(v.float64()),     // wander target (null = idle)
    targetY: v.optional(v.float64()),
    idleUntil: v.optional(v.number()),    // timestamp: don't move until this time
    currentIntent: v.optional(v.string()), // lightweight agent intent for dialogue/UI
    intentDetail: v.optional(v.string()),
    mood: v.optional(v.string()),
    lastTradeAt: v.optional(v.number()),
    lastTick: v.number(),                 // timestamp of last server update
  })
    .index("by_map", ["mapName"])
    .index("by_mapObject", ["mapObjectId"]),

  // ---------------------------------------------------------------------------
  // Chat messages
  // ---------------------------------------------------------------------------
  messages: defineTable({
    mapName: v.optional(v.string()),
    profileId: v.optional(v.id("profiles")),  // null for system messages
    senderName: v.string(),                   // denormalized for display
    text: v.string(),
    type: v.union(
      v.literal("chat"),
      v.literal("npc"),
      v.literal("system")
    ),
    timestamp: v.number(),
  }).index("by_map_time", ["mapName", "timestamp"]),

  // ---------------------------------------------------------------------------
  // Story tables
  // ---------------------------------------------------------------------------
  quests: defineTable({
    name: v.string(),
    description: v.string(),
    steps: v.array(v.object({
      description: v.string(),
      type: v.optional(v.string()),    // "kill" | "collect" | "talk" | "reach" | etc.
      target: v.optional(v.string()),  // NPC name, item name, label name
      count: v.optional(v.number()),   // required amount
      optional: v.optional(v.boolean()),
    })),
    prerequisites: v.array(v.id("quests")),
    rewards: v.object({
      items: v.optional(v.array(v.object({ name: v.string(), quantity: v.number() }))),
      xp: v.optional(v.number()),
      currency: v.optional(v.record(v.string(), v.number())),
    }),
  }).index("by_name", ["name"]),

  questProgress: defineTable({
    playerId: v.id("players"),
    questId: v.id("quests"),
    currentStep: v.number(),
    status: v.union(
      v.literal("active"),
      v.literal("completed"),
      v.literal("failed")
    ),
    choices: v.record(v.string(), v.string()), // step key -> chosen branch
  })
    .index("by_player", ["playerId"])
    .index("by_player_quest", ["playerId", "questId"]),

  dialogueTrees: defineTable({
    npcId: v.optional(v.id("npcs")),
    triggerId: v.optional(v.string()),
    nodes: v.array(v.object({
      id: v.string(),
      text: v.string(),
      speaker: v.optional(v.string()),
      choices: v.optional(v.array(v.object({
        text: v.string(),
        nextNodeId: v.optional(v.string()),
        condition: v.optional(v.string()),
      }))),
      nextNodeId: v.optional(v.string()),
      action: v.optional(v.string()),
    })),
    metadata: v.optional(v.object({
      title: v.optional(v.string()),
      description: v.optional(v.string()),
      tags: v.optional(v.array(v.string())),
    })),
  }).index("by_npc", ["npcId"]),

  lore: defineTable({
    key: v.string(),
    title: v.string(),
    content: v.string(),
    category: v.union(
      v.literal("world"),
      v.literal("character"),
      v.literal("item")
    ),
    discoverable: v.boolean(),
    discoveredBy: v.array(v.id("players")),
    draft: v.optional(v.boolean()),
  }).index("by_key", ["key"]),

  storyEvents: defineTable({
    mapId: v.optional(v.id("maps")),
    triggerId: v.string(),
    type: v.string(), // "enter-zone" | "interact" | "combat-end" | etc.
    conditions: v.optional(v.object({
      requiredQuest: v.optional(v.string()),
      requiredItem: v.optional(v.string()),
      minLevel: v.optional(v.number()),
      flag: v.optional(v.string()),
    })),
    script: v.array(v.object({
      action: v.string(),       // "dialogue" | "give-item" | "teleport" | "set-flag" | etc.
      args: v.optional(v.record(v.string(), v.string())),
    })),
  }).index("by_map", ["mapId"]),

  // ---------------------------------------------------------------------------
  // Mechanics tables
  // ---------------------------------------------------------------------------
  itemDefs: defineTable({
    name: v.string(),                  // unique slug (e.g. "iron-sword", "health-potion")
    displayName: v.string(),           // pretty display name
    description: v.string(),           // flavour / tooltip text
    type: v.union(
      v.literal("weapon"),
      v.literal("armor"),
      v.literal("accessory"),
      v.literal("consumable"),
      v.literal("material"),
      v.literal("key"),
      v.literal("currency"),
      v.literal("quest"),
      v.literal("misc")
    ),
    rarity: v.union(
      v.literal("common"),
      v.literal("uncommon"),
      v.literal("rare"),
      v.literal("epic"),
      v.literal("legendary"),
      v.literal("unique")             // one-of-a-kind, cannot be duplicated
    ),
    iconUrl: v.optional(v.string()),   // path to icon image/sprite
    iconSpriteSheetId: v.optional(v.id("spriteSheets")),
    // Tileset-based icon (crop from a tileset image)
    iconTilesetUrl: v.optional(v.string()),  // tileset image path
    iconTileX: v.optional(v.number()),       // crop X in px
    iconTileY: v.optional(v.number()),       // crop Y in px
    iconTileW: v.optional(v.number()),       // crop width in px
    iconTileH: v.optional(v.number()),       // crop height in px
    // Stats / properties
    stats: v.optional(v.object({
      atk: v.optional(v.number()),
      def: v.optional(v.number()),
      spd: v.optional(v.number()),
      hp: v.optional(v.number()),          // flat HP bonus
      maxHp: v.optional(v.number()),       // max HP bonus
    })),
    effects: v.optional(v.array(v.object({  // special effects / properties
      type: v.string(),                     // e.g. "heal", "buff", "poison", "teleport"
      value: v.optional(v.number()),        // magnitude
      duration: v.optional(v.number()),     // seconds (for buffs/debuffs)
      description: v.optional(v.string()),  // human-readable
    }))),
    equipSlot: v.optional(v.string()),      // "weapon" | "head" | "body" | "legs" | "feet" | "accessory" | null
    levelRequirement: v.optional(v.number()),
    stackable: v.boolean(),
    maxStack: v.optional(v.number()),       // max per stack (default 99)
    value: v.number(),                      // base currency value
    isUnique: v.optional(v.boolean()),      // true = only one can exist in the game
    tags: v.optional(v.array(v.string())),  // freeform tags (e.g. "fire", "cursed", "two-handed")
    lore: v.optional(v.string()),           // extended lore text
    pickupSoundUrl: v.optional(v.string()), // one-shot SFX played when picked up
    createdBy: v.optional(v.id("profiles")),
    visibilityType: v.optional(v.string()), // "public" | "private" | "system" (legacy undefined => system)
    createdByUser: v.optional(v.id("users")), // owner user for private/public assets
    updatedAt: v.number(),
  })
    .index("by_name", ["name"])
    .index("by_visibilityType", ["visibilityType"])
    .index("by_createdByUser", ["createdByUser"]),

  // ---------------------------------------------------------------------------
  // World items (items placed on maps — can be picked up by players)
  // ---------------------------------------------------------------------------
  worldItems: defineTable({
    mapName: v.string(),
    itemDefName: v.string(),         // references itemDefs.name
    x: v.float64(),
    y: v.float64(),
    quantity: v.number(),            // how many of this item the pickup gives
    respawn: v.optional(v.boolean()), // if true, reappears after pickup (for common items)
    respawnMs: v.optional(v.number()), // respawn delay in ms
    pickedUpAt: v.optional(v.number()), // timestamp of last pickup (null = available)
    pickedUpBy: v.optional(v.id("profiles")),
    placedBy: v.optional(v.id("profiles")),
    updatedAt: v.number(),
  })
    .index("by_map", ["mapName"]),

  inventories: defineTable({
    playerId: v.id("players"),
    slots: v.array(v.object({
      itemDefName: v.string(),
      quantity: v.number(),
      metadata: v.optional(v.record(v.string(), v.string())),
    })),
  }).index("by_player", ["playerId"]),

  combatEncounters: defineTable({
    enemies: v.array(v.object({
      npcName: v.optional(v.string()),
      level: v.number(),
      stats: v.object({
        hp: v.number(),
        maxHp: v.number(),
        atk: v.number(),
        def: v.number(),
        spd: v.number(),
      }),
    })),
    rewards: v.object({
      items: v.optional(v.array(v.object({ name: v.string(), quantity: v.number() }))),
      xp: v.optional(v.number()),
      currency: v.optional(v.record(v.string(), v.number())),
    }),
    mapId: v.optional(v.id("maps")),
    triggerLabel: v.optional(v.string()),
  }).index("by_map", ["mapId"]),

  combatLog: defineTable({
    encounterId: v.id("combatEncounters"),
    playerId: v.id("players"),
    turns: v.array(v.object({
      actor: v.string(),         // "player" or NPC name
      action: v.string(),        // "attack" | "defend" | "skill" | "item" | "flee"
      target: v.optional(v.string()),
      damage: v.optional(v.number()),
      heal: v.optional(v.number()),
    })),
    outcome: v.union(
      v.literal("victory"),
      v.literal("defeat"),
      v.literal("flee")
    ),
    timestamp: v.number(),
  }).index("by_player", ["playerId"]),

  wallets: defineTable({
    playerId: v.id("players"),
    currencies: v.record(v.string(), v.number()), // currency-name -> amount
  }).index("by_player", ["playerId"]),

  shops: defineTable({
    npcId: v.id("npcs"),
    inventory: v.array(v.object({
      itemDefName: v.string(),
      price: v.number(),
      stock: v.optional(v.number()), // null = unlimited
    })),
    mapId: v.optional(v.id("maps")),
  }).index("by_npc", ["npcId"]),

  // ---------------------------------------------------------------------------
  // External ecosystem cache
  // ---------------------------------------------------------------------------
  externalUsers: defineTable({
    source: v.string(),                // e.g. "zeroAuthority"
    externalId: v.string(),
    stxAddress: v.optional(v.string()),
    username: v.string(),
    avatarUrl: v.optional(v.string()),
    bio: v.optional(v.string()),
    twitter: v.optional(v.string()),
    discord: v.optional(v.string()),
    telegram: v.optional(v.string()),
    website: v.optional(v.string()),
    githubUrl: v.optional(v.string()),
    linkedin: v.optional(v.string()),
    bnsName: v.optional(v.string()),
    btcAddress: v.optional(v.string()),
    isXProfileVerified: v.optional(v.boolean()),
    isDiscordProfileVerified: v.optional(v.boolean()),
    isTelegramProfileVerified: v.optional(v.boolean()),
    profileCompleteness: v.optional(v.number()),
    activityScore: v.optional(v.number()),
    servicesJson: v.optional(v.string()),
    organizationsJson: v.optional(v.string()),
    rawJson: v.string(),
    syncedAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_source_externalId", ["source", "externalId"])
    .index("by_source_stxAddress", ["source", "stxAddress"])
    .index("by_source_username", ["source", "username"]),

  externalOrganizations: defineTable({
    source: v.string(),
    externalId: v.string(),
    name: v.string(),
    bio: v.optional(v.string()),
    logo: v.optional(v.string()),
    website: v.optional(v.string()),
    twitter: v.optional(v.string()),
    telegram: v.optional(v.string()),
    instagram: v.optional(v.string()),
    network: v.optional(v.string()),
    adminExternalId: v.optional(v.string()),
    rawJson: v.string(),
    syncedAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_source_externalId", ["source", "externalId"])
    .index("by_source_name", ["source", "name"]),

  externalOpportunities: defineTable({
    source: v.string(),
    opportunityType: v.union(
      v.literal("bounty"),
      v.literal("grant"),
      v.literal("quest"),
      v.literal("gig"),
      v.literal("service"),
    ),
    externalId: v.string(),
    slug: v.optional(v.string()),
    title: v.string(),
    summary: v.optional(v.string()),
    status: v.optional(v.string()),
    category: v.optional(v.string()),
    organizationName: v.optional(v.string()),
    creatorName: v.optional(v.string()),
    creatorStxAddress: v.optional(v.string()),
    tokenSymbol: v.optional(v.string()),
    tokenAddress: v.optional(v.string()),
    rewardAmount: v.optional(v.string()),
    rewardUnit: v.optional(v.string()),
    sourceUrl: v.optional(v.string()),
    startsAt: v.optional(v.number()),
    endsAt: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
    rawJson: v.string(),
    syncedAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_source_externalId", ["source", "externalId"])
    .index("by_source_type", ["source", "opportunityType"])
    .index("by_source_type_status", ["source", "opportunityType", "status"]),

  externalSyncLog: defineTable({
    source: v.string(),
    syncType: v.string(),              // "users" | "organizations" | "opportunities"
    status: v.string(),                // "started" | "success" | "error"
    startedAt: v.number(),
    finishedAt: v.optional(v.number()),
    recordsFetched: v.optional(v.number()),
    recordsUpserted: v.optional(v.number()),
    error: v.optional(v.string()),
    metadataJson: v.optional(v.string()),
  }).index("by_source_startedAt", ["source", "startedAt"]),

  externalMarketSnapshots: defineTable({
    source: v.string(),                // e.g. "tenero"
    snapshotType: v.string(),          // e.g. "market-overview" | "wallet-analytics"
    scope: v.optional(v.string()),     // e.g. "stacks" | wallet address | token id
    title: v.optional(v.string()),
    summary: v.optional(v.string()),
    rawJson: v.string(),
    syncedAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_source_snapshotType", ["source", "snapshotType"])
    .index("by_source_scope", ["source", "scope"]),

  agentStates: defineTable({
    agentId: v.string(),               // npc instance name, future agent id, or external agent key
    agentType: v.string(),             // "npc" | "service" | "external"
    state: v.string(),                 // "idle" | "teaching" | "guiding" | "offering-premium" | etc.
    mood: v.optional(v.string()),
    currentIntent: v.optional(v.string()),
    memorySummary: v.optional(v.string()),
    contextJson: v.optional(v.string()),
    transitionsJson: v.optional(v.string()),
    budgetPolicyJson: v.optional(v.string()),
    lastAiCallAt: v.optional(v.number()),
    nextAiAllowedAt: v.optional(v.number()),
    aiCallsToday: v.optional(v.number()),
    aiWindowStartedAt: v.optional(v.number()),
    lastEpochAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_agentId", ["agentId"])
    .index("by_agentType_state", ["agentType", "state"]),

  agentRegistry: defineTable({
    agentId: v.string(),               // stable in-world id, e.g. "guide-btc"
    displayName: v.string(),
    network: v.string(),               // "testnet" | "mainnet"
    walletAddress: v.optional(v.string()),
    walletProvider: v.optional(v.string()), // "aibtc" | "xverse" | "turnkey"
    walletStatus: v.optional(v.string()),   // "planned" | "active-testnet" | "active-mainnet"
    bnsName: v.optional(v.string()),
    agentType: v.string(),             // "npc" | "service" | "external-aibtc"
    roleKey: v.string(),               // "guide" | "market" | "quests" | etc.
    permissionTier: v.string(),        // "identity-only" | "service" | "execution"
    status: v.string(),                // "active" | "planned" | "disabled"
    homeWorld: v.optional(v.string()),
    homeMap: v.optional(v.string()),
    homeZoneKey: v.optional(v.string()),
    supportedAssets: v.array(v.string()), // "STX" | "sBTC" | "USDCx"
    testnetAddress: v.optional(v.string()),
    mainnetAddress: v.optional(v.string()),
    lineageSource: v.optional(v.string()), // "bitflow-tutorial-1" | "aibtc-template"
    lineageRef: v.optional(v.string()),    // "market-btc-m1" | "guide-btc-t1"
    metadataJson: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_agentId", ["agentId"])
    .index("by_network_status", ["network", "status"])
    .index("by_role_status", ["roleKey", "status"]),

  agentAccountBindings: defineTable({
    agentId: v.string(),
    network: v.string(),
    ownerAddress: v.optional(v.string()),
    agentAddress: v.optional(v.string()),
    walletProvider: v.optional(v.string()),
    walletStatus: v.optional(v.string()),
    accountContractId: v.optional(v.string()),
    allowlistedContracts: v.array(v.string()),
    canPropose: v.boolean(),
    canApproveContracts: v.boolean(),
    canTradeAssets: v.boolean(),
    status: v.string(),                // "planned" | "bound" | "disabled"
    testnetAddress: v.optional(v.string()),
    mainnetAddress: v.optional(v.string()),
    lineageSource: v.optional(v.string()),
    lineageRef: v.optional(v.string()),
    metadataJson: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_agentId", ["agentId"])
    .index("by_network_status", ["network", "status"]),

  walletIdentities: defineTable({
    walletId: v.string(),             // stable binding key, e.g. "guide-btc:execution:testnet"
    network: v.string(),              // "testnet" | "mainnet"
    address: v.string(),              // STX address or future contract/account address
    linkedTestnetAddress: v.optional(v.string()),
    linkedMainnetAddress: v.optional(v.string()),
    bnsName: v.optional(v.string()),
    ownerType: v.string(),            // "player" | "agent" | "service"
    ownerId: v.string(),              // profile id, agent id, or service key
    walletRole: v.string(),           // "payer" | "receiver" | "identity" | "execution"
    provider: v.optional(v.string()), // "xverse" | "leather" | "hiro" | "aibtc" | "turnkey"
    custodyType: v.string(),          // "browser" | "server" | "contract" | "external"
    status: v.string(),               // "planned" | "active" | "disabled"
    lineageSource: v.optional(v.string()),
    lineageRef: v.optional(v.string()),
    metadataJson: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_walletId", ["walletId"])
    .index("by_network_address", ["network", "address"])
    .index("by_owner", ["ownerType", "ownerId"])
    .index("by_role_status", ["walletRole", "status"]),

  signedIntents: defineTable({
    intentKey: v.string(),            // stable key from client or backend coordinator
    network: v.string(),
    standard: v.string(),             // "sip-018" | future variants
    signerAddress: v.string(),
    signerRole: v.string(),           // "player" | "agent" | "service"
    subjectType: v.string(),          // "agent" | "offer" | "room" | "object"
    subjectId: v.string(),
    intentType: v.string(),           // "approve" | "quote" | "enter-room" | "agent-policy"
    payloadJson: v.string(),
    signature: v.string(),
    status: v.string(),               // "active" | "consumed" | "expired" | "revoked"
    expiresAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_intentKey", ["intentKey"])
    .index("by_signer_time", ["signerAddress", "updatedAt"])
    .index("by_subject_status", ["subjectType", "subjectId", "status"]),

  premiumContentOffers: defineTable({
    offerKey: v.string(),              // stable identifier, e.g. "guide-btc-premium-brief"
    agentId: v.string(),
    title: v.string(),
    description: v.string(),
    provider: v.string(),              // "x402-stacks" | "mock" | "manual"
    priceAsset: v.string(),            // "STX" | "sBTC"
    priceAmount: v.string(),           // store as string to avoid precision assumptions
    network: v.optional(v.string()),   // "testnet" | "mainnet" | "stacks:1"
    endpointPath: v.optional(v.string()),
    mapName: v.optional(v.string()),
    zoneKey: v.optional(v.string()),
    objectKey: v.optional(v.string()),
    sourceType: v.optional(v.string()),   // "agent" | "interactable" | "terminal"
    deliveryType: v.optional(v.string()), // "npc-briefing" | "lore-packet" | "quote-json"
    unlockEventType: v.optional(v.string()),
    unlockFactKey: v.optional(v.string()),
    resourceId: v.optional(v.string()),
    receiverAddress: v.optional(v.string()),
    mainnetExecutionAddress: v.optional(v.string()),
    status: v.string(),                // "draft" | "active" | "disabled"
    metadataJson: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_offerKey", ["offerKey"])
    .index("by_agentId_status", ["agentId", "status"]),
});
