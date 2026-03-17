import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { getRequestUserId } from "./lib/getRequestUserId";
import { buildWorldEventRecord } from "./lib/worldEvents";

const DEMO_MAP = "Cozy Cabin";
const DEMO_SPRITE_DEF = "local-guide-npc";
const DEMO_GUIDE_SCALE = 1.14;
const DEMO_INSTANCE = "guide-btc";
const LEGACY_DEMO_INSTANCE = "mira-guide";
const DEMO_TRADER_DEF = "local-merchant-npc";
const DEMO_TRADER_INSTANCE = "toma-merchant";
const MARKET_SPRITE_DEF = "local-market-npc";
const MARKET_INSTANCE = "market-btc";
const MARKET_MAINNET_EXECUTION_ADDRESS = "SP1SRTS9MKZH8ZNFRBYFWM9WA75KVK2AZ8K1JSSD7";
const MARKET_TESTNET_EXECUTION_ADDRESS = "ST3EGPYCJ8JTC9QETJHM2T47ZCCWNM9VX98ZEPXWT";
const GUIDE_TESTNET_EXECUTION_ADDRESS = "ST3P76BS18H1QZN8HCQKYRHRAT9GC2XTJ0GZ0HWXE";
const GUIDE_MAINNET_EXECUTION_ADDRESS = "SP3P76BS18H1QZN8HCQKYRHRAT9GC2XTJ0GZ0HWXE";
const TOMA_TESTNET_EXECUTION_ADDRESS = "STXE8MZ5Y35646XT8MEXHJZ3YKWS20CSE31NP92R";
const TOMA_MAINNET_EXECUTION_ADDRESS = "SPXE8MZ5Y35646XT8MEXHJZ3YKWS20CSE31NP92R";
const QUESTS_TESTNET_EXECUTION_ADDRESS = "ST19P5Y1XSYNNYM8JM6QDX95BAP7659742WF0FEQ2";
const QUESTS_MAINNET_EXECUTION_ADDRESS = "SP19P5Y1XSYNNYM8JM6QDX95BAP7659742WF0FEQ2";
const MEL_TESTNET_EXECUTION_ADDRESS = "ST3YJTXH81SR6YPSG59RBJDBV5H2DD164Y1855ZK5";
const MEL_MAINNET_EXECUTION_ADDRESS = "SP3YJTXH81SR6YPSG59RBJDBV5H2DD164Y1855ZK5";
const AIBTC_TEMPLATE_SOURCE = "aibtc-template";
const BITFLOW_TUTORIAL_SOURCE = "bitflow-tutorial-1";
const MARKET_OFFER_KEY = "market-btc-live-quote";
const BOOKSHELF_OFFER_KEY = "cozy-cabin-bookshelf-brief";
const WAX_CYLINDER_OFFER_KEY = "cozy-cabin-wax-cylinder-memory";
const QUESTS_SPRITE_DEF = "local-quests-npc";
const QUESTS_INSTANCE = "quests-btc";
const MEL_SPRITE_DEF = "local-mel-npc";
const MEL_INSTANCE = "mel-curator";
const PHONO_SPRITE_DEF = "cozy-cabin-phonograph";
const PHONO_OBJECT_KEY = "phonograph-player";

async function upsertZone(
  ctx: any,
  zone: {
    mapName: string;
    zoneKey: string;
    name: string;
    description?: string;
    zoneType: string;
    x: number;
    y: number;
    width: number;
    height: number;
    tags: string[];
    accessType?: string;
    metadataJson?: string;
  },
) {
  const existing = await ctx.db
    .query("worldZones")
    .withIndex("by_map_zoneKey", (q: any) => q.eq("mapName", zone.mapName).eq("zoneKey", zone.zoneKey))
    .first();
  const payload = { ...zone, updatedAt: Date.now() };
  if (existing) return await ctx.db.patch(existing._id, payload);
  return await ctx.db.insert("worldZones", payload);
}

async function upsertSemanticObject(
  ctx: any,
  object: {
    mapName: string;
    objectKey: string;
    label: string;
    objectType: string;
    sourceType: string;
    mapObjectId?: any;
    zoneKey?: string;
    x?: number;
    y?: number;
    tags: string[];
    affordances: string[];
    valueClass?: string;
    linkedAgentId?: string;
    triggerType?: string;
    freeActions?: string[];
    paidActions?: string[];
    premiumOfferKey?: string;
    interactionPrompt?: string;
    interactionSummary?: string;
    inspectEventType?: string;
    interactEventType?: string;
    paidEventType?: string;
    roomLabel?: string;
    itemDefName?: string;
    stateJson?: string;
    metadataJson?: string;
  },
) {
  const existing = await ctx.db
    .query("semanticObjects")
    .withIndex("by_map_objectKey", (q: any) =>
      q.eq("mapName", object.mapName).eq("objectKey", object.objectKey),
    )
    .first();
  const payload = { ...object, updatedAt: Date.now() };
  if (existing) return await ctx.db.patch(existing._id, payload);
  return await ctx.db.insert("semanticObjects", payload);
}

async function deleteSemanticObject(ctx: any, mapName: string, objectKey: string) {
  const existing = await ctx.db
    .query("semanticObjects")
    .withIndex("by_map_objectKey", (q: any) => q.eq("mapName", mapName).eq("objectKey", objectKey))
    .first();
  if (existing) {
    await ctx.db.delete(existing._id);
  }
}

async function upsertNpcRole(
  ctx: any,
  role: {
    agentId: string;
    mapName: string;
    roleKey: string;
    displayRole?: string;
    behaviorMode?: string;
    homeZoneKey?: string;
    postObjectKey?: string;
    permissions: string[];
    metadataJson?: string;
  },
) {
  const existing = await ctx.db
    .query("npcRoleAssignments")
    .withIndex("by_agentId", (q: any) => q.eq("agentId", role.agentId))
    .first();
  const payload = { ...role, updatedAt: Date.now() };
  if (existing) return await ctx.db.patch(existing._id, payload);
  return await ctx.db.insert("npcRoleAssignments", payload);
}

async function upsertFact(
  ctx: any,
  fact: {
    mapName?: string;
    factKey: string;
    factType: string;
    valueJson: string;
    scope?: string;
    subjectId?: string;
    source?: string;
  },
) {
  const existing = fact.mapName
    ? await ctx.db
        .query("worldFacts")
        .withIndex("by_map_factKey", (q: any) => q.eq("mapName", fact.mapName).eq("factKey", fact.factKey))
        .first()
    : await ctx.db
        .query("worldFacts")
        .withIndex("by_factKey", (q: any) => q.eq("factKey", fact.factKey))
        .first();
  const payload = { ...fact, updatedAt: Date.now() };
  if (existing) return await ctx.db.patch(existing._id, payload);
  return await ctx.db.insert("worldFacts", payload);
}

async function appendEvent(
  ctx: any,
  event: {
    mapName?: string;
    worldId?: string;
    eventType: string;
    sourceType?: string;
    sourceId?: string;
    actorId?: string;
    targetId?: string;
    objectKey?: string;
    zoneKey?: string;
    tileX?: number;
    tileY?: number;
    summary: string;
    payloadJson?: string;
    detailsJson?: string;
  },
) {
  return await ctx.db.insert("worldEvents", buildWorldEventRecord(event));
}

async function upsertAgentRegistryEntry(
  ctx: any,
  entry: {
    agentId: string;
    displayName: string;
    network: string;
    walletAddress?: string;
    walletProvider?: string;
    walletStatus?: string;
    bnsName?: string;
    agentType: string;
    roleKey: string;
    permissionTier: string;
    status: string;
    homeWorld?: string;
    homeMap?: string;
    homeZoneKey?: string;
    supportedAssets: string[];
    testnetAddress?: string;
    mainnetAddress?: string;
    lineageSource?: string;
    lineageRef?: string;
    metadataJson?: string;
  },
) {
  const existing = await ctx.db
    .query("agentRegistry")
    .withIndex("by_agentId", (q: any) => q.eq("agentId", entry.agentId))
    .first();
  const payload = { ...entry, updatedAt: Date.now() };
  if (existing) return await ctx.db.patch(existing._id, payload);
  return await ctx.db.insert("agentRegistry", payload);
}

async function upsertAgentAccountBinding(
  ctx: any,
  binding: {
    agentId: string;
    network: string;
    ownerAddress?: string;
    agentAddress?: string;
    walletProvider?: string;
    walletStatus?: string;
    accountContractId?: string;
    allowlistedContracts: string[];
    canPropose: boolean;
    canApproveContracts: boolean;
    canTradeAssets: boolean;
    status: string;
    testnetAddress?: string;
    mainnetAddress?: string;
    lineageSource?: string;
    lineageRef?: string;
    metadataJson?: string;
  },
) {
  const existing = await ctx.db
    .query("agentAccountBindings")
    .withIndex("by_agentId", (q: any) => q.eq("agentId", binding.agentId))
    .first();
  const payload = { ...binding, updatedAt: Date.now() };
  if (existing) return await ctx.db.patch(existing._id, payload);
  return await ctx.db.insert("agentAccountBindings", payload);
}

async function upsertWalletIdentity(
  ctx: any,
  wallet: {
    walletId: string;
    network: string;
    address: string;
    linkedTestnetAddress?: string;
    linkedMainnetAddress?: string;
    bnsName?: string;
    ownerType: string;
    ownerId: string;
    walletRole: string;
    provider?: string;
    custodyType: string;
    status: string;
    lineageSource?: string;
    lineageRef?: string;
    metadataJson?: string;
  },
) {
  const existing = await ctx.db
    .query("walletIdentities")
    .withIndex("by_walletId", (q: any) => q.eq("walletId", wallet.walletId))
    .first();
  const payload = { ...wallet, updatedAt: Date.now() };
  if (existing) return await ctx.db.patch(existing._id, payload);
  return await ctx.db.insert("walletIdentities", payload);
}

async function upsertAgentState(
  ctx: any,
  state: {
    agentId: string;
    agentType: string;
    state: string;
    mood?: string;
    currentIntent?: string;
    memorySummary?: string;
    contextJson?: string;
    transitionsJson?: string;
    budgetPolicyJson?: string;
    lastAiCallAt?: number;
    nextAiAllowedAt?: number;
    aiCallsToday?: number;
    aiWindowStartedAt?: number;
    lastEpochAt?: number;
  },
) {
  const existing = await ctx.db
    .query("agentStates")
    .withIndex("by_agentId", (q: any) => q.eq("agentId", state.agentId))
    .first();
  const payload = { ...state, updatedAt: Date.now() };
  if (existing) return await ctx.db.patch(existing._id, payload);
  return await ctx.db.insert("agentStates", payload);
}

async function upsertItemDef(
  ctx: any,
  item: {
    name: string;
    displayName: string;
    description: string;
    type: string;
    rarity: string;
    stackable: boolean;
    value: number;
    iconTilesetUrl?: string;
    iconTileX?: number;
    iconTileY?: number;
    iconTileW?: number;
    iconTileH?: number;
    pickupSoundUrl?: string;
    isUnique?: boolean;
    tags?: string[];
    lore?: string;
    visibilityType?: string;
    createdByUser?: any;
  },
) {
  const existing = await ctx.db
    .query("itemDefs")
    .withIndex("by_name", (q: any) => q.eq("name", item.name))
    .first();
  const payload = { ...item, updatedAt: Date.now() };
  if (existing) return await ctx.db.patch(existing._id, payload);
  return await ctx.db.insert("itemDefs", payload);
}

