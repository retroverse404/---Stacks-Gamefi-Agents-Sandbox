# stacks2d (tinyrealms)

Stackshub is a playable Stacks-native agent sandbox built on TinyRealms, where wallet-backed characters, paid actions, and world state can be explored inside a 2D social world.

This project builds from the original [61cygni/tinyrealms](https://github.com/61cygni/tinyrealms) foundation, which provided a strong starting point for persistent 2D world simulation.

## At A Glance

- **What it is**: a playable Stacks-native agent sandbox built on TinyRealms.
- **World shell**: TinyRealms provides the 2D map, NPC, object, and exploration layer.
- **State layer**: Convex stores agents, offers, world facts, events, zones, and semantic objects.
- **AI layer**: Braintrust-backed prompts drive in-world dialogue and agent-facing responses.
- **Payment rail**: x402 gates paid actions like premium briefings and live market quotes.
- **Contract layer**: Clarity contracts record premium access, room access, and object access on Stacks testnet.
- **Agent direction**: AIBTC is used as the external agent-wallet pattern, not yet as full in-world autonomous runtime.

## Current Sprint

This repo is currently being prepared for the DoraHacks Stacks Build Battle submission.

For the remaining sprint, the priority is not feature sprawl.
The priority is:

- one highly legible flagship loop
- clear Stacks alignment
- visible payment/proof flow
- a demo that judges can understand quickly

## Verified Links

- `premium-access-v2` contract:
  - Records paid premium-access proof on Stacks testnet.
  - `ST2JDN3QED16X524SE8GWQSTP2MW6D2005AEEGJ9S.premium-access-v2`
  - https://explorer.hiro.so/txid/0x96afaf46c0e1ed8f86aceb0b0687fa6bdd284f9ea1366cd5437dc25901e969c3?chain=testnet
- `world-lobby` contract:
  - Records room creation, open or closed state, and room access on Stacks testnet.
  - `ST2JDN3QED16X524SE8GWQSTP2MW6D2005AEEGJ9S.world-lobby`
  - https://explorer.hiro.so/txid/e411bff9d554b55f12a19c30fa4d278525f8c197f4deac3391cb4362b0e6d84f?chain=testnet
- `world-objects` contract:
  - Records object registration, active state, and object access on Stacks testnet.
  - `ST2JDN3QED16X524SE8GWQSTP2MW6D2005AEEGJ9S.world-objects`
  - https://explorer.hiro.so/txid/37518e87cdb28578cdc9c8afcd5ba42245fca3c45d2adda4b4dfbd0bea5d385f?chain=testnet

## What Is Verified

- `guide.btc`: a testnet x402 premium payment loop returns paid content after wallet-signed settlement.
- `market.btc`: a testnet x402 paid quote loop returns a live quote payload after wallet-signed settlement.
- `premium-access-v2`: a deployed Clarity 4 contract records paid premium-access proof on testnet.
- `world-lobby`: a deployed Clarity contract records room creation, room access, and room entry state on testnet.
- `world-objects`: a deployed Clarity contract records object registration, object access, and object activity state on testnet.
- `Zero Authority`: backend-ingested ecosystem data is cached in Convex and rendered in-world.
- `Tenero`: backend-ingested market data is cached in Convex and rendered in the HUD and `market.btc`.

## Why This Matters

`stacks2d (tinyrealms)` is being developed as a practical bridge between:
- customizable 2D worldbuilding
- AI-enhanced NPC interaction
- modular agent infrastructure
- future Stacks-native economic and transaction patterns

The goal is not to overclaim finished blockchain integration.
The goal is to ship a strong game foundation now while cleanly preparing for:
- AIBTC-aligned agent tooling
- x402 on Stacks paid service flows
- creator economy mechanics
- ecosystem-driven identity, reputation, and opportunity ingestion
- lightweight gossip through world events

Internally, one of the clearest design framings is:

> Dungeons and Agents

Meaning:
- a sandbox for agents
- a world of roles, objects, value, and events
- a simulation surface that can later settle value through Stacks rails

## Architecture Snapshot

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

```mermaid
flowchart LR
  G[stacks2d / TinyRealms] --> X[AIBTC Adapter]
  G --> Z[Zero Authority Adapter]
  G --> P[x402 Adapter]
  G --> C[Clarity Proof Layer]
  X --> AX[AIBTC services]
  Z --> ZX[Zero Authority API]
  P --> PX[x402 API / sponsor relay]
  C --> CX[premium-access-v2<br/>world-lobby<br/>world-objects<br/>testnet]
```

## Sequential Build Path

The project is being built in a strict order to avoid technical debt and fake claims.

```mermaid
flowchart TD
  A[1. Playable world baseline] --> B[2. Semantic world model]
  B --> C[3. Ecosystem data adapters]
  C --> D[4. Purposeful agent behaviors]
  D --> E[5. Premium content and x402]
  E --> F[6. Trading agents and onchain execution]

  A["Playable world baseline<br/>maps, movement, scenes, UI, save state"]
  B["Semantic world model<br/>zones, objects, roles, values, events"]
  C["Ecosystem data adapters<br/>Zero Authority live, Tenero next"]
  D["Purposeful agent behaviors<br/>guide, market, quests, planners"]
  E["Premium content and x402<br/>offers, payment gates, service endpoints"]
  F["Trading agents and onchain execution<br/>AIBTC-style accounts, STX, sBTC, USDCx"]
```

This order is intentional:
- do not put payment logic into rendering and movement
- do not call third-party APIs directly from the frontend
- do not claim onchain execution before payment or wallet paths are verified

## Live, Scaffolded, Planned

```mermaid
flowchart LR
  L[Live now] --> S[Scaffolded now]
  S --> P[Planned next]

  L["Live now<br/>TinyRealms runtime<br/>Convex backend<br/>Braintrust AI path<br/>Zero Authority ingestion<br/>Tenero live ticker<br/>guide / market / quests surfaces<br/>3 deployed testnet contracts"]
  S["Scaffolded now<br/>agent state tables<br/>AIBTC-compatible registry<br/>services/x402-api boundary<br/>worldFacts blackboard pattern"]
  P["Planned next<br/>x402 to contract writes<br/>purposeful agents<br/>AIBTC account execution<br/>future SFT item layer"]
```

## Features

- **Shared 2D world** — multiplayer presence, map state, chat, and world data
- **Integrated map editor** — paint tiles, set collision, define zones, and save maps live to Convex
- **Sprite pipeline** — import sprite sheets, define animations, and render custom characters
- **NPC runtime** — server-authoritative NPC state with wandering, intent, and lightweight trading
- **AI narrative path** — Braintrust-backed dialogue and narrative generation
- **Economy primitives** — items, loot, shops, and in-world wallet records
- **Customizable foundation** — designed to support custom levels, custom characters, and future modular integrations

## Implementation Snapshot

Verified live in the current build:
- live Tenero ticker in the header
- Zero Authority opportunity cache used in-world
- dedicated surfaces for `guide.btc`, `market.btc`, and `quests.btc`
- `World Feed` driven by typed world events
- semantic world kernel and AIBTC-compatible registry in Convex
- premium offer metadata is real in Convex
- premium UI is real in the world

Verified locally:
- `services/x402-api` serves a real x402 v2 payment boundary for `guide.btc`
- the browser reads the `402 Payment Required` challenge
- a connected Stacks testnet wallet can sign the payment
- the signed retry settles through the service-local facilitator fallback
- `guide.btc` returns premium content after successful settlement
- `market.btc` now has a verified testnet paid quote loop returning a real quote payload after x402 payment
- the premium response is returned as structured JSON that can scale to both human UI rendering and agent consumption

Verified on Stacks testnet:
- `premium-access-v2` is deployed under Clarity 4
- deployed contract:
  - `ST2JDN3QED16X524SE8GWQSTP2MW6D2005AEEGJ9S.premium-access-v2`
- deployment tx:
  - `96afaf46c0e1ed8f86aceb0b0687fa6bdd284f9ea1366cd5437dc25901e969c3`
- `world-lobby` is deployed on testnet
  - `ST2JDN3QED16X524SE8GWQSTP2MW6D2005AEEGJ9S.world-lobby`
  - `e411bff9d554b55f12a19c30fa4d278525f8c197f4deac3391cb4362b0e6d84f`
- `world-objects` is deployed on testnet
  - `ST2JDN3QED16X524SE8GWQSTP2MW6D2005AEEGJ9S.world-objects`
  - `37518e87cdb28578cdc9c8afcd5ba42245fca3c45d2adda4b4dfbd0bea5d385f`

Not yet fully integrated:
- public hosted payment infrastructure outside the local fallback path
- a clean receipt and transaction-proof user experience
- automatic contract access grants after successful x402 payment
- live AIBTC-style agent account execution

## Verified Backend Connector Execution

The Stacks ecosystem connectors are backend-executed and cached before the world consumes them.

```mermaid
flowchart LR
  ZA[Zero Authority API] --> ZC[Convex integration cache]
  TE[Tenero API] --> TC[Convex integration cache]
  ZC --> Q[normalized queries]
  TC --> Q
  Q --> G[guide.btc / quests.btc]
  Q --> M[market.btc / HUD ticker]
  Q --> W[World Feed context]
```

Verified connector paths in the current build:
- `Zero Authority API -> Convex cache -> guideSnapshot -> guide.btc and quests.btc`
- `Tenero API -> Convex cache -> tickerRows -> HUD ticker and market.btc`

Verified by runtime/backend queries:
- `integrations/zeroAuthority:guideSnapshot`
- `integrations/tenero:tickerRows`

## Lightweight Gossip Through World Events

The current world already has a typed `World Feed`.

The intended next step is to use that same event system as a lightweight gossip layer:
- a premium unlock creates a world event
- an agent action creates a world event
- a new opportunity or market shift creates a world event
- nearby or role-relevant world surfaces can react to those events

This is the hackathon-scoped version of social propagation:
- not a full distributed gossip protocol
- but a real world-memory mechanism that makes payments, offers, and agent actions visible inside the simulation

## Current Status

This repository is intentionally presented as a **work in progress**.

What is working now:
- web client and Convex backend
- local development flow
- map loading and editing
- multiplayer presence foundations
- NPC runtime loop
- Braintrust-backed AI actions

What is planned next:
- deeper AI agent sandbox logic
- external ecosystem ingestion
- x402-to-contract writes
- stronger in-world agent dialogue and worldFacts coordination
- future wallet integrations

## Future GameFi Layer

The longer-term contract roadmap includes a dedicated GameFi/SFT layer informed by the Stacks GameFi tutorial on SFT acquisition, crafting, level-up, and token metadata. Source: [SFTs: Flow and Smart Contracts](https://gamefi-stacks.gitbook.io/stacks-degens-gaming-universe/sfts-flow-and-smart-contracts)

```mermaid
flowchart TD
  W[world-lobby.clar<br/>world/session lifecycle] --> O[world-objects.clar<br/>object ownership and binding]
  O --> S[sft-items.clar<br/>resources, items, passes, upgrades]
  S --> X[x402 and wallet flows<br/>paid access and settlement]
```

Planned uses for the SFT layer:
- room passes and access badges
- consumable resources
- craftable and upgradeable items
- creator/media access items
- future skins, tools, and world modules

Important truth:
- this SFT layer is a planned roadmap item
- it is not implemented in the current build

## Contract Proof Layer

The first contract proof layer is no longer theoretical.

```mermaid
flowchart LR
  P[guide.btc x402 payment] --> U[premium unlock]
  U --> C[premium-access-v2]
  C --> R[readable proof state]
  R --> W[future world facts and gated surfaces]
```

Current truth:
- `premium-access-v2` is deployed on Stacks testnet
- it is a post-payment proof/state contract, not the x402 settlement mechanism
- the backend is not yet calling `grant-access` after successful payment

## Why x402 and the Contract Both Exist

Judges should read the two layers like this:

- x402 answers: `can this premium action be paid for and unlocked right now?`
- `premium-access-v2` answers: `can this premium unlock be proven or recorded onchain after payment?`

In other words:

- x402 = payment and delivery
- Clarity = proof and durable world state

That separation is deliberate.
It keeps the payment rail narrow while giving the world a path to:
- gated rooms
- gated objects
- pass-based access
- future item and world logic

## What The Contract Actually Does

`premium-access-v2` is a narrow onchain access-proof contract.

It lets the contract owner:

- grant access to a specific resource for a specific principal
- revoke that access
- check whether a principal has access
- read the stored grant record

The contract stores:

- `resource-id`
- `who`
- `granted-at`
- `granted-by`

In plain English, it answers:

- `did this wallet get access to this premium thing?`
- `when was that access granted?`
- `who granted it?`

It does **not**:

- process payment itself
- replace x402
- mint items or tokens
- handle world/lobby/object logic yet

Its job is simple:

- durable onchain proof of premium unlock state after payment

## Current and Future Use Cases

Current MVP use case:

- `guide.btc` premium briefing
  - resource key: `guide-btc-premium-brief`
  - after successful x402 payment, the backend can record that unlock onchain

Near-future use cases:

- premium reports and classified ecosystem briefings
- premium rooms and gated spaces through `world-lobby.clar`
- premium terminals, boards, desks, and world objects through `world-objects.clar`
- passes, keys, badges, and itemized access through `sft-items.clar`
- agent-readable access checks for future wallet-bearing agents
- durable proof beyond session-only frontend or Convex state

## Tech Stack

- **Frontend**: Vite + TypeScript
- **Rendering**: PixiJS v8
- **Backend**: Convex (database, real-time, file storage, auth)
- **AI**: Braintrust AI Proxy
- **Future Stacks direction**: AIBTC patterns, x402 on Stacks, and modular external adapters

## Service Boundaries

The project now includes a dedicated x402 service scaffold:

```text
services/
└── x402-api/        Separate payment-required HTTP surface for premium endpoints
```

Current truth:
- the service exists in the repo and runs locally
- the world-side offer metadata exists in Convex
- the in-world premium UI is real
- the first local `guide.btc` x402 payment path is verified end-to-end on Stacks testnet
- hosted/public facilitator behavior is still a separate verification item

## Premium Payload Contract

The x402 premium response is intentionally JSON-first.

Why that matters:

- humans can view it as a styled premium card in-world
- agents can consume it programmatically without prose parsing
- apps can treat it as a stable contract between payment, content, and world-state consequences

Current shape:

- payment/proof metadata
- premium classification
- delivery timestamp

Current limitation:

- the verified local payload is still closer to a receipt/proof envelope than a fully enriched classified briefing

Next evolution:

- keep the receipt/proof fields
- add richer structured briefing content sourced from backend integrations
- let that same JSON contract later scale into:
  - premium rooms via `world-lobby.clar`
  - premium terminals and objects via `world-objects.clar`
  - passes/items via `sft-items.clar`

## DoraHacks Snapshot

The strongest honest hackathon claim today is:

- playable 2D world shell with multiplayer foundations
- backend-driven Stacks ecosystem discovery surfaces
- purposeful named agents (`guide.btc`, `market.btc`, `quests.btc`)
- one verified local x402 payment proof through `guide.btc`
- one deployed Clarity 4 contract proof layer:
  - `premium-access-v2`
- AIBTC-aligned agent registry and account-binding scaffolding in Convex
- a clear contract roadmap:
  - `premium-access-v2`
  - `world-lobby.clar`
  - `world-objects.clar`
  - later `sft-items.clar`

Still roadmap, not live:

- broader multi-agent economic execution
- autonomous trading / basket strategy
- broad Chainhooks rollout
- item/SFT economy
- hosted production payment infrastructure

See also:
- [docs/Stacks2D-Architecture.md](./docs/Stacks2D-Architecture.md)
- [docs/Current-State-2026-03-14.md](./docs/Current-State-2026-03-14.md)
- [docs/SFT-GameFi-Context.md](./docs/SFT-GameFi-Context.md)

## Getting Started

### Prerequisites

- Node.js 18+
- A [Convex](https://convex.dev) account for cloud workflows, or local Convex for offline/local development
- Optionally, a [Braintrust](https://braintrust.dev) API key (for NPC AI)

### Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Initialize Convex:
   ```bash
   npx convex dev --local
   ```
   This starts a local Convex deployment and generates the `_generated` types.

3. Set up environment variables:
   - Copy `.env.local.example` to `.env.local` and fill in `VITE_CONVEX_URL`
   - In Convex, set these environment variables as needed:
     - `JWT_PRIVATE_KEY` — local auth signing key
     - `JWKS` — local auth verification key set
     - `ADMIN_API_KEY` — local admin helper key
     - `BRAINTRUST_API_KEY` — optional AI key
     - `BRAINTRUST_MODEL` — optional model override

4. Run the dev server:
   ```bash
   npm run dev
   ```
   This starts both the Vite frontend and the Convex backend in parallel.

## Project Structure

```
convex/               Convex backend
├── schema.ts         Database schema (all tables)
├── auth.ts           Auth configuration
├── maps.ts           Map CRUD
├── players.ts        Player persistence
├── presence.ts       Real-time position sync
├── npcEngine.ts      Server-authoritative NPC runtime loop
├── npcProfiles.ts    NPC profile records and metadata
├── story/            Narrative backend
│   ├── quests.ts
│   ├── dialogue.ts
│   ├── events.ts
│   └── storyAi.ts    Braintrust LLM actions
├── agents/           Planned agent sandbox modules
├── integrations/     Planned external adapters (AIBTC, Zero Authority, x402)
└── mechanics/        Game mechanics backend
    ├── items.ts
    ├── inventory.ts
    ├── combat.ts
    ├── economy.ts
    └── loot.ts

src/                  Frontend
├── engine/           PixiJS game engine
│   ├── Game.ts       Main loop
│   ├── Camera.ts     Viewport
│   ├── MapRenderer.ts
│   ├── EntityLayer.ts
│   └── InputManager.ts
├── lib/              Shared client helpers
├── splash/           Overlay / splash screen system
└── ui/               HUD, chat, auth, profile, and mode controls
```

## Architecture Direction

The product is being built with clear boundaries:

- **Experience layer** — maps, characters, scenes, dialogue presentation
- **Game core** — movement, collisions, items, quests, NPC runtime state
- **AI layer** — Braintrust-backed dialogue and future agent memory / planning
- **Integration layer** — future AIBTC, Zero Authority, and x402 on Stacks adapters

This separation is intentional so the worldbuilding and asset pipeline can evolve without coupling the game client directly to external wallet or payment infrastructure.

See [docs/Stacks2D-Architecture.md](docs/Stacks2D-Architecture.md) for diagrams and module boundaries.

### Agent Framework Direction

The long-term agent architecture is layered rather than monolithic.

```mermaid
flowchart TD
  U[User or agent owner] --> P[Parent agent]
  P <--> B[Basket strategy]
  O[Offchain logic<br/>Zero Authority, Tenero, LLM signals] --> B
  B --> W1[Guide strategy]
  B --> W2[Market strategy]
  B --> W3[Quest strategy]
  W1 --> N1[World node or service node]
  W2 --> N2[World node or protocol node]
  W3 --> N3[World node or service node]
```

In `stacks2d`, that means:
- the world stays the interface layer
- strategy agents stay modular
- protocol and payment execution stay behind explicit nodes
- offchain signals help orchestrate decisions without taking over the engine

### World Semantics Direction

The world is being upgraded from a painted scene to a semantic simulation.

```mermaid
flowchart LR
  M[Map] --> Z[Zones]
  M --> O[Object instances]
  M --> N[NPC instances]
  Z --> T[Tags and allowed roles]
  O --> V[Value, interaction, offer state]
  N --> R[Role, post, current state]
  R --> E[Events]
  V --> E
```

This is the basis for:
- purposeful NPC movement instead of random drift
- object-aware agents
- creator economy loops
- future multi-world sandbox behavior

### Spatial Intelligence Direction

Spatial intelligence in `stacks2d` is not just “more AI chat”.

It is a layered system:

```mermaid
flowchart TD
  G[1. Geometry layer] --> S[2. Semantic layer]
  S --> A[3. Affordance layer]
  A --> C[4. Agent cognition layer]
  C --> E[5. Execution and economy layer]

  G["Geometry layer<br/>tiles, blockers, paths, portals, occupancy"]
  S["Semantic layer<br/>zones, objects, tags, value, roles"]
  A["Affordance layer<br/>what can be used, bought, opened, queried, traded"]
  C["Agent cognition layer<br/>perception, memory, role policy, planning"]
  E["Execution and economy layer<br/>events, offers, x402, STX, sBTC, USDCx"]
```

This means:
- geometry tells the system where things are
- semantics tells the system what things mean
- affordances tell agents what they can do
- cognition helps agents choose meaningful actions
- execution handles the resulting world or economic action

This is the path from:
- random NPC wandering
to
- a world where agents understand places, objects, and value

### System Diagram

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

### Module Boundaries

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

### Stacks Integration Direction

```mermaid
flowchart LR
  G[stacks2d / TinyRealms] --> X[AIBTC Adapter]
  G --> Z[Zero Authority Adapter]
  G --> P[x402 Adapter]
  X --> AX[AIBTC services]
  Z --> ZX[Zero Authority API]
  P --> PX[x402 API / sponsor relay]
```

### Payment and Execution Direction

```mermaid
flowchart LR
  H[Human or agent] --> I[World object or NPC]
  I --> O[Offer metadata in Convex]
  O --> X[x402 service boundary]
  X --> C[Stacks settlement path<br/>STX, sBTC, USDCx]
  X --> R[Premium content or action result]
  R --> I
```

Today:
- offer metadata is real
- premium UI is real
- payment execution is not live yet

That distinction is deliberate and should be preserved in public grant language.

### Why Semantics Matter

Without semantics, a room is just background art.

With semantics, the system can know:
- a coffee mug is a consumable object
- a swap terminal is a finance object
- a billboard is a media object
- a guide desk is a social and information zone
- a premium booth can expose an x402 offer

That is what makes:
- ai-town style behavior
- creator economy objects
- autonomous agents
- future trading agents
possible inside the same world model

## Modes

- **Play** — explore the world and interact with characters
- **Build** — edit the map, collision, and placement data
- **Sprites** — define and preview custom sprite animations

## Attribution

This repository builds on the TinyRealms foundation while taking the product in a different direction around semantic worlds, AI agent simulation, and Stacks/Bitcoin-native economic primitives.
