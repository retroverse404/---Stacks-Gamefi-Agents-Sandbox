/**
 * Server-authoritative NPC movement engine.
 *
 * NPCs wander server-side via a self-scheduling tick loop so that all clients
 * see the same NPC positions, and NPCs keep moving even when no players are
 * connected.
 */
import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const TICK_MS = 1500; // server tick interval (ms) — was 500ms, increased to reduce DB growth
const IDLE_MIN_MS = 3000; // minimum idle pause before next wander
const IDLE_MAX_MS = 8000; // maximum idle pause
const STALE_THRESHOLD_MS = TICK_MS * 4; // if no tick in this long, loop is dead
const TRADE_DISTANCE_PX = 96;
const TRADE_COOLDOWN_MS = 12000;
const TRADE_PRICE = 2;
const NPC_MIN_SEPARATION_PX = 40;
const POST_LEASH_PX = 20;
const POST_IDLE_RADIUS_PX = 12;
const POST_IDLE_MIN_MS = 1200;
const POST_IDLE_MAX_MS = 2600;

type RoleMetadata = {
  anchorObjectKey?: string;
  primaryTopics?: string[];
};

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** List all NPC states on a given map (clients subscribe to this) */
export const listByMap = query({
  args: { mapName: v.string() },
  handler: async (ctx, { mapName }) => {
    const states = await ctx.db
      .query("npcState")
      .withIndex("by_map", (q) => q.eq("mapName", mapName))
      .collect();

    const profiles = await ctx.db.query("npcProfiles").collect();
    const profilesByName = new Map(profiles.map((p) => [p.name, p]));

    return states.map((state) => ({
      ...state,
      npcProfile: state.instanceName
        ? profilesByName.get(state.instanceName) ?? null
        : null,
    }));
  },
});

function getItemQuantity(items: { name: string; quantity: number }[] | undefined, itemName: string) {
  return items?.find((item) => item.name === itemName)?.quantity ?? 0;
}

function upsertItem(
  items: { name: string; quantity: number }[] | undefined,
  itemName: string,
  delta: number,
) {
  const next = [...(items ?? [])];
  const index = next.findIndex((item) => item.name === itemName);
  if (index === -1) {
    if (delta > 0) next.push({ name: itemName, quantity: delta });
    return next;
  }
  const quantity = next[index].quantity + delta;
  if (quantity <= 0) {
    next.splice(index, 1);
  } else {
    next[index] = { ...next[index], quantity };
  }
  return next;
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function isCrowdedTarget(
  target: { x: number; y: number },
  allNpcs: { _id: unknown; mapName: string; x: number; y: number }[],
  mapName: string,
  ignoreId: string,
  desiredTargets: Map<string, { x: number; y: number; detail: string }>,
) {
  for (const other of allNpcs) {
    if (other.mapName !== mapName || String(other._id) === ignoreId) continue;
    if (distance(target, other) < NPC_MIN_SEPARATION_PX) return true;
  }

  for (const [otherId, otherTarget] of desiredTargets.entries()) {
    if (otherId === ignoreId) continue;
    if (distance(target, otherTarget) < NPC_MIN_SEPARATION_PX) return true;
  }

  return false;
}

/** Minimum wander distance to guarantee at least 2 ticks of movement at default speed.
 * step = speed * (TICK_MS/1000) = 28 * 1.5 = 42px. Min distance > 42 ensures vx/vy > 0
 * for at least one tick so the client walk animation fires. */
const MIN_WANDER_DIST = 60;

function findWanderTarget(
  npc: { _id: unknown; mapName: string; spawnX: number; spawnY: number; wanderRadius: number },
  allNpcs: { _id: unknown; mapName: string; x: number; y: number }[],
  desiredTargets: Map<string, { x: number; y: number; detail: string }>,
) {
  const npcId = String(npc._id);
  let fallback = { x: npc.spawnX, y: npc.spawnY };

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.max(MIN_WANDER_DIST, Math.random() * npc.wanderRadius);
    const candidate = {
      x: npc.spawnX + Math.cos(angle) * dist,
      y: npc.spawnY + Math.sin(angle) * dist,
    };
    fallback = candidate;
    if (!isCrowdedTarget(candidate, allNpcs, npc.mapName, npcId, desiredTargets)) {
      return candidate;
    }
  }

  return fallback;
}

