import { v } from "convex/values";
import { mutation, query } from "../_generated/server";

const DEFAULT_TRANSITIONS = {
  idle: ["teaching", "guiding", "offering-premium"],
  teaching: ["idle", "guiding", "offering-premium"],
  guiding: ["idle", "teaching", "offering-premium"],
  "offering-premium": ["idle", "awaiting-payment"],
  "awaiting-payment": ["idle", "delivering-premium"],
  "delivering-premium": ["idle"],
};

function normalizeTransitions(
  transitions: Record<string, string[]> | undefined,
) {
  return JSON.stringify(transitions ?? DEFAULT_TRANSITIONS);
}

export const get = query({
  args: { agentId: v.string() },
  handler: async (ctx, { agentId }) => {
    return await ctx.db
      .query("agentStates")
      .withIndex("by_agentId", (q) => q.eq("agentId", agentId))
      .first();
  },
});

export const listByState = query({
  args: {
    agentType: v.string(),
    state: v.string(),
  },
  handler: async (ctx, { agentType, state }) => {
    return await ctx.db
      .query("agentStates")
      .withIndex("by_agentType_state", (q) => q.eq("agentType", agentType).eq("state", state))
      .collect();
  },
});

export const ensure = mutation({
  args: {
    agentId: v.string(),
    agentType: v.string(),
    state: v.optional(v.string()),
    mood: v.optional(v.string()),
    currentIntent: v.optional(v.string()),
    memorySummary: v.optional(v.string()),
    contextJson: v.optional(v.string()),
    budgetPolicyJson: v.optional(v.string()),
    lastAiCallAt: v.optional(v.number()),
    nextAiAllowedAt: v.optional(v.number()),
    aiCallsToday: v.optional(v.number()),
    aiWindowStartedAt: v.optional(v.number()),
    lastEpochAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("agentStates")
      .withIndex("by_agentId", (q) => q.eq("agentId", args.agentId))
      .first();

    const payload = {
      agentId: args.agentId,
      agentType: args.agentType,
      state: args.state ?? "idle",
      mood: args.mood,
      currentIntent: args.currentIntent,
      memorySummary: args.memorySummary,
      contextJson: args.contextJson,
      budgetPolicyJson: args.budgetPolicyJson,
      lastAiCallAt: args.lastAiCallAt,
      nextAiAllowedAt: args.nextAiAllowedAt,
      aiCallsToday: args.aiCallsToday,
      aiWindowStartedAt: args.aiWindowStartedAt,
      lastEpochAt: args.lastEpochAt,
      transitionsJson: normalizeTransitions(undefined),
      updatedAt: Date.now(),
    };

    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return await ctx.db.get(existing._id);
    }

    const id = await ctx.db.insert("agentStates", payload);
    return await ctx.db.get(id);
  },
});

export const transition = mutation({
  args: {
    agentId: v.string(),
    nextState: v.string(),
    mood: v.optional(v.string()),
    currentIntent: v.optional(v.string()),
    memorySummary: v.optional(v.string()),
    contextJson: v.optional(v.string()),
    budgetPolicyJson: v.optional(v.string()),
    lastAiCallAt: v.optional(v.number()),
    nextAiAllowedAt: v.optional(v.number()),
    aiCallsToday: v.optional(v.number()),
    aiWindowStartedAt: v.optional(v.number()),
    lastEpochAt: v.optional(v.number()),
  },
  handler: async (
    ctx,
    {
      agentId,
      nextState,
      mood,
      currentIntent,
      memorySummary,
      contextJson,
      budgetPolicyJson,
      lastAiCallAt,
      nextAiAllowedAt,
      aiCallsToday,
      aiWindowStartedAt,
      lastEpochAt,
    },
  ) => {
    const existing = await ctx.db
      .query("agentStates")
      .withIndex("by_agentId", (q) => q.eq("agentId", agentId))
      .first();

    if (!existing) {
      throw new Error(`Agent state not found for ${agentId}`);
    }

    const transitions = JSON.parse(existing.transitionsJson ?? "{}") as Record<string, string[]>;
    const allowed = transitions[existing.state] ?? [];
    if (existing.state === nextState) {
      await ctx.db.patch(existing._id, {
        mood: mood ?? existing.mood,
        currentIntent: currentIntent ?? existing.currentIntent,
        memorySummary: memorySummary ?? existing.memorySummary,
        contextJson: contextJson ?? existing.contextJson,
        budgetPolicyJson: budgetPolicyJson ?? existing.budgetPolicyJson,
        lastAiCallAt: lastAiCallAt ?? existing.lastAiCallAt,
        nextAiAllowedAt: nextAiAllowedAt ?? existing.nextAiAllowedAt,
        aiCallsToday: aiCallsToday ?? existing.aiCallsToday,
        aiWindowStartedAt: aiWindowStartedAt ?? existing.aiWindowStartedAt,
        lastEpochAt: lastEpochAt ?? existing.lastEpochAt,
        updatedAt: Date.now(),
      });

      return await ctx.db.get(existing._id);
    }

    if (allowed.length > 0 && !allowed.includes(nextState)) {
      throw new Error(`Invalid transition from ${existing.state} to ${nextState}`);
    }

    await ctx.db.patch(existing._id, {
      state: nextState,
      mood: mood ?? existing.mood,
      currentIntent: currentIntent ?? existing.currentIntent,
      memorySummary: memorySummary ?? existing.memorySummary,
      contextJson: contextJson ?? existing.contextJson,
      budgetPolicyJson: budgetPolicyJson ?? existing.budgetPolicyJson,
      lastAiCallAt: lastAiCallAt ?? existing.lastAiCallAt,
      nextAiAllowedAt: nextAiAllowedAt ?? existing.nextAiAllowedAt,
      aiCallsToday: aiCallsToday ?? existing.aiCallsToday,
      aiWindowStartedAt: aiWindowStartedAt ?? existing.aiWindowStartedAt,
      lastEpochAt: lastEpochAt ?? existing.lastEpochAt,
      updatedAt: Date.now(),
    });

    return await ctx.db.get(existing._id);
  },
});
