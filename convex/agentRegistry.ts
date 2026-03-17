import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

function parseJsonObject(value: string | undefined): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export const listAgents = query({
  args: {
    network: v.optional(v.string()),
    status: v.optional(v.string()),
  },
  handler: async (ctx, { network, status }) => {
    if (network && status) {
      return await ctx.db
        .query("agentRegistry")
        .withIndex("by_network_status", (q) => q.eq("network", network).eq("status", status))
        .collect();
    }
    return await ctx.db.query("agentRegistry").collect();
  },
});

export const getAgent = query({
  args: {
    agentId: v.string(),
  },
  handler: async (ctx, { agentId }) => {
    return await ctx.db
      .query("agentRegistry")
      .withIndex("by_agentId", (q) => q.eq("agentId", agentId))
      .first();
  },
});

export const upsertAgent = mutation({
  args: {
    agentId: v.string(),
    displayName: v.string(),
    network: v.string(),
    walletAddress: v.optional(v.string()),
    walletProvider: v.optional(v.string()),
    walletStatus: v.optional(v.string()),
    bnsName: v.optional(v.string()),
    agentType: v.string(),
    roleKey: v.string(),
    permissionTier: v.string(),
    status: v.string(),
    homeWorld: v.optional(v.string()),
    homeMap: v.optional(v.string()),
    homeZoneKey: v.optional(v.string()),
    supportedAssets: v.array(v.string()),
    testnetAddress: v.optional(v.string()),
    mainnetAddress: v.optional(v.string()),
    lineageSource: v.optional(v.string()),
    lineageRef: v.optional(v.string()),
    metadataJson: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("agentRegistry")
      .withIndex("by_agentId", (q) => q.eq("agentId", args.agentId))
      .first();
    const payload = {
      ...args,
      updatedAt: Date.now(),
    };
    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return existing._id;
    }
    return await ctx.db.insert("agentRegistry", payload);
  },
});

export const getAccountBinding = query({
  args: {
    agentId: v.string(),
  },
  handler: async (ctx, { agentId }) => {
    return await ctx.db
      .query("agentAccountBindings")
      .withIndex("by_agentId", (q) => q.eq("agentId", agentId))
      .first();
  },
});

export const upsertAccountBinding = mutation({
  args: {
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
    status: v.string(),
    testnetAddress: v.optional(v.string()),
    mainnetAddress: v.optional(v.string()),
    lineageSource: v.optional(v.string()),
    lineageRef: v.optional(v.string()),
    metadataJson: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("agentAccountBindings")
      .withIndex("by_agentId", (q) => q.eq("agentId", args.agentId))
      .first();
    const payload = {
      ...args,
      updatedAt: Date.now(),
    };
    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return existing._id;
    }
    return await ctx.db.insert("agentAccountBindings", payload);
  },
});

export const listCanonicalAgentWalletMatrix = query({
  args: {
    network: v.optional(v.string()),
    status: v.optional(v.string()),
  },
  handler: async (ctx, { network, status }) => {
    const [registryRows, bindingRows, walletRows] = await Promise.all([
      ctx.db.query("agentRegistry").collect(),
      ctx.db.query("agentAccountBindings").collect(),
      ctx.db.query("walletIdentities").collect(),
    ]);

    const filteredRegistry = registryRows.filter((row) => !network || row.network === network);
    const filteredStatus = filteredRegistry.filter((row) => !status || row.status === status);
    const bindingsByAgentId = new Map(bindingRows.map((row) => [row.agentId, row]));
    const walletsByOwnerId = new Map<string, (typeof walletRows)>();

    for (const wallet of walletRows) {
      const existing = walletsByOwnerId.get(wallet.ownerId) ?? [];
      existing.push(wallet);
      walletsByOwnerId.set(wallet.ownerId, existing);
    }

    return filteredStatus.map((registry) => {
      const binding = bindingsByAgentId.get(registry.agentId) ?? null;
      const registryMeta = parseJsonObject(registry.metadataJson);
      const bindingMeta = parseJsonObject(binding?.metadataJson);

      return {
        agentId: registry.agentId,
        displayName: registry.displayName,
        roleKey: registry.roleKey,
        permissionTier: registry.permissionTier,
        network: registry.network,
        walletAddress: registry.walletAddress ?? binding?.agentAddress ?? null,
        walletProvider:
          registry.walletProvider ??
          binding?.walletProvider ??
          (typeof registryMeta.walletProvider === "string" ? registryMeta.walletProvider : null) ??
          (typeof bindingMeta.walletProvider === "string" ? bindingMeta.walletProvider : null) ??
          null,
        walletStatus:
          registry.walletStatus ??
          binding?.walletStatus ??
          (typeof registryMeta.walletStatus === "string" ? registryMeta.walletStatus : null) ??
          (typeof bindingMeta.walletStatus === "string" ? bindingMeta.walletStatus : null) ??
          null,
        testnetAddress:
          registry.testnetAddress ??
          binding?.testnetAddress ??
          (typeof registryMeta.testnetAddress === "string" ? registryMeta.testnetAddress : null) ??
          (typeof bindingMeta.testnetAddress === "string" ? bindingMeta.testnetAddress : null) ??
          null,
        mainnetAddress:
          registry.mainnetAddress ??
          binding?.mainnetAddress ??
          (typeof registryMeta.mainnetAddress === "string" ? registryMeta.mainnetAddress : null) ??
          (typeof bindingMeta.mainnetAddress === "string" ? bindingMeta.mainnetAddress : null) ??
          (typeof bindingMeta.mainnetExecutionAddress === "string"
            ? bindingMeta.mainnetExecutionAddress
            : null) ??
          null,
        lineageSource:
          registry.lineageSource ??
          binding?.lineageSource ??
          (typeof registryMeta.source === "string" ? registryMeta.source : null) ??
          (typeof bindingMeta.source === "string" ? bindingMeta.source : null) ??
          null,
        lineageRef:
          registry.lineageRef ??
          binding?.lineageRef ??
          (typeof registryMeta.lineageRef === "string" ? registryMeta.lineageRef : null) ??
          (typeof bindingMeta.lineageRef === "string" ? bindingMeta.lineageRef : null) ??
          null,
        bindingStatus: binding?.status ?? null,
        canTradeAssets: binding?.canTradeAssets ?? false,
        wallets: (walletsByOwnerId.get(registry.agentId) ?? []).map((wallet) => {
          const walletMeta = parseJsonObject(wallet.metadataJson);
          return {
            walletId: wallet.walletId,
            walletRole: wallet.walletRole,
            provider: wallet.provider ?? null,
            status: wallet.status,
            address: wallet.address,
            linkedTestnetAddress:
              wallet.linkedTestnetAddress ??
              (typeof walletMeta.testnetAddress === "string" ? walletMeta.testnetAddress : null) ??
              null,
            linkedMainnetAddress:
              wallet.linkedMainnetAddress ??
              (typeof walletMeta.mainnetAddress === "string" ? walletMeta.mainnetAddress : null) ??
              (typeof walletMeta.mainnetExecutionAddress === "string"
                ? walletMeta.mainnetExecutionAddress
                : null) ??
              null,
            lineageSource:
              wallet.lineageSource ??
              (typeof walletMeta.source === "string" ? walletMeta.source : null) ??
              null,
            lineageRef:
              wallet.lineageRef ??
              (typeof walletMeta.lineageRef === "string" ? walletMeta.lineageRef : null) ??
              null,
          };
        }),
      };
    });
  },
});
