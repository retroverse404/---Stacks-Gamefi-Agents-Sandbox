import { v } from "convex/values";
import { mutation, query } from "../_generated/server";

export const listOffers = query({
  args: {
    agentId: v.optional(v.string()),
  },
  handler: async (ctx, { agentId }) => {
    if (!agentId) {
      return await ctx.db.query("premiumContentOffers").collect();
    }
    return await ctx.db
      .query("premiumContentOffers")
      .withIndex("by_agentId_status", (q) => q.eq("agentId", agentId).eq("status", "active"))
      .collect();
  },
});

export const upsertOffer = mutation({
  args: {
    offerKey: v.string(),
    agentId: v.string(),
    title: v.string(),
    description: v.string(),
    provider: v.string(),
    priceAsset: v.string(),
    priceAmount: v.string(),
    network: v.optional(v.string()),
    endpointPath: v.optional(v.string()),
    mapName: v.optional(v.string()),
    zoneKey: v.optional(v.string()),
    objectKey: v.optional(v.string()),
    sourceType: v.optional(v.string()),
    deliveryType: v.optional(v.string()),
    unlockEventType: v.optional(v.string()),
    unlockFactKey: v.optional(v.string()),
    resourceId: v.optional(v.string()),
    receiverAddress: v.optional(v.string()),
    mainnetExecutionAddress: v.optional(v.string()),
    status: v.string(),
    metadataJson: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("premiumContentOffers")
      .withIndex("by_offerKey", (q) => q.eq("offerKey", args.offerKey))
      .first();

    const payload = {
      ...args,
      updatedAt: Date.now(),
    };

    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return await ctx.db.get(existing._id);
    }

    const id = await ctx.db.insert("premiumContentOffers", payload);
    return await ctx.db.get(id);
  },
});

export const getOffer = query({
  args: { offerKey: v.string() },
  handler: async (ctx, { offerKey }) => {
    return await ctx.db
      .query("premiumContentOffers")
      .withIndex("by_offerKey", (q) => q.eq("offerKey", offerKey))
      .first();
  },
});
