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
const TICK_MS = 500; // server tick interval (ms) — faster updates keep agents visibly alive
const IDLE_MIN_MS = 1200; // minimum idle pause before next wander
const IDLE_MAX_MS = 3200; // maximum idle pause
const STALE_THRESHOLD_MS = TICK_MS * 4; // if no tick in this long, loop is dead
const GUEST_HEARTBEAT_STALE_MS = 10_000;
const TRADE_DISTANCE_PX = 96;
const TRADE_COOLDOWN_MS = 12000;
const TRADE_PRICE = 2;
const NPC_MIN_SEPARATION_PX = 40;
const NPC_COLLISION_HALF_W = 5;
const NPC_COLLISION_TOP = -10;
const NPC_COLLISION_BOT = 0;
const POST_LEASH_PX = 20;
const POST_IDLE_RADIUS_PX = 28;
const POST_IDLE_MIN_MS = 700;
const POST_IDLE_MAX_MS = 1600;
const SURFACE_IDLE_MIN_MS = 350;
const SURFACE_IDLE_MAX_MS = 900;
const MIN_SURFACE_PATROL_DIST = 80;

type RoleMetadata = {
  anchorObjectKey?: string;
  primaryTopics?: string[];
  routeObjectKeys?: string[];
};

type MapCollisionInfo = {
  width: number;
  height: number;
  tileWidth: number;
  tileHeight: number;
  collisionMask: boolean[];
};

type WaypointNode = {
  x: number;
  y: number;
  label: string;
  neighbors: string[];
};

type RoutedTarget = {
  x: number;
  y: number;
  viaLabel?: string;
};

const DEFAULT_SURFACE_ROUTE_KEYS: Record<string, string[]> = {
  guide: ["guide-post", "guide-board", "bookshelf-lore", "coffee-service"],
  merchant: ["merchant-post", "trade-corner"],
  market: ["market-post", "price-board", "market-aisle"],
  quests: ["quest-post", "opportunity-board", "bookshelf-lore", "coffee-service"],
  curator: ["mel-post", "curation-board", "bookshelf-lore", "phonograph-player", "coffee-service"],
};

const WAYPOINT_SAMPLE_PX = 18;
const WAYPOINT_CAPTURE_PX = 28;
const WAYPOINT_MAX_LINK_DIST = 420;
const CROWD_DETOUR_PX = 52;
const CROWD_WAIT_MIN_MS = 160;
const CROWD_WAIT_MAX_MS = 360;
const GEOMETRY_WAIT_MIN_MS = 180;
const GEOMETRY_WAIT_MAX_MS = 420;

const COZY_CABIN_WAYPOINTS: Record<string, WaypointNode> = {
  upperHall: { x: 708, y: 336, label: "upper hall", neighbors: ["marketDesk", "studyDoor", "centerHall"] },
  marketDesk: { x: 828, y: 336, label: "market desk", neighbors: ["upperHall", "marketAisle"] },
  marketAisle: { x: 876, y: 336, label: "market aisle", neighbors: ["marketDesk", "studyDoor"] },
  studyDoor: { x: 840, y: 288, label: "study door", neighbors: ["upperHall", "marketAisle"] },
  centerHall: { x: 900, y: 600, label: "center hall", neighbors: ["upperHall", "centerSouthA"] },
  centerSouthA: { x: 912, y: 732, label: "south corridor", neighbors: ["centerHall", "centerSouthB"] },
  centerSouthB: { x: 948, y: 852, label: "south approach", neighbors: ["centerSouthA", "southHall"] },
  southHall: { x: 984, y: 960, label: "south hall", neighbors: ["centerSouthB", "eastHallA", "tavernBridgeA"] },
  eastHallA: { x: 1200, y: 960, label: "east hall", neighbors: ["southHall", "eastHallB"] },
  eastHallB: { x: 1440, y: 1104, label: "east passage", neighbors: ["eastHallA", "eastHallC"] },
  eastHallC: { x: 1560, y: 1248, label: "music approach", neighbors: ["eastHallB", "musicEntry"] },
  tavernBridgeA: { x: 996, y: 1092, label: "tavern bridge", neighbors: ["southHall", "tavernBridgeB"] },
  tavernBridgeB: { x: 1020, y: 1192, label: "tavern threshold", neighbors: ["tavernBridgeA", "tavernEntry"] },
  tavernEntry: { x: 1032, y: 1296, label: "tavern entry", neighbors: ["tavernBridgeB", "barLeft"] },
  barLeft: { x: 1104, y: 1344, label: "bar left", neighbors: ["tavernEntry", "barCenter", "barSouth"] },
  barCenter: { x: 1176, y: 1344, label: "bar center", neighbors: ["barLeft"] },
  barSouth: { x: 1176, y: 1416, label: "bar south", neighbors: ["barLeft"] },
  musicEntry: { x: 1560, y: 1296, label: "music entry", neighbors: ["eastHallC", "musicMid"] },
  musicMid: { x: 1632, y: 1296, label: "music corridor", neighbors: ["musicEntry", "phonographDoor"] },
  phonographDoor: { x: 1848, y: 1464, label: "phonograph door", neighbors: ["musicMid"] },
};

