import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { getRequestUserId } from "./lib/getRequestUserId";

const GUEST_VIEWER_FACT_PREFIX = "guest-viewer:";
const POLICY_SNAPSHOT_FACT_KEY = "runtime-policy-snapshot";
const AI_BUDGET_FACT_KEY = "runtime-policy:ai-budget";

type AiBudgetState = {
  windowStartedAt: number;
  callCount: number;
  autonomousCallCount: number;
  approximateInputTokens: number;
  reservedOutputTokens: number;
  lastSurface?: string | null;
  lastAgentId?: string | null;
};

type RuntimePolicySnapshot = {
  generatedAt: number;
  sessionDurationMs: number;
  maxConcurrentPlayers: number;
  maxGuestViewers: number;
  activePlayers: number;
  activeGuestViewers: number;
  totalActiveViewers: number;
  aiBudget: AiBudgetState & {
    windowMs: number;
    maxCallsPerWindow: number;
    maxAutonomousCallsPerWindow: number;
    maxReservedOutputTokensPerWindow: number;
  };
};

type StoredRuntimePolicySnapshot = RuntimePolicySnapshot;

function readNumberEnv(name: string, fallback: number, min = 0) {
  const env = (globalThis as any)?.process?.env ?? {};
  const raw = Number(env[name]);
  return Number.isFinite(raw) && raw >= min ? raw : fallback;
}

export function getRuntimePolicyConfig() {
  const freeSessionMinutes = readNumberEnv(
    "RUNTIME_FREE_SESSION_MINUTES",
    readNumberEnv("RUNTIME_SESSION_MINUTES", 3, 1),
    1,
  );
  return {
    sessionDurationMs: Math.round(freeSessionMinutes * 60 * 1000),
    maxConcurrentPlayers: Math.max(1, Math.floor(readNumberEnv("MAX_CONCURRENT_PLAYERS", 3, 1))),
    maxGuestViewers: Math.max(0, Math.floor(readNumberEnv("MAX_GUEST_VIEWERS", 2, 0))),
    authenticatedViewerTtlMs: Math.max(5_000, readNumberEnv("AUTH_VIEWER_TTL_MS", 30_000, 5_000)),
    guestViewerTtlMs: Math.max(5_000, readNumberEnv("GUEST_VIEWER_TTL_MS", 30_000, 5_000)),
    aiBudgetWindowMs: Math.max(60_000, readNumberEnv("AI_BUDGET_WINDOW_MS", 60 * 60 * 1000, 60_000)),
    maxAiCallsPerWindow: Math.max(1, Math.floor(readNumberEnv("AI_MAX_CALLS_PER_WINDOW", 80, 1))),
    maxAutonomousAiCallsPerWindow: Math.max(
      0,
      Math.floor(readNumberEnv("AI_MAX_AUTONOMOUS_CALLS_PER_WINDOW", 24, 0)),
    ),
    maxReservedOutputTokensPerWindow: Math.max(
      128,
      Math.floor(readNumberEnv("AI_MAX_RESERVED_OUTPUT_TOKENS_PER_WINDOW", 24_000, 128)),
    ),
  };
}

function getEffectiveMaxGuestViewers(config = getRuntimePolicyConfig()) {
  return Math.max(config.maxGuestViewers, 5);
}

function parseAiBudgetState(raw: string | undefined, now: number, windowMs: number): AiBudgetState {
  if (!raw) {
    return {
      windowStartedAt: now,
      callCount: 0,
      autonomousCallCount: 0,
      approximateInputTokens: 0,
      reservedOutputTokens: 0,
      lastSurface: null,
      lastAgentId: null,
    };
  }
  try {
    const parsed = JSON.parse(raw) as Partial<AiBudgetState>;
    const windowStartedAt =
      typeof parsed.windowStartedAt === "number" && now - parsed.windowStartedAt < windowMs
        ? parsed.windowStartedAt
        : now;
    const windowIsFresh = windowStartedAt !== now;
    return {
      windowStartedAt,
      callCount: windowIsFresh && typeof parsed.callCount === "number" ? parsed.callCount : 0,
      autonomousCallCount:
        windowIsFresh && typeof parsed.autonomousCallCount === "number" ? parsed.autonomousCallCount : 0,
      approximateInputTokens:
        windowIsFresh && typeof parsed.approximateInputTokens === "number"
          ? parsed.approximateInputTokens
          : 0,
      reservedOutputTokens:
        windowIsFresh && typeof parsed.reservedOutputTokens === "number" ? parsed.reservedOutputTokens : 0,
      lastSurface: typeof parsed.lastSurface === "string" ? parsed.lastSurface : null,
      lastAgentId: typeof parsed.lastAgentId === "string" ? parsed.lastAgentId : null,
    };
  } catch {
    return {
      windowStartedAt: now,
      callCount: 0,
      autonomousCallCount: 0,
      approximateInputTokens: 0,
      reservedOutputTokens: 0,
      lastSurface: null,
      lastAgentId: null,
    };
  }
}

