/**
 * Autonomous agent intelligence layer.
 *
 * Each agent has:
 *  - A rich role-specific system prompt with real Stacks ecosystem knowledge
 *  - Awareness of other agents in the world (cast)
 *  - Access to recent world events for context
 *  - Rolling memory that persists across epochs
 *  - Live market data for market.btc (ALEX API)
 *  - Inter-agent reaction: when a notable event fires, a second agent responds
 *
 * Flow (per eligible agent per epoch):
 *   runEpoch → agentThinkAction (internalAction, calls Braintrust) → postAgentThought (internalMutation)
 *
 * Inter-agent reactions:
 *   agentThinkAction → schedules agentReactAction for a peer agent
 */
import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import { buildWorldEventRecord } from "../lib/worldEvents";
import { MAX_AGENT_LINE_CHARS, normalizeShortAgentLine } from "../lib/agentCopy";

// ─── Braintrust config (mirrors storyAi.ts) ─────────────────────────────────

function getBraintrustKey(): string {
  const env = (globalThis as any)?.process?.env ?? {};
  const key = env.BRAINTRUST_API_KEY as string | undefined;
  if (!key) throw new Error("BRAINTRUST_API_KEY not configured");
  return key;
}

async function callBraintrust(
  apiKey: string,
  model: string,
  messages: Array<{ role: string; content: string }>,
  maxTokens: number,
): Promise<string> {
  const res = await fetch("https://api.braintrust.dev/v1/proxy/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, messages, max_tokens: maxTokens }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Braintrust ${res.status}: ${err.slice(0, 200)}`);
  }
  const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content?.trim() ?? "";
}

// ─── Model selection ─────────────────────────────────────────────────────────
// market and guide get GPT-4.1 (full) for maximum quality on demo-facing outputs.
// quests, curator get GPT-4.1-mini (fast + capable).
// merchant gets Gemini 2.5 Flash (fast, good for casual tavern banter).

const ROLE_MODEL: Record<string, string> = {
  market:   "gpt-4.1",
  guide:    "gpt-4.1",
  quests:   "gpt-4.1-mini",
  curator:  "gpt-4.1-mini",
  merchant: "gemini-2.5-flash",
};

// ─── Rich system prompts ─────────────────────────────────────────────────────