const WAYPOINT_GRAPHS: Record<string, Record<string, WaypointNode>> = {
  "Cozy Cabin": COZY_CABIN_WAYPOINTS,
};

const COZY_CABIN_PIT_BLOCK_TILES: ReadonlyArray<readonly [number, number]> = [
  [62, 40],
  [63, 40],
  [64, 40],
  [62, 41],
  [63, 41],
  [64, 41],
  [62, 42],
  [63, 42],
  [64, 42],
];
const COZY_CABIN_PASSAGE_CLEAR_TILES: ReadonlyArray<readonly [number, number]> = [
  ...Array.from({ length: 10 }, (_, offset) => [67, 17 + offset] as [number, number]),
  ...Array.from({ length: 10 }, (_, offset) => [68, 17 + offset] as [number, number]),
];
const GUEST_HEARTBEAT_FACT_KEY = "guest-viewer-heartbeat";

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

function parseJsonObject(metadataJson?: string) {
  if (!metadataJson) return {};
  try {
    const parsed = JSON.parse(metadataJson);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function sanitizePatrolDetail(detail?: string) {
  return detail?.split(" via ")[0] ?? "continuing patrol";
}

function resolveSemanticNavAnchor(object: {
  x?: number;
  y?: number;
  label?: string;
  metadataJson?: string;
}) {
  const meta = parseJsonObject(object.metadataJson);
  const navAnchor =
    meta.navAnchor && typeof meta.navAnchor === "object"
      ? (meta.navAnchor as Record<string, unknown>)
      : null;
  const anchorX = typeof navAnchor?.x === "number" ? navAnchor.x : object.x;
  const anchorY = typeof navAnchor?.y === "number" ? navAnchor.y : object.y;
  const label = typeof navAnchor?.label === "string" ? navAnchor.label : object.label;
  return anchorX != null && anchorY != null
    ? { x: anchorX, y: anchorY, label: label ?? "surface" }
    : null;
}

function getRoleSurfaceAnchors(
  npc: { mapName: string; spawnX?: number; spawnY?: number },
  role: { roleKey?: string; postObjectKey?: string } | null | undefined,
  roleMeta: RoleMetadata,
  semanticObjectsByKey: Map<string, any>,
) {
  const anchors = uniqueKeys([
    role?.postObjectKey,
    roleMeta.anchorObjectKey,
    ...(roleMeta.routeObjectKeys ?? DEFAULT_SURFACE_ROUTE_KEYS[role?.roleKey ?? ""] ?? []),
  ])
    .map((objectKey) => {
      const object = semanticObjectsByKey.get(`${npc.mapName}:${objectKey}`);
      const anchor = object ? resolveSemanticNavAnchor(object) : null;
      return anchor ? { x: anchor.x, y: anchor.y, label: anchor.label } : null;
    })
    .filter((anchor): anchor is NonNullable<typeof anchor> => anchor !== null);

  if (npc.spawnX != null && npc.spawnY != null) {
    anchors.push({ x: npc.spawnX, y: npc.spawnY, label: "spawn" });
  }

  return anchors;
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

function uniqueKeys(keys: Array<string | undefined>) {
  return Array.from(new Set(keys.filter((key): key is string => !!key)));
}

function shuffleArray<T>(values: T[]) {
  const next = [...values];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

function chooseSurfacePatrolTarget(
  npc: { _id: unknown; mapName: string; x: number; y: number; targetX?: number; targetY?: number },
  role: { roleKey?: string; postObjectKey?: string } | undefined,
  roleMeta: RoleMetadata,
  semanticObjectsByKey: Map<string, any>,
  mapCollision: MapCollisionInfo | undefined,
  allNpcs: { _id: unknown; mapName: string; x: number; y: number }[],
  desiredTargets: Map<string, { x: number; y: number; detail: string }>,
) {
  const anchors = getRoleSurfaceAnchors(npc, role, roleMeta, semanticObjectsByKey);

  const candidates = anchors
      .map((anchor, index) => {
        const distFromNpc = distance(npc, { x: anchor.x, y: anchor.y });
        const distFromCurrentTarget =
          npc.targetX != null && npc.targetY != null
            ? distance({ x: npc.targetX, y: npc.targetY }, { x: anchor.x, y: anchor.y })
            : Infinity;
        return {
          objectKey: `${anchor.label}:${index}`,
          x: anchor.x,
          y: anchor.y,
          label: anchor.label,
          distFromNpc,
          distFromCurrentTarget,
          isReachable:
            isDirectPathClear(mapCollision, npc, { x: anchor.x, y: anchor.y }) ||
            routeTargetThroughWaypoints(
              npc.mapName,
              mapCollision,
              { x: npc.x, y: npc.y },
              { x: anchor.x, y: anchor.y },
            ) !== null,
        };
      })
      .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null);

  const currentCandidate =
    npc.targetX != null && npc.targetY != null
      ? candidates.find(
          (candidate) =>
            distance({ x: npc.targetX!, y: npc.targetY! }, { x: candidate.x, y: candidate.y }) <=
            POST_IDLE_RADIUS_PX,
        )
      : null;

  if (currentCandidate && distance(npc, currentCandidate) > POST_IDLE_RADIUS_PX) {
    return {
      x: currentCandidate.x,
      y: currentCandidate.y,
      detail: `roaming toward ${currentCandidate.label}`,
    };
  }

  const shuffledCandidates = shuffleArray(
    candidates,
  );

  const viable = shuffledCandidates.filter(
    (candidate) =>
      candidate.isReachable &&
      candidate.distFromNpc >= MIN_SURFACE_PATROL_DIST &&
      candidate.distFromCurrentTarget >= POST_IDLE_RADIUS_PX,
  );
  const reachable = shuffledCandidates.filter((candidate) => candidate.isReachable);
  const pool = viable.length > 0 ? viable : reachable.length > 0 ? reachable : shuffledCandidates;

  for (const candidate of pool) {
    if (
      !isCrowdedTarget(
        { x: candidate.x, y: candidate.y },
        allNpcs,
        npc.mapName,
        String(npc._id),
        desiredTargets,
      )
    ) {
      return {
        x: candidate.x,
        y: candidate.y,
        detail: `roaming toward ${candidate.label}`,
      };
    }
  }

  const fallback = pool[0];
  return fallback
    ? {
        x: fallback.x,
        y: fallback.y,
        detail: `roaming toward ${fallback.label}`,
      }
    : null;
}

function chooseNpcRecoveryTarget(
  npc: { mapName: string; x: number; y: number; spawnX?: number; spawnY?: number },
  role: { roleKey?: string; postObjectKey?: string } | null | undefined,
  roleMeta: RoleMetadata,
  semanticObjectsByKey: Map<string, any>,
  mapCollision: MapCollisionInfo | undefined,
) {
  const graph = WAYPOINT_GRAPHS[npc.mapName];
  const candidates = [
    ...getRoleSurfaceAnchors(npc, role, roleMeta, semanticObjectsByKey),
    ...Object.values(graph ?? {}).map((node) => ({ x: node.x, y: node.y, label: node.label })),
  ].filter((candidate) => !isMapBlocked(mapCollision, candidate.x, candidate.y));

  const ranked = candidates.sort(
    (a, b) => distance(npc, { x: a.x, y: a.y }) - distance(npc, { x: b.x, y: b.y }),
  );

  return ranked[0] ?? null;
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

async function hasActiveViewer(ctx: any) {
  const anyPresence = await ctx.db.query("presence").first();
  if (anyPresence) return true;

  const heartbeat = await ctx.db
    .query("worldFacts")
    .withIndex("by_factKey", (q: any) => q.eq("factKey", GUEST_HEARTBEAT_FACT_KEY))
    .first();
  return (heartbeat?.updatedAt ?? 0) > Date.now() - GUEST_HEARTBEAT_STALE_MS;
}

function parseCollisionMask(raw: string | undefined) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(Boolean) : [];
  } catch {
    return [];
  }
}

function applyCozyCabinCollisionFixups(
  mapName: string,
  collisionMask: boolean[],
  width: number,
  height: number,
) {
  const normalized = mapName.toLowerCase();
  const isCozyCabin = normalized === "cozy cabin" || normalized === "cozy-cabin";
  if (!isCozyCabin) return collisionMask;

  const next = [...collisionMask];
  for (const [tileX, tileY] of COZY_CABIN_PASSAGE_CLEAR_TILES) {
    if (tileX < 0 || tileY < 0 || tileX >= width || tileY >= height) continue;
    next[tileY * width + tileX] = false;
  }
  for (const [tileX, tileY] of COZY_CABIN_PIT_BLOCK_TILES) {
    if (tileX < 0 || tileY < 0 || tileX >= width || tileY >= height) continue;
    next[tileY * width + tileX] = true;
  }
  return next;
}

function buildMapCollisionIndex(
  maps: Array<{
    name: string;
    width: number;
    height: number;
    tileWidth: number;
    tileHeight: number;
    collisionMask: string;
  }>,
) {
  return new Map(
    maps.map((map) => [
      map.name,
      {
        width: map.width,
        height: map.height,
        tileWidth: map.tileWidth,
        tileHeight: map.tileHeight,
        collisionMask: applyCozyCabinCollisionFixups(
          map.name,
          parseCollisionMask(map.collisionMask),
          map.width,
          map.height,
        ),
      } satisfies MapCollisionInfo,
    ]),
  );
}

function worldToTile(map: MapCollisionInfo, px: number, py: number) {
  return {
    tileX: Math.floor(px / map.tileWidth),
    tileY: Math.floor(py / map.tileHeight),
  };
}

function isTileBlocked(map: MapCollisionInfo, tileX: number, tileY: number) {
  if (tileX < 0 || tileY < 0 || tileX >= map.width || tileY >= map.height) return true;
  return Boolean(map.collisionMask[tileY * map.width + tileX]);
}

function isMapBlocked(map: MapCollisionInfo | undefined, px: number, py: number) {
  if (!map) return false;

  const left = px - NPC_COLLISION_HALF_W;
  const right = px + NPC_COLLISION_HALF_W;
  const top = py + NPC_COLLISION_TOP;
  const bot = py + NPC_COLLISION_BOT;

  const tl = worldToTile(map, left, top);
  const tr = worldToTile(map, right, top);
  const bl = worldToTile(map, left, bot);
  const br = worldToTile(map, right, bot);

  return (
    isTileBlocked(map, tl.tileX, tl.tileY) ||
    isTileBlocked(map, tr.tileX, tr.tileY) ||
    isTileBlocked(map, bl.tileX, bl.tileY) ||
    isTileBlocked(map, br.tileX, br.tileY)
  );
}

function isDirectPathClear(
  map: MapCollisionInfo | undefined,
  from: { x: number; y: number },
  to: { x: number; y: number },
) {
  if (!map) return true;
  const dist = distance(from, to);
  const steps = Math.max(2, Math.ceil(dist / WAYPOINT_SAMPLE_PX));
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    const px = from.x + (to.x - from.x) * t;
    const py = from.y + (to.y - from.y) * t;
    if (isMapBlocked(map, px, py)) return false;
  }
  return true;
}

function findNearestWaypointId(
  graph: Record<string, WaypointNode>,
  map: MapCollisionInfo | undefined,
  point: { x: number; y: number },
) {
  let bestId: string | null = null;
  let bestDist = Number.POSITIVE_INFINITY;

  for (const [id, node] of Object.entries(graph)) {
    const distFromPoint = distance(point, node);
    if (distFromPoint > WAYPOINT_MAX_LINK_DIST) continue;
    if (!isDirectPathClear(map, point, node)) continue;
    if (distFromPoint < bestDist) {
      bestDist = distFromPoint;
      bestId = id;
    }
  }

  return bestId;
}

function findWaypointPath(
  graph: Record<string, WaypointNode>,
  startId: string,
  goalId: string,
) {
  if (startId === goalId) return [startId];

  const queue: string[] = [startId];
  const cameFrom = new Map<string, string | null>([[startId, null]]);

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === goalId) break;
    for (const next of graph[current]?.neighbors ?? []) {
      if (!graph[next] || cameFrom.has(next)) continue;
      cameFrom.set(next, current);
      queue.push(next);
    }
  }

  if (!cameFrom.has(goalId)) return null;

  const path: string[] = [];
  let cursor: string | null = goalId;
  while (cursor) {
    path.unshift(cursor);
    cursor = cameFrom.get(cursor) ?? null;
  }
  return path;
}