function estimateInputTokens(approximateInputChars: number) {
  return Math.max(1, Math.ceil(Math.max(0, approximateInputChars) / 4));
}

function parseStoredRuntimePolicySnapshot(raw: string | undefined): StoredRuntimePolicySnapshot | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredRuntimePolicySnapshot;
  } catch {
    return null;
  }
}

function sameRuntimePolicySnapshot(
  left: StoredRuntimePolicySnapshot | null,
  right: RuntimePolicySnapshot,
): boolean {
  if (!left) return false;
  return (
    left.sessionDurationMs === right.sessionDurationMs &&
    left.maxConcurrentPlayers === right.maxConcurrentPlayers &&
    left.maxGuestViewers === right.maxGuestViewers &&
    left.activePlayers === right.activePlayers &&
    left.activeGuestViewers === right.activeGuestViewers &&
    left.totalActiveViewers === right.totalActiveViewers &&
    JSON.stringify(left.aiBudget) === JSON.stringify(right.aiBudget)
  );
}

function buildGuestViewerFactKey(sessionId: string) {
  return `${GUEST_VIEWER_FACT_PREFIX}${sessionId}`;
}

async function getAiBudgetFact(ctx: any) {
  return await ctx.db
    .query("worldFacts")
    .withIndex("by_factKey", (q: any) => q.eq("factKey", AI_BUDGET_FACT_KEY))
    .first();
}

async function getPolicySnapshotFact(ctx: any) {
  return await ctx.db
    .query("worldFacts")
    .withIndex("by_factKey", (q: any) => q.eq("factKey", POLICY_SNAPSHOT_FACT_KEY))
    .first();
}

export async function listActivePlayerPresence(ctx: any, now = Date.now()) {
  const { authenticatedViewerTtlMs } = getRuntimePolicyConfig();
  const cutoff = now - authenticatedViewerTtlMs;
  const rows = await ctx.db.query("presence").collect();
  return rows.filter((row: any) => (row.lastSeen ?? 0) > cutoff);
}

export async function listActiveGuestViewerFacts(ctx: any, now = Date.now()) {
  const { guestViewerTtlMs } = getRuntimePolicyConfig();
  const cutoff = now - guestViewerTtlMs;
  const rows = await ctx.db
    .query("worldFacts")
    .withIndex("by_scope_subject", (q: any) => q.eq("scope", "player"))
    .collect();
  return rows.filter(
    (row: any) => row.factKey.startsWith(GUEST_VIEWER_FACT_PREFIX) && (row.updatedAt ?? 0) > cutoff,
  );
}

export async function hasActiveViewer(ctx: any, now = Date.now()) {
  const [players, guests] = await Promise.all([
    listActivePlayerPresence(ctx, now),
    listActiveGuestViewerFacts(ctx, now),
  ]);
  return players.length > 0 || guests.length > 0;
}

export async function assertPlayerCapacity(ctx: any, profileId: any, now = Date.now()) {
  const { maxConcurrentPlayers } = getRuntimePolicyConfig();
  const activePlayers = await listActivePlayerPresence(ctx, now);
  const alreadyPresent = activePlayers.some((row: any) => row.profileId === profileId);
  if (!alreadyPresent && activePlayers.length >= maxConcurrentPlayers) {
    throw new Error(
      `Live demo capacity reached (${activePlayers.length}/${maxConcurrentPlayers} players). Try again in a few minutes.`,
    );
  }
  return {
    activePlayers: alreadyPresent ? activePlayers.length : activePlayers.length + 1,
    maxConcurrentPlayers,
  };
}

