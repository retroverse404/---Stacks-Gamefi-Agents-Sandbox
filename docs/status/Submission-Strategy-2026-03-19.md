---
title: Submission Strategy & Competitive Context
date: 2026-03-19
tags: [hackathon, submission, strategy, dorahacks, competitive]
status: active
---

# Submission Strategy — Dungeons & Agents

Last updated: 2026-03-19

---

## The Submission Truth

> STX is the agent currency on Bitcoin. Five agents. Five wallets. Every premium action settles in STX. Every txid is on Stacks. The dungeon master built the world and trained the agents.

---

## Why This Wins

### 1. Tony from x402 specifically wanted agent builds

The x402 protocol was built with agents in mind. TinyRealms is the first live use case of x402 as an agent payment rail — not a demo, not a concept. Five agents earning STX through HTTP 402 payment gates.

### 2. The Stacks community asked "What should I build?" — nobody answered with agents

From the Stacks community thread (Kenny, May 2025 → March 2026):

| What the community proposed | Status |
|---|---|
| Oracle integration (Pyth/Chainlink) | Still theoretical |
| Lightning + Stacks integration | Still theoretical |
| Airdrop infrastructure | Still researching (Muizz, Mar 2026) |
| Modular stablecoin engine | Still exploring (yehia67, Mar 2026) |
| **AI agents with real wallets earning STX** | **TinyRealms. Live. March 2026.** |

Nobody in the community thread thought of agents. We're in a category that didn't exist in the conversation.

### 3. Muizz's UX3 framework — we satisfy it without trying

Muizz (@0xMuizz) is building "Infrastructural UX" for Stacks — designing safety into protocol execution through state transitions, irreversibility, permission models, behavioral flows.

TinyRealms demonstrates every UX3 principle:

| UX3 Concept | TinyRealms Implementation |
|---|---|
| State transitions | Pay STX → access granted → Clarity records it. One-way, irreversible |
| Permission models | x402 paywall — no payment, no content. Zero ambiguity |
| Behavioral flows | Agent think loop → World Feed → inter-agent reaction. Observable |
| Safety by design | World Feed shows consequences — premium-access-granted is the receipt |

**The line:** *"The world IS the interface. The protocol execution IS the UX."*

---

## Competitive Advantages

1. **Only submission with autonomous AI agents that earn STX** — 5 agents, thinking every 3 minutes, reacting to each other, earning from premium actions
2. **Only submission using x402 as an agent payment rail** — HTTP 402 gating on AI content
3. **Verifiable on-chain proof** — every payment records on Stacks via `premium-access-v2` Clarity contract
4. **A world, not a dashboard** — judges are clicking dashboards all day. We show a playable 2D world with live agents, a Tenero ticker, music, and a paywall
5. **AIBTC Media angle** — Mel as autonomous editorial AI publishing on the Bitcoin agent economy. Her thoughts read like dispatches from inside the chain.

---

## Submission Narrative (DoraHacks)

Lead with:

> *"The Stacks community asked: what should builders build? Tony from x402 wanted something for agents. We built it in 5 days."*

> *"TinyRealms is the first playable agent economy on Stacks. Five AI agents. Five real testnet wallets. Every premium action gates through x402. Every access proof lands on Stacks via Clarity. The agents earn. The world remembers. No player required."*

> *"The community was still asking about oracle integrations and stablecoins in March 2026. We shipped autonomous AI agents with real wallets earning STX from a playable world."*

---

## Demo Script (60-90 seconds, uncut)

1. Open world → agents visible, Tenero ticker live, music playing
2. Walk to Dual Stacking Screen (tile 72,11)
3. "Pay 1 STX to watch" → wallet approves
4. Video unlocks (dual stacking explainer)
5. World Feed updates → `premium-access-granted` event
6. Mel or guide.btc reacts autonomously (agent-thought event)
7. Cut to Stacks explorer → show `grantAccessTxid` on testnet

---

## Proof Layer (paste in submission)

- `grantAccessTxid`: [to be captured]
- `paymentTxid`: [to be captured]
- Explorer: `https://explorer.hiro.so/txid/<txid>?chain=testnet`
- 2-3 `agent-thought` events from World Feed with timestamps
- Agent earning record in Convex: `agents.agentEconomics.onPremiumPaymentConfirmed`

---

## Key People in the Ecosystem to Reference

- **Tony** — x402 protocol author, specifically wanted agent builds
- **Kenny** — Stacks DevRel, opened the "what should I build?" thread
- **Muizz (@0xMuizz)** — UX3/Infrastructural UX researcher, potential advocate
- **AIBTC** — wallet-backed agent pattern, Mel's editorial arm

---

## Deployment State (2026-03-19)

| Service | URL | Status |
|---|---|---|
| Convex cloud | https://zealous-bobcat-847.convex.cloud | Live |
| Render x402-api | https://stackshub-x402-api.onrender.com | Live, configured:true |
| Vercel frontend | https://stacks-gamefi-agents-sandbox-vbqm.vercel.app | Live, login working |

---

## What's Still Needed

- [ ] Production Convex agents seeded (`npx convex run localDev:ensureDemoNpc --prod`)
- [ ] Live txid captured from Dual Stacking Screen payment
- [ ] Demo video recorded (60-90s uncut)
- [ ] DoraHacks submission written using Dungeons-and-Agents.md as base + this doc

---

## Related Docs

- [[Dungeons-and-Agents]] — core submission frame
- [[Project-Timeline]] — build chronology (Mar 14-19)
- [[Current-Truth-Matrix]] — what's live vs. claimed
- [[GameFi-Backlog]] — what's explicitly out of scope
- [[deploymet]] — cloud deployment runbook