function routeTargetThroughWaypoints(
  mapName: string,
  map: MapCollisionInfo | undefined,
  current: { x: number; y: number },
  target: { x: number; y: number },
): RoutedTarget | null {
  const graph = WAYPOINT_GRAPHS[mapName];
  if (!graph || !map) return null;
  if (isDirectPathClear(map, current, target)) return null;

  const startId = findNearestWaypointId(graph, map, current);
  const goalId = findNearestWaypointId(graph, map, target);
  if (!startId || !goalId) return null;

  if (startId === goalId) {
    const node = graph[startId];
    if (distance(current, node) > WAYPOINT_CAPTURE_PX) {
      return { x: node.x, y: node.y, viaLabel: node.label };
    }
    return null;
  }

  const path = findWaypointPath(graph, startId, goalId);
  if (!path || path.length === 0) return null;

  const startNode = graph[startId];
  if (distance(current, startNode) > WAYPOINT_CAPTURE_PX) {
    return { x: startNode.x, y: startNode.y, viaLabel: startNode.label };
  }

  const nextNodeId = path[1];
  if (!nextNodeId || !graph[nextNodeId]) return null;
  const nextNode = graph[nextNodeId];
  return { x: nextNode.x, y: nextNode.y, viaLabel: nextNode.label };
}