function buildApproachTarget(
  npc: { x: number; y: number },
  seller: { x: number; y: number },
) {
  const dx = seller.x - npc.x;
  const dy = seller.y - npc.y;
  const dist = Math.max(distance(npc, seller), 1);
  const offset = Math.min(NPC_MIN_SEPARATION_PX, Math.max(12, dist * 0.5));

  return {
    x: seller.x - (dx / dist) * offset,
    y: seller.y - (dy / dist) * offset,
  };
}

function roleIntent(roleKey?: string, hasDesiredItem?: boolean) {
  switch (roleKey) {
    case "guide":
      return {
        currentIntent: "guiding",
        intentDetail: "holding the guide desk and briefing newcomers",
        mood: "calm",
      };
    case "merchant":
      return {
        currentIntent: "trading",
        intentDetail: hasDesiredItem
          ? "holding the merchant corner and waiting for customers"
          : "watching the merchant corner for trade",
        mood: "curious",
      };
    case "market":
      return {
        currentIntent: "monitoring-market",
        intentDetail: "cycling between the market post and the price board",
        mood: "alert",
      };
    case "quests":
      return {
        currentIntent: "curating-opportunities",
        intentDetail: "checking the quest post and opportunity board for new work",
        mood: "focused",
      };
    default:
      return {
        currentIntent: hasDesiredItem ? "resting" : "idle",
        intentDetail: hasDesiredItem ? "waiting with inventory" : "waiting",
        mood: hasDesiredItem ? "content" : "curious",
      };
  }
}