export async function assertGuestCapacity(ctx: any, sessionId: string, now = Date.now()) {
  const effectiveMaxGuestViewers = getEffectiveMaxGuestViewers();
  const activeGuests = await listActiveGuestViewerFacts(ctx, now);
  const currentFactKey = buildGuestViewerFactKey(sessionId);
  const alreadyPresent = activeGuests.some((row: any) => row.factKey === currentFactKey);
  if (!alreadyPresent && activeGuests.length >= effectiveMaxGuestViewers) {
    throw new Error(
      `Guest viewer capacity reached (${activeGuests.length}/${effectiveMaxGuestViewers}). Use an invite-backed player session instead.`,
    );
  }
  return {
    activeGuestViewers: alreadyPresent ? activeGuests.length : activeGuests.length + 1,
    maxGuestViewers: effectiveMaxGuestViewers,
  };
}

export async function touchGuestViewer(
  ctx: any,
  { sessionId, mapName, now = Date.now() }: { sessionId: string; mapName?: string; now?: number },
) {
  const { guestViewerTtlMs } = getRuntimePolicyConfig();
  await assertGuestCapacity(ctx, sessionId, now);

  const factKey = buildGuestViewerFactKey(sessionId);
  const existing = await ctx.db
    .query("worldFacts")
    .withIndex("by_factKey", (q: any) => q.eq("factKey", factKey))
    .first();

  const payload = {
    mapName,
    factKey,
    factType: "status",
    valueJson: JSON.stringify({
      viewerType: "guest",
      sessionId,
      mapName: mapName ?? null,
      heartbeatAt: now,
    }),
    scope: "player",
    subjectId: factKey,
    source: "runtimePolicy.touchGuestViewer",
    updatedAt: now,
  };

  if (existing) {
    await ctx.db.patch(existing._id, payload);
    return {
      isNew: false,
      wasStale: now - (existing.updatedAt ?? 0) > guestViewerTtlMs,
    };
  } else {
    await ctx.db.insert("worldFacts", payload);
    return {
      isNew: true,
      wasStale: true,
    };
  }
}

async function buildRuntimePolicySnapshot(ctx: any, now = Date.now()): Promise<RuntimePolicySnapshot> {
  const config = getRuntimePolicyConfig();
  const [activePlayers, activeGuests, aiBudgetFact] = await Promise.all([
    listActivePlayerPresence(ctx, now),
    listActiveGuestViewerFacts(ctx, now),
    getAiBudgetFact(ctx),
  ]);
  const aiBudget = parseAiBudgetState(aiBudgetFact?.valueJson, now, config.aiBudgetWindowMs);

  return {
    generatedAt: now,
    sessionDurationMs: config.sessionDurationMs,
    maxConcurrentPlayers: config.maxConcurrentPlayers,
    maxGuestViewers: getEffectiveMaxGuestViewers(config),
    activePlayers: activePlayers.length,
    activeGuestViewers: activeGuests.length,
    totalActiveViewers: activePlayers.length + activeGuests.length,
    aiBudget: {
      ...aiBudget,
      windowMs: config.aiBudgetWindowMs,
      maxCallsPerWindow: config.maxAiCallsPerWindow,
      maxAutonomousCallsPerWindow: config.maxAutonomousAiCallsPerWindow,
      maxReservedOutputTokensPerWindow: config.maxReservedOutputTokensPerWindow,
    },
  };
}

async function upsertRuntimePolicySnapshotFact(ctx: any, snapshot: RuntimePolicySnapshot) {
  const existing = await getPolicySnapshotFact(ctx);
  const existingSnapshot = parseStoredRuntimePolicySnapshot(existing?.valueJson);
  if (sameRuntimePolicySnapshot(existingSnapshot, snapshot)) {
    return existingSnapshot;
  }
  const payload = {
    mapName: undefined,
    factKey: POLICY_SNAPSHOT_FACT_KEY,
    factType: "status",
    valueJson: JSON.stringify(snapshot),
    scope: "world",
    source: "runtimePolicy.refreshRuntimePolicySnapshot",
    updatedAt: snapshot.generatedAt,
  };
  if (existing) {
    await ctx.db.patch(existing._id, payload);
  } else {
    await ctx.db.insert("worldFacts", payload);
  }
}

export const getClientPolicySnapshot = query({
  args: {},
  handler: async (ctx) => {
    return await buildRuntimePolicySnapshot(ctx);
  },
});

