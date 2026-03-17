import { v } from "convex/values";
import { internalMutation, mutation, query } from "../_generated/server";
import { internal } from "../_generated/api";
import { buildWorldEventRecord } from "../lib/worldEvents";

// Epoch interval: default 3 minutes for a live world feel.
// Override via AGENT_EPOCH_MS env var (e.g. 600000 for 10 min on low-budget deploys).
function getEpochMs(): number {
  const env = (globalThis as any)?.process?.env ?? {};
  const override = Number(env.AGENT_EPOCH_MS);
  return Number.isFinite(override) && override >= 60_000 ? override : 3 * 60 * 1000;
}
const EPOCH_MS = getEpochMs();
const LOOP_STALE_MS = EPOCH_MS + 2 * 60 * 1000;
const AI_WINDOW_MS = 24 * 60 * 60 * 1000;

type AgentBudgetPolicy = {
  cooldownMs: number;
  dailyLimit: number;
  maxConversationMessages: number;
  maxUserChars: number;
  maxOutputTokens: number;
  modelHint: string;
};

type RuntimeSnapshot = {
  state: string;
  mood: string;
  intent: string;
  summary: string;
};

function buildDefaultBudgetPolicy(roleKey: string, permissionTier: string): AgentBudgetPolicy {
  if (roleKey === "market") {
    return {
      cooldownMs: 60_000,
      dailyLimit: permissionTier === "execution" ? 72 : 48,
      maxConversationMessages: 6,
      maxUserChars: 700,
      maxOutputTokens: 280,
      modelHint: "gpt-4.1-mini",
    };
  }

  if (roleKey === "guide" || roleKey === "curator") {
    return {
      cooldownMs: 30_000,
      dailyLimit: 64,
      maxConversationMessages: 8,
      maxUserChars: 900,
      maxOutputTokens: 360,
      modelHint: "gpt-4.1-mini",
    };
  }

  if (roleKey === "quests") {
    return {
      cooldownMs: 45_000,
      dailyLimit: 36,
      maxConversationMessages: 6,
      maxUserChars: 700,
      maxOutputTokens: 280,
      modelHint: "gemini-2.5-flash",
    };
  }

  return {
    cooldownMs: 90_000,
    dailyLimit: 18,
    maxConversationMessages: 4,
    maxUserChars: 500,
    maxOutputTokens: 220,
    modelHint: "gemini-2.5-flash",
  };
}

function parseBudgetPolicy(
  budgetPolicyJson: string | undefined,
  fallback: AgentBudgetPolicy,
): AgentBudgetPolicy {
  if (!budgetPolicyJson) return fallback;
  try {
    const parsed = JSON.parse(budgetPolicyJson) as Partial<AgentBudgetPolicy>;
    return {
      cooldownMs: typeof parsed.cooldownMs === "number" ? parsed.cooldownMs : fallback.cooldownMs,
      dailyLimit: typeof parsed.dailyLimit === "number" ? parsed.dailyLimit : fallback.dailyLimit,
      maxConversationMessages:
        typeof parsed.maxConversationMessages === "number"
          ? parsed.maxConversationMessages
          : fallback.maxConversationMessages,
      maxUserChars: typeof parsed.maxUserChars === "number" ? parsed.maxUserChars : fallback.maxUserChars,
      maxOutputTokens:
        typeof parsed.maxOutputTokens === "number" ? parsed.maxOutputTokens : fallback.maxOutputTokens,
      modelHint: typeof parsed.modelHint === "string" ? parsed.modelHint : fallback.modelHint,
    };
  } catch {
    return fallback;
  }
}

function summarizeRole(roleKey: string): RuntimeSnapshot {
  switch (roleKey) {
    case "guide":
      return {
        state: "guiding",
        mood: "calm",
        intent: "brief-newcomers",
        summary: "guide.btc is orienting newcomers and keeping premium learning paths ready.",
      };
    case "merchant":
      return {
        state: "hosting-tavern",
        mood: "warm",
        intent: "trade-gossip-and-consumables",
        summary: "Toma is holding the tavern floor, ready for social trades and low-friction interactions.",
      };
    case "market":
      return {
        state: "monitoring-market",
        mood: "alert",
        intent: "surface-market-signals",
        summary: "market.btc is watching quotes and keeping the paid market surface live.",
      };
    case "quests":
      return {
        state: "curating-opportunities",
        mood: "focused",
        intent: "surface-quests-and-bounties",
        summary: "quests.btc is organizing opportunities, grants, and dungeon-facing objectives.",
      };
    case "curator":
      return {
        state: "offering-premium",
        mood: "attentive",
        intent: "curate-memory-fragments",
        summary: "Mel is curating signals, premium fragments, and artifact-facing interactions.",
      };
    default:
      return {
        state: "idle",
        mood: "neutral",
        intent: "hold-post",
        summary: "Agent is holding its assigned role.",
      };
  }
}