function parseRoleMetadata(metadataJson?: string): RoleMetadata {
  if (!metadataJson) return {};
  try {
    const parsed = JSON.parse(metadataJson) as RoleMetadata;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function choosePostIdleTarget(
  post: { x: number; y: number },
  npcId: string,
  allNpcs: { _id: unknown; mapName: string; x: number; y: number }[],
  mapName: string,
  desiredTargets: Map<string, { x: number; y: number; detail: string }>,
) {
  let fallback = { x: post.x, y: post.y };

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.random() * POST_IDLE_RADIUS_PX;
    const candidate = {
      x: post.x + Math.cos(angle) * dist,
      y: post.y + Math.sin(angle) * dist,
    };
    fallback = candidate;
    if (!isCrowdedTarget(candidate, allNpcs, mapName, npcId, desiredTargets)) {
      return candidate;
    }
  }

  return fallback;
}

function randomDirection() {
  const dirs = ["up", "down", "left", "right"] as const;
  return dirs[Math.floor(Math.random() * dirs.length)];
}

function currentNpcStates(
  statesById: Map<string, any>,
) {
  return Array.from(statesById.values());
}

function hasRecentNpcLoopActivity(
  states: Array<{
    lastTick: number;
    vx?: number;
    vy?: number;
    targetX?: number;
    idleUntil?: number;
  }>,
  now: number,
) {
  return states.some(
    (state) =>
      state.lastTick > now - STALE_THRESHOLD_MS &&
      (
        state.vx !== 0 ||
        state.vy !== 0 ||
        state.targetX != null ||
        state.idleUntil != null
      ),
  );
}

// ---------------------------------------------------------------------------
// Tick loop (internal — not callable from client)
// ---------------------------------------------------------------------------

/** The main NPC tick. Moves all NPCs one step, then reschedules itself. */
export const tick = internalMutation({
  args: {},
  handler: async (ctx) => {
    const allNpcs = await ctx.db.query("npcState").collect();
    if (allNpcs.length === 0) return; // nothing to do, loop stops naturally

    const now = Date.now();
    const mostRecentTick = Math.max(...allNpcs.map((npc) => npc.lastTick ?? 0));
    if (mostRecentTick > 0 && mostRecentTick > now - TICK_MS / 2) {
      // Another tick invocation already updated NPC state very recently.
      // Exit without rescheduling so duplicate chains die off naturally.
      return;
    }
    const dt = TICK_MS / 1000; // seconds per tick
    const allProfiles = await ctx.db.query("npcProfiles").collect();
    const profilesByName = new Map(allProfiles.map((profile) => [profile.name, profile]));
    const statesById = new Map(allNpcs.map((npc) => [String(npc._id), npc]));
    const desiredTargets = new Map<string, { x: number; y: number; detail: string }>();
    const roleAssignments = await ctx.db.query("npcRoleAssignments").collect();
    const rolesByAgentId = new Map(roleAssignments.map((role) => [role.agentId, role]));
    const semanticObjects = await ctx.db.query("semanticObjects").collect();
    const semanticObjectsByKey = new Map(
      semanticObjects.map((object) => [`${object.mapName}:${object.objectKey}`, object]),
    );

    for (const npc of allNpcs) {
      if (!npc.instanceName) continue;
      const profile = profilesByName.get(npc.instanceName);
      const role = rolesByAgentId.get(npc.instanceName);
      const roleMeta = parseRoleMetadata(role?.metadataJson);
      const desiredItem = profile?.desiredItem;
      const shouldHoldPost = role?.behaviorMode === "at-post";
      const shouldPatrolSurface = role?.behaviorMode === "patrol-surface";

      if (shouldHoldPost && role?.postObjectKey) {
        const post = semanticObjectsByKey.get(`${npc.mapName}:${role.postObjectKey}`);
        if (post?.x != null && post?.y != null) {
          const distFromPost = distance(npc, { x: post.x, y: post.y });
          const idleTarget = choosePostIdleTarget(
            { x: post.x, y: post.y },
            String(npc._id),
            allNpcs,
            npc.mapName,
            desiredTargets,
          );
          desiredTargets.set(String(npc._id), {
            x: distFromPost > POST_LEASH_PX ? post.x : idleTarget.x,
            y: distFromPost > POST_LEASH_PX ? post.y : idleTarget.y,
            detail:
              distFromPost > POST_LEASH_PX
                ? `returning to post at ${post.label}`
                : `patrolling post at ${post.label}`,
          });
          continue;
        }
      }

      if (shouldPatrolSurface && role?.postObjectKey) {
        const post = semanticObjectsByKey.get(`${npc.mapName}:${role.postObjectKey}`);
        const anchor = roleMeta.anchorObjectKey
          ? semanticObjectsByKey.get(`${npc.mapName}:${roleMeta.anchorObjectKey}`)
          : null;
        if (post?.x != null && post?.y != null) {
          const movingTowardAnchor =
            npc.targetX != null &&
            npc.targetY != null &&
            anchor?.x != null &&
            anchor?.y != null &&
            distance({ x: npc.targetX, y: npc.targetY }, { x: anchor.x, y: anchor.y }) <= POST_IDLE_RADIUS_PX + 6;
          const baseTarget =
            !movingTowardAnchor && anchor?.x != null && anchor?.y != null
              ? { x: anchor.x, y: anchor.y, label: anchor.label }
              : { x: post.x, y: post.y, label: post.label };
          const patrolTarget = choosePostIdleTarget(
            { x: baseTarget.x, y: baseTarget.y },
            String(npc._id),
            allNpcs,
            npc.mapName,
            desiredTargets,
          );
          desiredTargets.set(String(npc._id), {
            x: patrolTarget.x,
            y: patrolTarget.y,
            detail: `patrolling surface between ${post.label} and ${baseTarget.label}`,
          });
          continue;
        }
      }

      if (shouldHoldPost) continue;

      if (!profile || !desiredItem || getItemQuantity(profile.items, desiredItem) > 0) continue;

      const seller = allNpcs
        .filter((other) => other.mapName === npc.mapName && other._id !== npc._id && other.instanceName)
        .map((other) => ({ state: other, profile: profilesByName.get(other.instanceName!) }))
        .filter((entry) => entry.profile && getItemQuantity(entry.profile.items, desiredItem) > 0)
        .sort((a, b) => distance(npc, a.state) - distance(npc, b.state))[0];

      if (seller) {
        const approach = buildApproachTarget(npc, seller.state);
        desiredTargets.set(String(npc._id), {
          x: approach.x,
          y: approach.y,
          detail: `seeking ${desiredItem} from ${seller.profile?.displayName ?? seller.state.instanceName}`,
        });
      }
    }

    for (const npc of allNpcs) {
      if (!npc.instanceName) continue;
      const profile = profilesByName.get(npc.instanceName);
      if (!profile) continue;

      const nearby = allNpcs.filter(
        (other) =>
          other.mapName === npc.mapName &&
          other._id !== npc._id &&
          other.instanceName &&
          distance(npc, other) <= TRADE_DISTANCE_PX,
      );

      for (const other of nearby) {
        const otherProfile = other.instanceName ? profilesByName.get(other.instanceName) : null;
        if (!otherProfile) continue;
        const lastTradeAt = Math.max(npc.lastTradeAt ?? 0, other.lastTradeAt ?? 0);
        if (now - lastTradeAt < TRADE_COOLDOWN_MS) continue;

        const sellerDesired = otherProfile.desiredItem;
        if (!sellerDesired) continue;
        const sellerHas = getItemQuantity(profile.items, sellerDesired);
        const buyerCoins = otherProfile.currencies?.coins ?? 0;
        if (sellerHas <= 0 || buyerCoins < TRADE_PRICE) continue;

        await ctx.db.patch(otherProfile._id, {
          items: upsertItem(otherProfile.items, sellerDesired, 1),
          currencies: {
            ...(otherProfile.currencies ?? {}),
            coins: buyerCoins - TRADE_PRICE,
          },
          updatedAt: now,
        });
        await ctx.db.patch(profile._id, {
          items: upsertItem(profile.items, sellerDesired, -1),
          currencies: {
            ...(profile.currencies ?? {}),
            coins: (profile.currencies?.coins ?? 0) + TRADE_PRICE,
          },
          updatedAt: now,
        });

        await ctx.db.patch(npc._id, {
          currentIntent: "trading",
          intentDetail: `sold ${sellerDesired} to ${otherProfile.displayName}`,
          mood: "satisfied",
          lastTradeAt: now,
          lastTick: now,
        });
        await ctx.db.patch(other._id, {
          currentIntent: "trading",
          intentDetail: `bought ${sellerDesired} from ${profile.displayName}`,
          mood: "curious",
          lastTradeAt: now,
          lastTick: now,
        });

        statesById.set(String(npc._id), { ...npc, lastTradeAt: now });
        statesById.set(String(other._id), { ...other, lastTradeAt: now });
        break;
      }
    }

    for (const npc of allNpcs) {
      const refreshed = statesById.get(String(npc._id)) ?? npc;
      const profile = refreshed.instanceName
        ? profilesByName.get(refreshed.instanceName)
        : null;
      const role = refreshed.instanceName
        ? rolesByAgentId.get(refreshed.instanceName)
        : null;
      const desiredTarget = desiredTargets.get(String(refreshed._id));
      const desiredItem = profile?.desiredItem;
      const hasDesiredItem =
        !!desiredItem && getItemQuantity(profile?.items, desiredItem) > 0;
      const isHoldingPost =
        desiredTarget?.detail?.startsWith("holding post") ||
        desiredTarget?.detail?.startsWith("patrolling post") ||
        desiredTarget?.detail?.startsWith("returning to post") ||
        desiredTarget?.detail?.startsWith("patrolling surface");
      const roleState = roleIntent(role?.roleKey, hasDesiredItem);

      // --- Idle check ---
      if (refreshed.idleUntil && now < refreshed.idleUntil) {
        // Still pausing — only patch if velocity needs zeroing (skip no-op writes)
        if (refreshed.vx !== 0 || refreshed.vy !== 0) {
          await ctx.db.patch(refreshed._id, {
            vx: 0,
            vy: 0,
            currentIntent: isHoldingPost
              ? roleState.currentIntent
              : hasDesiredItem
                ? "resting"
                : desiredTarget
                  ? "seeking-trade"
                  : roleState.currentIntent,
            intentDetail:
              desiredTarget?.detail ??
              (hasDesiredItem ? `holding ${desiredItem}` : roleState.intentDetail),
            mood: isHoldingPost ? roleState.mood : hasDesiredItem ? "content" : roleState.mood,
            lastTick: now,
          });
        }
        // Otherwise skip entirely — no DB write needed for idle NPCs
        continue;
      }

      // --- Pick a new target if we don't have one ---
      let targetX = refreshed.targetX;
      let targetY = refreshed.targetY;

      if (targetX == null || targetY == null) {
        if (desiredTarget) {
          targetX = desiredTarget.x;
          targetY = desiredTarget.y;
        } else {
          const wanderTarget = findWanderTarget(refreshed, allNpcs, desiredTargets);
          targetX = wanderTarget.x;
          targetY = wanderTarget.y;
        }
      }

      // --- Move toward target ---
      const dx = targetX - refreshed.x;
      const dy = targetY - refreshed.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const step = refreshed.speed * dt;
      const nextIntent = isHoldingPost
        ? roleState.currentIntent
        : desiredTarget
          ? "seeking-trade"
          : "wandering";
      const nextDetail =
        desiredTarget?.detail ??
        (hasDesiredItem ? `carrying ${desiredItem}` : roleState.intentDetail);
      const nextMood = isHoldingPost
        ? roleState.mood
        : desiredTarget
          ? "focused"
          : hasDesiredItem
            ? "content"
            : "curious";

      if (dist <= step + 1) {
        // Reached target — go idle
        const idleDuration =
          isHoldingPost
            ? POST_IDLE_MIN_MS + Math.random() * (POST_IDLE_MAX_MS - POST_IDLE_MIN_MS)
            : IDLE_MIN_MS + Math.random() * (IDLE_MAX_MS - IDLE_MIN_MS);
        const idleDirection = isHoldingPost ? randomDirection() : refreshed.direction;
        const nextState = {
          ...refreshed,
          x: targetX,
          y: targetY,
          vx: 0,
          vy: 0,
          targetX: undefined,
          targetY: undefined,
          idleUntil: now + idleDuration,
          currentIntent: isHoldingPost
            ? roleState.currentIntent
            : hasDesiredItem
              ? "resting"
              : nextIntent,
          intentDetail: isHoldingPost
            ? roleState.intentDetail
            : hasDesiredItem
              ? `holding ${desiredItem}`
              : desiredTarget?.detail ?? "taking a pause",
          mood: isHoldingPost ? roleState.mood : hasDesiredItem ? "content" : nextMood,
          direction: idleDirection,
          lastTick: now,
        };
        await ctx.db.patch(refreshed._id, {
          x: targetX,
          y: targetY,
          vx: 0,
          vy: 0,
          targetX: undefined,
          targetY: undefined,
          idleUntil: now + idleDuration,
          currentIntent: isHoldingPost
            ? roleState.currentIntent
            : hasDesiredItem
              ? "resting"
              : nextIntent,
          intentDetail: isHoldingPost
            ? roleState.intentDetail
            : hasDesiredItem
              ? `holding ${desiredItem}`
              : desiredTarget?.detail ?? "taking a pause",
          mood: isHoldingPost ? roleState.mood : hasDesiredItem ? "content" : nextMood,
          direction: idleDirection,
          lastTick: now,
        });
        statesById.set(String(refreshed._id), nextState);
      } else {
        // Step toward target
        const ratio = step / dist;
        let newX = refreshed.x + dx * ratio;
        let newY = refreshed.y + dy * ratio;

        const blockingNpc = currentNpcStates(statesById).find(
          (other) =>
            other.mapName === refreshed.mapName &&
            other._id !== refreshed._id &&
            distance({ x: newX, y: newY }, other) < NPC_MIN_SEPARATION_PX,
        );

        if (blockingNpc) {
          const idleDuration =
            IDLE_MIN_MS + Math.random() * Math.min(2000, IDLE_MAX_MS - IDLE_MIN_MS);
          await ctx.db.patch(refreshed._id, {
            vx: 0,
            vy: 0,
            targetX: undefined,
            targetY: undefined,
            idleUntil: now + idleDuration,
            currentIntent: "idle",
            intentDetail: "waiting for space to clear",
            mood: "calm",
            lastTick: now,
          });
          statesById.set(String(refreshed._id), {
            ...refreshed,
            vx: 0,
            vy: 0,
            targetX: undefined,
            targetY: undefined,
            idleUntil: now + idleDuration,
            currentIntent: "idle",
            intentDetail: "waiting for space to clear",
            mood: "calm",
            lastTick: now,
          });
          continue;
        }

        // Velocity for client extrapolation
        const vx = (dx / dist) * refreshed.speed;
        const vy = (dy / dist) * refreshed.speed;

        // Determine facing direction
        const direction =
          Math.abs(dx) > Math.abs(dy)
            ? dx > 0
              ? "right"
              : "left"
            : dy > 0
              ? "down"
              : "up";

        await ctx.db.patch(refreshed._id, {
          x: newX,
          y: newY,
          vx,
          vy,
          targetX,
          targetY,
          direction,
          currentIntent: nextIntent,
          intentDetail: nextDetail,
          mood: nextMood,
          idleUntil: undefined,
          lastTick: now,
        });
        statesById.set(String(refreshed._id), {
          ...refreshed,
          x: newX,
          y: newY,
          vx,
          vy,
          targetX,
          targetY,
          direction,
          currentIntent: nextIntent,
          intentDetail: nextDetail,
          mood: nextMood,
          idleUntil: undefined,
          lastTick: now,
        });
      }
    }

    // Reschedule the next tick
    await ctx.scheduler.runAfter(TICK_MS, internal.npcEngine.tick, {});
  },
});

// ---------------------------------------------------------------------------
// Sync npcState from mapObjects (called after editor saves)
// ---------------------------------------------------------------------------

/**
 * Synchronise the npcState table with mapObjects for a given map.
 * - Creates npcState rows for new NPC objects
 * - Removes npcState rows for deleted NPC objects
 * - Leaves existing NPC positions untouched (they keep wandering)
 */
export const syncMap = internalMutation({
  args: { mapName: v.string() },
  handler: async (ctx, { mapName }) => {
    // All objects on this map
    const objects = await ctx.db
      .query("mapObjects")
      .withIndex("by_map", (q) => q.eq("mapName", mapName))
      .collect();

    // All sprite definitions — we need to know which are NPCs
    const defs = await ctx.db.query("spriteDefinitions").collect();
    const npcDefNames = new Set(
      defs.filter((d) => d.category === "npc").map((d) => d.name),
    );

    // Current npcState rows for this map
    const currentStates = await ctx.db
      .query("npcState")
      .withIndex("by_map", (q) => q.eq("mapName", mapName))
      .collect();
    const stateByObjectId = new Map(
      currentStates.map((s) => [s.mapObjectId as string, s]),
    );

    // NPC objects from mapObjects
    const npcObjects = objects.filter((o) => npcDefNames.has(o.spriteDefName));
    const npcObjectIds = new Set(npcObjects.map((o) => o._id as string));

    const now = Date.now();

    const hadAnyStates = currentStates.length > 0;
    let createdAny = false;

    // Create missing npcState rows  (+ update instanceName on existing ones)
    for (const obj of npcObjects) {
      const existing = stateByObjectId.get(obj._id as string);
      if (existing) {
        // Keep instanceName in sync with mapObject
        if (existing.instanceName !== obj.instanceName) {
          await ctx.db.patch(existing._id, { instanceName: obj.instanceName });
        }
      } else {
        const def = defs.find((d) => d.name === obj.spriteDefName);
        await ctx.db.insert("npcState", {
          mapName,
          mapObjectId: obj._id,
          spriteDefName: obj.spriteDefName,
          instanceName: obj.instanceName,
          x: obj.x,
          y: obj.y,
          spawnX: obj.x,
          spawnY: obj.y,
          direction: "down",
          vx: 0,
          vy: 0,
          speed: def?.npcSpeed ?? 30,
          wanderRadius: def?.npcWanderRadius ?? 60,
          lastTick: 0,
        });
        createdAny = true;
      }
    }

    // Remove npcState rows for deleted NPC objects
    for (const state of currentStates) {
      if (!npcObjectIds.has(state.mapObjectId as string)) {
        await ctx.db.delete(state._id);
      }
    }

    // Start the loop only when we just created the first NPC rows or when the
    // existing loop appears stale. Overlapping tick chains cause NPCs to
    // violate spacing rules and visually stack.
    const allStates = await ctx.db.query("npcState").collect();
    const hasActiveLoop = hasRecentNpcLoopActivity(allStates, now);
    if ((createdAny && !hadAnyStates) || (!hasActiveLoop && allStates.length > 0)) {
      await ctx.scheduler.runAfter(0, internal.npcEngine.tick, {});
    }
  },
});

// ---------------------------------------------------------------------------
// Ensure the tick loop is running (called by clients on connect)
// ---------------------------------------------------------------------------

export const ensureLoop = mutation({
  args: {},
  handler: async (ctx) => {
    const anyNpc = await ctx.db.query("npcState").first();
    if (!anyNpc) return;

    // Check if there's been a recent tick by looking for any NPC whose
    // lastTick changed recently AND has non-zero velocity or a target
    // (indicating active movement from the tick loop, not just creation).
    const now = Date.now();
    const allStates = await ctx.db.query("npcState").collect();
    const hasActiveTick = hasRecentNpcLoopActivity(allStates, now);

    if (!hasActiveTick) {
      console.log("[NPC Engine] Loop appears dead, restarting tick...");
      await ctx.scheduler.runAfter(0, internal.npcEngine.tick, {});
    }
  },
});

// ---------------------------------------------------------------------------
// Admin: clear all NPC state (useful for debugging)
// ---------------------------------------------------------------------------
export const clearAll = mutation({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("npcState").collect();
    for (const s of all) {
      await ctx.db.delete(s._id);
    }
    return { deleted: all.length };
  },
});
