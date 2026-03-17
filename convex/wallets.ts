import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const listWalletIdentities = query({
  args: {
    ownerType: v.optional(v.string()),
    ownerId: v.optional(v.string()),
    network: v.optional(v.string()),
    walletRole: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.ownerType && args.ownerId) {
      return await ctx.db
        .query("walletIdentities")
        .withIndex("by_owner", (q) => q.eq("ownerType", args.ownerType!).eq("ownerId", args.ownerId!))
        .collect();
    }

    if (args.walletRole) {
      return await ctx.db
        .query("walletIdentities")
        .withIndex("by_role_status", (q) => q.eq("walletRole", args.walletRole!).eq("status", "active"))
        .collect();
    }

    if (args.network) {
      return (await ctx.db.query("walletIdentities").collect()).filter(
        (entry) => entry.network === args.network,
      );
    }

    return await ctx.db.query("walletIdentities").collect();
  },
});

export const getWalletIdentity = query({
  args: {
    walletId: v.optional(v.string()),
    network: v.optional(v.string()),
    address: v.optional(v.string()),
  },
  handler: async (ctx, { walletId, network, address }) => {
    if (walletId) {
      return await ctx.db
        .query("walletIdentities")
        .withIndex("by_walletId", (q) => q.eq("walletId", walletId))
        .first();
    }

    if (network && address) {
      return await ctx.db
        .query("walletIdentities")
        .withIndex("by_network_address", (q) => q.eq("network", network).eq("address", address))
        .first();
    }

    return null;
  },
});

export const upsertWalletIdentity = mutation({
  args: {
    walletId: v.string(),
    network: v.string(),
    address: v.string(),
    linkedTestnetAddress: v.optional(v.string()),
    linkedMainnetAddress: v.optional(v.string()),
    bnsName: v.optional(v.string()),
    ownerType: v.string(),
    ownerId: v.string(),
    walletRole: v.string(),
    provider: v.optional(v.string()),
    custodyType: v.string(),
    status: v.string(),
    lineageSource: v.optional(v.string()),
    lineageRef: v.optional(v.string()),
    metadataJson: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("walletIdentities")
      .withIndex("by_walletId", (q) => q.eq("walletId", args.walletId))
      .first();

    const payload = {
      ...args,
      updatedAt: Date.now(),
    };

    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return await ctx.db.get(existing._id);
    }

    const id = await ctx.db.insert("walletIdentities", payload);
    return await ctx.db.get(id);
  },
});

export const listSignedIntents = query({
  args: {
    signerAddress: v.optional(v.string()),
    subjectType: v.optional(v.string()),
    subjectId: v.optional(v.string()),
    status: v.optional(v.string()),
  },
  handler: async (ctx, { signerAddress, subjectType, subjectId, status }) => {
    if (subjectType && subjectId) {
      const rows = await ctx.db
        .query("signedIntents")
        .withIndex("by_subject_status", (q) =>
          q.eq("subjectType", subjectType).eq("subjectId", subjectId).eq("status", status ?? "active"),
        )
        .collect();
      return rows;
    }

    if (signerAddress) {
      return await ctx.db
        .query("signedIntents")
        .withIndex("by_signer_time", (q) => q.eq("signerAddress", signerAddress))
        .collect();
    }

    return await ctx.db.query("signedIntents").collect();
  },
});

export const upsertSignedIntent = mutation({
  args: {
    intentKey: v.string(),
    network: v.string(),
    standard: v.string(),
    signerAddress: v.string(),
    signerRole: v.string(),
    subjectType: v.string(),
    subjectId: v.string(),
    intentType: v.string(),
    payloadJson: v.string(),
    signature: v.string(),
    status: v.string(),
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("signedIntents")
      .withIndex("by_intentKey", (q) => q.eq("intentKey", args.intentKey))
      .first();

    const payload = {
      ...args,
      updatedAt: Date.now(),
    };

    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return await ctx.db.get(existing._id);
    }

    const id = await ctx.db.insert("signedIntents", payload);
    return await ctx.db.get(id);
  },
});