function sameMap(mapName: string | undefined, targetMap: string | undefined) {
  if (!targetMap) return true;
  return mapName === targetMap;
}

export const listRuntimeCast = query({
  args: {
    mapName: v.optional(v.string()),
  },
  handler: async (ctx, { mapName }) => {
    const [registryRows, roleRows, stateRows, bindingRows, walletRows] = await Promise.all([
      ctx.db.query("agentRegistry").collect(),
      ctx.db.query("npcRoleAssignments").collect(),
      ctx.db.query("agentStates").collect(),
      ctx.db.query("agentAccountBindings").collect(),
      ctx.db.query("walletIdentities").collect(),
    ]);

    const rolesByAgentId = new Map(roleRows.map((row) => [row.agentId, row]));
    const statesByAgentId = new Map(stateRows.map((row) => [row.agentId, row]));
    const bindingsByAgentId = new Map(bindingRows.map((row) => [row.agentId, row]));
    const walletsByOwnerId = new Map<string, typeof walletRows>();

    for (const wallet of walletRows) {
      const existing = walletsByOwnerId.get(wallet.ownerId) ?? [];
      existing.push(wallet);
      walletsByOwnerId.set(wallet.ownerId, existing);
    }

    return registryRows
      .filter((row) => row.status === "active")
      .filter((row) => sameMap(row.homeMap, mapName))
      .map((row) => ({
        registry: row,
        role: rolesByAgentId.get(row.agentId),
        state: statesByAgentId.get(row.agentId),
        binding: bindingsByAgentId.get(row.agentId) ?? null,
        wallets: walletsByOwnerId.get(row.agentId) ?? [],
        budgetPolicy: parseBudgetPolicy(
          statesByAgentId.get(row.agentId)?.budgetPolicyJson,
          buildDefaultBudgetPolicy(row.roleKey, row.permissionTier),
        ),
      }));
  },
});

export const ensureEpochLoop = mutation({
  args: {
    mapName: v.optional(v.string()),
  },
  handler: async (ctx, { mapName }) => {
    const targetMap = mapName ?? "global";
    const factKey = `agent-runtime-loop:${targetMap}`;
    const existing = await ctx.db
      .query("worldFacts")
      .withIndex("by_factKey", (q) => q.eq("factKey", factKey))
      .first();
    const now = Date.now();

    if (existing && now - existing.updatedAt < LOOP_STALE_MS) {
      return { scheduled: false, reason: "fresh-loop", mapName: targetMap };
    }

    const payload = {
      mapName,
      factKey,
      factType: "status",
      valueJson: JSON.stringify({ loop: "agent-runtime", scheduledAt: now }),
      scope: "world",
      source: "agents/runtime.ensureEpochLoop",
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, payload);
    } else {
      await ctx.db.insert("worldFacts", payload);
    }

    await ctx.scheduler.runAfter(0, (internal as any).agents.runtime.runEpoch, { mapName });
    return { scheduled: true, mapName: targetMap };
  },
});

export const registerAiCall = mutation({
  args: {
    agentId: v.string(),
    reason: v.string(),
  },
  handler: async (ctx, { agentId, reason }) => {
    const [registry, existing] = await Promise.all([
      ctx.db
        .query("agentRegistry")
        .withIndex("by_agentId", (q) => q.eq("agentId", agentId))
        .first(),
      ctx.db
        .query("agentStates")
        .withIndex("by_agentId", (q) => q.eq("agentId", agentId))
        .first(),
    ]);

    if (!registry) throw new Error(`Unknown agent: ${agentId}`);
    if (!existing) throw new Error(`Agent state missing for ${agentId}`);

    const now = Date.now();
    const policy = parseBudgetPolicy(
      existing.budgetPolicyJson,
      buildDefaultBudgetPolicy(registry.roleKey, registry.permissionTier),
    );

    const windowStartedAt =
      existing.aiWindowStartedAt && now - existing.aiWindowStartedAt < AI_WINDOW_MS
        ? existing.aiWindowStartedAt
        : now;
    const aiCallsToday =
      existing.aiWindowStartedAt && now - existing.aiWindowStartedAt < AI_WINDOW_MS
        ? existing.aiCallsToday ?? 0
        : 0;

    if ((existing.nextAiAllowedAt ?? 0) > now) {
      const waitMs = (existing.nextAiAllowedAt ?? now) - now;
      throw new Error(`${agentId} is cooling down for ${Math.ceil(waitMs / 1000)}s.`);
    }

    if (aiCallsToday >= policy.dailyLimit) {
      throw new Error(`${agentId} has reached its current AI budget window.`);
    }

    const context =
      existing.contextJson && existing.contextJson.trim().length > 0
        ? JSON.parse(existing.contextJson)
        : {};

    await ctx.db.patch(existing._id, {
      lastAiCallAt: now,
      nextAiAllowedAt: now + policy.cooldownMs,
      aiCallsToday: aiCallsToday + 1,
      aiWindowStartedAt: windowStartedAt,
      contextJson: JSON.stringify({
        ...context,
        lastAiReason: reason,
      }),
      updatedAt: now,
    });

    return {
      agentId,
      aiCallsToday: aiCallsToday + 1,
      nextAiAllowedAt: now + policy.cooldownMs,
      cooldownMs: policy.cooldownMs,
    };
  },
});

