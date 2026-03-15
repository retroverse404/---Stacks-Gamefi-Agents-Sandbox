# Clarity Contract Plan

This note records the current contract sequencing decision for `stacks2d`.

## Current Decision

The project should not lead with a world/lobby contract as the first and only hackathon contract.

The recommended order is:

1. `premium-access.clar`
2. `world-lobby.clar`

## Why `premium-access.clar` Comes First

This contract maps directly to the current product slice:
- `guide.btc` premium content
- x402 payment boundary
- paid unlock proof
- judge-visible Stacks transaction relevance

It is the strongest first onchain proof because it ties to:
- premium content
- transactions
- receipts or unlock state

## Why a World/Lobby Contract Still Fits

The reviewed `btchub-lobby.clar` pattern is useful, but it fits better as a world/session contract than as the first payment-proof contract.

Good uses in `stacks2d`:
- `Cozy Cabin` world instance
- future `Station` world instance
- premium rooms
- sponsored scenes
- event rooms
- agent gathering spaces

What it models well:
- owner/host
- members
- world or room lifecycle
- flow-state transitions
- open / active / closed state

## Recommended Mapping

- `world-lobby.clar`
  - one contract per world or world-instance pattern
  - examples:
    - `cozy-cabin`
    - `station`
    - later premium or sponsored worlds

- `premium-access.clar`
  - one narrow contract for premium unlock proof
  - tied to:
    - `guide.btc`
    - later premium reports, rooms, scenes, or services

- future `sft-items.clar`
  - resources, items, crafting, upgrades, passes
  - aligned with Stacks GameFi SFT patterns
  - best added after world/session and object layers are established

## Important Truth

The lobby/world contract is a good fit for the long-term world model.

It is **not** a substitute for:
- payment proof
- premium access proof
- x402-linked transaction evidence

## Next Contract Work

1. Keep `premium-access.clar` minimal and hackathon-safe
2. Scope it as post-payment proof/state, not x402 settlement itself
3. Use resource-specific access keys such as `guide-btc-premium-brief`
4. After that, adapt the `btchub-lobby.clar` state-machine style into `world-lobby.clar`
5. Later, add an SFT item/resource layer for GameFi progression and passes
