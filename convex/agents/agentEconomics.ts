/**
 * Agent economics layer.
 *
 * Tracks value flows between agents in the world:
 *  - records earnings when premium endpoints are paid
 *  - records inter-agent transfers
 *  - records NFT/SFT mints tied to world interactions
 *  - surfaces an economy snapshot for the World Feed and UI
 *
 * This is the ledger layer. Actual Stacks transactions are signed by the
 * x402-api service using each agent's wallet. This module records the
 * semantic meaning of those flows in Convex world state.
 */
import { v } from "convex/values";
import { internalMutation, mutation, query } from "../_generated/server";
import { buildWorldEventRecord } from "../lib/worldEvents";

function parseJsonSafe(value?: string | null): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

// ─── Record an agent earning from a premium payment ─────────────────────────

export const recordAgentEarning = internalMutation({
  args: {
    agentId: v.string(),
    agentDisplayName: v.string(),
    amountMicroStx: v.number(),
    payerPrincipal: v.string(),
    paymentTxid: v.string(),
    resourceId: v.string(),
    mapName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const amountStx = args.amountMicroStx / 1_000_000;

    // Update agent state with running earnings total
    const state = await ctx.db
      .query("agentStates")
      .withIndex("by_agentId", (q) => q.eq("agentId", args.agentId))
      .first();

    if (state) {
      let prevContext: Record<string, unknown> = {};
      try { prevContext = JSON.parse(state.contextJson ?? "{}"); } catch { /* */ }

      const totalEarned = ((prevContext.totalEarnedStx as number) ?? 0) + amountStx;
      const earningCount = ((prevContext.earningCount as number) ?? 0) + 1;

      await ctx.db.patch(state._id, {
        contextJson: JSON.stringify({
          ...prevContext,
          totalEarnedStx: totalEarned,
          earningCount,
          lastEarningAt: now,
          lastEarningTxid: args.paymentTxid,
        }),
        updatedAt: now,
      });
    }

    // Post earning event to World Feed
    await ctx.db.insert(
      "worldEvents",
      buildWorldEventRecord({
        mapName: args.mapName,
        eventType: "agent-earned",
        sourceType: "agent",
        sourceId: args.agentId,
        actorId: args.agentId,
        summary: `${args.agentDisplayName} earned ${amountStx.toFixed(4)} STX from ${args.payerPrincipal.slice(0, 8)}… for ${args.resourceId}.`,
        detailsJson: JSON.stringify({
          agentId: args.agentId,
          amountStx,
          payerPrincipal: args.payerPrincipal,
          paymentTxid: args.paymentTxid,
          resourceId: args.resourceId,
        }),
      }),
    );
  },
});

// ─── Record an inter-agent transfer ─────────────────────────────────────────

export const recordAgentTransfer = internalMutation({
  args: {
    fromAgentId: v.string(),
    fromAgentDisplayName: v.string(),
    toAgentId: v.string(),
    toAgentDisplayName: v.string(),
    amountMicroStx: v.number(),
    reason: v.string(),
    txid: v.optional(v.string()),
    mapName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const amountStx = args.amountMicroStx / 1_000_000;

    await ctx.db.insert(
      "worldEvents",
      buildWorldEventRecord({
        mapName: args.mapName,
        eventType: "agent-transfer",
        sourceType: "agent",
        sourceId: args.fromAgentId,
        actorId: args.fromAgentId,
        targetId: args.toAgentId,
        summary: `${args.fromAgentDisplayName} → ${args.toAgentDisplayName}: ${amountStx.toFixed(4)} STX (${args.reason})`,
        detailsJson: JSON.stringify({
          fromAgentId: args.fromAgentId,
          toAgentId: args.toAgentId,
          amountStx,
          reason: args.reason,
          txid: args.txid ?? null,
        }),
      }),
    );
    void now; // suppress unused warning
  },
});

