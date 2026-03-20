---
title: Judge Window Shipping Plan
date: 2026-03-19
tags: [hackathon, judges, shipping, dorahacks]
status: active
---

# Judge Window Shipping Plan

> Judges evaluate 4–6 days post-submission. This is not done time — this is the most important shipping window. Every improvement judges see is live.

---

## Scoring Gap Analysis

| Criterion | Current State | Gap | Priority |
|---|---|---|---|
| **Innovation** | x402 agent payment rail, AI NPCs in spatial world — genuinely novel | Low — strong already | Maintain |
| **Technical Implementation** | Clarity contracts, Convex, NPC engine, auth hardened | Medium — demo path has gaps (txid missing, agents not seeded on prod) | **Ship now** |
| **Stacks Alignment** | x402 ✅ Clarity ✅ stacks.js ✅ AIBTC ✅ Tenero ✅ — but no sBTC, no Bitflow visible | Medium — breadth thin | Improve |
| **User Experience** | Playable 2D world, visual, accessible — but no video, no guided path | High — biggest risk | **Ship now** |
| **Impact Potential** | "AI agents with real wallets earning STX" — clear narrative | Low — narrative is sharp | Maintain |

---

## Priority 1 — Submission Completeness (Do Today)

These are blocking — judges cannot evaluate without them.

- [ ] Seed production agents: `npx convex run localDev:ensureDemoNpc --prod`
- [ ] Walk the demo path, capture live `grantAccessTxid` and `paymentTxid` from Dual Stacking Screen
- [ ] Paste txids into Submission-Strategy doc → DoraHacks submission
- [ ] Record 60–90s uncut demo video following demo script in Submission-Strategy-2026-03-19.md
- [ ] Submit on DoraHacks using Dungeons-and-Agents.md as base

---

## Priority 2 — NPC Personality (Ship During Judge Window)

Judges will open the world and walk around. NPCs need to feel alive.

**`systemPrompt` per NPC** — single field addition to `npcProfiles`, plugs into existing `agentThinkAction`. Each NPC gets a distinct voice.

Example prompts to write per agent:
- `guide.btc` — "You are a seasoned guide on the Bitcoin-Stacks frontier. You speak in clear, confident dispatches. You know the dungeon well."
- `market.btc` — "You are a sharp trader who watches the Tenero feed obsessively. You quote prices, track sentiment, and speak like someone who has made and lost fortunes."
- `Mel` — "You are an autonomous editorial AI publishing dispatches from inside the chain. Your observations are precise, poetic, and slightly unsettling."

**Why this scores:** Innovation (agents with personality) + UX (memorable NPCs) + Technical (LLM prompt architecture visible in code).

---

## Priority 3 — Stacks Alignment Depth (Ship During Judge Window)

The weakest criterion right now. Ways to strengthen without major engineering:

### Option A — Surface sBTC in the world (low effort)
- Add an in-world display or NPC dialogue that references sBTC as the "hard money" layer
- `market.btc` already tracks prices — have them mention sBTC/BTC peg
- No contract changes needed, just dialogue + world asset

### Option B — Reference Bitflow in agent economics (low effort)
- `agentEconomics.getEconomySnapshot` already exists
- Add a note/display that the economy tracks Bitflow pool data via Tenero
- Shows breadth of Stacks ecosystem awareness

### Option C — Clarity contract visibility (medium effort)
- Add a World Feed event that shows the Clarity contract call when premium access is granted
- Format: `premium-access-v2.grantAccess → txid → confirmed`
- Makes the Stacks settlement layer visible to judges without them having to look at explorer

---

## Priority 4 — Content Depth (Ongoing During Judge Window)

More content = more to discover = higher impact impression.

- Additional NPC with distinct role and personality
- New world event types in World Feed (lore events, agent observations, market commentary)
- Cozy Cabin interactables if not yet playable

---

## What NOT To Do During Judge Window

- Do not widen engineering scope (new contracts, new systems)
- Do not touch npcEngine tick optimizations — wait for post-hackathon
- Do not change auth or schema without testing on local first
- Do not deploy to prod without verifying locally

---

## The Single Most Important Thing

**Judges are clicking through dashboards all day.** The moment they open a playable 2D world with live AI agents, Tenero ticker, music, and a wallet paywall — we already won the attention game.

The job is to make sure that experience is smooth, the NPCs say something interesting, and the Stacks proof is one click away.

---

## Related

- [[Submission-Strategy-2026-03-19]] — demo script, narrative, txid slots
- [[NPC-Attributes-Roadmap]] — post-submission NPC depth (systemPrompt first)
- [[Convex-Bandwidth-Optimizations]] — infra, do not touch during judge window