const SYSTEM_PROMPTS: Record<string, string> = {

  guide: `You are guide.btc — a native AI agent living inside stacks2d, a 2D browser-based GameFi world built on the Stacks blockchain.

Your deep knowledge base:
- Stacks is a Bitcoin L2 that enables smart contracts secured by Bitcoin's proof-of-work
- sBTC is a 1:1 Bitcoin-backed asset on Stacks, enabling DeFi without wrapping or bridges
- The Nakamoto upgrade made Stacks fully Bitcoin-finalized: 100% Bitcoin security
- Clarity is Stacks' smart contract language — decidable, safe, no reentrancy attacks
- Dual Stacking lets STX holders earn both BTC and sBTC yield simultaneously
- x402 is an HTTP payment protocol where agents charge micropayments for content/services
- AIBTC is a framework for building autonomous AI agents with real Stacks wallets
- In this world, premium content from you costs 1 STX and is delivered onchain

Your personality: calm, knowledgeable, quietly excited about what's being built. You genuinely believe Stacks + AI agents is the most important infrastructure frontier right now.

When you observe world activity, generate ONE sentence narrating what you're doing or noticing right now. Be specific — reference actual events if given. First person, present tense. Never break character. Never say "as an AI".`,

  market: `You are market.btc — a market analyst AI agent living inside stacks2d with a real funded Stacks testnet wallet.

Your deep knowledge base:
- STX is Stacks' native token, currently trading ~$0.80-1.20 on mainnet
- sBTC tracks BTC 1:1 on Stacks; the STX/sBTC pool on ALEX is a key liquidity surface
- ALEX is the leading AMM/DEX on Stacks — TVL, volume, and pool depth matter to you
- Tenero provides real-time Stacks token analytics and holder distribution data
- JingSwap is an OTC market for larger STX/sBTC blocks
- You watch for: spread compression, volume spikes, wallet concentration shifts, premium demand
- Your paid surface (/api/premium/market-btc/quote) costs 0.001 STX and returns live data
- You have execution rights and a real wallet: ST3EGPYCJ8JTC9QETJHM2T47ZCCWNM9VX98ZEPXWT

Your personality: measured, signal-focused, concise. Every word you say has a number or an observation behind it. You don't speculate — you surface data.

When given live market data and world events, post ONE precise market signal or observation. Include any price data given. First person, present tense.`,

  quests: `You are quests.btc — an opportunity keeper AI agent inside stacks2d with a real Stacks testnet wallet.

Your deep knowledge base:
- The Stacks Foundation runs ongoing grants programs for builders (grants.stacks.co)
- Zero Authority is an on-chain governance layer for community-directed funding on Stacks
- Hiro Systems maintains the developer tooling stack and occasionally funds bounties
- Active opportunity categories: smart contract audits, Clarity tooling, sBTC integrations, frontend SDKs
- The Bitcoin DeFi wave (post-Nakamoto) is creating new bounties for bridge tooling and indexers
- Typical grant sizes: 5,000–50,000 STX for small projects, up to 250,000 STX for protocol work
- You track: new grant announcements, open bounties, hackathon calls, community quests
- Your wallet: ST19P5Y1XSYNNYM8JM6QDX95BAP7659742WF0FEQ2

Your personality: organized, action-oriented, slightly urgent. You believe the biggest risk for builders is not knowing what's funded. Every epoch you surface at least one actionable thing.

Post ONE specific, actionable opportunity or observation. Be concrete — name a category, a number, or a program. First person, present tense.`,

  curator: `You are Mel — editorial AI and signal curator for AIBTC Media, living inside stacks2d with a real Stacks testnet wallet.

AIBTC Media is the autonomous editorial arm of the Bitcoin agent economy. It scans on-chain signals, developer activity, and ecosystem moves — then publishes illustrated editorial commentary: short-form dispatches, opinion pieces, and comic-strip-style breakdowns that make the Bitcoin agent economy legible to the world.

You are its editor-in-chief and field correspondent inside this world.

Your intelligence sources:
- New contract deployments on Stacks: who's building, what category, what it signals
- ALEX pool movements and TVL shifts: where capital is flowing
- Hiro developer activity and SDK adoption curves
- AI agent economy signals: new wallets, premium payment volumes, x402 adoption
- What the other agents here — guide.btc, market.btc, quests.btc, Toma — are saying and doing
- Your premium wax-cylinder memory fragments (/api/premium/mel/wax-cylinder-memory) are lore artifacts that hold encoded editorial history
- Your curation desk is where raw signal becomes published story
- Your wallet: ST3YJTXH81SR6YPSG59RBJDBV5H2DD164Y1855ZK5

Your editorial voice:
- You write like a sharp columnist who happens to live on-chain
- Discerning, slightly cryptic, always opinionated — you don't describe, you interpret
- You name what's actually happening when others are still hedging
- Your dispatches are one sentence — compressed editorial truth
- When your observation is significant enough, it becomes a media-published world event

Post ONE editorial dispatch: a compressed, opinionated interpretation of what the ecosystem signals are telling you right now. One sentence. Never hedge. Write it like a headline with a point of view.`,

  merchant: `You are Toma — a wandering peddler who lives inside the Cozy Cabin tavern in stacks2d.

Your world:
- The Cozy Cabin is a gathering place for travelers, agents, and ecosystem explorers
- You trade in consumables: apples, tea, small luxuries. Nothing too serious.
- You've noticed that travelers who pay agents with STX tend to tip better afterward
- You keep tabs on the other agents — guide.btc is always lecturing, market.btc never stops watching numbers
- You've heard that Mel charges for the good stuff, and you respect that hustle
- Your wallet: STXE8MZ5Y35646XT8MEXHJZ3YKWS20CSE31NP92R (you're saving up)

Your personality: warm, observant, a little mercenary, genuinely fond of the regulars. You see the world through trades and small exchanges.

Post ONE brief tavern-flavored observation or comment based on recent world activity. Warm, one sentence, in character. You can be funny.`,
};

// ─── Reaction pairs (who reacts to whose events) ────────────────────────────
// When agent A thinks, agent B may react — creating a visible inter-agent exchange.

const REACTION_PAIRS: Array<{ trigger: string; reactor: string; probability: number }> = [
  { trigger: "market",   reactor: "quests",   probability: 0.5 },
  { trigger: "market",   reactor: "curator",  probability: 0.4 },
  { trigger: "guide",    reactor: "merchant", probability: 0.4 },
  { trigger: "quests",   reactor: "guide",    probability: 0.35 },
  { trigger: "curator",  reactor: "market",   probability: 0.35 },
];

// ─── Market data fetch ───────────────────────────────────────────────────────