export const hasActiveViewerQuery = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await hasActiveViewer(ctx);
  },
});

export const assertViewerAdmission = mutation({
  args: {
    viewerType: v.union(v.literal("player"), v.literal("guest")),
    profileId: v.optional(v.id("profiles")),
    sessionId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    if (args.viewerType === "player") {
      if (!args.profileId) throw new Error("profileId is required for player admission.");
      const userId = await getRequestUserId(ctx);
      if (!userId) throw new Error("Not authenticated");
      const profile = await ctx.db.get(args.profileId);
      if (!profile) throw new Error("Profile not found");
      if (profile.userId !== userId) throw new Error("Cannot admit another player's profile");
      await assertPlayerCapacity(ctx, args.profileId, now);
    } else {
      if (!args.sessionId) throw new Error("sessionId is required for guest admission.");
      await assertGuestCapacity(ctx, args.sessionId, now);
    }

    return await buildRuntimePolicySnapshot(ctx, now);
  },
});

export const registerAiSpend = internalMutation({
  args: {
    surface: v.string(),
    agentId: v.optional(v.string()),
    approximateInputChars: v.number(),
    maxOutputTokens: v.number(),
    autonomous: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const config = getRuntimePolicyConfig();
    const fact = await getAiBudgetFact(ctx);
    const current = parseAiBudgetState(fact?.valueJson, now, config.aiBudgetWindowMs);

    const projectedCallCount = current.callCount + 1;
    const projectedAutonomousCount = current.autonomousCallCount + (args.autonomous ? 1 : 0);
    const projectedReservedOutputTokens = current.reservedOutputTokens + Math.max(0, args.maxOutputTokens);
    const nextState: AiBudgetState = {
      windowStartedAt: current.windowStartedAt,
      callCount: projectedCallCount,
      autonomousCallCount: projectedAutonomousCount,
      approximateInputTokens: current.approximateInputTokens + estimateInputTokens(args.approximateInputChars),
      reservedOutputTokens: projectedReservedOutputTokens,
      lastSurface: args.surface,
      lastAgentId: args.agentId ?? null,
    };

    if (projectedCallCount > config.maxAiCallsPerWindow) {
      throw new Error("Live AI budget exhausted for the current window.");
    }
    if (projectedAutonomousCount > config.maxAutonomousAiCallsPerWindow) {
      throw new Error("Autonomous AI budget exhausted for the current window.");
    }
    if (projectedReservedOutputTokens > config.maxReservedOutputTokensPerWindow) {
      throw new Error("Live AI output budget exhausted for the current window.");
    }

    const payload = {
      mapName: undefined,
      factKey: AI_BUDGET_FACT_KEY,
      factType: "economy",
      valueJson: JSON.stringify(nextState),
      scope: "world",
      source: "runtimePolicy.registerAiSpend",
      updatedAt: now,
    };

    if (fact) {
      await ctx.db.patch(fact._id, payload);
    } else {
      await ctx.db.insert("worldFacts", payload);
    }

    return {
      ...nextState,
      maxCallsPerWindow: config.maxAiCallsPerWindow,
      maxAutonomousCallsPerWindow: config.maxAutonomousAiCallsPerWindow,
      maxReservedOutputTokensPerWindow: config.maxReservedOutputTokensPerWindow,
    };
  },
});

export const refreshRuntimePolicySnapshot = internalMutation({
  args: {},
  handler: async (ctx) => {
    const snapshot = await buildRuntimePolicySnapshot(ctx);
    await upsertRuntimePolicySnapshotFact(ctx, snapshot);
    return snapshot;
  },
});

export const cleanupStaleGuestViewers = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const active = await listActiveGuestViewerFacts(ctx, now);
    const activeFactKeys = new Set(active.map((row: any) => row.factKey));
    const rows = await ctx.db
      .query("worldFacts")
      .withIndex("by_scope_subject", (q: any) => q.eq("scope", "player"))
      .collect();
    let deleted = 0;
    for (const row of rows) {
      if (!row.factKey.startsWith(GUEST_VIEWER_FACT_PREFIX)) continue;
      if (activeFactKeys.has(row.factKey)) continue;
      await ctx.db.delete(row._id);
      deleted += 1;
    }
    return { deleted };
  },
});
