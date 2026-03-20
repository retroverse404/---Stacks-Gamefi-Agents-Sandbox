---
title: Codex Session — Bandwidth Emergency Fix
date: 2026-03-19
session: bandwidth-fix
tags:
  - codex
  - convex
  - npcEngine
  - presence
status: complete
---

# Codex Session — 2026-03-19 — Bandwidth Emergency Fix

**Session goal:** Stop runaway Convex DB bandwidth caused by `npcEngine.tick` running 24/7 regardless of player presence.

---

## What Triggered This

On billing period start (2026-03-19), Convex Dashboard showed:

- **Database Bandwidth: 1 GB included + 30.42 GB on-demand** (day 1 of billing cycle)
- Root cause: `npcEngine.tick` running every 500ms, doing 5 full `.collect()` table scans per call
- At ~580 KB per tick × 56K ticks ≈ 31.25 GB in ~7.7 hours
- Largest single contributor: `maps.collect()` reads full `collisionMask` strings on every tick

---

## What I Changed

### `convex/npcEngine.ts`

**Added: presence guard at top of `tick` handler**

```ts
// Before (line 770):
const allNpcs = await ctx.db.query("npcState").collect();
if (allNpcs.length === 0) return;

// After:
const anyPresence = await ctx.db.query("presence").first();
if (!anyPresence) return; // Stop loop when no players online

const allNpcs = await ctx.db.query("npcState").collect();
if (allNpcs.length === 0) return;
```

**Why:** The tick self-schedules via `ctx.scheduler.runAfter(TICK_MS, internal.npcEngine.tick, {})`. By returning early without rescheduling, the loop stops completely when no presence rows exist. `presence.first()` is a single cheap read — no index needed, returns immediately.

**Impact:** Zero bandwidth consumed when server is idle.

---

### `convex/presence.ts`

**Added: `internal` import**

```ts
import { internal } from "./_generated/api";
```

**Added: tick restart logic in `update` handler**

```ts
// At the end of presence.update handler:
const anyNpc = await ctx.db.query("npcState").first();
if (anyNpc) {
  const STALE_MS = 500 * 6; // 6 missed ticks = loop is dead
  if ((anyNpc.lastTick ?? 0) < Date.now() - STALE_MS) {
    await ctx.scheduler.runAfter(0, internal.npcEngine.tick, {});
  }
}
```

**Why:** When the first player connects, their client calls `presence.update` every ~200ms. This detects a stale tick loop and restarts it automatically. The existing tick deduplication logic (line ~775 in npcEngine.ts) prevents duplicate chains from stacking.

---

## Deployed

```
npx convex deploy --yes
→ Deployed to https://zealous-bobcat-847.convex.cloud
Timestamp: 2026-03-19 ~18:30 IST
```

---

## What Was NOT Fixed (Deferred)

The following are documented in [[Convex-Bandwidth-Optimizations]] for future sessions:

1. **`maps.collect()` in tick** — reads full collision masks every tick even for maps with no active NPCs. Fix: query by active map names with `by_name` index, or split `collisionMask` into a separate table the tick never reads.
2. **`npcProfiles.collect()` and `semanticObjects.collect()` in tick** — static data, full scan every 500ms.
3. **Presence cleanup cron** — stale presence rows (crashed clients) keep tick alive. Fix: Convex cron every 30s calling `presence.cleanup`.
4. **Per-map tick scheduling** — tick fires for all maps even uninhabited ones.

---

## Architecture Notes For Next Session

- The tick loop is **self-scheduling** — it only runs while players are online now
- `presence.update` is the **restart trigger** — no manual intervention needed
- `presence.remove` is called on clean disconnect; `presence.cleanup` handles crashes (needs cron)
- Collision masks are the **largest bandwidth source per tick** — stored as serialized strings in `maps` table, read on every tick call
- Write conflicts on `semanticObjects` (visible in Convex Insights since 2026-03-16) suggest tick frequency is too high relative to agent write throughput — increasing `TICK_MS` or switching to per-map ticks would resolve this

---

## Deployment Context

- Prod deployment exists solely for DoraHacks hackathon deadline (~2026-03-20)
- All future development should run against local Convex (`local-ragavvagav-tinyrealms`)
- Consider deleting `zealous-bobcat-847` after submission window closes