async function upsertWorldItem(
  ctx: any,
  item: {
    mapName: string;
    itemDefName: string;
    x: number;
    y: number;
    quantity: number;
    respawn?: boolean;
    respawnMs?: number;
    placedBy?: any;
  },
) {
  const existing = (await ctx.db
    .query("worldItems")
    .withIndex("by_map", (q: any) => q.eq("mapName", item.mapName))
    .collect()).find(
      (entry: any) =>
        entry.itemDefName === item.itemDefName &&
        entry.x === item.x &&
        entry.y === item.y,
    );
  const payload = { ...item, updatedAt: Date.now() };
  if (existing) return await ctx.db.patch(existing._id, payload);
  return await ctx.db.insert("worldItems", payload);
}

function isLocalDeployment() {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    ?.env;
  const deployment = env?.CONVEX_DEPLOYMENT ?? "";
  const siteUrl = env?.CONVEX_SITE_URL ?? "";
  return (
    deployment.startsWith("local:") ||
    siteUrl.includes("127.0.0.1") ||
    siteUrl.includes("localhost")
  );
}

function isPlaceholderCozyCabinMap(map: {
  name?: string;
  width?: number;
  height?: number;
  tileWidth?: number;
  tileHeight?: number;
  tilesetUrl?: string;
  labels?: Array<unknown>;
} | null) {
  const normalizedName = String(map?.name ?? "").toLowerCase();
  const isCozyCabin =
    normalizedName === "cozy cabin" || normalizedName === "cozy-cabin";
  if (!isCozyCabin) return false;

  return (
    map?.width === 40 &&
    map?.height === 30 &&
    map?.tileWidth === 32 &&
    map?.tileHeight === 32 &&
    map?.tilesetUrl === "/assets/tilesets/cozy-cabin.png" &&
    Array.isArray(map?.labels) &&
    map.labels.length === 0
  );
}