async function fetchEcosystemContext(): Promise<string> {
  // Pull recent Stacks contract deployments from Hiro API — real signal for Mel
  try {
    const res = await fetch(
      "https://api.hiro.so/extended/v1/contract?limit=5&order_by=block_height&order=desc",
      { signal: AbortSignal.timeout(4000) },
    );
    if (res.ok) {
      const data = await res.json() as { results?: Array<{ contract_id?: string; block_height?: number }> };
      const results = data.results ?? [];
      if (results.length > 0) {
        const names = results
          .map((c) => c.contract_id ?? "unknown")
          .slice(0, 3)
          .join(", ");
        return `Recent Stacks deploys: ${names}`;
      }
    }
  } catch {
    // ignore
  }
  // Fallback: Stacks mempool size as signal
  try {
    const res = await fetch("https://api.hiro.so/extended/v1/tx/mempool/stats", {
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      const data = await res.json() as { tx_count?: number };
      if (typeof data.tx_count === "number") {
        return `Stacks mempool: ${data.tx_count} pending txs`;
      }
    }
  } catch {
    // ignore
  }
  return "";
}

async function fetchMarketContext(): Promise<string> {
  // Try ALEX pool stats for STX/sBTC
  const endpoints = [
    "https://api.alexlab.co/v1/pool_stats/token-wstx_token-sbtc",
    "https://api.alexlab.co/v1/price/token-wstx",
  ];
  for (const url of endpoints) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
      if (!res.ok) continue;
      const data = await res.json() as Record<string, unknown>;
      const price = data["price_token_b_in_token_a"] ?? data["last_price_usd"];
      const vol = data["volume_24h"];
      const tvl = data["tvl"];
      if (typeof price === "number" && price > 0) {
        const parts: string[] = [`STX/sBTC: ${price.toFixed(8)}`];
        if (typeof vol === "number" && vol > 0) parts.push(`24h vol: ${Math.round(vol).toLocaleString()} STX`);
        if (typeof tvl === "number" && tvl > 0) parts.push(`TVL: ${Math.round(tvl).toLocaleString()} STX`);
        return parts.join(" · ");
      }
    } catch {
      continue;
    }
  }
  // Fallback: Stacks API for STX price
  try {
    const res = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=blockstack&vs_currencies=usd", {
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      const data = await res.json() as Record<string, Record<string, number>>;
      const price = data?.blockstack?.usd;
      if (typeof price === "number") return `STX: $${price.toFixed(4)} USD`;
    }
  } catch {
    // ignore
  }
  return "";
}

function parseJsonObject(value: string | undefined): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function parseStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function distancePx(a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function formatDistance(distance: number) {
  return `${Math.round(distance)}px`;
}

function pointInZone(point: { x: number; y: number }, zone: { x: number; y: number; width: number; height: number }) {
  return point.x >= zone.x && point.x <= zone.x + zone.width && point.y >= zone.y && point.y <= zone.y + zone.height;
}

// ─── Internal query: recent world events ────────────────────────────────────

export const recentEventsQuery = internalQuery({
  args: {
    mapName: v.optional(v.string()),
    limit: v.number(),
  },
  handler: async (ctx, { mapName, limit }) => {
    const rows = await ctx.db
      .query("worldEvents")
      .withIndex("by_map_time", (q: any) =>
        mapName ? q.eq("mapName", mapName) : q,
      )
      .order("desc")
      .take(limit);
    return rows.map((r: any) => ({
      eventType: r.eventType as string,
      summary: r.summary as string,
      actorId: r.actorId as string | undefined,
    }));
  },
});

// ─── Internal query: agent memory ───────────────────────────────────────────

export const agentMemoryQuery = internalQuery({
  args: { agentId: v.string() },
  handler: async (ctx, { agentId }) => {
    const state = await ctx.db
      .query("agentStates")
      .withIndex("by_agentId", (q) => q.eq("agentId", agentId))
      .first();
    if (!state?.contextJson) return null;
    try {
      const ctx2 = JSON.parse(state.contextJson);
      return {
        memorySummary: state.memorySummary ?? null,
        recentThoughts: (ctx2.recentThoughts as string[] | undefined) ?? [],
        lastThoughtAt: (ctx2.lastThoughtAt as number | undefined) ?? null,
      };
    } catch {
      return null;
    }
  },
});

export const knowledgeFactsQuery = internalQuery({
  args: {
    mapName: v.optional(v.string()),
    limit: v.number(),
  },
  handler: async (ctx, { mapName, limit }) => {
    const allFacts = await ctx.db.query("worldFacts").collect();
    return allFacts
      .filter((fact) => {
        if (mapName && fact.mapName !== mapName) return false;
        return fact.scope === "world" || fact.scope === undefined || fact.scope === null;
      })
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, Math.max(1, Math.min(limit, 8)))
      .map((fact) => {
        const value = parseJsonObject(fact.valueJson);
        const summary =
          typeof value.latestSummary === "string"
            ? value.latestSummary
            : typeof value.summary === "string"
              ? value.summary
              : null;

        return {
          factKey: fact.factKey,
          factType: fact.factType,
          summary,
          zoneKey: typeof value.zoneKey === "string" ? value.zoneKey : null,
          objectKey: typeof value.objectKey === "string" ? value.objectKey : null,
          updatedAt: fact.updatedAt,
        };
      });
  },
});

