import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { getRequestUserId } from "./lib/getRequestUserId";

const DEMO_MAP = "Cozy Cabin";
const DEMO_SPRITE_DEF = "local-guide-npc";
const DEMO_INSTANCE = "mira-guide";
const DEMO_TRADER_DEF = "local-merchant-npc";
const DEMO_TRADER_INSTANCE = "toma-merchant";

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
    if (!map) {
      return { seeded: false, reason: "map-missing" as const, mapName: requestedMap };
    }
    const targetMap = map.name;

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
        scale: 1,
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
        npcGreeting: "Welcome in. I'm still waking this place up.",
        visibilityType: "system",
        createdByUser: userId ?? undefined,
        updatedAt: now,
      });
      spriteDef = await ctx.db.get(spriteDefId);
    }

    let traderSpriteDef = await ctx.db
      .query("spriteDefinitions")
      .withIndex("by_name", (q) => q.eq("name", DEMO_TRADER_DEF))
      .first();
    if (!traderSpriteDef) {
      const spriteDefId = await ctx.db.insert("spriteDefinitions", {
        name: DEMO_TRADER_DEF,
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
    }

    let npcProfile = await ctx.db
      .query("npcProfiles")
      .withIndex("by_name", (q) => q.eq("name", DEMO_INSTANCE))
      .first();
    if (!npcProfile) {
      const profileId = await ctx.db.insert("npcProfiles", {
        name: DEMO_INSTANCE,
        spriteDefName: DEMO_SPRITE_DEF,
        mapName: targetMap,
        displayName: "Mira",
        title: "Caretaker",
        backstory:
          "Mira keeps the cabin warm for new arrivals and watches how the room changes as the world comes online.",
        personality: "observant, welcoming, quietly curious",
        dialogueStyle: "short, grounded, gently mysterious",
        knowledge:
          "She knows the cabin is the first stable pocket of the world and encourages visitors to keep exploring.",
        items: [{ name: "tea", quantity: 2 }],
        currencies: { coins: 6 },
        desiredItem: "apple",
        tags: ["guide", "caretaker", "starter-npc"],
        visibilityType: "system",
        createdByUser: userId ?? undefined,
        updatedAt: now,
      });
      npcProfile = await ctx.db.get(profileId);
    } else {
      await ctx.db.patch(npcProfile._id, {
        spriteDefName: DEMO_SPRITE_DEF,
        mapName: targetMap,
        displayName: "Mira",
        title: "Caretaker",
        backstory:
          "Mira keeps the cabin warm for new arrivals and watches how the room changes as the world comes online.",
        personality: "observant, welcoming, quietly curious",
        dialogueStyle: "short, grounded, gently mysterious",
        knowledge:
          "She knows the cabin is the first stable pocket of the world and encourages visitors to keep exploring.",
        items: [{ name: "tea", quantity: 2 }],
        currencies: { coins: 6 },
        desiredItem: "apple",
        tags: ["guide", "caretaker", "starter-npc"],
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

    const existingObjects = await ctx.db
      .query("mapObjects")
      .withIndex("by_map", (q) => q.eq("mapName", targetMap))
      .collect();
    let demoObject = existingObjects.find((o) => o.instanceName === DEMO_INSTANCE) ?? undefined;
    if (!demoObject) {
      const tileX = 25;
      const tileY = 10;
      const objectId = await ctx.db.insert("mapObjects", {
        mapName: targetMap,
        spriteDefName: DEMO_SPRITE_DEF,
        instanceName: DEMO_INSTANCE,
        x: tileX * map.tileWidth + map.tileWidth / 2,
        y: tileY * map.tileHeight + map.tileHeight,
        layer: 1,
        updatedAt: now,
      });
      demoObject = (await ctx.db.get(objectId)) ?? undefined;
    }

    let traderObject = existingObjects.find((o) => o.instanceName === DEMO_TRADER_INSTANCE) ?? undefined;
    if (!traderObject) {
      const tileX = 29;
      const tileY = 10;
      const objectId = await ctx.db.insert("mapObjects", {
        mapName: targetMap,
        spriteDefName: DEMO_TRADER_DEF,
        instanceName: DEMO_TRADER_INSTANCE,
        x: tileX * map.tileWidth + map.tileWidth / 2,
        y: tileY * map.tileHeight + map.tileHeight,
        layer: 1,
        updatedAt: now,
      });
      traderObject = (await ctx.db.get(objectId)) ?? undefined;
    }

    await ctx.scheduler.runAfter(0, internal.npcEngine.syncMap, { mapName: targetMap });

    return {
      seeded: true,
      mapName: targetMap,
      spriteDefName: spriteDef?.name ?? DEMO_SPRITE_DEF,
      traderSpriteDefName: traderSpriteDef?.name ?? DEMO_TRADER_DEF,
      instanceName: npcProfile?.name ?? DEMO_INSTANCE,
      traderInstanceName: traderProfile?.name ?? DEMO_TRADER_INSTANCE,
      mapObjectId: demoObject?._id ?? null,
      traderMapObjectId: traderObject?._id ?? null,
    };
  },
});