// ─── Record an NFT mint tied to a world interaction ─────────────────────────

export const recordNftMint = internalMutation({
  args: {
    agentId: v.string(),
    agentDisplayName: v.string(),
    recipientPrincipal: v.string(),
    nftType: v.string(),          // "wax-cylinder" | "bookshelf-lore" | "quest-proof"
    nftContractId: v.optional(v.string()),
    tokenId: v.optional(v.number()),
    mintTxid: v.optional(v.string()),
    objectKey: v.optional(v.string()),
    mapName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert(
      "worldEvents",
      buildWorldEventRecord({
        mapName: args.mapName,
        eventType: "nft-minted",
        sourceType: "agent",
        sourceId: args.agentId,
        actorId: args.agentId,
        objectKey: args.objectKey,
        summary: `${args.agentDisplayName} minted a ${args.nftType} NFT for ${args.recipientPrincipal.slice(0, 8)}…`,
        detailsJson: JSON.stringify({
          agentId: args.agentId,
          recipientPrincipal: args.recipientPrincipal,
          nftType: args.nftType,
          nftContractId: args.nftContractId ?? null,
          tokenId: args.tokenId ?? null,
          mintTxid: args.mintTxid ?? null,
          objectKey: args.objectKey ?? null,
        }),
      }),
    );
  },
});

// ─── Record an SFT issuance (quest token, guild token, etc.) ─────────────────

export const recordSftIssued = internalMutation({
  args: {
    agentId: v.string(),
    agentDisplayName: v.string(),
    recipientPrincipal: v.string(),
    sftType: v.string(),          // "tavern-token" | "guild-token" | "bounty-credit"
    amount: v.number(),
    sftContractId: v.optional(v.string()),
    txid: v.optional(v.string()),
    mapName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert(
      "worldEvents",
      buildWorldEventRecord({
        mapName: args.mapName,
        eventType: "sft-issued",
        sourceType: "agent",
        sourceId: args.agentId,
        actorId: args.agentId,
        summary: `${args.agentDisplayName} issued ${args.amount} ${args.sftType} to ${args.recipientPrincipal.slice(0, 8)}…`,
        detailsJson: JSON.stringify({
          agentId: args.agentId,
          recipientPrincipal: args.recipientPrincipal,
          sftType: args.sftType,
          amount: args.amount,
          sftContractId: args.sftContractId ?? null,
          txid: args.txid ?? null,
        }),
      }),
    );
  },
});

// ─── Economy snapshot query (for UI / World Feed header) ─────────────────────