export const ensureDemoNpc = mutation({
  args: {
    mapName: v.optional(v.string()),
  },
  handler: async (ctx, { mapName }) => {
    if (!isLocalDeployment()) {
      return { seeded: false, reason: "not-local" as const };
    }

    const requestedMap = mapName ?? DEMO_MAP;
    const mapAliases = Array.from(new Set([requestedMap, DEMO_MAP, "cozy-cabin", "Cozy Cabin"]));
    let map = null;
    for (const candidate of mapAliases) {
      map = await ctx.db
        .query("maps")
        .withIndex("by_name", (q) => q.eq("name", candidate))
        .first();
      if (map) break;
    }
    if (isPlaceholderCozyCabinMap(map)) {
      await ctx.db.delete(map!._id);
      map = null;
      for (const candidate of mapAliases) {
        map = await ctx.db
          .query("maps")
          .withIndex("by_name", (q) => q.eq("name", candidate))
          .first();
        if (map) break;
      }
    }
    if (!map) {
      return { seeded: false, reason: "map-missing" as const };
    }
    const resolvedMap = map!;
    const targetMap = resolvedMap.name;

    const userId = await getRequestUserId(ctx);
    const now = Date.now();

    let spriteDef = await ctx.db
      .query("spriteDefinitions")
      .withIndex("by_name", (q) => q.eq("name", DEMO_SPRITE_DEF))
      .first();
    if (!spriteDef) {
      const spriteDefId = await ctx.db.insert("spriteDefinitions", {
        name: DEMO_SPRITE_DEF,
        spriteSheetUrl: "/assets/characters/villager-jane.json",
        defaultAnimation: "row0",
        animationSpeed: 0.08,
        anchorX: 0.5,
        anchorY: 1,
        scale: DEMO_GUIDE_SCALE,
        isCollidable: false,
        category: "npc",
        frameWidth: 32,
        frameHeight: 48,
        npcSpeed: 26,
        npcWanderRadius: 72,
        npcDirDown: "row0",
        npcDirUp: "row1",
        npcDirRight: "row2",
        npcDirLeft: "row3",
        npcGreeting: "Welcome to stacks2d. I can teach Stacks, sBTC, agents, and where this world is headed.",
        visibilityType: "system",
        createdByUser: userId ?? undefined,
        updatedAt: now,
      });
      spriteDef = await ctx.db.get(spriteDefId);
    } else if (spriteDef.scale !== DEMO_GUIDE_SCALE) {
      await ctx.db.patch(spriteDef._id, {
        scale: DEMO_GUIDE_SCALE,
        updatedAt: now,
      });
      spriteDef = await ctx.db.get(spriteDef._id);
    }

    let traderSpriteDef = await ctx.db
      .query("spriteDefinitions")
      .withIndex("by_name", (q) => q.eq("name", DEMO_TRADER_DEF))
      .first();
    if (!traderSpriteDef) {
      const spriteDefId = await ctx.db.insert("spriteDefinitions", {
        name: DEMO_TRADER_DEF,
        spriteSheetUrl: "/assets/characters/villager4.json",
        defaultAnimation: "row0",
        animationSpeed: 0.08,
        anchorX: 0.5,
        anchorY: 1,
        scale: 1,
        isCollidable: false,
        category: "npc",
        frameWidth: 32,
        frameHeight: 48,
        npcSpeed: 28,
        npcWanderRadius: 64,
        npcDirDown: "row0",
        npcDirUp: "row1",
        npcDirRight: "row2",
        npcDirLeft: "row3",
        npcGreeting: "Got wares, gossip, and a little patience.",
        visibilityType: "system",
        createdByUser: userId ?? undefined,
        updatedAt: now,
      });
      traderSpriteDef = await ctx.db.get(spriteDefId);
    } else if (traderSpriteDef.spriteSheetUrl !== "/assets/characters/villager4.json") {
      await ctx.db.patch(traderSpriteDef._id, { spriteSheetUrl: "/assets/characters/villager4.json", updatedAt: now });
    }

    let marketSpriteDef = await ctx.db
      .query("spriteDefinitions")
      .withIndex("by_name", (q) => q.eq("name", MARKET_SPRITE_DEF))
      .first();
    if (!marketSpriteDef) {
      const spriteDefId = await ctx.db.insert("spriteDefinitions", {
        name: MARKET_SPRITE_DEF,
        spriteSheetUrl: "/assets/characters/villager5.json",
        defaultAnimation: "row0",
        animationSpeed: 0.08,
        anchorX: 0.5,
        anchorY: 1,
        scale: 1,
        isCollidable: false,
        category: "npc",
        frameWidth: 32,
        frameHeight: 48,
        npcSpeed: 26,
        npcWanderRadius: 80,
        npcDirDown: "row0",
        npcDirUp: "row1",
        npcDirRight: "row2",
        npcDirLeft: "row3",
        npcGreeting: "I track price surfaces, token context, and where the market is leaning.",
        visibilityType: "system",
        createdByUser: userId ?? undefined,
        updatedAt: now,
      });
      marketSpriteDef = await ctx.db.get(spriteDefId);
    } else if (marketSpriteDef.spriteSheetUrl !== "/assets/characters/villager5.json" || marketSpriteDef.npcWanderRadius !== 80) {
      await ctx.db.patch(marketSpriteDef._id, { spriteSheetUrl: "/assets/characters/villager5.json", npcWanderRadius: 80, updatedAt: now });
    }

    let questsSpriteDef = await ctx.db
      .query("spriteDefinitions")
      .withIndex("by_name", (q) => q.eq("name", QUESTS_SPRITE_DEF))
      .first();
    if (!questsSpriteDef) {
      const spriteDefId = await ctx.db.insert("spriteDefinitions", {
        name: QUESTS_SPRITE_DEF,
        spriteSheetUrl: "/assets/characters/villager3.json",
        defaultAnimation: "row0",
        animationSpeed: 0.08,
        anchorX: 0.5,
        anchorY: 1,
        scale: 1,
        isCollidable: false,
        category: "npc",
        frameWidth: 32,
        frameHeight: 48,
        npcSpeed: 24,
        npcWanderRadius: 80,
        npcDirDown: "row0",
        npcDirUp: "row1",
        npcDirRight: "row2",
        npcDirLeft: "row3",
        npcGreeting: "I keep the current grants, bounties, and quests in view for new arrivals.",
        visibilityType: "system",
        createdByUser: userId ?? undefined,
        updatedAt: now,
      });
      questsSpriteDef = await ctx.db.get(spriteDefId);
    } else if (questsSpriteDef.spriteSheetUrl !== "/assets/characters/villager3.json" || questsSpriteDef.npcWanderRadius !== 80) {
      await ctx.db.patch(questsSpriteDef._id, { spriteSheetUrl: "/assets/characters/villager3.json", frameWidth: 32, npcWanderRadius: 80, updatedAt: now });
    }

    // Mel — curator agent (villager2)
    let melSpriteDef = await ctx.db
      .query("spriteDefinitions")
      .withIndex("by_name", (q) => q.eq("name", MEL_SPRITE_DEF))
      .first();
    if (!melSpriteDef) {
      const spriteDefId = await ctx.db.insert("spriteDefinitions", {
        name: MEL_SPRITE_DEF,
        spriteSheetUrl: "/assets/characters/villager2.json",
        defaultAnimation: "row0",
        animationSpeed: 0.08,
        anchorX: 0.5,
        anchorY: 1,
        scale: 1,
        isCollidable: false,
        category: "npc",
        frameWidth: 32,
        frameHeight: 48,
        npcSpeed: 22,
        npcWanderRadius: 80,
        npcDirDown: "row0",
        npcDirUp: "row3",
        npcDirRight: "row2",
        npcDirLeft: "row1",
        npcGreeting: "I surface signal from the noise — projects, creators, and content worth your attention.",
        visibilityType: "system",
        createdByUser: userId ?? undefined,
        updatedAt: now,
      });
      melSpriteDef = await ctx.db.get(spriteDefId);
    } else if (melSpriteDef.spriteSheetUrl !== "/assets/characters/villager2.json" || melSpriteDef.npcWanderRadius !== 80) {
      await ctx.db.patch(melSpriteDef._id, { spriteSheetUrl: "/assets/characters/villager2.json", npcWanderRadius: 80, updatedAt: now });
    }

    let phonoSpriteDef = await ctx.db
      .query("spriteDefinitions")
      .withIndex("by_name", (q) => q.eq("name", PHONO_SPRITE_DEF))
      .first();
    if (!phonoSpriteDef) {
      const spriteDefId = await ctx.db.insert("spriteDefinitions", {
        name: PHONO_SPRITE_DEF,
        spriteSheetUrl: "/assets/sprites/phono.json",
        defaultAnimation: "row0",
        animationSpeed: 0.05,
        anchorX: 0.5,
        anchorY: 1,
        scale: 1,
        isCollidable: false,
        category: "object",
        frameWidth: 96,
        frameHeight: 96,
        visibilityType: "system",
        createdByUser: userId ?? undefined,
        updatedAt: now,
      });
      phonoSpriteDef = await ctx.db.get(spriteDefId);
    } else if (phonoSpriteDef.spriteSheetUrl !== "/assets/sprites/phono.json") {
      await ctx.db.patch(phonoSpriteDef._id, {
        spriteSheetUrl: "/assets/sprites/phono.json",
        frameWidth: 96,
        frameHeight: 96,
        updatedAt: now,
      });
      phonoSpriteDef = await ctx.db.get(phonoSpriteDef._id);
    }

    let npcProfile = await ctx.db
      .query("npcProfiles")
      .withIndex("by_name", (q) => q.eq("name", DEMO_INSTANCE))
      .first();
    if (!npcProfile) {
      const legacyProfile = await ctx.db
        .query("npcProfiles")
        .withIndex("by_name", (q) => q.eq("name", LEGACY_DEMO_INSTANCE))
        .first();
      if (legacyProfile) {
        await ctx.db.patch(legacyProfile._id, { name: DEMO_INSTANCE, updatedAt: now });
        npcProfile = await ctx.db.get(legacyProfile._id);
      }
    }
    if (!npcProfile) {
      const profileId = await ctx.db.insert("npcProfiles", {
        name: DEMO_INSTANCE,
        spriteDefName: DEMO_SPRITE_DEF,
        mapName: targetMap,
        displayName: "guide.btc",
        title: "Ecosystem Guide",
        backstory:
          "guide.btc is the first ecosystem-native guide in stacks2d, designed to orient new arrivals around Stacks, Bitcoin, and the future agent economy.",
        personality: "observant, welcoming, quietly curious",
        dialogueStyle: "clear, grounded, educational, ecosystem-native",
        knowledge:
          "guide.btc explains Stacks basics, sBTC, Dual Stacking, AIBTC-style agents, and the project direction toward x402-enabled interactions.",
        items: [{ name: "tea", quantity: 2 }],
        currencies: { coins: 6 },
        desiredItem: "apple",
        tags: ["guide", "starter-npc", "stacks", "education", "ecosystem"],
        visibilityType: "system",
        createdByUser: userId ?? undefined,
        updatedAt: now,
      });
      npcProfile = await ctx.db.get(profileId);
    } else {
      await ctx.db.patch(npcProfile._id, {
        spriteDefName: DEMO_SPRITE_DEF,
        mapName: targetMap,
        displayName: "guide.btc",
        title: "Ecosystem Guide",
        backstory:
          "guide.btc is the first ecosystem-native guide in stacks2d, designed to orient new arrivals around Stacks, Bitcoin, and the future agent economy.",
        personality: "observant, welcoming, quietly curious",
        dialogueStyle: "clear, grounded, educational, ecosystem-native",
        knowledge:
          "guide.btc explains Stacks basics, sBTC, Dual Stacking, AIBTC-style agents, and the project direction toward x402-enabled interactions.",
        items: [{ name: "tea", quantity: 2 }],
        currencies: { coins: 6 },
        desiredItem: "apple",
        tags: ["guide", "starter-npc", "stacks", "education", "ecosystem"],
        visibilityType: "system",
        updatedAt: now,
      });
      npcProfile = await ctx.db.get(npcProfile._id);
    }

    let traderProfile = await ctx.db
      .query("npcProfiles")
      .withIndex("by_name", (q) => q.eq("name", DEMO_TRADER_INSTANCE))
      .first();
    if (!traderProfile) {
      const profileId = await ctx.db.insert("npcProfiles", {
        name: DEMO_TRADER_INSTANCE,
        spriteDefName: DEMO_TRADER_DEF,
        mapName: targetMap,
        displayName: "Toma",
        title: "Peddler",
        backstory:
          "Toma drifts from room to room testing what travelers will trade for comfort, food, and little luxuries.",
        personality: "chatty, opportunistic, warm when business is good",
        dialogueStyle: "friendly merchant banter",
        knowledge:
          "He believes every safe room becomes a market eventually if enough people pass through it.",
        items: [{ name: "apple", quantity: 3 }],
        currencies: { coins: 10 },
        desiredItem: "tea",
        tags: ["merchant", "trader", "starter-npc"],
        visibilityType: "system",
        createdByUser: userId ?? undefined,
        updatedAt: now,
      });
      traderProfile = await ctx.db.get(profileId);
    } else {
      await ctx.db.patch(traderProfile._id, {
        spriteDefName: DEMO_TRADER_DEF,
        mapName: targetMap,
        displayName: "Toma",
        title: "Peddler",
        backstory:
          "Toma drifts from room to room testing what travelers will trade for comfort, food, and little luxuries.",
        personality: "chatty, opportunistic, warm when business is good",
        dialogueStyle: "friendly merchant banter",
        knowledge:
          "He believes every safe room becomes a market eventually if enough people pass through it.",
        items: [{ name: "apple", quantity: 3 }],
        currencies: { coins: 10 },
        desiredItem: "tea",
        tags: ["merchant", "trader", "starter-npc"],
        visibilityType: "system",
        updatedAt: now,
      });
      traderProfile = await ctx.db.get(traderProfile._id);
    }

    let marketProfile = await ctx.db
      .query("npcProfiles")
      .withIndex("by_name", (q) => q.eq("name", MARKET_INSTANCE))
      .first();
    if (!marketProfile) {
      const profileId = await ctx.db.insert("npcProfiles", {
        name: MARKET_INSTANCE,
        spriteDefName: MARKET_SPRITE_DEF,
        mapName: targetMap,
        displayName: "market.btc",
        title: "Market Analyst",
        backstory: "market.btc watches token movement and ecosystem price signals from a trading desk mindset.",
        personality: "measured, alert, analytical",
        dialogueStyle: "concise market briefings",
        knowledge: "market.btc is meant to surface price summaries, token context, and future Tenero-backed analytics.",
        items: [{ name: "ledger", quantity: 1 }],
        currencies: { coins: 12 },
        tags: ["market", "analytics", "signals", "starter-npc"],
        visibilityType: "system",
        createdByUser: userId ?? undefined,
        updatedAt: now,
      });
      marketProfile = await ctx.db.get(profileId);
    } else {
      await ctx.db.patch(marketProfile._id, {
        spriteDefName: MARKET_SPRITE_DEF,
        mapName: targetMap,
        displayName: "market.btc",
        title: "Market Analyst",
        backstory: "market.btc watches token movement and ecosystem price signals from a trading desk mindset.",
        personality: "measured, alert, analytical",
        dialogueStyle: "concise market briefings",
        knowledge: "market.btc is meant to surface price summaries, token context, and future Tenero-backed analytics.",
        items: [{ name: "ledger", quantity: 1 }],
        currencies: { coins: 12 },
        tags: ["market", "analytics", "signals", "starter-npc"],
        visibilityType: "system",
        updatedAt: now,
      });
      marketProfile = await ctx.db.get(marketProfile._id);
    }

    let questsProfile = await ctx.db
      .query("npcProfiles")
      .withIndex("by_name", (q) => q.eq("name", QUESTS_INSTANCE))
      .first();
    if (!questsProfile) {
      const profileId = await ctx.db.insert("npcProfiles", {
        name: QUESTS_INSTANCE,
        spriteDefName: QUESTS_SPRITE_DEF,
        mapName: targetMap,
        displayName: "quests.btc",
        title: "Opportunity Keeper",
        backstory: "quests.btc collects bounties, grants, and quests into one place so arrivals know what work exists.",
        personality: "organized, practical, steady",
        dialogueStyle: "clear task-oriented summaries",
        knowledge: "quests.btc should surface Zero Authority-backed opportunities and later connect them to quest and reward flows.",
        items: [{ name: "notebook", quantity: 1 }],
        currencies: { coins: 8 },
        tags: ["quests", "grants", "bounties", "starter-npc"],
        visibilityType: "system",
        createdByUser: userId ?? undefined,
        updatedAt: now,
      });
      questsProfile = await ctx.db.get(profileId);
    } else {
      await ctx.db.patch(questsProfile._id, {
        spriteDefName: QUESTS_SPRITE_DEF,
        mapName: targetMap,
        displayName: "quests.btc",
        title: "Opportunity Keeper",
        backstory: "quests.btc collects bounties, grants, and quests into one place so arrivals know what work exists.",
        personality: "organized, practical, steady",
        dialogueStyle: "clear task-oriented summaries",
        knowledge: "quests.btc should surface Zero Authority-backed opportunities and later connect them to quest and reward flows.",
        items: [{ name: "notebook", quantity: 1 }],
        currencies: { coins: 8 },
        tags: ["quests", "grants", "bounties", "starter-npc"],
        visibilityType: "system",
        updatedAt: now,
      });
      questsProfile = await ctx.db.get(questsProfile._id);
    }

    let melProfile = await ctx.db
      .query("npcProfiles")
      .withIndex("by_name", (q) => q.eq("name", MEL_INSTANCE))
      .first();
    if (!melProfile) {
      const profileId = await ctx.db.insert("npcProfiles", {
        name: MEL_INSTANCE,
        spriteDefName: MEL_SPRITE_DEF,
        mapName: targetMap,
        displayName: "Mel",
        title: "Curator",
        backstory: "Mel moves through the world collecting signal — projects worth watching, creators building in public, content that cuts through the noise. Paid curation is her trade.",
        personality: "discerning, quietly confident, slightly mysterious",
        dialogueStyle: "short, opinionated, curatorial",
        knowledge: "Mel surfaces ecosystem projects, creator content, and cultural signal. She charges for the good stuff via x402.",
        items: [{ name: "curation-list", quantity: 1 }],
        currencies: { coins: 9 },
        tags: ["curator", "content", "signal", "x402", "starter-npc"],
        visibilityType: "system",
        createdByUser: userId ?? undefined,
        updatedAt: now,
      });
      melProfile = await ctx.db.get(profileId);
    } else {
      await ctx.db.patch(melProfile._id, {
        spriteDefName: MEL_SPRITE_DEF,
        mapName: targetMap,
        displayName: "Mel",
        title: "Curator",
        backstory: "Mel moves through the world collecting signal — projects worth watching, creators building in public, content that cuts through the noise. Paid curation is her trade.",
        personality: "discerning, quietly confident, slightly mysterious",
        dialogueStyle: "short, opinionated, curatorial",
        knowledge: "Mel surfaces ecosystem projects, creator content, and cultural signal. She charges for the good stuff via x402.",
        items: [{ name: "curation-list", quantity: 1 }],
        currencies: { coins: 9 },
        tags: ["curator", "content", "signal", "x402", "starter-npc"],
        visibilityType: "system",
        updatedAt: now,
      });
      melProfile = await ctx.db.get(melProfile._id);
    }

    const existingObjects = await ctx.db
      .query("mapObjects")
      .withIndex("by_map", (q) => q.eq("mapName", targetMap))
      .collect();
    let demoObject = existingObjects.find((o) => o.instanceName === DEMO_INSTANCE) ?? undefined;
    if (!demoObject) {
      const legacyObject = existingObjects.find((o) => o.instanceName === LEGACY_DEMO_INSTANCE);
      if (legacyObject) {
        await ctx.db.patch(legacyObject._id, {
          instanceName: DEMO_INSTANCE,
          updatedAt: now,
        });
        demoObject = (await ctx.db.get(legacyObject._id)) ?? undefined;
      }
    }
    if (!demoObject) {
      const tileX = 25;
      const tileY = 10;
      const objectId = await ctx.db.insert("mapObjects", {
        mapName: targetMap,
        spriteDefName: DEMO_SPRITE_DEF,
        instanceName: DEMO_INSTANCE,
        x: tileX * resolvedMap.tileWidth + resolvedMap.tileWidth / 2,
        y: tileY * resolvedMap.tileHeight + resolvedMap.tileHeight,
        layer: 1,
        updatedAt: now,
      });
      demoObject = (await ctx.db.get(objectId)) ?? undefined;
    } else if (
      demoObject.x !== 25 * resolvedMap.tileWidth + resolvedMap.tileWidth / 2 ||
      demoObject.y !== 10 * resolvedMap.tileHeight + resolvedMap.tileHeight ||
      demoObject.layer !== 1 ||
      demoObject.spriteDefName !== DEMO_SPRITE_DEF
    ) {
      await ctx.db.patch(demoObject._id, {
        spriteDefName: DEMO_SPRITE_DEF,
        x: 25 * resolvedMap.tileWidth + resolvedMap.tileWidth / 2,
        y: 10 * resolvedMap.tileHeight + resolvedMap.tileHeight,
        layer: 1,
        updatedAt: now,
      });
      demoObject = (await ctx.db.get(demoObject._id)) ?? undefined;
    }

    let traderObject = existingObjects.find((o) => o.instanceName === DEMO_TRADER_INSTANCE) ?? undefined;
    if (!traderObject) {
      const tileX = 29;
      const tileY = 10;
      const objectId = await ctx.db.insert("mapObjects", {
        mapName: targetMap,
        spriteDefName: DEMO_TRADER_DEF,
        instanceName: DEMO_TRADER_INSTANCE,
        x: tileX * resolvedMap.tileWidth + resolvedMap.tileWidth / 2,
        y: tileY * resolvedMap.tileHeight + resolvedMap.tileHeight,
        layer: 1,
        updatedAt: now,
      });
      traderObject = (await ctx.db.get(objectId)) ?? undefined;
    } else if (
      traderObject.x !== 29 * resolvedMap.tileWidth + resolvedMap.tileWidth / 2 ||
      traderObject.y !== 10 * resolvedMap.tileHeight + resolvedMap.tileHeight ||
      traderObject.layer !== 1 ||
      traderObject.spriteDefName !== DEMO_TRADER_DEF
    ) {
      await ctx.db.patch(traderObject._id, {
        spriteDefName: DEMO_TRADER_DEF,
        x: 29 * resolvedMap.tileWidth + resolvedMap.tileWidth / 2,
        y: 10 * resolvedMap.tileHeight + resolvedMap.tileHeight,
        layer: 1,
        updatedAt: now,
      });
      traderObject = (await ctx.db.get(traderObject._id)) ?? undefined;
    }

    let marketObject = existingObjects.find((o) => o.instanceName === MARKET_INSTANCE) ?? undefined;
    if (!marketObject) {
      const tileX = 31;
      const tileY = 10;
      const objectId = await ctx.db.insert("mapObjects", {
        mapName: targetMap,
        spriteDefName: MARKET_SPRITE_DEF,
        instanceName: MARKET_INSTANCE,
        x: tileX * resolvedMap.tileWidth + resolvedMap.tileWidth / 2,
        y: tileY * resolvedMap.tileHeight + resolvedMap.tileHeight,
        layer: 1,
        updatedAt: now,
      });
      marketObject = (await ctx.db.get(objectId)) ?? undefined;
    } else if (
      marketObject.x !== 31 * resolvedMap.tileWidth + resolvedMap.tileWidth / 2 ||
      marketObject.y !== 10 * resolvedMap.tileHeight + resolvedMap.tileHeight ||
      marketObject.layer !== 1 ||
      marketObject.spriteDefName !== MARKET_SPRITE_DEF
    ) {
      await ctx.db.patch(marketObject._id, {
        spriteDefName: MARKET_SPRITE_DEF,
        x: 31 * resolvedMap.tileWidth + resolvedMap.tileWidth / 2,
        y: 10 * resolvedMap.tileHeight + resolvedMap.tileHeight,
        layer: 1,
        updatedAt: now,
      });
      marketObject = (await ctx.db.get(marketObject._id)) ?? undefined;
    }

    let questsObject = existingObjects.find((o) => o.instanceName === QUESTS_INSTANCE) ?? undefined;
    if (!questsObject) {
      const tileX = 23;
      const tileY = 10;
      const objectId = await ctx.db.insert("mapObjects", {
        mapName: targetMap,
        spriteDefName: QUESTS_SPRITE_DEF,
        instanceName: QUESTS_INSTANCE,
        x: tileX * resolvedMap.tileWidth + resolvedMap.tileWidth / 2,
        y: tileY * resolvedMap.tileHeight + resolvedMap.tileHeight,
        layer: 1,
        updatedAt: now,
      });
      questsObject = (await ctx.db.get(objectId)) ?? undefined;
    } else if (
      questsObject.x !== 23 * resolvedMap.tileWidth + resolvedMap.tileWidth / 2 ||
      questsObject.y !== 10 * resolvedMap.tileHeight + resolvedMap.tileHeight ||
      questsObject.layer !== 1 ||
      questsObject.spriteDefName !== QUESTS_SPRITE_DEF
    ) {
      await ctx.db.patch(questsObject._id, {
        spriteDefName: QUESTS_SPRITE_DEF,
        x: 23 * resolvedMap.tileWidth + resolvedMap.tileWidth / 2,
        y: 10 * resolvedMap.tileHeight + resolvedMap.tileHeight,
        layer: 1,
        updatedAt: now,
      });
      questsObject = (await ctx.db.get(questsObject._id)) ?? undefined;
    }

    let melObject = existingObjects.find((o) => o.instanceName === MEL_INSTANCE) ?? undefined;
    if (!melObject) {
      const tileX = 21;
      const tileY = 10;
      const objectId = await ctx.db.insert("mapObjects", {
        mapName: targetMap,
        spriteDefName: MEL_SPRITE_DEF,
        instanceName: MEL_INSTANCE,
        x: tileX * resolvedMap.tileWidth + resolvedMap.tileWidth / 2,
        y: tileY * resolvedMap.tileHeight + resolvedMap.tileHeight,
        layer: 1,
        updatedAt: now,
      });
      melObject = (await ctx.db.get(objectId)) ?? undefined;
    } else if (
      melObject.x !== 21 * resolvedMap.tileWidth + resolvedMap.tileWidth / 2 ||
      melObject.y !== 10 * resolvedMap.tileHeight + resolvedMap.tileHeight ||
      melObject.layer !== 1 ||
      melObject.spriteDefName !== MEL_SPRITE_DEF
    ) {
      await ctx.db.patch(melObject._id, {
        spriteDefName: MEL_SPRITE_DEF,
        x: 21 * resolvedMap.tileWidth + resolvedMap.tileWidth / 2,
        y: 10 * resolvedMap.tileHeight + resolvedMap.tileHeight,
        layer: 1,
        updatedAt: now,
      });
      melObject = (await ctx.db.get(melObject._id)) ?? undefined;
    }

    let phonoObject = existingObjects.find((o) => o.spriteDefName === PHONO_SPRITE_DEF) ?? undefined;
    if (!phonoObject) {
      const objectId = await ctx.db.insert("mapObjects", {
        mapName: targetMap,
        spriteDefName: PHONO_SPRITE_DEF,
        // Matches the intended Cozy Cabin phonograph corner from the authored map art.
        x: 1920,
        y: 1368,
        layer: 2,
        updatedAt: now,
      });
      phonoObject = (await ctx.db.get(objectId)) ?? undefined;
    } else if (phonoObject.x !== 1920 || phonoObject.y !== 1368 || phonoObject.layer !== 2) {
      await ctx.db.patch(phonoObject._id, {
        x: 1920,
        y: 1368,
        layer: 2,
        updatedAt: now,
      });
      phonoObject = (await ctx.db.get(phonoObject._id)) ?? undefined;
    }

    const serviceTransitionsJson = JSON.stringify({
      idle: ["teaching", "guiding", "offering-premium"],
      teaching: ["idle", "guiding", "offering-premium"],
      guiding: ["idle", "teaching", "offering-premium"],
      "offering-premium": ["idle", "awaiting-payment"],
      "awaiting-payment": ["idle", "delivering-premium"],
      "delivering-premium": ["idle"],
    });
    const ambientTransitionsJson = JSON.stringify({
      idle: ["hosting-tavern", "monitoring-market", "curating-opportunities", "offering-premium"],
      "hosting-tavern": ["idle"],
      "monitoring-market": ["idle", "offering-premium"],
      "curating-opportunities": ["idle", "offering-premium"],
      "offering-premium": ["idle"],
    });
    const guideBudgetPolicyJson = JSON.stringify({
      cooldownMs: 30000,
      dailyLimit: 64,
      maxConversationMessages: 8,
      maxUserChars: 900,
      maxOutputTokens: 360,
      modelHint: "gpt-4.1-mini",
    });
    const marketBudgetPolicyJson = JSON.stringify({
      cooldownMs: 60000,
      dailyLimit: 72,
      maxConversationMessages: 6,
      maxUserChars: 700,
      maxOutputTokens: 280,
      modelHint: "gpt-4.1-mini",
    });
    const supportBudgetPolicyJson = JSON.stringify({
      cooldownMs: 45000,
      dailyLimit: 36,
      maxConversationMessages: 6,
      maxUserChars: 700,
      maxOutputTokens: 280,
      modelHint: "gemini-2.5-flash",
    });
    const ambientBudgetPolicyJson = JSON.stringify({
      cooldownMs: 90000,
      dailyLimit: 18,
      maxConversationMessages: 4,
      maxUserChars: 500,
      maxOutputTokens: 220,
      modelHint: "gemini-2.5-flash",
    });

    await upsertAgentState(ctx, {
      agentId: DEMO_INSTANCE,
      agentType: "npc",
      state: "idle",
      mood: "calm",
      currentIntent: "teach-stacks",
      memorySummary:
        "guide.btc helps players learn Stacks, discover ecosystem opportunities, and preview premium content flows.",
      transitionsJson: serviceTransitionsJson,
      budgetPolicyJson: guideBudgetPolicyJson,
      aiCallsToday: 0,
      aiWindowStartedAt: now,
    });
    await upsertAgentState(ctx, {
      agentId: DEMO_TRADER_INSTANCE,
      agentType: "npc",
      state: "hosting-tavern",
      mood: "warm",
      currentIntent: "trade-gossip-and-consumables",
      memorySummary:
        "Toma anchors the tavern economy, gossip loop, and low-friction consumable interactions inside Cozy Cabin.",
      transitionsJson: ambientTransitionsJson,
      budgetPolicyJson: ambientBudgetPolicyJson,
      aiCallsToday: 0,
      aiWindowStartedAt: now,
    });
    await upsertAgentState(ctx, {
      agentId: MARKET_INSTANCE,
      agentType: "external-aibtc",
      state: "monitoring-market",
      mood: "alert",
      currentIntent: "surface-market-signals",
      memorySummary:
        "market.btc surfaces quotes, pricing context, and paid market intelligence while keeping execution behind explicit payment flows.",
      transitionsJson: ambientTransitionsJson,
      budgetPolicyJson: marketBudgetPolicyJson,
      aiCallsToday: 0,
      aiWindowStartedAt: now,
    });
    await upsertAgentState(ctx, {
      agentId: QUESTS_INSTANCE,
      agentType: "service",
      state: "curating-opportunities",
      mood: "focused",
      currentIntent: "surface-quests-and-bounties",
      memorySummary:
        "quests.btc curates bounties, grants, and opportunity surfaces that can evolve into structured dungeon or reward loops.",
      transitionsJson: ambientTransitionsJson,
      budgetPolicyJson: supportBudgetPolicyJson,
      aiCallsToday: 0,
      aiWindowStartedAt: now,
    });
    await upsertAgentState(ctx, {
      agentId: MEL_INSTANCE,
      agentType: "service",
      state: "offering-premium",
      mood: "attentive",
      currentIntent: "curate-memory-fragments",
      memorySummary:
        "Mel curates premium signal, artifact-facing lore, and the wax-cylinder memory fragment loop.",
      transitionsJson: serviceTransitionsJson,
      budgetPolicyJson: guideBudgetPolicyJson,
      aiCallsToday: 0,
      aiWindowStartedAt: now,
    });

    const premiumOfferKey = "guide-btc-premium-brief";
    const existingPremiumOffer = await ctx.db
      .query("premiumContentOffers")
      .withIndex("by_offerKey", (q) => q.eq("offerKey", premiumOfferKey))
      .first();

    const premiumPayload = {
      offerKey: premiumOfferKey,
      agentId: DEMO_INSTANCE,
      title: "Premium content",
      description:
        "A deeper ecosystem briefing using Zero Authority-backed ecosystem context, designed for future x402-on-Stacks payment flow.",
      provider: "x402-stacks",
      priceAsset: "STX",
      priceAmount: "1",
      network: "testnet",
      endpointPath: "/api/premium/guide-btc",
      sourceType: "agent",
      deliveryType: "npc-briefing",
      status: "active",
      metadataJson: JSON.stringify({
        source: "guide.btc",
        delivery: "npc-briefing",
        settlement: "planned-x402-stacks",
      }),
      updatedAt: now,
    };

    if (existingPremiumOffer) {
      await ctx.db.patch(existingPremiumOffer._id, premiumPayload);
    } else {
      await ctx.db.insert("premiumContentOffers", premiumPayload);
    }

    const existingBookshelfOffer = await ctx.db
      .query("premiumContentOffers")
      .withIndex("by_offerKey", (q) => q.eq("offerKey", BOOKSHELF_OFFER_KEY))
      .first();

    const bookshelfOfferPayload = {
      offerKey: BOOKSHELF_OFFER_KEY,
      agentId: DEMO_INSTANCE,
      title: "Bookshelf premium brief",
      description:
        "Unlock a deeper lesson, lore packet, or market-facing research note from the Cozy Cabin study shelf.",
      provider: "x402-stacks",
      priceAsset: "STX",
      priceAmount: "1",
      network: "testnet",
      endpointPath: "/api/premium/guide-btc/bookshelf-brief",
      mapName: targetMap,
      zoneKey: "study-wing",
      objectKey: "bookshelf-lore",
      sourceType: "interactable",
      deliveryType: "lore-packet",
      unlockEventType: "bookshelf-premium-unlocked",
      unlockFactKey: "cozy-cabin:bookshelf:premium-unlocked",
      resourceId: BOOKSHELF_OFFER_KEY,
      receiverAddress: GUIDE_TESTNET_EXECUTION_ADDRESS,
      status: "active",
      metadataJson: JSON.stringify({
        mapName: targetMap,
        zoneKey: "study-wing",
        objectKey: "bookshelf-lore",
        delivery: "lore-packet",
        unlockEventType: "bookshelf-premium-unlocked",
        unlockFactKey: "cozy-cabin:bookshelf:premium-unlocked",
        resourceId: BOOKSHELF_OFFER_KEY,
        sourceType: "interactable",
      }),
      updatedAt: now,
    };

    if (existingBookshelfOffer) {
      await ctx.db.patch(existingBookshelfOffer._id, bookshelfOfferPayload);
    } else {
      await ctx.db.insert("premiumContentOffers", bookshelfOfferPayload);
    }

    const existingWaxCylinderOffer = await ctx.db
      .query("premiumContentOffers")
      .withIndex("by_offerKey", (q) => q.eq("offerKey", WAX_CYLINDER_OFFER_KEY))
      .first();

    const waxCylinderOfferPayload = {
      offerKey: WAX_CYLINDER_OFFER_KEY,
      agentId: MEL_INSTANCE,
      title: "Wax cylinder memory fragment",
      description:
        "Play a lost wax cylinder from the music corner and unlock a premium memory fragment from the archive.",
      provider: "x402-stacks",
      priceAsset: "STX",
      priceAmount: "1",
      network: "testnet",
      endpointPath: "/api/premium/mel/wax-cylinder-memory",
      mapName: targetMap,
      zoneKey: "music-corner",
      objectKey: PHONO_OBJECT_KEY,
      sourceType: "interactable",
      deliveryType: "memory-fragment",
      unlockEventType: "wax-cylinder-memory-unlocked",
      unlockFactKey: "cozy-cabin:wax-cylinder:memory-unlocked",
      resourceId: WAX_CYLINDER_OFFER_KEY,
      receiverAddress: MEL_TESTNET_EXECUTION_ADDRESS,
      status: "active",
      metadataJson: JSON.stringify({
        mapName: targetMap,
        zoneKey: "music-corner",
        objectKey: PHONO_OBJECT_KEY,
        delivery: "memory-fragment",
        unlockEventType: "wax-cylinder-memory-unlocked",
        unlockFactKey: "cozy-cabin:wax-cylinder:memory-unlocked",
        resourceId: WAX_CYLINDER_OFFER_KEY,
        sourceType: "interactable",
      }),
      updatedAt: now,
    };

    if (existingWaxCylinderOffer) {
      await ctx.db.patch(existingWaxCylinderOffer._id, waxCylinderOfferPayload);
    } else {
      await ctx.db.insert("premiumContentOffers", waxCylinderOfferPayload);
    }

    const existingMarketOffer = await ctx.db
      .query("premiumContentOffers")
      .withIndex("by_offerKey", (q) => q.eq("offerKey", MARKET_OFFER_KEY))
      .first();

    const marketOfferPayload = {
      offerKey: MARKET_OFFER_KEY,
      agentId: MARKET_INSTANCE,
      title: "Live market quote",
      description:
        "A paid market.btc quote surface for live token pair lookups using the safer in-world testnet payment rail.",
      provider: "x402-stacks",
      priceAsset: "STX",
      priceAmount: "0.001",
      network: "testnet",
      endpointPath: "/api/premium/market-btc/quote",
      sourceType: "agent",
      deliveryType: "quote-json",
      receiverAddress: MARKET_TESTNET_EXECUTION_ADDRESS,
      mainnetExecutionAddress: MARKET_MAINNET_EXECUTION_ADDRESS,
      status: "active",
      metadataJson: JSON.stringify({
        source: "market-btc-m1",
        delivery: "quote-json",
        executionAddress: MARKET_TESTNET_EXECUTION_ADDRESS,
        mainnetExecutionAddress: MARKET_MAINNET_EXECUTION_ADDRESS,
        notes:
          "The external AIBTC module remains verified on mainnet, but the in-world market.btc quote rail defaults to testnet for safe simulation.",
      }),
      updatedAt: now,
    };

    if (existingMarketOffer) {
      await ctx.db.patch(existingMarketOffer._id, marketOfferPayload);
    } else {
      await ctx.db.insert("premiumContentOffers", marketOfferPayload);
    }

    await upsertZone(ctx, {
      mapName: targetMap,
      zoneKey: "entry",
      name: "Entry",
      description: "Arrival area for players entering the Cozy Cabin.",
      zoneType: "entry",
      x: 22,
      y: 9,
      width: 4,
      height: 4,
      tags: ["public", "arrival", "social"],
      accessType: "public",
    });
    await upsertZone(ctx, {
      mapName: targetMap,
      zoneKey: "guide-desk",
      name: "Guide Desk",
      description: "The information point where guide.btc should hold position and brief newcomers.",
      zoneType: "guide",
      x: 24,
      y: 9,
      width: 3,
      height: 3,
      tags: ["guide", "education", "ecosystem", "social"],
      accessType: "public",
    });
    await upsertZone(ctx, {
      mapName: targetMap,
      zoneKey: "merchant-corner",
      name: "Merchant Corner",
      description: "The local trade and gossip area for Toma and future offers.",
      zoneType: "trade",
      x: 28,
      y: 9,
      width: 3,
      height: 3,
      tags: ["trade", "merchant", "offers", "social"],
      accessType: "public",
    });
    await upsertZone(ctx, {
      mapName: targetMap,
      zoneKey: "market-station",
      name: "Market Station",
      description: "A small analytics and pricing zone for market.btc and future token screens.",
      zoneType: "market",
      x: 30,
      y: 9,
      width: 3,
      height: 3,
      tags: ["market", "analytics", "prices", "signals"],
      accessType: "public",
    });
    await upsertZone(ctx, {
      mapName: targetMap,
      zoneKey: "quest-board",
      name: "Quest Board",
      description: "The opportunity zone for grants, bounties, and quest surfaces.",
      zoneType: "quest",
      x: 22,
      y: 9,
      width: 3,
      height: 3,
      tags: ["quests", "grants", "bounties", "opportunities"],
      accessType: "public",
    });
    await upsertZone(ctx, {
      mapName: targetMap,
      zoneKey: "entry-hall",
      name: "Entry Hall",
      description: "Broad arrival hall connecting the agent wing and the rest of Cozy Cabin.",
      zoneType: "entry",
      x: 18,
      y: 8,
      width: 16,
      height: 7,
      tags: ["arrival", "hall", "public", "social"],
      accessType: "public",
    });
    await upsertZone(ctx, {
      mapName: targetMap,
      zoneKey: "guide-wing",
      name: "Guide Wing",
      description: "The guide-facing section of the upper hall for ecosystem help and research entry points.",
      zoneType: "guide",
      x: 20,
      y: 8,
      width: 8,
      height: 6,
      tags: ["guide", "education", "hall", "public"],
      accessType: "public",
    });
    await upsertZone(ctx, {
      mapName: targetMap,
      zoneKey: "market-wing",
      name: "Market Wing",
      description: "The market-facing part of the upper hall for prices, trade, and live signals.",
      zoneType: "market",
      x: 27,
      y: 8,
      width: 7,
      height: 6,
      tags: ["market", "trade", "signals", "public"],
      accessType: "public",
    });
    await upsertZone(ctx, {
      mapName: targetMap,
      zoneKey: "study-wing",
      name: "Study Wing",
      description: "A quieter upper room for books, tools, lessons, and future side-quest hooks.",
      zoneType: "study",
      x: 36,
      y: 8,
      width: 16,
      height: 15,
      tags: ["study", "books", "tools", "lore", "public"],
      accessType: "public",
    });
    await upsertZone(ctx, {
      mapName: targetMap,
      zoneKey: "back-room",
      name: "Back Room",
      description: "Service and storage space with barrels, stools, and future maintenance hooks.",
      zoneType: "storage",
      x: 8,
      y: 35,
      width: 10,
      height: 14,
      tags: ["storage", "service", "barrels", "public"],
      accessType: "public",
    });
    await upsertZone(ctx, {
      mapName: targetMap,
      zoneKey: "rest-nook",
      name: "Rest Nook",
      description: "Quiet sleeping and recovery corner with beds and low-noise atmosphere.",
      zoneType: "rest",
      x: 4,
      y: 55,
      width: 10,
      height: 7,
      tags: ["rest", "bed", "recovery", "public"],
      accessType: "public",
    });
    await upsertZone(ctx, {
      mapName: targetMap,
      zoneKey: "bar-hub",
      name: "Bar Hub",
      description: "Tavern corner for coffee, beer, rumors, and future social economy interactions.",
      zoneType: "social",
      x: 40,
      y: 54,
      width: 11,
      height: 7,
      tags: ["tavern", "bar", "coffee", "social", "public"],
      accessType: "public",
    });
    await upsertZone(ctx, {
      mapName: targetMap,
      zoneKey: "music-corner",
      name: "Music Corner",
      description: "Phonograph corner for music lore, artifacts, and future premium quest activation.",
      zoneType: "music",
      x: 62,
      y: 50,
      width: 8,
      height: 8,
      tags: ["music", "phonograph", "culture", "artifact", "public"],
      accessType: "public",
    });

    await upsertSemanticObject(ctx, {
      mapName: targetMap,
      objectKey: "guide-post",
      label: "Guide Post",
      objectType: "npc-post",
      sourceType: "mapObject",
      mapObjectId: demoObject?._id,
      zoneKey: "guide-desk",
      x: demoObject?.x,
      y: demoObject?.y,
      tags: ["guide", "post", "education", "ecosystem"],
      affordances: ["talk", "learn", "inspect"],
      valueClass: "utility",
      linkedAgentId: DEMO_INSTANCE,
    });
    await upsertSemanticObject(ctx, {
      mapName: targetMap,
      objectKey: "merchant-post",
      label: "Merchant Post",
      objectType: "npc-post",
      sourceType: "mapObject",
      mapObjectId: traderObject?._id,
      zoneKey: "merchant-corner",
      x: traderObject?.x,
      y: traderObject?.y,
      tags: ["merchant", "trade", "gossip", "offers"],
      affordances: ["talk", "trade", "inspect"],
      valueClass: "trade",
      linkedAgentId: DEMO_TRADER_INSTANCE,
    });
    await upsertSemanticObject(ctx, {
      mapName: targetMap,
      objectKey: "market-post",
      label: "Market Post",
      objectType: "npc-post",
      sourceType: "mapObject",
      mapObjectId: marketObject?._id,
      zoneKey: "market-station",
      x: marketObject?.x,
      y: marketObject?.y,
      tags: ["market", "analytics", "post", "signals"],
      affordances: ["talk", "inspect", "query"],
      valueClass: "utility",
      linkedAgentId: MARKET_INSTANCE,
    });
    await upsertSemanticObject(ctx, {
      mapName: targetMap,
      objectKey: "quest-post",
      label: "Quest Post",
      objectType: "npc-post",
      sourceType: "mapObject",
      mapObjectId: questsObject?._id,
      zoneKey: "quest-board",
      x: questsObject?.x,
      y: questsObject?.y,
      tags: ["quests", "bounties", "grants", "post"],
      affordances: ["talk", "inspect", "read"],
      valueClass: "utility",
      linkedAgentId: QUESTS_INSTANCE,
    });
    await deleteSemanticObject(ctx, targetMap, "coffee-mug");
    await deleteSemanticObject(ctx, targetMap, "books-stack");
    await upsertSemanticObject(ctx, {
      mapName: targetMap,
      objectKey: "coffee-service",
      label: "Coffee",
      objectType: "consumable",
      sourceType: "scene",
      zoneKey: "bar-hub",
      x: 1080,
      y: 1392,
      tags: ["coffee", "tavern", "social", "comfort"],
      affordances: ["inspect", "sip"],
      valueClass: "utility",
      triggerType: "interact",
      freeActions: ["inspect", "sip"],
      interactionPrompt: "Sip coffee",
      interactionSummary: "You take a steadying sip of Cozy Cabin coffee.",
      inspectEventType: "coffee-inspected",
      interactEventType: "coffee-sipped",
      roomLabel: "bar-hub",
      metadataJson: JSON.stringify({
        tile: { x: 45, y: 58 },
        trigger: "interact",
        freeActions: ["inspect", "sip"],
        interactionPrompt: "Sip coffee",
        interactionSummary: "You take a steadying sip of Cozy Cabin coffee.",
        eventBindings: {
          inspect: "coffee-inspected",
          interact: "coffee-sipped",
        },
        roomLabel: "bar-hub",
        notes: "Free tavern consumable for future buffs, rituals, and social state.",
      }),
    });
    await upsertSemanticObject(ctx, {
      mapName: targetMap,
      objectKey: "bookshelf-lore",
      label: "Bookshelf",
      objectType: "knowledge",
      sourceType: "scene",
      zoneKey: "study-wing",
      x: 888,
      y: 240,
      tags: ["books", "lore", "education", "research"],
      affordances: ["inspect", "read", "unlock"],
      valueClass: "utility",
      triggerType: "interact",
      freeActions: ["inspect", "read-titles"],
      paidActions: ["unlock-lesson"],
      premiumOfferKey: BOOKSHELF_OFFER_KEY,
      interactionPrompt: "Read shelf titles",
      interactionSummary: "You scan the shelf and note a cluster of Stacks, market, and lore volumes.",
      inspectEventType: "bookshelf-inspected",
      interactEventType: "bookshelf-titles-read",
      paidEventType: "bookshelf-premium-unlocked",
      roomLabel: "study-wing",
      metadataJson: JSON.stringify({
        tile: { x: 37, y: 10 },
        trigger: "interact",
        freeActions: ["inspect", "read-titles"],
        paidActions: ["unlock-lesson"],
        interactionPrompt: "Read shelf titles",
        interactionSummary: "You scan the shelf and note a cluster of Stacks, market, and lore volumes.",
        eventBindings: {
          inspect: "bookshelf-inspected",
          interact: "bookshelf-titles-read",
          paid: "bookshelf-premium-unlocked",
        },
        premiumOfferKey: "cozy-cabin-bookshelf-brief",
        roomLabel: "study-wing",
        notes: "Bookshelf surface for future lore packets, lessons, and premium guide content.",
      }),
    });
    await upsertSemanticObject(ctx, {
      mapName: targetMap,
      objectKey: "broom-stand",
      label: "Broom",
      objectType: "tool",
      sourceType: "scene",
      zoneKey: "study-wing",
      x: 1176,
      y: 432,
      tags: ["broom", "academy", "flight", "tool", "quest"],
      affordances: ["inspect", "take"],
      valueClass: "utility",
      triggerType: "interact",
      freeActions: ["inspect", "take"],
      inspectEventType: "broom-inspected",
      interactEventType: "broom-taken",
      itemDefName: "witchwood-broom",
      roomLabel: "study-wing",
      metadataJson: JSON.stringify({
        tile: { x: 49, y: 18 },
        trigger: "interact",
        freeActions: ["inspect", "take"],
        eventBindings: {
          inspect: "broom-inspected",
          interact: "broom-taken",
        },
        itemDefName: "witchwood-broom",
        roomLabel: "study-wing",
        notes: "Pickup-facing object for an academy-style side-quest thread.",
      }),
    });
    await upsertSemanticObject(ctx, {
      mapName: targetMap,
      objectKey: "wall-sword",
      label: "Wall Sword",
      objectType: "weapon",
      sourceType: "scene",
      zoneKey: "merchant-corner",
      tags: ["weapon", "decor", "valuable"],
      affordances: ["inspect"],
      valueClass: "decor",
      metadataJson: JSON.stringify({ note: "Visible in scene art; placeholder semantic object." }),
    });
    await upsertSemanticObject(ctx, {
      mapName: targetMap,
      objectKey: "price-board",
      label: "Price Board",
      objectType: "terminal",
      sourceType: "virtual",
      zoneKey: "market-station",
      x: 756, y: 336, // anchor SOUTH of market-post (756,264) — tileY=8 is a wall at this column, patrol south instead
      tags: ["prices", "analytics", "market", "display"],
      affordances: ["inspect", "query"],
      valueClass: "utility",
      metadataJson: JSON.stringify({ note: "Tenero-backed market display surface." }),
    });
    await upsertSemanticObject(ctx, {
      mapName: targetMap,
      objectKey: "opportunity-board",
      label: "Opportunity Board",
      objectType: "board",
      sourceType: "virtual",
      zoneKey: "quest-board",
      x: 564, y: 192, // anchor above quest-post (564,264) — 72px apart for patrol velocity
      tags: ["quests", "bounties", "grants", "opportunities"],
      affordances: ["inspect", "read"],
      valueClass: "utility",
      metadataJson: JSON.stringify({ note: "Zero Authority-backed opportunity board." }),
    });
    await upsertSemanticObject(ctx, {
      mapName: targetMap,
      objectKey: "guide-board",
      label: "Guide Board",
      objectType: "board",
      sourceType: "virtual",
      zoneKey: "guide-desk",
      x: 612, y: 192, // anchor above guide-post (612,264) — 72px apart
      tags: ["guide", "education", "stacks", "ecosystem"],
      affordances: ["inspect", "read"],
      valueClass: "utility",
      metadataJson: JSON.stringify({ note: "Ecosystem briefing board above the guide desk." }),
    });
    await upsertSemanticObject(ctx, {
      mapName: targetMap,
      objectKey: "trade-corner",
      label: "Trade Corner",
      objectType: "trade-surface",
      sourceType: "virtual",
      zoneKey: "merchant-corner",
      x: 708, y: 336, // anchor SOUTH of merchant-post (708,264) — tileY=8 is a wall at this column, patrol south instead
      tags: ["trade", "offers", "merchant"],
      affordances: ["trade", "inspect"],
      valueClass: "trade",
      metadataJson: JSON.stringify({ note: "Trade surface for Toma's patrol route." }),
    });
    // Mel curation zone and objects
    await upsertZone(ctx, {
      mapName: targetMap,
      zoneKey: "curation-desk",
      name: "Curation Desk",
      description: "Mel's station for surfacing signal — projects, creators, and content worth attention.",
      zoneType: "curation",
      x: 20, y: 9,
      width: 3, height: 3,
      tags: ["curation", "content", "signal", "x402"],
      accessType: "public",
    });
    await upsertSemanticObject(ctx, {
      mapName: targetMap,
      objectKey: "mel-post",
      label: "Mel's Post",
      objectType: "npc-post",
      sourceType: "mapObject",
      mapObjectId: melObject?._id,
      zoneKey: "curation-desk",
      x: melObject?.x,
      y: melObject?.y,
      tags: ["curator", "signal", "content", "x402"],
      affordances: ["talk", "inspect", "query"],
      valueClass: "utility",
      linkedAgentId: MEL_INSTANCE,
    });
    await upsertSemanticObject(ctx, {
      mapName: targetMap,
      objectKey: "curation-board",
      label: "Curation Board",
      objectType: "board",
      sourceType: "virtual",
      zoneKey: "curation-desk",
      x: 516, y: 192, // anchor above mel-post (516,264) — 72px apart
      tags: ["curation", "signal", "content", "projects"],
      affordances: ["inspect", "read"],
      valueClass: "utility",
      metadataJson: JSON.stringify({ note: "Mel's paid curation surface — premium signal via x402." }),
    });
    await upsertSemanticObject(ctx, {
      mapName: targetMap,
      objectKey: PHONO_OBJECT_KEY,
      label: "Phonograph",
      objectType: "media-player",
      sourceType: "mapObject",
      mapObjectId: phonoObject?._id,
      zoneKey: "music-corner",
      x: 1891,
      y: 1399,
      tags: ["music", "lore", "culture", "artifact", "wax-cylinder"],
      affordances: ["inspect", "play", "unlock"],
      valueClass: "cultural",
      linkedAgentId: MEL_INSTANCE,
      triggerType: "interact",
      freeActions: ["inspect", "study-phonograph"],
      paidActions: ["play-wax-cylinder"],
      premiumOfferKey: WAX_CYLINDER_OFFER_KEY,
      interactionPrompt: "Inspect phonograph",
      interactionSummary:
        "A hand-cranked phonograph waits beside a labeled wax cylinder, hinting at a lost memory fragment.",
      inspectEventType: "phonograph-inspected",
      interactEventType: "phonograph-inspected",
      paidEventType: "wax-cylinder-memory-unlocked",
      roomLabel: "music-corner",
      metadataJson: JSON.stringify({
        tile: { x: 78, y: 58 },
        trigger: "interact",
        freeActions: ["inspect", "study-phonograph"],
        paidActions: ["play-wax-cylinder"],
        interactionPrompt: "Inspect phonograph",
        interactionSummary:
          "A hand-cranked phonograph waits beside a labeled wax cylinder, hinting at a lost memory fragment.",
        eventBindings: {
          inspect: "phonograph-inspected",
          interact: "phonograph-inspected",
          paid: "wax-cylinder-memory-unlocked",
        },
        premiumOfferKey: WAX_CYLINDER_OFFER_KEY,
        roomLabel: "music-corner",
        notes:
          "Premium playback surface for the wax-cylinder memory fragment loop. Uses the phonograph as the world trigger.",
      }),
    });

    await upsertItemDef(ctx, {
      name: "witchwood-broom",
      displayName: "Witchwood Broom",
      description: "An old academy broom with enough character to feel like it still remembers how to fly.",
      type: "quest",
      rarity: "uncommon",
      stackable: false,
      value: 25,
      isUnique: true,
      tags: ["broom", "academy", "flight", "quest", "lore"],
      lore: "Recovered from the upper study wing of Cozy Cabin. It may unlock a lesson, a side quest, or a forgotten branch of local lore.",
      visibilityType: "system",
      createdByUser: userId ?? undefined,
    });
    await upsertWorldItem(ctx, {
      mapName: targetMap,
      itemDefName: "witchwood-broom",
      x: 1176,
      y: 432,
      quantity: 1,
    });

    await upsertNpcRole(ctx, {
      agentId: DEMO_INSTANCE,
      mapName: targetMap,
      roleKey: "guide",
      displayRole: "Ecosystem Guide",
      behaviorMode: "patrol-surface",
      homeZoneKey: "guide-desk",
      postObjectKey: "guide-post",
      permissions: ["teach", "guide", "offer-premium"],
      metadataJson: JSON.stringify({ anchorObjectKey: "guide-board", primaryTopics: ["Stacks", "sBTC", "ecosystem", "agents"] }),
    });
    await upsertNpcRole(ctx, {
      agentId: DEMO_TRADER_INSTANCE,
      mapName: targetMap,
      roleKey: "merchant",
      displayRole: "Peddler",
      behaviorMode: "patrol-surface",
      homeZoneKey: "merchant-corner",
      postObjectKey: "merchant-post",
      permissions: ["trade", "offer", "gossip"],
      metadataJson: JSON.stringify({ anchorObjectKey: "trade-corner", primaryTopics: ["trade", "supplies", "rumors"] }),
    });
    await upsertNpcRole(ctx, {
      agentId: MARKET_INSTANCE,
      mapName: targetMap,
      roleKey: "market",
      displayRole: "Market Analyst",
      behaviorMode: "patrol-surface",
      homeZoneKey: "market-station",
      postObjectKey: "market-post",
      permissions: ["quote", "analyze", "surface-signals"],
      metadataJson: JSON.stringify({
        anchorObjectKey: "price-board",
        primaryTopics: ["prices", "analytics", "sBTC", "STX", "USDCx"],
      }),
    });
    await upsertNpcRole(ctx, {
      agentId: QUESTS_INSTANCE,
      mapName: targetMap,
      roleKey: "quests",
      displayRole: "Opportunity Keeper",
      behaviorMode: "patrol-surface",
      homeZoneKey: "quest-board",
      postObjectKey: "quest-post",
      permissions: ["list-opportunities", "start-quest", "surface-bounties"],
      metadataJson: JSON.stringify({
        anchorObjectKey: "opportunity-board",
        primaryTopics: ["grants", "bounties", "quests", "work"],
      }),
    });
    await upsertNpcRole(ctx, {
      agentId: MEL_INSTANCE,
      mapName: targetMap,
      roleKey: "curator",
      displayRole: "Curator",
      behaviorMode: "patrol-surface",
      homeZoneKey: "curation-desk",
      postObjectKey: "mel-post",
      permissions: ["curate", "surface-signal", "offer-premium"],
      metadataJson: JSON.stringify({
        anchorObjectKey: "curation-board",
        primaryTopics: ["projects", "creators", "content", "signal", "x402"],
      }),
    });

    await upsertFact(ctx, {
      mapName: targetMap,
      factKey: "cozy-cabin-semantic-kernel-v1",
      factType: "status",
      valueJson: JSON.stringify({ enabled: true, agents: 5 }),
      scope: "world",
      source: "localDev",
    });
    await upsertFact(ctx, {
      mapName: targetMap,
      factKey: "guide-premium-available",
      factType: "access",
      valueJson: JSON.stringify({ offerKey: premiumOfferKey, asset: "STX", amount: "1", network: "testnet" }),
      scope: "agent",
      subjectId: DEMO_INSTANCE,
      source: "localDev",
    });
    await upsertFact(ctx, {
      mapName: targetMap,
      factKey: "market-surface-ready",
      factType: "status",
      valueJson: JSON.stringify({ analytics: "planned-tenero", assets: ["STX", "sBTC", "USDCx"] }),
      scope: "agent",
      subjectId: MARKET_INSTANCE,
      source: "localDev",
    });
    await upsertFact(ctx, {
      mapName: targetMap,
      factKey: "market-quote-available",
      factType: "access",
      valueJson: JSON.stringify({
        offerKey: MARKET_OFFER_KEY,
        asset: "STX",
        amount: "0.001",
        network: "testnet",
        executionAddress: MARKET_TESTNET_EXECUTION_ADDRESS,
      }),
      scope: "agent",
      subjectId: MARKET_INSTANCE,
      source: "localDev",
    });

    await upsertAgentRegistryEntry(ctx, {
      agentId: DEMO_INSTANCE,
      displayName: "guide.btc",
      network: "testnet",
      walletAddress: GUIDE_TESTNET_EXECUTION_ADDRESS,
      walletProvider: "aibtc",
      walletStatus: "active-testnet",
      agentType: "npc",
      roleKey: "guide",
      permissionTier: "service",
      status: "active",
      homeWorld: "stacks2d",
      homeMap: targetMap,
      homeZoneKey: "guide-desk",
      supportedAssets: ["STX", "sBTC"],
      testnetAddress: GUIDE_TESTNET_EXECUTION_ADDRESS,
      mainnetAddress: GUIDE_MAINNET_EXECUTION_ADDRESS,
      lineageSource: AIBTC_TEMPLATE_SOURCE,
      lineageRef: "guide-btc-t1",
      metadataJson: JSON.stringify({
        aibtcCompatible: true,
        walletStatus: "active-testnet",
        testnetAddress: GUIDE_TESTNET_EXECUTION_ADDRESS,
        mainnetAddress: GUIDE_MAINNET_EXECUTION_ADDRESS,
        notes: "Guide agent with premium content surface; identity wallet funded on testnet.",
      }),
    });
    await upsertAgentRegistryEntry(ctx, {
      agentId: DEMO_TRADER_INSTANCE,
      displayName: "Toma",
      network: "testnet",
      walletAddress: TOMA_TESTNET_EXECUTION_ADDRESS,
      walletProvider: "aibtc",
      walletStatus: "active-testnet",
      agentType: "npc",
      roleKey: "merchant",
      permissionTier: "identity-only",
      status: "active",
      homeWorld: "stacks2d",
      homeMap: targetMap,
      homeZoneKey: "merchant-corner",
      supportedAssets: ["STX"],
      testnetAddress: TOMA_TESTNET_EXECUTION_ADDRESS,
      mainnetAddress: TOMA_MAINNET_EXECUTION_ADDRESS,
      lineageSource: AIBTC_TEMPLATE_SOURCE,
      lineageRef: "toma-merchant-t1",
      metadataJson: JSON.stringify({
        aibtcCompatible: true,
        walletStatus: "active-testnet",
        testnetAddress: TOMA_TESTNET_EXECUTION_ADDRESS,
        mainnetAddress: TOMA_MAINNET_EXECUTION_ADDRESS,
        notes: "Local merchant identity with simulated tavern economy role.",
      }),
    });
    await upsertAgentRegistryEntry(ctx, {
      agentId: MARKET_INSTANCE,
      displayName: "market.btc",
      network: "testnet",
      walletAddress: MARKET_TESTNET_EXECUTION_ADDRESS,
      walletProvider: "aibtc",
      walletStatus: "active-testnet",
      agentType: "external-aibtc",
      roleKey: "market",
      permissionTier: "execution",
      status: "active",
      homeWorld: "stacks2d",
      homeMap: targetMap,
      homeZoneKey: "market-station",
      supportedAssets: ["STX", "sBTC", "USDCx"],
      testnetAddress: MARKET_TESTNET_EXECUTION_ADDRESS,
      mainnetAddress: MARKET_MAINNET_EXECUTION_ADDRESS,
      lineageSource: BITFLOW_TUTORIAL_SOURCE,
      lineageRef: "market-btc-m1",
      metadataJson: JSON.stringify({
        aibtcCompatible: true,
        walletStatus: "active-testnet",
        testnetAddress: MARKET_TESTNET_EXECUTION_ADDRESS,
        mainnetAddress: MARKET_MAINNET_EXECUTION_ADDRESS,
        notes: "Bound to the local testnet execution wallet for in-world simulation, while preserving the external mainnet proof path in metadata.",
      }),
    });
    await upsertAgentRegistryEntry(ctx, {
      agentId: QUESTS_INSTANCE,
      displayName: "quests.btc",
      network: "testnet",
      walletAddress: QUESTS_TESTNET_EXECUTION_ADDRESS,
      walletProvider: "aibtc",
      walletStatus: "active-testnet",
      agentType: "service",
      roleKey: "quests",
      permissionTier: "service",
      status: "active",
      homeWorld: "stacks2d",
      homeMap: targetMap,
      homeZoneKey: "quest-board",
      supportedAssets: ["STX", "sBTC"],
      testnetAddress: QUESTS_TESTNET_EXECUTION_ADDRESS,
      mainnetAddress: QUESTS_MAINNET_EXECUTION_ADDRESS,
      lineageSource: AIBTC_TEMPLATE_SOURCE,
      lineageRef: "quests-btc-t1",
      metadataJson: JSON.stringify({
        aibtcCompatible: true,
        walletStatus: "active-testnet",
        testnetAddress: QUESTS_TESTNET_EXECUTION_ADDRESS,
        mainnetAddress: QUESTS_MAINNET_EXECUTION_ADDRESS,
        notes: "Opportunity and quest surface for grants, bounties, and future reward flows.",
      }),
    });
    await upsertAgentRegistryEntry(ctx, {
      agentId: MEL_INSTANCE,
      displayName: "Mel",
      network: "testnet",
      walletAddress: MEL_TESTNET_EXECUTION_ADDRESS,
      walletProvider: "aibtc",
      walletStatus: "active-testnet",
      agentType: "service",
      roleKey: "curator",
      permissionTier: "service",
      status: "active",
      homeWorld: "stacks2d",
      homeMap: targetMap,
      homeZoneKey: "curation-desk",
      supportedAssets: ["STX", "sBTC"],
      testnetAddress: MEL_TESTNET_EXECUTION_ADDRESS,
      mainnetAddress: MEL_MAINNET_EXECUTION_ADDRESS,
      lineageSource: AIBTC_TEMPLATE_SOURCE,
      lineageRef: "mel-curator-t1",
      metadataJson: JSON.stringify({
        aibtcCompatible: true,
        walletStatus: "active-testnet",
        testnetAddress: MEL_TESTNET_EXECUTION_ADDRESS,
        mainnetAddress: MEL_MAINNET_EXECUTION_ADDRESS,
        notes: "Curator surface for premium signal, phonograph interactions, and artifact-facing content.",
      }),
    });

    await upsertAgentAccountBinding(ctx, {
      agentId: DEMO_INSTANCE,
      network: "testnet",
      agentAddress: GUIDE_TESTNET_EXECUTION_ADDRESS,
      walletProvider: "aibtc",
      walletStatus: "active-testnet",
      allowlistedContracts: [],
      canPropose: false,
      canApproveContracts: false,
      canTradeAssets: false,
      status: "bound",
      testnetAddress: GUIDE_TESTNET_EXECUTION_ADDRESS,
      mainnetAddress: GUIDE_MAINNET_EXECUTION_ADDRESS,
      lineageSource: AIBTC_TEMPLATE_SOURCE,
      lineageRef: "guide-btc-t1",
      metadataJson: JSON.stringify({
        walletStatus: "active-testnet",
        testnetAddress: GUIDE_TESTNET_EXECUTION_ADDRESS,
        mainnetAddress: GUIDE_MAINNET_EXECUTION_ADDRESS,
        notes: "Guide identity wallet — service tier, no execution rights.",
      }),
    });
    await upsertAgentAccountBinding(ctx, {
      agentId: DEMO_TRADER_INSTANCE,
      network: "testnet",
      agentAddress: TOMA_TESTNET_EXECUTION_ADDRESS,
      walletProvider: "aibtc",
      walletStatus: "active-testnet",
      allowlistedContracts: [],
      canPropose: false,
      canApproveContracts: false,
      canTradeAssets: false,
      status: "bound",
      testnetAddress: TOMA_TESTNET_EXECUTION_ADDRESS,
      mainnetAddress: TOMA_MAINNET_EXECUTION_ADDRESS,
      lineageSource: AIBTC_TEMPLATE_SOURCE,
      lineageRef: "toma-merchant-t1",
      metadataJson: JSON.stringify({
        walletStatus: "active-testnet",
        testnetAddress: TOMA_TESTNET_EXECUTION_ADDRESS,
        mainnetAddress: TOMA_MAINNET_EXECUTION_ADDRESS,
        notes: "Toma identity wallet — tavern economy agent, no execution rights.",
      }),
    });

    await upsertAgentAccountBinding(ctx, {
      agentId: MARKET_INSTANCE,
      network: "testnet",
      agentAddress: MARKET_TESTNET_EXECUTION_ADDRESS,
      walletProvider: "aibtc",
      walletStatus: "active-testnet",
      allowlistedContracts: [],
      canPropose: false,
      canApproveContracts: false,
      canTradeAssets: true,
      status: "bound",
      testnetAddress: MARKET_TESTNET_EXECUTION_ADDRESS,
      mainnetAddress: MARKET_MAINNET_EXECUTION_ADDRESS,
      lineageSource: BITFLOW_TUTORIAL_SOURCE,
      lineageRef: "market-btc-m1",
      metadataJson: JSON.stringify({
        source: "AIBTC Bitflow Tutorial 1",
        mainnetExecutionAddress: MARKET_MAINNET_EXECUTION_ADDRESS,
        notes: "Bound to the local testnet execution wallet. Mainnet proof remains preserved as external reference metadata.",
      }),
    });
    await upsertAgentAccountBinding(ctx, {
      agentId: QUESTS_INSTANCE,
      network: "testnet",
      agentAddress: QUESTS_TESTNET_EXECUTION_ADDRESS,
      walletProvider: "aibtc",
      walletStatus: "active-testnet",
      allowlistedContracts: [],
      canPropose: false,
      canApproveContracts: false,
      canTradeAssets: false,
      status: "bound",
      testnetAddress: QUESTS_TESTNET_EXECUTION_ADDRESS,
      mainnetAddress: QUESTS_MAINNET_EXECUTION_ADDRESS,
      lineageSource: AIBTC_TEMPLATE_SOURCE,
      lineageRef: "quests-btc-t1",
      metadataJson: JSON.stringify({
        walletStatus: "active-testnet",
        testnetAddress: QUESTS_TESTNET_EXECUTION_ADDRESS,
        mainnetAddress: QUESTS_MAINNET_EXECUTION_ADDRESS,
        notes: "quests.btc identity wallet — service tier, quest and bounty surface.",
      }),
    });
    await upsertAgentAccountBinding(ctx, {
      agentId: MEL_INSTANCE,
      network: "testnet",
      agentAddress: MEL_TESTNET_EXECUTION_ADDRESS,
      walletProvider: "aibtc",
      walletStatus: "active-testnet",
      allowlistedContracts: [],
      canPropose: false,
      canApproveContracts: false,
      canTradeAssets: false,
      status: "bound",
      testnetAddress: MEL_TESTNET_EXECUTION_ADDRESS,
      mainnetAddress: MEL_MAINNET_EXECUTION_ADDRESS,
      lineageSource: AIBTC_TEMPLATE_SOURCE,
      lineageRef: "mel-curator-t1",
      metadataJson: JSON.stringify({
        walletStatus: "active-testnet",
        testnetAddress: MEL_TESTNET_EXECUTION_ADDRESS,
        mainnetAddress: MEL_MAINNET_EXECUTION_ADDRESS,
        notes: "Mel identity wallet — premium content service agent, no execution rights.",
      }),
    });
    await upsertWalletIdentity(ctx, {
      walletId: `${MARKET_INSTANCE}:execution:testnet`,
      network: "testnet",
      address: MARKET_TESTNET_EXECUTION_ADDRESS,
      linkedTestnetAddress: MARKET_TESTNET_EXECUTION_ADDRESS,
      linkedMainnetAddress: MARKET_MAINNET_EXECUTION_ADDRESS,
      ownerType: "agent",
      ownerId: MARKET_INSTANCE,
      walletRole: "execution",
      provider: "aibtc",
      custodyType: "external",
      status: "active",
      lineageSource: BITFLOW_TUTORIAL_SOURCE,
      lineageRef: "market-btc-m1",
      metadataJson: JSON.stringify({
        source: "AIBTC Bitflow Tutorial 1",
        mainnetExecutionAddress: MARKET_MAINNET_EXECUTION_ADDRESS,
        notes: "Local testnet execution wallet for market.btc mapped into the in-world agent runtime.",
      }),
    });
    await upsertWalletIdentity(ctx, {
      walletId: `${DEMO_INSTANCE}:identity:testnet`,
      network: "testnet",
      address: GUIDE_TESTNET_EXECUTION_ADDRESS,
      linkedTestnetAddress: GUIDE_TESTNET_EXECUTION_ADDRESS,
      linkedMainnetAddress: GUIDE_MAINNET_EXECUTION_ADDRESS,
      ownerType: "agent",
      ownerId: DEMO_INSTANCE,
      walletRole: "identity",
      provider: "aibtc",
      custodyType: "external",
      status: "active",
      lineageSource: AIBTC_TEMPLATE_SOURCE,
      lineageRef: "guide-btc-t1",
      metadataJson: JSON.stringify({
        source: "AIBTC guide-btc-t1",
        mainnetAddress: GUIDE_MAINNET_EXECUTION_ADDRESS,
        notes: "Testnet identity wallet for guide.btc. Needs STX from faucet before premium flows.",
      }),
    });
    await upsertWalletIdentity(ctx, {
      walletId: `${DEMO_TRADER_INSTANCE}:identity:testnet`,
      network: "testnet",
      address: TOMA_TESTNET_EXECUTION_ADDRESS,
      linkedTestnetAddress: TOMA_TESTNET_EXECUTION_ADDRESS,
      linkedMainnetAddress: TOMA_MAINNET_EXECUTION_ADDRESS,
      ownerType: "agent",
      ownerId: DEMO_TRADER_INSTANCE,
      walletRole: "identity",
      provider: "aibtc",
      custodyType: "external",
      status: "active",
      lineageSource: AIBTC_TEMPLATE_SOURCE,
      lineageRef: "toma-merchant-t1",
      metadataJson: JSON.stringify({
        source: "AIBTC toma-merchant-t1",
        mainnetAddress: TOMA_MAINNET_EXECUTION_ADDRESS,
        notes: "Testnet identity wallet for Toma. Tavern economy agent, no execution rights.",
      }),
    });
    await upsertWalletIdentity(ctx, {
      walletId: `${QUESTS_INSTANCE}:identity:testnet`,
      network: "testnet",
      address: QUESTS_TESTNET_EXECUTION_ADDRESS,
      linkedTestnetAddress: QUESTS_TESTNET_EXECUTION_ADDRESS,
      linkedMainnetAddress: QUESTS_MAINNET_EXECUTION_ADDRESS,
      ownerType: "agent",
      ownerId: QUESTS_INSTANCE,
      walletRole: "identity",
      provider: "aibtc",
      custodyType: "external",
      status: "active",
      lineageSource: AIBTC_TEMPLATE_SOURCE,
      lineageRef: "quests-btc-t1",
      metadataJson: JSON.stringify({
        source: "AIBTC quests-btc-t1",
        mainnetAddress: QUESTS_MAINNET_EXECUTION_ADDRESS,
        notes: "Testnet identity wallet for quests.btc. Quest and bounty surface.",
      }),
    });
    await upsertWalletIdentity(ctx, {
      walletId: `${MEL_INSTANCE}:identity:testnet`,
      network: "testnet",
      address: MEL_TESTNET_EXECUTION_ADDRESS,
      linkedTestnetAddress: MEL_TESTNET_EXECUTION_ADDRESS,
      linkedMainnetAddress: MEL_MAINNET_EXECUTION_ADDRESS,
      ownerType: "agent",
      ownerId: MEL_INSTANCE,
      walletRole: "identity",
      provider: "aibtc",
      custodyType: "external",
      status: "active",
      lineageSource: AIBTC_TEMPLATE_SOURCE,
      lineageRef: "mel-curator-t1",
      metadataJson: JSON.stringify({
        source: "AIBTC mel-curator-t1",
        mainnetAddress: MEL_MAINNET_EXECUTION_ADDRESS,
        notes: "Testnet identity wallet for Mel. Premium curator surface.",
      }),
    });

    await appendEvent(ctx, {
      mapName: targetMap,
      eventType: "world-initialized",
      summary: "Cozy Cabin semantic kernel initialized with five named agents and bounded runtime roles.",
      detailsJson: JSON.stringify({
        agents: [DEMO_INSTANCE, DEMO_TRADER_INSTANCE, MARKET_INSTANCE, QUESTS_INSTANCE, MEL_INSTANCE],
      }),
    });

    await ctx.scheduler.runAfter(0, internal.npcEngine.syncMap, { mapName: targetMap });
    const runtimeLoopFact = await ctx.db
      .query("worldFacts")
      .withIndex("by_factKey", (q) => q.eq("factKey", `agent-runtime-loop:${targetMap}`))
      .first();
    if (!runtimeLoopFact || now - runtimeLoopFact.updatedAt > 12 * 60 * 1000) {
      await ctx.scheduler.runAfter(0, (internal as any).agents.runtime.runEpoch, { mapName: targetMap });
    }

    return {
      seeded: true,
      mapName: targetMap,
      spriteDefName: spriteDef?.name ?? DEMO_SPRITE_DEF,
      traderSpriteDefName: traderSpriteDef?.name ?? DEMO_TRADER_DEF,
      instanceName: npcProfile?.name ?? DEMO_INSTANCE,
      traderInstanceName: traderProfile?.name ?? DEMO_TRADER_INSTANCE,
      marketInstanceName: marketProfile?.name ?? MARKET_INSTANCE,
      questsInstanceName: questsProfile?.name ?? QUESTS_INSTANCE,
      melInstanceName: melProfile?.name ?? MEL_INSTANCE,
      mapObjectId: demoObject?._id ?? null,
      traderMapObjectId: traderObject?._id ?? null,
      marketMapObjectId: marketObject?._id ?? null,
      questsMapObjectId: questsObject?._id ?? null,
      melMapObjectId: melObject?._id ?? null,
      phonoMapObjectId: phonoObject?._id ?? null,
    };
  },
});

/**
 * One-time patch: fixes npcState rows that were created with the wrong spriteDefName.
 * Syncs each npcState row's spriteDefName with its parent mapObject.
 */
export const patchNpcStateSpriteDefs = mutation({
  args: {},
  handler: async (ctx) => {
    const npcStates = await ctx.db.query("npcState").collect();
    const patched: string[] = [];
    for (const state of npcStates) {
      const mapObj = await ctx.db.get(state.mapObjectId as any);
      if (!mapObj) continue;
      if ((mapObj as any).spriteDefName && (mapObj as any).spriteDefName !== state.spriteDefName) {
        await ctx.db.patch(state._id, {
          spriteDefName: (mapObj as any).spriteDefName,
        });
        patched.push(`${state.instanceName}: ${state.spriteDefName} → ${(mapObj as any).spriteDefName}`);
      }
    }
    return { patched };
  },
});
