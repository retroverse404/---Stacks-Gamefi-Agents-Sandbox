# Stacks2D Architecture

This document explains the current module boundaries for `stacks2d (tinyrealms)` and the planned path toward AIBTC- and x402-aligned integrations on Stacks.

## Product Framing

`stacks2d (tinyrealms)` is a work-in-progress 2D social world and agent sandbox.

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
- x402 on Stacks transaction flows
- AIBTC-aligned agent tooling

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
  A["convex/agents<br/>planned agent sandbox"]
  I["convex/integrations<br/>planned external adapters"]
  M["convex/mechanics<br/>items, economy, combat"]
```

## External Service Position

```mermaid
flowchart LR
  G[stacks2d / TinyRealms] --> X[AIBTC Adapter]
  G --> Z[Zero Authority Adapter]
  G --> P[x402 Adapter]
  X --> AX[AIBTC services]
  Z --> ZX[Zero Authority API]
  P --> PX[x402 API / sponsor relay]
```

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

- a work-in-progress TinyRealms fork
- building toward a 2D sandbox for AI agents and creator economy
- aligned with AIBTC patterns for agent tooling
- exploring x402 on Stacks for paid service and transaction flows

It should not be described as fully integrated with all of those systems yet.
