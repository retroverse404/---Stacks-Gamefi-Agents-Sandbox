import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { getRequestUserId } from "./lib/getRequestUserId";

const GUEST_HEARTBEAT_FACT_KEY = "guest-viewer-heartbeat";

async function requireOwnedProfile(ctx: any, profileId: any) {
  const userId = await getRequestUserId(ctx);
  if (!userId) throw new Error("Not authenticated");
  const profile = await ctx.db.get(profileId);
  if (!profile) throw new Error("Profile not found");
  if (profile.userId !== userId) throw new Error("Cannot update another player's presence");
  return profile;
}

/**
 * Upsert presence for a profile.
 * Called frequently (~200ms) by each connected client.
 * Includes velocity (vx, vy) for client-side extrapolation.
 */
export const update = mutation({
  args: {
    profileId: v.id("profiles"),
    mapName: v.optional(v.string()),
    x: v.float64(),
    y: v.float64(),
    vx: v.float64(),
    vy: v.float64(),
    direction: v.string(),
    animation: v.string(),
    spriteUrl: v.string(),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    await requireOwnedProfile(ctx, args.profileId);
    const existing = await ctx.db
      .query("presence")
      .withIndex("by_profile", (q) => q.eq("profileId", args.profileId))
      .first();

    const data = {
      profileId: args.profileId,
      mapName: args.mapName,
      x: args.x,
      y: args.y,
      vx: args.vx,
      vy: args.vy,
      direction: args.direction,
      animation: args.animation,
      spriteUrl: args.spriteUrl,
      name: args.name,
      lastSeen: Date.now(),
    };

    if (existing) {
      await ctx.db.patch(existing._id, data);
    } else {
      await ctx.db.insert("presence", data);
    }

    // Restart the NPC tick loop if it has gone dormant (no players were online).
    const anyNpc = await ctx.db.query("npcState").first();
    if (anyNpc) {
      const STALE_MS = 500 * 6; // 6 missed ticks = loop is dead
      if ((anyNpc.lastTick ?? 0) < Date.now() - STALE_MS) {
        await ctx.scheduler.runAfter(0, internal.npcEngine.tick, {});
      }
    }
  },
});

/** List all presence entries for a given map */
export const listByMap = query({
  args: { mapName: v.optional(v.string()) },
  handler: async (ctx, { mapName }) => {
    return await ctx.db
      .query("presence")
      .withIndex("by_map", (q) => q.eq("mapName", mapName))
      .collect();
  },
});

/** Lightweight heartbeat used by guest/demo viewers to keep NPCs ticking. */
export const guestHeartbeat = mutation({
  args: { mapName: v.optional(v.string()) },
  handler: async (ctx, { mapName }) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("worldFacts")
      .withIndex("by_factKey", (q) => q.eq("factKey", GUEST_HEARTBEAT_FACT_KEY))
      .first();

    const payload = {
      mapName,
      factKey: GUEST_HEARTBEAT_FACT_KEY,
      factType: "status",
      valueJson: JSON.stringify({
        viewer: "guest",
        mapName: mapName ?? null,
        heartbeatAt: now,
      }),
      scope: "world",
      source: "presence.guestHeartbeat",
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, payload);
    } else {
      await ctx.db.insert("worldFacts", payload);
    }

    const anyNpc = await ctx.db.query("npcState").first();
    if (anyNpc) {
      const STALE_MS = 500 * 6;
      if ((anyNpc.lastTick ?? 0) < now - STALE_MS) {
        await ctx.scheduler.runAfter(0, internal.npcEngine.tick, {});
      }
    }

    return { ok: true, heartbeatAt: now };
  },
});

/** Remove presence for a profile (on disconnect / tab close) */
export const remove = mutation({
  args: { profileId: v.id("profiles") },
  handler: async (ctx, { profileId }) => {
    await requireOwnedProfile(ctx, profileId);
    const existing = await ctx.db
      .query("presence")
      .withIndex("by_profile", (q) => q.eq("profileId", profileId))
      .first();
    if (existing) {
      await ctx.db.delete(existing._id);
    }
  },
});

/** Clean up stale presence entries (called periodically or via scheduled fn) */
export const cleanup = mutation({
  args: { staleThresholdMs: v.optional(v.number()) },
  handler: async (ctx, { staleThresholdMs }) => {
    const threshold = staleThresholdMs ?? 30_000;
    const cutoff = Date.now() - threshold;
    const all = await ctx.db.query("presence").collect();
    for (const p of all) {
      if (p.lastSeen < cutoff) {
        await ctx.db.delete(p._id);
      }
    }
  },
});
