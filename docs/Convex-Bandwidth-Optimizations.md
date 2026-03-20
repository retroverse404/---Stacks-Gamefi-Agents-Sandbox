---
title: Convex Bandwidth Optimizations
date: 2026-03-19
tags:
  - tinyrealms/infra
  - convex
  - optimization
status: active
type: note
---

# Convex Bandwidth Optimizations

> Living doc — add entries as we observe, fix, and measure.

## Context

On 2026-03-19 (day 1 of billing cycle), DB bandwidth hit **31.42 GB** against a 1 GB plan limit — generating +30.42 GB on-demand charges. Root cause: `npcEngine.tick` running every 500ms and doing 5 full `.collect()` table scans per call.

---

## Done

### 2026-03-19 — Stop tick when no players online
**Problem:** Tick ran 24/7 even with zero players connected, burning ~580 KB/tick.
**Fix:** Added `presence.first()` check at top of `tick` — returns without rescheduling if no presence rows exist. Added restart logic in `presence.update` when `npcState.lastTick` is stale.
**Impact:** Tick loop now dormant when server is idle.

---

## Next Up

### Add presence cleanup cron
**Problem:** If a client crashes/disconnects without calling `presence.remove`, stale presence rows keep the tick running forever.
**Fix:** Schedule `presence.cleanup` as a Convex cron every 30s.
**File:** `convex/crons.ts`

### Stop querying `maps` every tick
**Problem:** `maps` table includes full `collisionMask` strings (large). Read on every tick even though maps never change.
**Fix options:**
- Move collision mask to a separate `mapCollision` table never queried by tick
- Or: query only maps with active NPCs using `by_name` index instead of `.collect()`
**File:** `convex/npcEngine.ts` line ~782

### Stop querying `npcProfiles` and `semanticObjects` every tick
**Problem:** Both are full `.collect()` — static data that rarely changes between ticks.
**Fix:** Same pattern — index query by active map names only, not global collect.
**File:** `convex/npcEngine.ts` lines ~781, ~789

### Increase `TICK_MS` when no players are in a map
**Problem:** Even with players online, uninhabited maps tick at full speed.
**Fix:** Per-map tick scheduling — only tick maps that have presence rows.

---

## Monitoring

- Convex Dashboard → Usage → Database Bandwidth → Breakdown by function
- Watch `npcEngine.tick` bandwidth — should be near 0 when no one is online
- Target: stay within 1 GB/month included on Pro plan

---

## Deployment Strategy

- **Local dev** (`local-ragavvagav-tinyrealms`) — free, no billing, use for all future sessions
- **Prod** (`zealous-bobcat-847`) — only deploy when a shareable live URL is needed (demo, hackathon)
- Prod was spun up solely for the DoraHacks deadline — consider pausing/deleting it after the submission window closes

## Notes

- `npcEngine.listByMap` (89 MB) and `agentEconomics.getEconomySnapshot` (17 MB) are secondary bandwidth sources — address after tick is fixed
- Write conflicts on `semanticObjects` (Insights panel) suggest tick frequency is too high relative to agent write throughput — increasing `TICK_MS` would also reduce conflicts
