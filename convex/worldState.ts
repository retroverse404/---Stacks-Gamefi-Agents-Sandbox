import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { buildWorldEventRecord } from "./lib/worldEvents";

export const listFacts = query({
  args: { mapName: v.optional(v.string()) },
  handler: async (ctx, { mapName }) => {
    if (mapName) {
      return await ctx.db
        .query("worldFacts")
        .withIndex("by_map_factKey", (q) => q.eq("mapName", mapName))
        .collect();
    }
    return await ctx.db.query("worldFacts").collect();
  },
});

export const listEvents = query({
  args: {
    mapName: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { mapName, limit }) => {
    const take = Math.max(1, Math.min(limit ?? 20, 100));
    const rows = mapName
      ? await ctx.db
          .query("worldEvents")
          .withIndex("by_map_time", (q) => q.eq("mapName", mapName))
          .order("desc")
          .take(take)
      : await ctx.db.query("worldEvents").order("desc").take(take);
    return rows;
  },
});

export const upsertFact = mutation({
  args: {
    mapName: v.optional(v.string()),
    factKey: v.string(),
    factType: v.string(),
    valueJson: v.string(),
    scope: v.optional(v.string()),
    subjectId: v.optional(v.string()),
    source: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = args.mapName
      ? await ctx.db
          .query("worldFacts")
          .withIndex("by_map_factKey", (q) => q.eq("mapName", args.mapName).eq("factKey", args.factKey))
          .first()
      : await ctx.db
          .query("worldFacts")
          .withIndex("by_factKey", (q) => q.eq("factKey", args.factKey))
          .first();
    const payload = { ...args, updatedAt: Date.now() };
    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return existing._id;
    }
    return await ctx.db.insert("worldFacts", payload);
  },
});

export const appendEvent = mutation({
  args: {
    mapName: v.optional(v.string()),
    worldId: v.optional(v.string()),
    eventType: v.string(),
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
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("worldEvents", buildWorldEventRecord(args));
  },
});