function chooseCrowdDetourTarget(
  npc: { _id: unknown; mapName: string; x: number; y: number },
  moveTarget: { x: number; y: number },
  mapCollision: MapCollisionInfo | undefined,
  allNpcs: { _id: unknown; mapName: string; x: number; y: number }[],
  desiredTargets: Map<string, { x: number; y: number; detail: string }>,
) {
  const dx = moveTarget.x - npc.x;
  const dy = moveTarget.y - npc.y;
  const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
  const nx = dx / dist;
  const ny = dy / dist;

  const candidates = [
    { x: npc.x - ny * CROWD_DETOUR_PX, y: npc.y + nx * CROWD_DETOUR_PX, detail: "sidestepping left" },
    { x: npc.x + ny * CROWD_DETOUR_PX, y: npc.y - nx * CROWD_DETOUR_PX, detail: "sidestepping right" },
    { x: npc.x - nx * (CROWD_DETOUR_PX * 0.6), y: npc.y - ny * (CROWD_DETOUR_PX * 0.6), detail: "backing away" },
  ];

  for (const candidate of candidates) {
    if (isMapBlocked(mapCollision, candidate.x, candidate.y)) continue;
    if (isCrowdedTarget(candidate, allNpcs, npc.mapName, String(npc._id), desiredTargets)) continue;
    return candidate;
  }

  return null;
}

