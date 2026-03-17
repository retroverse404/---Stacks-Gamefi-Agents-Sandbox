# Bitflow Tutorial 1

Module 1 for the external AIBTC-aligned prototype path.

This module exists so the team can follow the public AIBTC / Bitflow onboarding
flow in a clean, modular workspace before linking a working agent back into the
main `tinyrealms` build.

## Purpose

Build one practical prototype agent that can later be mapped to an in-world
character.

This module should help prove:

- agent wallet creation and verification
- Stacks/BTC address visibility
- skill-driven agent workflow
- Bitflow-oriented market / quote / execution preparation
- a reusable pattern for future agents

## Why This Is Separate

The TinyRealms runtime should remain focused on:

- worlds
- UI
- Convex persistence
- x402 and contract surfaces

This module should focus on:

- agent runtime experimentation
- AIBTC-aligned setup
- ecosystem tooling
- external execution patterns

## Intended Mapping Back Into TinyRealms

Once this module works, it can be linked back into the main build through:

- `agentRegistry`
- `agentAccountBindings`
- `walletIdentities`
- `signedIntents`

Likely first in-world mapping target:

- `market.btc`

Possible later mappings:

- `guide.btc`
- `quests.btc`
- future specialized strategy or execution agents

## Module Status

Current status:

- folder scaffold created
- ready for Bitflow/AIBTC tutorial implementation

Not done yet:

- wallet/account setup
- skill wiring
- Bitflow quote flow
- TinyRealms adapter link

## Working Rule

Treat this as a modular prototype lane.

Do not tightly couple this module into the main world until:

1. the agent loop is working
2. the wallet/account flow is understandable
3. the mapping back into TinyRealms is explicit
