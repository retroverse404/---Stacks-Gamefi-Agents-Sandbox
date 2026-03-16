# Stacks2D Architecture

This document explains the current module boundaries for `stacks2d (tinyrealms)` and the planned path toward AIBTC- and x402-aligned integrations on Stacks.

## Product Framing

`stacks2d (tinyrealms)` is a work-in-progress 2D social world and agent sandbox.

It builds from the original TinyRealms foundation, but the active product direction is a semantic Stacks-facing sandbox for agents, creator economy, and paid service surfaces.

The current codebase already supports:
- world rendering
- map editing
- sprite definitions
- multiplayer presence foundations
- NPC runtime state
- Braintrust-backed AI actions

The future direction adds:
- richer agent logic
- external ecosystem ingestion
- stronger in-world agent dialogue and worldFacts coordination
- x402-to-contract writes
- fuller AIBTC-aligned agent runtime
- Clarity 4 proof and world-state contracts

## Core Boundary

```mermaid
flowchart LR
  A[Experience Layer] --> B[Game Core]
  B --> C[AI Layer]
  B --> D[Persistence Layer]
  C --> D
  E[External Integrations] --> D

  A["Experience Layer<br/>maps, art, characters, dialogue UI"]
  B["Game Core<br/>movement, collisions, quests, items, NPC runtime"]
  C["AI Layer<br/>Braintrust dialogue, future memory and planning"]
  D["Persistence Layer<br/>Convex state and normalized cached records"]
  E["External Integrations<br/>AIBTC, Zero Authority, x402 on Stacks"]
```

## Current Truth

Live now:
- TinyRealms world runtime
- local and cloud-ready Convex backend patterns
- Braintrust-backed AI path
- Zero Authority backend ingestion and cache
- Tenero-backed live market ticker in the HUD
- dedicated in-world surfaces for:
  - `guide.btc`
  - `market.btc`
  - `quests.btc`
- World Feed driven by typed `worldEvents`

Scaffolded now:
- separate `services/x402-api` boundary for premium endpoints
- agent-state storage and account-binding tables
- worldFacts blackboard pattern for lightweight coordination
- external AIBTC module boundary, not yet full in-world runtime

Verified now:
- local x402 payment path for `guide.btc`
- local x402 paid quote path for `market.btc`
- saved `npcProfiles`-backed in-world dialogue for `market.btc`
- deployed `premium-access-v2`, `world-lobby`, and `world-objects` contracts on Stacks testnet
- working Clarity 4 deploy path from this repo

Planned next:
- ranked and fresher ecosystem snapshots
- purposeful agent behaviors tied to roles and zones
- lightweight gossip via `worldEvents` propagation
- x402-to-contract grant integration
- real AIBTC-compatible agent runtime and account flows

## Folder Mapping

```mermaid
flowchart TD
  R[Apps/tinyrealms]
  R --> S[src/engine]
  R --> U[src/ui]
  R --> L[src/lib]
  R --> C[convex/story]
  R --> A[convex/agents]
  R --> I[convex/integrations]
  R --> M[convex/mechanics]

  S["src/engine<br/>runtime and rendering"]
  U["src/ui<br/>screens and presentation"]
  L["src/lib<br/>shared client helpers"]
  C["convex/story<br/>AI dialogue and narrative"]
  A["convex/agents<br/>agent registry, bindings, offers"]
  I["convex/integrations<br/>Zero Authority and Tenero caches"]
  M["convex/mechanics<br/>items, economy, combat"]
```

## External Service Position

```mermaid
flowchart LR
  G[stacks2d / TinyRealms] --> X[AIBTC Adapter]
  G --> Z[Zero Authority Adapter]
  G --> T[Tenero Adapter]
  G --> P[x402 Service Boundary]
  G --> C[Clarity Proof Layer]
  X --> AX[AIBTC services]
  Z --> ZX[Zero Authority API]
  T --> TX[Tenero API]
  P --> PX[services/x402-api]
  C --> CX[premium-access-v2<br/>world-lobby<br/>world-objects]
```

## Verified Connector Execution

The current Stacks ecosystem slice already runs through backend adapters rather than direct frontend API calls.

```mermaid
flowchart LR
  ZA[Zero Authority API] --> Z[Convex Zero Authority integration]
  T[Tenero API] --> R[Convex Tenero integration]
  Z --> C[normalized cached records]
  R --> C
  C --> G[guide.btc]
  C --> Q[quests.btc]
  C --> M[market.btc]
  C --> H[HUD ticker]
```