function randomDuration(minMs: number, maxMs: number) {
  return minMs + Math.random() * Math.max(0, maxMs - minMs);
}

// ---------------------------------------------------------------------------
// Tick loop (internal — not callable from client)
// ---------------------------------------------------------------------------

/** The main NPC tick. Moves all NPCs one step, then reschedules itself. */
export const tick = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Stop the loop when no players are online — avoids burning DB bandwidth.
    // Authenticated presence or a recent guest heartbeat can keep it alive.
    if (!(await hasActiveViewer(ctx))) return;

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
    const allMaps = await ctx.db.query("maps").collect();
    const profilesByName = new Map(allProfiles.map((profile) => [profile.name, profile]));
    const mapsByName = buildMapCollisionIndex(allMaps);
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

      if (shouldPatrolSurface) {
        const patrolTarget = chooseSurfacePatrolTarget(
          npc,
          role,
          roleMeta,
          semanticObjectsByKey,
          mapsByName.get(npc.mapName),
          allNpcs,
          desiredTargets,
        );
        if (patrolTarget) {
          desiredTargets.set(String(npc._id), patrolTarget);
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
      const roleMeta = parseRoleMetadata(role?.metadataJson);
      const mapCollision = mapsByName.get(refreshed.mapName);

      if (isMapBlocked(mapCollision, refreshed.x, refreshed.y)) {
        const recoveryTarget = chooseNpcRecoveryTarget(
          refreshed,
          role,
          roleMeta,
          semanticObjectsByKey,
          mapCollision,
        );
        if (recoveryTarget) {
          const recoveryIdleUntil = now + randomDuration(GEOMETRY_WAIT_MIN_MS, GEOMETRY_WAIT_MAX_MS);
          const recoveryRoleState = roleIntent(role?.roleKey, false);
          await ctx.db.patch(refreshed._id, {
            x: recoveryTarget.x,
            y: recoveryTarget.y,
            vx: 0,
            vy: 0,
            targetX: undefined,
            targetY: undefined,
            idleUntil: recoveryIdleUntil,
            currentIntent: recoveryRoleState.currentIntent,
            intentDetail: `recovering to ${recoveryTarget.label}`,
            mood: "focused",
            lastTick: now,
          });
          statesById.set(String(refreshed._id), {
            ...refreshed,
            x: recoveryTarget.x,
            y: recoveryTarget.y,
            vx: 0,
            vy: 0,
            targetX: undefined,
            targetY: undefined,
            idleUntil: recoveryIdleUntil,
            currentIntent: recoveryRoleState.currentIntent,
            intentDetail: `recovering to ${recoveryTarget.label}`,
            mood: "focused",
            lastTick: now,
          });
          continue;
        }
      }

      const desiredTarget = desiredTargets.get(String(refreshed._id));
      const desiredItem = profile?.desiredItem;
      const hasDesiredItem =
        !!desiredItem && getItemQuantity(profile?.items, desiredItem) > 0;
      const isHoldingPost =
        desiredTarget?.detail?.startsWith("holding post") ||
        desiredTarget?.detail?.startsWith("patrolling post") ||
        desiredTarget?.detail?.startsWith("returning to post") ||
        desiredTarget?.detail?.startsWith("patrolling surface");
      const isSurfaceRoam = desiredTarget?.detail?.startsWith("roaming toward");
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
      let goalX = refreshed.targetX;
      let goalY = refreshed.targetY;
      const finalTarget = desiredTarget
        ? { x: desiredTarget.x, y: desiredTarget.y }
        : goalX != null && goalY != null
          ? { x: goalX, y: goalY }
          : null;

      if (goalX == null || goalY == null) {
        if (desiredTarget) {
          goalX = desiredTarget.x;
          goalY = desiredTarget.y;
        } else {
          const wanderTarget = findWanderTarget(refreshed, allNpcs, desiredTargets);
          goalX = wanderTarget.x;
          goalY = wanderTarget.y;
        }
      }

      const routedTarget =
        goalX != null && goalY != null
          ? routeTargetThroughWaypoints(
              refreshed.mapName,
              mapsByName.get(refreshed.mapName),
              { x: refreshed.x, y: refreshed.y },
              finalTarget ?? { x: goalX, y: goalY },
            )
          : null;
      const moveTarget = routedTarget ?? { x: goalX!, y: goalY! };

      // --- Move toward target ---
      const dx = moveTarget.x - refreshed.x;
      const dy = moveTarget.y - refreshed.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const step = refreshed.speed * dt;
      const nextIntent = isHoldingPost
        ? roleState.currentIntent
        : isSurfaceRoam
          ? roleState.currentIntent
          : desiredTarget
          ? "seeking-trade"
          : "wandering";
      const routedDetailSuffix = routedTarget?.viaLabel ? ` via ${routedTarget.viaLabel}` : "";
      const nextDetail =
        desiredTarget?.detail
          ? `${desiredTarget.detail}${routedDetailSuffix}`
          :
        (hasDesiredItem ? `carrying ${desiredItem}` : roleState.intentDetail);
      const nextMood = isHoldingPost
        ? roleState.mood
        : desiredTarget
          ? "focused"
          : hasDesiredItem
            ? "content"
            : "curious";

      if (dist <= step + 1) {
        if (routedTarget && finalTarget && distance(moveTarget, finalTarget) > WAYPOINT_CAPTURE_PX) {
          await ctx.db.patch(refreshed._id, {
            x: moveTarget.x,
            y: moveTarget.y,
            vx: 0,
            vy: 0,
            targetX: goalX,
            targetY: goalY,
            currentIntent: nextIntent,
            intentDetail: nextDetail,
            mood: nextMood,
            idleUntil: undefined,
            lastTick: now,
          });
          statesById.set(String(refreshed._id), {
            ...refreshed,
            x: moveTarget.x,
            y: moveTarget.y,
            vx: 0,
            vy: 0,
            targetX: goalX,
            targetY: goalY,
            currentIntent: nextIntent,
            intentDetail: nextDetail,
            mood: nextMood,
            idleUntil: undefined,
            lastTick: now,
          });
          continue;
        }

        // Reached final target — go idle
          const idleDuration =
            isHoldingPost
              ? randomDuration(POST_IDLE_MIN_MS, POST_IDLE_MAX_MS)
              : isSurfaceRoam
                ? randomDuration(SURFACE_IDLE_MIN_MS, SURFACE_IDLE_MAX_MS)
                : randomDuration(IDLE_MIN_MS, IDLE_MAX_MS);
        const idleDirection = isHoldingPost ? randomDirection() : refreshed.direction;
        const nextState = {
          ...refreshed,
          x: moveTarget.x,
          y: moveTarget.y,
          vx: 0,
          vy: 0,
          targetX: undefined,
          targetY: undefined,
          idleUntil: now + idleDuration,
          currentIntent: isHoldingPost
            ? roleState.currentIntent
            : isSurfaceRoam
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
          x: moveTarget.x,
          y: moveTarget.y,
          vx: 0,
          vy: 0,
          targetX: undefined,
          targetY: undefined,
          idleUntil: now + idleDuration,
            currentIntent: isHoldingPost
              ? roleState.currentIntent
              : isSurfaceRoam
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
          const detourTarget = chooseCrowdDetourTarget(
            refreshed,
            moveTarget,
            mapsByName.get(refreshed.mapName),
            currentNpcStates(statesById),
            desiredTargets,
          );

          if (detourTarget) {
            newX = detourTarget.x;
            newY = detourTarget.y;
          } else {
            const idleDuration = randomDuration(CROWD_WAIT_MIN_MS, CROWD_WAIT_MAX_MS);
            await ctx.db.patch(refreshed._id, {
              vx: 0,
              vy: 0,
              targetX: goalX,
              targetY: goalY,
              idleUntil: now + idleDuration,
              currentIntent: nextIntent,
              intentDetail: "making room to continue patrol",
              mood: "focused",
              lastTick: now,
            });
            statesById.set(String(refreshed._id), {
              ...refreshed,
              vx: 0,
              vy: 0,
              targetX: goalX,
              targetY: goalY,
              idleUntil: now + idleDuration,
              currentIntent: nextIntent,
              intentDetail: "making room to continue patrol",
              mood: "focused",
              lastTick: now,
            });
            continue;
          }
        }

        const mapCollision = mapsByName.get(refreshed.mapName);
        let moveX = newX;
        let moveY = newY;
        let moved = true;

        if (isMapBlocked(mapCollision, moveX, moveY)) {
          const canSlideX = !isMapBlocked(mapCollision, moveX, refreshed.y);
          const canSlideY = !isMapBlocked(mapCollision, refreshed.x, moveY);

          if (canSlideX) {
            moveY = refreshed.y;
          } else if (canSlideY) {
            moveX = refreshed.x;
          } else {
            const geometryDetour = chooseCrowdDetourTarget(
              refreshed,
              moveTarget,
              mapCollision,
              currentNpcStates(statesById),
              desiredTargets,
            );
            if (geometryDetour) {
              moveX = geometryDetour.x;
              moveY = geometryDetour.y;
            } else {
              moved = false;
            }
          }
        }

        if (!moved) {
          const idleDuration = randomDuration(GEOMETRY_WAIT_MIN_MS, GEOMETRY_WAIT_MAX_MS);
          await ctx.db.patch(refreshed._id, {
            vx: 0,
            vy: 0,
            targetX: goalX,
            targetY: goalY,
            idleUntil: now + idleDuration,
            currentIntent: roleState.currentIntent,
            intentDetail: "repositioning around room geometry",
            mood: "focused",
            lastTick: now,
          });
          statesById.set(String(refreshed._id), {
            ...refreshed,
            vx: 0,
            vy: 0,
            targetX: goalX,
            targetY: goalY,
            idleUntil: now + idleDuration,
            currentIntent: roleState.currentIntent,
            intentDetail: "repositioning around room geometry",
            mood: "focused",
            lastTick: now,
          });
          continue;
        }

        const actualDx = moveX - refreshed.x;
        const actualDy = moveY - refreshed.y;
        const actualDist = Math.sqrt(actualDx * actualDx + actualDy * actualDy);
        const vx = actualDist > 0 ? (actualDx / actualDist) * refreshed.speed : 0;
        const vy = actualDist > 0 ? (actualDy / actualDist) * refreshed.speed : 0;

        // Determine facing direction
        const direction =
          Math.abs(actualDx) > Math.abs(actualDy)
            ? actualDx > 0
              ? "right"
              : "left"
            : actualDy > 0
              ? "down"
              : "up";

        await ctx.db.patch(refreshed._id, {
          x: moveX,
          y: moveY,
          vx,
          vy,
          targetX: goalX,
          targetY: goalY,
          direction,
          currentIntent: nextIntent,
          intentDetail: nextDetail,
          mood: nextMood,
          idleUntil: undefined,
          lastTick: now,
        });
        statesById.set(String(refreshed._id), {
          ...refreshed,
          x: moveX,
          y: moveY,
          vx,
          vy,
          targetX: goalX,
          targetY: goalY,
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

    if (!(await hasActiveViewer(ctx))) {
      return;
    }

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