export const runEpoch = internalMutation({
  args: {
    mapName: v.optional(v.string()),
  },
  handler: async (ctx, { mapName }) => {
    const now = Date.now();
    const [registryRows, stateRows] = await Promise.all([
      ctx.db.query("agentRegistry").collect(),
      ctx.db.query("agentStates").collect(),
    ]);

    const activeAgents = registryRows
      .filter((row) => row.status === "active")
      .filter((row) => sameMap(row.homeMap, mapName));
    const statesByAgentId = new Map(stateRows.map((row) => [row.agentId, row]));
    const summaries: string[] = [];

    for (const row of activeAgents) {
      const existing = statesByAgentId.get(row.agentId);
      const policy = parseBudgetPolicy(
        existing?.budgetPolicyJson,
        buildDefaultBudgetPolicy(row.roleKey, row.permissionTier),
      );
      const snapshot = summarizeRole(row.roleKey);
      const context =
        existing?.contextJson && existing.contextJson.trim().length > 0
          ? JSON.parse(existing.contextJson)
          : {};
      const payload = {
        agentId: row.agentId,
        agentType: row.agentType,
        state: snapshot.state,
        mood: snapshot.mood,
        currentIntent: snapshot.intent,
        memorySummary: snapshot.summary,
        contextJson: JSON.stringify({
          ...context,
          roleKey: row.roleKey,
          permissionTier: row.permissionTier,
          homeMap: row.homeMap,
          homeZoneKey: row.homeZoneKey,
        }),
        budgetPolicyJson: JSON.stringify(policy),
        lastAiCallAt: existing?.lastAiCallAt,
        nextAiAllowedAt: existing?.nextAiAllowedAt,
        aiCallsToday: existing?.aiCallsToday ?? 0,
        aiWindowStartedAt: existing?.aiWindowStartedAt,
        lastEpochAt: now,
        transitionsJson: existing?.transitionsJson,
        updatedAt: now,
      };

      if (existing) {
        await ctx.db.patch(existing._id, payload);
      } else {
        await ctx.db.insert("agentStates", payload);
      }

      summaries.push(`${row.displayName}: ${snapshot.intent}`);
    }

    const factKey = `agent-runtime-loop:${mapName ?? "global"}`;
    const existingFact = await ctx.db
      .query("worldFacts")
      .withIndex("by_factKey", (q) => q.eq("factKey", factKey))
      .first();
    const factPayload = {
      mapName,
      factKey,
      factType: "status",
      valueJson: JSON.stringify({
        loop: "agent-runtime",
        ranAt: now,
        activeAgents: activeAgents.length,
        summaries,
      }),
      scope: "world",
      source: "agents/runtime.runEpoch",
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
        mapName,
        eventType: "agent-runtime-epoch",
        sourceType: "system",
        sourceId: "agents/runtime",
        summary:
          summaries.length > 0
            ? `Agent runtime refreshed: ${summaries.join(" | ")}`
            : "Agent runtime refreshed with no active agents.",
        payloadJson: JSON.stringify({
          activeAgents: activeAgents.map((row) => row.agentId),
          ranAt: now,
        }),
      }),
    );

    // Schedule autonomous thinking for eligible agents.
    // Stagger by role so not all 5 fire every epoch — market always thinks (has live data),
    // others rotate to stay within budget.
    const epochCount = Math.floor(now / EPOCH_MS);
    const thinkStagger: Record<string, number> = {
      market: 1,   // every epoch
      guide: 2,    // every other epoch
      curator: 2,
      quests: 3,   // every third epoch
      merchant: 4, // every fourth epoch
    };

    for (const row of activeAgents) {
      const interval = thinkStagger[row.roleKey] ?? 3;
      if (epochCount % interval === 0) {
        await ctx.scheduler.runAfter(
          Math.floor(Math.random() * 30_000), // spread within 30s to avoid simultaneous calls
          (internal as any).agents.agentThink.agentThinkAction,
          {
            agentId: row.agentId,
            roleKey: row.roleKey,
            mapName,
            displayName: row.displayName,
          },
        );
      }
    }

    await ctx.scheduler.runAfter(EPOCH_MS, (internal as any).agents.runtime.runEpoch, { mapName });
  },
});