What is verified:
- Zero Authority data is cached in Convex and exposed through `guideSnapshot`
- Tenero token data is cached in Convex and exposed through `tickerRows`
- the browser consumes those backend queries instead of calling the external APIs directly

This proves real backend connector execution, not just themed UI.

## Lightweight Gossip Layer

For the hackathon scope, `gossip` should be understood as app-level event propagation, not a separate protocol.

The current foundation already exists:
- typed `worldEvents`
- agent and NPC surfaces
- Convex as the live coordination layer

The intended behavior is:
- important actions write a world event
- nearby or role-relevant agents observe a subset of those events
- dialogue, premium surfaces, and world memory reflect that propagated state

This is especially relevant for:
- x402 premium unlocks
- market offers purchased
- new opportunities surfacing
- agent status changes

```mermaid
flowchart LR
  X[x402 payment or agent action] --> E[worldEvents]
  E --> G[guide.btc]
  E --> M[market.btc]
  E --> Q[quests.btc]
  E --> W[World Feed]
```

This gives the world social consequences without requiring every agent to poll all backend state directly.

## Sequential Implementation Order

This is the intended build order. Each layer depends on the previous one.

```mermaid
flowchart TD
  A[Phase 1<br/>Playable world baseline] --> B[Phase 2<br/>World semantics]
  B --> C[Phase 3<br/>Ecosystem data adapters]
  C --> D[Phase 4<br/>Purposeful agents]
  D --> E[Phase 5<br/>Premium content and x402]
  E --> F[Phase 6<br/>Contract proof layer]
  F --> G[Phase 7<br/>Trading agents and onchain execution]

  A["Playable world baseline<br/>maps, movement, scenes, UI, save states"]
  B["World semantics<br/>zones, semantic objects, roles, values, events"]
  C["Ecosystem data adapters<br/>Zero Authority live, Tenero live"]
  D["Purposeful agents<br/>guide, market, quests, posts, constraints"]
  E["Premium content and x402<br/>offers, paywalls, service endpoints"]
  F["Contract proof layer<br/>premium-access-v2, world-lobby, world-objects"]
  G["Trading agents and onchain execution<br/>AIBTC accounts, STX, sBTC, USDCx"]
```

Why this order matters:
- it protects the creative layer from payment and wallet complexity
- it prevents frontend code from becoming an API integration dump
- it keeps public claims aligned with verified functionality

## Multi-Agent Execution Model

The long-term agentic model is hierarchical, not a single giant NPC brain.

```mermaid
flowchart TD
  U[User or owner] --> P[Parent agent]
  P <--> B[Basket strategy]
  O[Offchain logic<br/>Zero Authority, Tenero, LLM signals] --> B
  B --> S1[Guide strategy]
  B --> S2[Market strategy]
  B --> S3[Quest strategy]
  S1 --> N1[World node or service node]
  S2 --> N2[Protocol or service node]
  S3 --> N3[World node or service node]
```

This allows:
- one user or owner-facing agent session
- orchestration across multiple worker strategies
- clear separation between planning and execution
- future protocol-specific trading or yield agents without coupling them to the renderer

## World Semantics Model

To support purposeful agents and many future worlds, the simulation needs a semantic layer.

```mermaid
flowchart LR
  M[Map] --> Z[Zones]
  M --> O[Object instances]
  M --> N[NPC instances]
  Z --> A[Allowed roles and behaviors]
  O --> V[Value and interaction state]
  N --> R[Role, post, capability, current state]
  R --> E[Events]
  V --> E
```

Examples:
- a `guide` role belongs near a `guide-desk` zone
- a `market` role belongs near a `price-board` or `swap-terminal`
- a `quest` role belongs near a `board` or `rumor desk`

This is what closes the gap between:
- what a player visually sees in a room
- what the system understands about the room

## Spatial Intelligence Stack

The project should treat spatial intelligence as a stack, not a single AI feature.

```mermaid
flowchart TD
  G[Geometry] --> S[Semantics]
  S --> A[Affordances]
  A --> C[Agent cognition]
  C --> X[Execution and economy]

  G["Geometry<br/>tiles, blockers, paths, portals, occupancy"]
  S["Semantics<br/>zones, object meaning, value, roles, tags"]
  A["Affordances<br/>what can be used, bought, opened, queried, traded"]
  C["Agent cognition<br/>perception, memory, role policy, planning"]
  X["Execution and economy<br/>events, offers, x402, STX, sBTC, USDCx"]
```