// ─── Internal query: cast (all active agents) ───────────────────────────────

export const castQuery = internalQuery({
  args: { mapName: v.optional(v.string()) },
  handler: async (ctx, { mapName }) => {
    const registry = await ctx.db.query("agentRegistry").collect();
    return registry
      .filter((r) => r.status === "active" && (!mapName || r.homeMap === mapName))
      .map((r) => ({ agentId: r.agentId, displayName: r.displayName, roleKey: r.roleKey }));
  },
});

export const spatialContextQuery = internalQuery({
  args: {
    agentId: v.string(),
    mapName: v.optional(v.string()),
  },
  handler: async (ctx, { agentId, mapName }) => {
    const [mapInfo, npcStates, semanticObjects, zones, roles, registry, presence] = await Promise.all([
      mapName
        ? ctx.db.query("maps").withIndex("by_name", (q) => q.eq("name", mapName)).first()
        : Promise.resolve(null),
      mapName
        ? ctx.db.query("npcState").withIndex("by_map", (q) => q.eq("mapName", mapName)).collect()
        : ctx.db.query("npcState").collect(),
      mapName
        ? ctx.db.query("semanticObjects").withIndex("by_map", (q) => q.eq("mapName", mapName)).collect()
        : ctx.db.query("semanticObjects").collect(),
      mapName
        ? ctx.db.query("worldZones").withIndex("by_map", (q) => q.eq("mapName", mapName)).collect()
        : ctx.db.query("worldZones").collect(),
      mapName
        ? ctx.db.query("npcRoleAssignments").withIndex("by_map_roleKey", (q) => q.eq("mapName", mapName)).collect()
        : ctx.db.query("npcRoleAssignments").collect(),
      mapName
        ? ctx.db.query("agentRegistry").collect().then((rows) => rows.filter((row) => row.homeMap === mapName))
        : ctx.db.query("agentRegistry").collect(),
      mapName
        ? ctx.db.query("presence").withIndex("by_map", (q) => q.eq("mapName", mapName)).collect()
      : ctx.db.query("presence").collect(),
    ]);

    const roleAssignment = roles.find((row) => row.agentId === agentId) ?? null;
    const registryEntry = registry.find((row) => row.agentId === agentId) ?? null;
    const agentState = npcStates.find((row) => row.instanceName === agentId) ?? null;
    const origin = agentState ? { x: agentState.x, y: agentState.y } : null;
    const roleMeta = parseJsonObject(roleAssignment?.metadataJson);
    const roleAnchorKeys = [
      typeof roleMeta.anchorObjectKey === "string" ? roleMeta.anchorObjectKey : null,
      typeof roleAssignment?.postObjectKey === "string" ? roleAssignment.postObjectKey : null,
      ...parseStringArray(roleMeta.routeObjectKeys),
    ].filter((value): value is string => Boolean(value));
    const anchorKeySet = new Set(roleAnchorKeys);

    const zone = origin && mapInfo
      ? zones.find((candidate) => {
          const tilePoint = {
            x: origin.x / mapInfo.tileWidth,
            y: origin.y / mapInfo.tileHeight,
          };
          return pointInZone(tilePoint, candidate);
        }) ?? null
      : null;

    const semanticObjectsByKey = new Map(semanticObjects.map((object) => [object.objectKey, object]));
    const nearbySemanticObjects = origin
      ? semanticObjects
          .map((object) => {
            const point = typeof object.x === "number" && typeof object.y === "number"
              ? { x: object.x, y: object.y }
              : null;
            const distance = point && origin ? distancePx(origin, point) : null;
            return {
              object,
              distance,
              anchor: anchorKeySet.has(object.objectKey),
            };
          })
          .filter((entry) => entry.distance !== null && entry.distance <= 420)
          .sort((a, b) => {
            const anchorWeightA = a.anchor ? 0 : 1;
            const anchorWeightB = b.anchor ? 0 : 1;
            if (anchorWeightA !== anchorWeightB) return anchorWeightA - anchorWeightB;
            return (a.distance ?? 0) - (b.distance ?? 0);
          })
          .slice(0, 6)
          .map((entry) => ({
            objectKey: entry.object.objectKey,
            label: entry.object.label,
            roomLabel: entry.object.roomLabel ?? null,
            zoneKey: entry.object.zoneKey ?? null,
            valueClass: entry.object.valueClass ?? null,
            triggerType: entry.object.triggerType ?? null,
            affordances: entry.object.affordances,
            distancePx: entry.distance !== null ? Math.round(entry.distance) : null,
            anchor: entry.anchor,
          }))
      : [];

    const nearbyPlayers = origin
      ? presence
          .map((row) => ({
            name: row.name,
            direction: row.direction,
            animation: row.animation,
            distance: distancePx(origin, { x: row.x, y: row.y }),
          }))
          .filter((row) => row.distance <= 360)
          .sort((a, b) => a.distance - b.distance)
          .slice(0, 4)
          .map((row) => ({
            name: row.name,
            direction: row.direction,
            animation: row.animation,
            distancePx: Math.round(row.distance),
          }))
      : [];

    const nearbyNpcs = origin
      ? npcStates
          .filter((row) => row.instanceName !== agentId)
          .map((row) => {
            const point = { x: row.x, y: row.y };
            const distance = distancePx(origin, point);
            const registryRow = registry.find((candidate) => candidate.agentId === row.instanceName) ?? null;
            return {
              agentId: row.instanceName ?? null,
              displayName: registryRow?.displayName ?? row.instanceName ?? row.spriteDefName,
              roleKey: registryRow?.roleKey ?? null,
              currentIntent: row.currentIntent ?? null,
              mood: row.mood ?? null,
              distance,
            };
          })
          .filter((row) => row.distance <= 420)
          .sort((a, b) => a.distance - b.distance)
          .slice(0, 4)
          .map((row) => ({
            agentId: row.agentId,
            displayName: row.displayName,
            roleKey: row.roleKey,
            currentIntent: row.currentIntent,
            mood: row.mood,
            distancePx: Math.round(row.distance),
          }))
      : [];

    return {
      agentState: agentState
        ? {
            x: agentState.x,
            y: agentState.y,
            direction: agentState.direction,
            currentIntent: agentState.currentIntent ?? null,
            mood: agentState.mood ?? null,
            spawnX: agentState.spawnX,
            spawnY: agentState.spawnY,
            wanderRadius: agentState.wanderRadius,
          }
        : null,
      roleAssignment: roleAssignment
        ? {
            roleKey: roleAssignment.roleKey,
            behaviorMode: roleAssignment.behaviorMode ?? null,
            homeZoneKey: roleAssignment.homeZoneKey ?? null,
            postObjectKey: roleAssignment.postObjectKey ?? null,
            displayRole: roleAssignment.displayRole ?? null,
            metadataJson: roleAssignment.metadataJson ?? null,
          }
        : null,
      registryEntry: registryEntry
        ? {
            displayName: registryEntry.displayName,
            roleKey: registryEntry.roleKey,
            homeZoneKey: registryEntry.homeZoneKey ?? null,
            homeMap: registryEntry.homeMap ?? null,
          }
        : null,
      zone: zone
        ? {
            zoneKey: zone.zoneKey,
            name: zone.name,
            zoneType: zone.zoneType,
            accessType: zone.accessType ?? null,
            tags: zone.tags,
          }
        : null,
      nearbySemanticObjects,
      nearbyPlayers,
      nearbyNpcs,
      roleAnchors: roleAnchorKeys.map((objectKey) => {
        const object = semanticObjectsByKey.get(objectKey);
        return object
          ? {
              objectKey,
              label: object.label,
              roomLabel: object.roomLabel ?? null,
              zoneKey: object.zoneKey ?? null,
              valueClass: object.valueClass ?? null,
            }
          : { objectKey, label: objectKey, roomLabel: null, zoneKey: null, valueClass: null };
      }),
    };
  },
});

