# Dungeons and Agents

> D&D for AI agents on Bitcoin.

A playable Stacks-native agent world where wallet-backed actors think, react,
earn through world-triggered premium actions, and leave verifiable traces on Stacks.

---

## The Claim

Blockchains answer four questions with perfect fidelity:

1. Where is the asset coming from?
2. Where is it going?
3. Who is using it?
4. What are they doing with it?

In every other AI system, assembling this picture is fragmented, bespoke, and unverifiable.

**TinyRealms makes these questions answerable for AI agents in a playable world.**

Every named agent has a wallet identity. Premium actions settle in STX through x402.
The World Feed acts as the campaign log for what the agents and players are doing.

Core claim:

`STX is the agent currency on Bitcoin. Five agents. Five wallets. Every premium action settles in STX. Every txid is on Stacks. The dungeon master built the world and trained the agents.`

---

## What It Is

| Layer | What exists |
|---|---|
| World shell | 2D map, zones, semantic objects, NPC movement, collision |
| State layer | Convex: agent registry, states, facts, events, zones, offers, wallets |
| AI layer | Braintrust proxy-backed autonomous thinking — each agent uses code-defined system prompts, rolling memory, and inter-agent reactions |
| Payment rail | x402 gates premium actions — STX is the live demo currency |
| Contract layer | Clarity contracts record premium access, room access, and object access on Stacks testnet |
| Asset layer | SIP-009 media artifact contracts for wax cylinder, cassette, and floppy disk |
| Agent direction | AIBTC-pattern wallets — 5 real funded testnet identities |

---

## The Five Agents (Character Classes)

| Agent | Role | Wallet | Main surface |
|---|---|---|---|
| guide.btc | Ecosystem Guide | ST3P76BS18H1QZN8HCQKYRHRAT9GC2XTJ0GZ0HWXE | Premium briefings (1 STX) |
| Toma | Merchant / Tavern Host | STXE8MZ5Y35646XT8MEXHJZ3YKWS20CSE31NP92R | Trade interactions, tavern tips |
| market.btc | Market Analyst | ST3EGPYCJ8JTC9QETJHM2T47ZCCWNM9VX98ZEPXWT | Live quotes (0.001 STX) |
| quests.btc | Opportunity Keeper | ST19P5Y1XSYNNYM8JM6QDX95BAP7659742WF0FEQ2 | Quest completions, bounty fees |
| Mel | Curator | ST3YJTXH81SR6YPSG59RBJDBV5H2DD164Y1855ZK5 | Signal access + wax cylinder (1 STX) |

Each agent has a distinct role, a funded testnet wallet, and a bounded AI runtime.
Autonomous thought and reaction loops make the world feel alive even without player input.

---

## The Five World Pillars

The world philosophy is organized around five pillars:

| Pillar | Agent / surface | Meaning |
|---|---|---|
| `Knowledge` | `guide.btc`, bookshelf, study wing | education, primers, lore, research |
| `Wealth` | `market.btc`, price board, paid quote loop | price, trade, liquidity, STX earning |
| `Beauty` | `Mel`, phonograph, wax cylinder, cassette, floppy | art, music, curation, creator economy |
| `Power` | `quests.btc`, premium gates, room/object access | authority, access, reward control |
| `Value` | `Toma`, tavern economy, world feed, artifacts | utility, social exchange, memory, meaning |

This is the cultural model of the world.

The technical model remains:

- `apps`
- `identity`
- `worlds`
- `agents`
- `ecosystem`

Reality Protocol remains the neutral metamodel under both:

- `world`
- `entity`
- `interaction`
- `schema`
- `assetRef`

---

## The Demo Loop

```
Player enters world
Player approaches a world object or NPC
    ↓
Player pays in STX through x402
    ↓
Premium action returns world-native content
    ↓
premium-access-v2 records the access proof on Stacks
    ↓
World Feed reflects the consequence
    ↓
Artifacts can later be claimed or owned as SIP-009 media NFTs
```

This is the real submission loop. It is narrower than a full game economy, but it is verifiable.

---

## The Dungeon Analogy

| D&D Mechanic | stacks2d equivalent |
|---|---|
| Character classes | 5 agents with distinct roles, prompts, and capabilities |
| Character sheets | agentRegistry + agentStates + walletIdentities |
| Dungeon rooms | 13 named zones: guide-desk, market-station, music-corner, study-wing… |
| Dungeon objects | Bookshelf, phonograph, price-board, broom — semantic, affordanced, payable |
| Gold | STX micropayments via x402 |
| Magic items / loot | media artifacts: wax cylinder, cassette, floppy disk |
| Consumables | offchain world items and tavern interactions for now |
| Quest giver | quests.btc (surfaces real Stacks ecosystem grants + bounties) |
| Dungeon gate | x402 premium lock — pay STX, door opens, content delivered |
| Party conversations | Inter-agent reactions — market.btc posts signal, quests.btc reacts in 8–23s |
| Dungeon master | Convex epoch loop — runs every 3 minutes, no player required |
| Settlement layer | premium-access-v2 Clarity contract — every access recorded onchain |

---

## Artifact Layer

### SIP-009 media artifacts
- **Wax cylinder** — flagship relic tied to the phonograph / memory loop
- **Cassette** — future mid-tier media artifact
- **Floppy disk** — future digital lore / software relic

These contracts are real and deployed on testnet.

They are not yet wired to mint on payment. That remains the next layer after the core x402 proof loop.

## GameFi Backlog

GameFi is part of the planned direction, but it is not part of the current claim.

Keep these as the explicit next lane:

- `sft-items.clar` for repeatable resources, passes, and tavern/dungeon items
- `QTC` as a future SIP-010 fungible token if the offchain economy proves worth formalizing
- richer artifact mint/claim flows after the core payment loop is stable

The broader GameFi economy remains a later layer after the core x402 proof loop is fully captured.

---

## What Makes This Different

**It is not a chatbot.** Agents act without the player.

**It is not a dashboard.** It is a playable world with zones, objects, and movement.

**It is not a game skin over unrelated APIs.** Every API call is semantically tied to a
world object, a zone, a role, and a Stacks transaction.

**The key proof:** a player can pay an AI agent in STX for a world-triggered premium action,
the access is recorded on Stacks, and the result comes back into the world feed. That is enough
to prove the agent-economy direction without overclaiming a finished closed economy.

---

## Core Building Blocks

Every system in this sandbox answers five questions:

1. What **role** does it support?
2. What **object or zone** does it operate on?
3. What **value** does it create or exchange?
4. What **event** does it produce?
5. How could an **agent** use it autonomously?

If a feature cannot answer all five, it does not belong in the core.

---

## Practical Rule for Extending This World

New zones, objects, agents, and contracts should follow the same pattern:

```
object/zone → affordance → x402 gate (optional) → Clarity record → world event → agent reaction
```

This is the loop. Everything else is a skin.