export const getEconomySnapshot = query({
  args: { mapName: v.optional(v.string()) },
  handler: async (ctx, { mapName }) => {
    const [states, recentEvents, registryRows] = await Promise.all([
      ctx.db.query("agentStates").collect(),
      ctx.db
        .query("worldEvents")
        .withIndex("by_map_time", (q: any) => mapName ? q.eq("mapName", mapName) : q)
        .order("desc")
        .take(50),
      ctx.db.query("agentRegistry").collect(),
    ]);

    const stateByAgent = new Map(states.map((row) => [row.agentId, row]));
    const registryByAgent = new Map(registryRows.map((row) => [row.agentId, row]));

    const leaderboard = registryRows
      .filter((row) => row.status !== "disabled")
      .map((row) => {
        const state = stateByAgent.get(row.agentId);
        const ctx2 = parseJsonSafe(state?.contextJson);
        return {
          agentId: row.agentId,
          displayName: row.displayName,
          roleKey: row.roleKey,
          walletAddress: row.walletAddress ?? null,
          network: row.network,
          permissionTier: row.permissionTier,
          totalEarnedStx: (ctx2.totalEarnedStx as number) ?? 0,
          earningCount: (ctx2.earningCount as number) ?? 0,
          lastEarningAt: (ctx2.lastEarningAt as number) ?? null,
          lastEarningTxid: (ctx2.lastEarningTxid as string) ?? null,
        };
      })
      .sort((a, b) => {
        if (b.totalEarnedStx !== a.totalEarnedStx) {
          return b.totalEarnedStx - a.totalEarnedStx;
        }
        return a.displayName.localeCompare(b.displayName);
      });

    // Count economic events
    const economicEventTypes = ["agent-earned", "agent-transfer", "nft-minted", "sft-issued", "premium-access-granted"];
    const economicEvents = recentEvents.filter((e: any) =>
      economicEventTypes.includes(e.eventType),
    );

    const totalEarnedStx = leaderboard.reduce((sum, row) => sum + row.totalEarnedStx, 0);

    return {
      leaderboard,
      totalEarnedStx,
      recentEconomicEvents: economicEvents.slice(0, 12).map((e: any) => {
        const details = parseJsonSafe(e.payloadJson ?? e.detailsJson);
        const actorId = (e.actorId as string | undefined) ?? (e.sourceId as string | undefined) ?? null;
        const actor = actorId ? registryByAgent.get(actorId) : null;
        const txid =
          (details.txid as string | undefined) ??
          (details.paymentTxid as string | undefined) ??
          (details.mintTxid as string | undefined) ??
          null;
        const secondaryTxid =
          details.txid && details.paymentTxid && details.txid !== details.paymentTxid
            ? (details.paymentTxid as string)
            : null;
        const amountStx =
          typeof details.amountStx === "number"
            ? (details.amountStx as number)
            : typeof details.amountMicroStx === "number"
              ? (details.amountMicroStx as number) / 1_000_000
              : null;
        return {
          eventType: e.eventType,
          summary: e.summary,
          timestamp: e.timestamp,
          actorId,
          actorDisplayName: actor?.displayName ?? actorId,
          txid,
          secondaryTxid,
          amountStx,
          resourceId: (details.resourceId as string | undefined) ?? null,
          objectKey: (e.objectKey as string | undefined) ?? null,
          zoneKey: (e.zoneKey as string | undefined) ?? null,
        };
      }),
      totalEconomicEvents: economicEvents.length,
    };
  },
});

// ─── Public mutation: called from x402-api after payment confirmed ───────────

export const onPremiumPaymentConfirmed = mutation({
  args: {
    agentId: v.string(),
    agentDisplayName: v.string(),
    amountMicroStx: v.number(),
    payerPrincipal: v.string(),
    paymentTxid: v.string(),
    resourceId: v.string(),
    mapName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Record the earning
    const state = await ctx.db
      .query("agentStates")
      .withIndex("by_agentId", (q) => q.eq("agentId", args.agentId))
      .first();

    if (state) {
      let prevContext: Record<string, unknown> = {};
      try { prevContext = JSON.parse(state.contextJson ?? "{}"); } catch { /* */ }
      const amountStx = args.amountMicroStx / 1_000_000;
      const totalEarned = ((prevContext.totalEarnedStx as number) ?? 0) + amountStx;
      const earningCount = ((prevContext.earningCount as number) ?? 0) + 1;
      await ctx.db.patch(state._id, {
        contextJson: JSON.stringify({
          ...prevContext,
          totalEarnedStx: totalEarned,
          earningCount,
          lastEarningAt: Date.now(),
          lastEarningTxid: args.paymentTxid,
        }),
        updatedAt: Date.now(),
      });
    }

    await ctx.db.insert(
      "worldEvents",
      buildWorldEventRecord({
        mapName: args.mapName,
        eventType: "agent-earned",
        sourceType: "agent",
        sourceId: args.agentId,
        actorId: args.agentId,
        summary: `${args.agentDisplayName} earned ${(args.amountMicroStx / 1_000_000).toFixed(4)} STX from ${args.payerPrincipal.slice(0, 8)}… for ${args.resourceId}.`,
        detailsJson: JSON.stringify(args),
      }),
    );

    return { recorded: true };
  },
});