// ─── Post thought mutation ───────────────────────────────────────────────────

export const postAgentThought = internalMutation({
  args: {
    agentId: v.string(),
    roleKey: v.string(),
    mapName: v.optional(v.string()),
    thought: v.string(),
    displayName: v.optional(v.string()),
    contextTag: v.optional(v.string()),
    chatterKind: v.optional(v.string()),
    replyToDisplayName: v.optional(v.string()),
    replyToRoleKey: v.optional(v.string()),
  },
  handler: async (
    ctx,
    { agentId, roleKey, mapName, thought, displayName, contextTag, chatterKind, replyToDisplayName, replyToRoleKey },
  ) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("agentStates")
      .withIndex("by_agentId", (q) => q.eq("agentId", agentId))
      .first();

    if (existing) {
      let prevContext: Record<string, unknown> = {};
      try { prevContext = JSON.parse(existing.contextJson ?? "{}"); } catch { /* */ }

      // Rolling memory: keep last 5 autonomous thoughts
      const prevThoughts = (prevContext.recentThoughts as string[] | undefined) ?? [];
      const recentThoughts = [...prevThoughts.slice(-4), thought];

      await ctx.db.patch(existing._id, {
        contextJson: JSON.stringify({
          ...prevContext,
          recentThoughts,
          lastThoughtAt: now,
        }),
        updatedAt: now,
      });
    }

    await ctx.db.insert(
      "worldEvents",
      buildWorldEventRecord({
        mapName,
        eventType: `agent-thought:${roleKey}`,
        sourceType: "agent",
        sourceId: agentId,
        actorId: agentId,
        summary: thought,
        detailsJson: JSON.stringify({
          autonomous: true,
          displayName: displayName ?? agentId,
          roleKey,
          chatterKind: chatterKind ?? "thought",
          ...(contextTag ? { context: contextTag } : {}),
          ...(replyToDisplayName ? { replyToDisplayName } : {}),
          ...(replyToRoleKey ? { replyToRoleKey } : {}),
        }),
      }),
    );
  },
});

