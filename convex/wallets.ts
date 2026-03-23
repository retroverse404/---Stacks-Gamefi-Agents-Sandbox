import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { buildWorldEventRecord } from "./lib/worldEvents";
import { getRequestUserId } from "./lib/getRequestUserId";

function normalizeWalletProvider(provider: string | undefined) {
  if (!provider) return undefined;

  switch (provider) {
    case "LeatherProvider":
      return "leather";
    case "XverseProviders.BitcoinProvider":
      return "xverse";
    case "AsignaProvider":
      return "asigna";
    case "FordefiProviders.UtxoProvider":
      return "fordefi";
    default:
      return provider.trim().toLowerCase() || undefined;
  }
}

async function requireOwnedProfile(ctx: any, profileId: any) {
  const userId = await getRequestUserId(ctx);
  if (!userId) throw new Error("Not authenticated");

  const profile = await ctx.db.get(profileId);
  if (!profile) throw new Error("Profile not found");
  if (profile.userId !== userId) {
    throw new Error("Cannot bind a wallet to another user's profile");
  }

  return profile;
}

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

export const bindPlayerWallet = mutation({
  args: {
    profileId: v.id("profiles"),
    network: v.string(),
    address: v.string(),
    provider: v.optional(v.string()),
    walletRole: v.optional(v.string()),
    custodyType: v.optional(v.string()),
    bnsName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const profile = await requireOwnedProfile(ctx, args.profileId);
    const now = Date.now();
    const walletRole = args.walletRole ?? "payer";
    const provider = normalizeWalletProvider(args.provider);
    const walletId = `player:${args.profileId}:${walletRole}:${args.network}`;

    const existingForProfile = await ctx.db
      .query("walletIdentities")
      .withIndex("by_owner", (q) => q.eq("ownerType", "player").eq("ownerId", String(args.profileId)))
      .collect();

    for (const row of existingForProfile) {
      if (row.network !== args.network) continue;
      if (row.walletRole !== walletRole) continue;
      if (row.walletId === walletId) continue;
      if (row.status !== "disabled") {
        await ctx.db.patch(row._id, {
          status: "disabled",
          updatedAt: now,
        });
      }
    }

    const existingByAddress = await ctx.db
      .query("walletIdentities")
      .withIndex("by_network_address", (q) => q.eq("network", args.network).eq("address", args.address))
      .first();

    if (
      existingByAddress &&
      existingByAddress.ownerType === "player" &&
      existingByAddress.ownerId !== String(args.profileId) &&
      existingByAddress.walletRole === walletRole &&
      existingByAddress.status === "active"
    ) {
      throw new Error("This wallet is already linked to another player profile.");
    }

    const payload = {
      walletId,
      network: args.network,
      address: args.address,
      bnsName: args.bnsName,
      ownerType: "player",
      ownerId: String(args.profileId),
      walletRole,
      provider,
      custodyType: args.custodyType ?? "browser",
      status: "active",
      lineageSource: "profile-wallet-bind",
      lineageRef: String(args.profileId),
      metadataJson: JSON.stringify({
        profileName: profile.name,
        mapName: profile.mapName ?? null,
        boundAt: now,
      }),
      updatedAt: now,
    };

    let walletDoc;
    if (existingByAddress) {
      await ctx.db.patch(existingByAddress._id, payload);
      walletDoc = await ctx.db.get(existingByAddress._id);
    } else {
      const existingByWalletId = await ctx.db
        .query("walletIdentities")
        .withIndex("by_walletId", (q) => q.eq("walletId", walletId))
        .first();

      if (existingByWalletId) {
        await ctx.db.patch(existingByWalletId._id, payload);
        walletDoc = await ctx.db.get(existingByWalletId._id);
      } else {
        const id = await ctx.db.insert("walletIdentities", payload);
        walletDoc = await ctx.db.get(id);
      }
    }

    const factKey = `wallet-binding:${args.network}`;
    const existingFact = await ctx.db
      .query("worldFacts")
      .withIndex("by_scope_subject_factKey", (q) =>
        q.eq("scope", "player").eq("subjectId", String(args.profileId)).eq("factKey", factKey),
      )
      .first();

    const factPayload = {
      mapName: profile.mapName,
      factKey,
      factType: "status",
      valueJson: JSON.stringify({
        profileId: String(args.profileId),
        profileName: profile.name,
        network: args.network,
        address: args.address,
        provider: provider ?? null,
        walletRole,
        status: "active",
        updatedAt: now,
      }),
      scope: "player",
      subjectId: String(args.profileId),
      source: "wallets.bindPlayerWallet",
      updatedAt: now,
    };

    if (existingFact) {
      await ctx.db.patch(existingFact._id, factPayload);
    } else {
      await ctx.db.insert("worldFacts", factPayload);
    }

    await ctx.db.insert(
      "worldEvents",
      buildWorldEventRecord({
        mapName: profile.mapName,
        eventType: "player-wallet-linked",
        sourceType: "wallet",
        sourceId: args.address,
        actorId: profile.name,
        targetId: args.address,
        summary: `${profile.name} linked a ${provider ?? "Stacks"} wallet for paid actions.`,
        payloadJson: JSON.stringify({
          profileId: String(args.profileId),
          network: args.network,
          address: args.address,
          provider: provider ?? null,
          walletRole,
        }),
      }),
    );

    return walletDoc;
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