This architecture matters because:
- more LLM output alone will not create a believable simulation
- agents need structured knowledge of places, objects, and value
- deterministic movement and pathing should remain separate from high-level reasoning

Practical interpretation:
- geometry answers where things are
- semantics answers what things are
- affordances answer what can be done
- cognition answers what should happen next
- execution carries out the chosen action

## Current Clarity Proof Layer

The first onchain proof layer is now live on testnet:

```mermaid
flowchart LR
  O[in-world premium offer] --> X[x402 payment rail]
  X --> U[premium unlock payload]
  U --> C[premium-access-v2]
  C --> R[read-only proof state]
  R --> W[future rooms, objects, and passes]
```

Current truth:
- `premium-access-v2` is deployed on Stacks testnet
- it is a post-payment proof/state contract
- the app does not yet call `grant-access` automatically after successful x402 settlement

Plain-English interpretation:
- x402 answers: "was this premium action paid for?"
- `premium-access-v2` answers: "does this principal now have onchain premium access proof?"

## Why This Is Needed

The current world already contains rich visual scenes, but many visible objects still exist only as art, not as system-readable entities.

Examples:
- books
- coffee
- swords
- knives
- media surfaces
- terminals

To support a true agent sandbox, these need to become:
- semantic objects
- value surfaces
- interaction points
- optional offer or premium nodes

## Economy and Settlement Model

The economy is hybrid by design.

```mermaid
flowchart LR
  D[Reference pricing layer] --> Q[Quote and conversion layer]
  Q --> W[World offers and objects]
  W --> X[x402 or wallet action]
  X --> S[Stacks settlement or proof]

  D["Reference pricing layer<br/>USD, SATS, stable references"]
  Q["Quote and conversion layer<br/>SATS, USDCx, soft credits"]
  W["World offers and objects<br/>coffee, access, skins, reports, terminals"]
  X["x402 or wallet action<br/>premium content, swaps, purchases"]
  S["Stacks settlement or proof<br/>STX, sBTC, USDCx"]
```

Design rules:
- fast-changing world state stays offchain in Convex
- sensitive payment, ownership, and settlement paths move onchain only when needed
- do not claim a hard peg for in-world currency unless it is actually redeemable and enforced

## Future GameFi / SFT Layer

The planned GameFi layer is strongly informed by the Stacks GameFi SFT tutorial covering resource burn/mint flows, acquisition, crafting, level-up, and token URI metadata. Source: [SFTs: Flow and Smart Contracts](https://gamefi-stacks.gitbook.io/stacks-degens-gaming-universe/sfts-flow-and-smart-contracts)

```mermaid
flowchart LR
  L[world-lobby.clar] --> O[world-objects.clar]
  O --> S[sft-items.clar]
  S --> P[x402 and wallet flows]

  L["world-lobby.clar<br/>room membership, host ownership, flow-state"]
  O["world-objects.clar<br/>object binding, transfers, metadata anchors"]
  S["sft-items.clar<br/>resources, passes, crafting, level-up, token URI"]
  P["x402 and wallet flows<br/>premium access, paid services, settlement"]
```

This layer would support:
- world passes and access badges
- consumable resources
- craftable items
- upgradeable tools and modules
- creator/media access items

Important truth:
- this SFT/GameFi layer is part of the architecture roadmap
- it is not yet implemented in the current repo

## Judge-Facing Summary

The strongest accurate description today is:

- a playable 2D Stacks-facing world
- with real backend ecosystem ingestion from Zero Authority and Tenero
- with real in-world surfaces for guide, market, and opportunity discovery
- with a real AI guide path
- with modular scaffolding for premium content, x402, and future AIBTC-style agents

The strongest next milestone is:

1. make the x402 service boundary executable on testnet
2. add one narrow Clarity proof contract
3. continue moving NPC behavior from static roles to semantic actions

## Practical Rule

Do not merge external infrastructure into the game runtime.

Keep separate:
- game and experience
- agent logic
- external integrations
- payment infrastructure

That allows:
- faster asset and level iteration
- lower technical debt
- cleaner grant positioning
- safer future wallet work

## Stacks and AIBTC Positioning

This project should be described as:

- a Stacks-facing world built from the TinyRealms foundation
- building toward a 2D sandbox for AI agents and creator economy
- aligned with AIBTC patterns for agent tooling
- exploring x402 on Stacks for paid service and transaction flows

It should not be described as fully integrated with all of those systems yet.