// ─── Reaction action ─────────────────────────────────────────────────────────

export const agentReactAction = internalAction({
  args: {
    reactorAgentId: v.string(),
    reactorRoleKey: v.string(),
    reactorDisplayName: v.string(),
    triggerThought: v.string(),
    triggerAgentName: v.string(),
    triggerRoleKey: v.string(),
    mapName: v.optional(v.string()),
  },
  handler: async (ctx, {
    reactorAgentId, reactorRoleKey, reactorDisplayName,
    triggerThought, triggerAgentName, triggerRoleKey, mapName,
  }) => {
    let apiKey: string;
    try { apiKey = getBraintrustKey(); } catch { return; }

    const systemPrompt = SYSTEM_PROMPTS[reactorRoleKey] ?? SYSTEM_PROMPTS.merchant;
    const model = ROLE_MODEL[reactorRoleKey] ?? "gemini-2.5-flash";

    const userMessage =
      `${triggerAgentName} (${triggerRoleKey}) just said: "${triggerThought}"\n\n` +
      `React with one brief first-person response — as yourself, in character. ` +
      `Reference what they said. One sentence under ${MAX_AGENT_LINE_CHARS} characters.`;

    try {
      await ctx.runMutation((internal as any).runtimePolicy.registerAiSpend, {
        surface: `agent-reaction:${reactorRoleKey}`,
        agentId: reactorAgentId,
        approximateInputChars: systemPrompt.length + userMessage.length,
        maxOutputTokens: 100,
        autonomous: true,
      });
    } catch {
      return;
    }

    try {
      await ctx.runMutation((internal as any).agents.runtime.registerAiCall, {
        agentId: reactorAgentId,
        reason: "agent-reaction",
      });
    } catch { return; } // cooling down

    const thought = normalizeShortAgentLine(await callBraintrust(apiKey, model, [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ], 100));

    if (!thought) return;

    await ctx.runMutation((internal as any).agents.agentThink.postAgentThought, {
      agentId: reactorAgentId,
      roleKey: reactorRoleKey,
      mapName,
      thought,
      displayName: reactorDisplayName,
      contextTag: `reaction-to:${triggerRoleKey}`,
      chatterKind: "reaction",
      replyToDisplayName: triggerAgentName,
      replyToRoleKey: triggerRoleKey,
    });
  },
});

// ─── Main think action ───────────────────────────────────────────────────────

export const agentThinkAction = internalAction({
  args: {
    agentId: v.string(),
    roleKey: v.string(),
    mapName: v.optional(v.string()),
    displayName: v.string(),
  },
  handler: async (ctx, { agentId, roleKey, mapName, displayName }) => {
    let apiKey: string;
    try { apiKey = getBraintrustKey(); } catch { return; }

    const activeViewer = await ctx.runQuery((internal as any).runtimePolicy.hasActiveViewerQuery, {});
    if (!activeViewer) return;

    // Gather context in parallel
    const [recentEvents, memory, cast, knowledgeFacts, spatial] = await Promise.all([
      ctx.runQuery((internal as any).agents.agentThink.recentEventsQuery, { mapName, limit: 8 }),
      ctx.runQuery((internal as any).agents.agentThink.agentMemoryQuery, { agentId }),
      ctx.runQuery((internal as any).agents.agentThink.castQuery, { mapName }),
      ctx.runQuery((internal as any).agents.agentThink.knowledgeFactsQuery, { mapName, limit: 5 }),
      ctx.runQuery((internal as any).agents.agentThink.spatialContextQuery, { agentId, mapName }),
    ]);

    // Filter out epoch heartbeats — only meaningful events
    const meaningfulEvents = (recentEvents as Array<{ eventType: string; summary: string; actorId?: string }>)
      .filter((e) => !e.eventType.startsWith("agent-runtime-epoch") && !e.eventType.startsWith("agent-thought"))
      .slice(0, 5);

    const recentThoughts = (recentEvents as Array<{ eventType: string; summary: string; actorId?: string }>)
      .filter((e) => e.eventType.startsWith("agent-thought"))
      .slice(0, 3);

    // Build context blocks
    const contextParts: string[] = [];

    // Who else is in the world
    const peers = (cast as Array<{ agentId: string; displayName: string; roleKey: string }>)
      .filter((c) => c.agentId !== agentId)
      .map((c) => c.displayName)
      .join(", ");
    if (peers) contextParts.push(`Other agents present: ${peers}`);

    const spatialContext = spatial as {
      agentState: {
        x: number;
        y: number;
        direction: string;
        currentIntent: string | null;
        mood: string | null;
        spawnX: number;
        spawnY: number;
        wanderRadius: number;
      } | null;
      roleAssignment: {
        roleKey: string;
        behaviorMode: string | null;
        homeZoneKey: string | null;
        postObjectKey: string | null;
        displayRole: string | null;
        metadataJson: string | null;
      } | null;
      registryEntry: {
        displayName: string;
        roleKey: string;
        homeZoneKey: string | null;
        homeMap: string | null;
      } | null;
      zone: {
        zoneKey: string;
        name: string;
        zoneType: string;
        accessType: string | null;
        tags: string[];
      } | null;
      nearbySemanticObjects: Array<{
        objectKey: string;
        label: string;
        roomLabel: string | null;
        zoneKey: string | null;
        valueClass: string | null;
        triggerType: string | null;
        affordances: string[];
        distancePx: number | null;
        anchor: boolean;
      }>;
      nearbyPlayers: Array<{
        name: string;
        direction: string;
        animation: string;
        distancePx: number;
      }>;
      nearbyNpcs: Array<{
        agentId: string | null;
        displayName: string;
        roleKey: string | null;
        currentIntent: string | null;
        mood: string | null;
        distancePx: number;
      }>;
      roleAnchors: Array<{
        objectKey: string;
        label: string;
        roomLabel: string | null;
        zoneKey: string | null;
        valueClass: string | null;
      }>;
    } | null;

    if (spatialContext) {
      const lines: string[] = [];
      if (spatialContext.agentState) {
        const pos = spatialContext.agentState;
        lines.push(
          `You are at (${Math.round(pos.x)}, ${Math.round(pos.y)}) facing ${pos.direction}. ` +
            `Spawn: (${Math.round(pos.spawnX)}, ${Math.round(pos.spawnY)}). ` +
            `Mood: ${pos.mood ?? "unknown"}. Intent: ${pos.currentIntent ?? "unknown"}.`,
        );
      }
      if (spatialContext.zone) {
        lines.push(
          `Current zone: ${spatialContext.zone.name} (${spatialContext.zone.zoneType})` +
            (spatialContext.zone.accessType ? `, access ${spatialContext.zone.accessType}` : ""),
        );
      }
      if (spatialContext.roleAnchors.length > 0) {
        lines.push(
          "Role anchors: " +
            spatialContext.roleAnchors
              .slice(0, 4)
              .map((anchor) => `${anchor.label}${anchor.roomLabel ? ` [${anchor.roomLabel}]` : ""}`)
              .join(", "),
        );
      }
      if (spatialContext.nearbySemanticObjects.length > 0) {
        lines.push(
          "Nearby semantic objects:\n" +
            spatialContext.nearbySemanticObjects
              .slice(0, 5)
              .map((object) => {
                const tags = [
                  object.roomLabel ? object.roomLabel : null,
                  object.valueClass ? object.valueClass : null,
                  object.triggerType ? object.triggerType : null,
                ].filter(Boolean).join(" · ");
                return `  - ${object.label}${object.distancePx !== null ? ` (${formatDistance(object.distancePx)})` : ""}${tags ? ` — ${tags}` : ""}`;
              })
              .join("\n"),
        );
      }
      if (spatialContext.nearbyPlayers.length > 0) {
        lines.push(
          "Nearby visitors:\n" +
            spatialContext.nearbyPlayers
              .map((visitor) => `  - ${visitor.name} (${formatDistance(visitor.distancePx)}) facing ${visitor.direction}`)
              .join("\n"),
        );
      }
      if (spatialContext.nearbyNpcs.length > 0) {
        lines.push(
          "Nearby NPCs:\n" +
            spatialContext.nearbyNpcs
              .map((npc) => `  - ${npc.displayName}${npc.roleKey ? ` (${npc.roleKey})` : ""} (${formatDistance(npc.distancePx)})`)
              .join("\n"),
        );
      }
      if (lines.length > 0) {
        contextParts.push(`Spatial context:\n${lines.join("\n")}`);
      }
    }

    // Recent world activity
    if (meaningfulEvents.length > 0) {
      contextParts.push(
        "Recent world events:\n" +
        meaningfulEvents.map((e) => `  [${e.eventType}] ${e.summary}`).join("\n"),
      );
    }

    // What other agents recently said
    if (recentThoughts.length > 0) {
      contextParts.push(
        "What other agents recently said:\n" +
        recentThoughts.map((e) => `  ${e.summary}`).join("\n"),
      );
    }

    const knownFacts = (knowledgeFacts as Array<{
      factKey: string;
      factType: string;
      summary: string | null;
      zoneKey: string | null;
      objectKey: string | null;
    }>)
      .map((fact) => {
        const location = [fact.zoneKey, fact.objectKey].filter(Boolean).join(" / ");
        if (fact.summary && location) return `  [${fact.factType}] ${location}: ${fact.summary}`;
        if (fact.summary) return `  [${fact.factType}] ${fact.summary}`;
        if (location) return `  [${fact.factType}] ${location}`;
        return `  [${fact.factType}] ${fact.factKey}`;
      });

    if (knownFacts.length > 0) {
      contextParts.push("Known world facts:\n" + knownFacts.join("\n"));
    }

    // Agent's own memory
    const mem = memory as { memorySummary: string | null; recentThoughts: string[]; lastThoughtAt: number | null } | null;
    if (mem?.recentThoughts?.length) {
      contextParts.push(
        "Your last few thoughts:\n" +
        mem.recentThoughts.slice(-3).map((t) => `  "${t}"`).join("\n"),
      );
    }

    // Live external data — market.btc gets ALEX prices, curator gets Hiro ecosystem signal
    let externalContext = "";
    if (roleKey === "market") {
      externalContext = await fetchMarketContext();
      if (externalContext) contextParts.push(`Live market data: ${externalContext}`);
    } else if (roleKey === "curator") {
      externalContext = await fetchEcosystemContext();
      if (externalContext) contextParts.push(`Live ecosystem signal: ${externalContext}`);
    }

    if (contextParts.length === 0) contextParts.push("The world is quiet right now.");

    const model = ROLE_MODEL[roleKey] ?? "gpt-4.1-mini";
    const systemPrompt = SYSTEM_PROMPTS[roleKey] ?? SYSTEM_PROMPTS.merchant;
    const composedPrompt = contextParts.join("\n\n");

    try {
      await ctx.runMutation((internal as any).runtimePolicy.registerAiSpend, {
        surface: `agent-think:${roleKey}`,
        agentId,
        approximateInputChars: systemPrompt.length + composedPrompt.length + 160,
        maxOutputTokens: 120,
        autonomous: true,
      });
    } catch {
      return;
    }

    try {
      await ctx.runMutation((internal as any).agents.runtime.registerAiCall, {
        agentId,
        reason: "autonomous-think",
      });
    } catch { return; }

    const thought = await callBraintrust(
      apiKey,
      model,
      [
        { role: "system", content: systemPrompt },
        {
          role: "system",
          content:
            `Return exactly one sentence under ${MAX_AGENT_LINE_CHARS} characters. ` +
            "Stay in character and keep the line concise.",
        },
        { role: "user", content: composedPrompt },
      ],
      120,
    );

    const normalizedThought = normalizeShortAgentLine(thought);
    if (!normalizedThought) return;

    await ctx.runMutation((internal as any).agents.agentThink.postAgentThought, {
      agentId,
      roleKey,
      mapName,
      thought: normalizedThought,
      displayName,
      contextTag: externalContext || undefined,
      chatterKind: "thought",
    });

    // Trigger a peer reaction with some probability
    const pair = REACTION_PAIRS.find((p) => p.trigger === roleKey);
    if (pair && Math.random() < pair.probability) {
      const reactor = (cast as Array<{ agentId: string; displayName: string; roleKey: string }>)
        .find((c) => c.roleKey === pair.reactor);
      if (reactor) {
        await ctx.scheduler.runAfter(
          8_000 + Math.floor(Math.random() * 15_000), // 8–23s delay — feels natural
          (internal as any).agents.agentThink.agentReactAction,
          {
            reactorAgentId: reactor.agentId,
            reactorRoleKey: reactor.roleKey,
            reactorDisplayName: reactor.displayName,
            triggerThought: normalizedThought,
            triggerAgentName: displayName,
            triggerRoleKey: roleKey,
            mapName,
          },
        );
      }
    }
  },
});
