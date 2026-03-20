# Current Truth Matrix

Purpose: record the current implementation truth in one place.

Audience:
- builders
- reviewers
- demo prep

Last verified: 2026-03-17

| Area | Current truth | Status |
| --- | --- | --- |
| World shell | Cozy Cabin is playable with named zones, semantic objects, world events, and 5 visible NPC roles | live |
| Agent runtime | 5 named agents have runtime state, cooldown/budget guardrails, and autonomous thought loops | live |
| Agent wallets | all 5 named agents now have testnet wallet identities and bindings | live |
| Database hygiene | agent wallet/provider/lineage data now has first-class Convex fields instead of living only in JSON blobs | live |
| Interaction surfaces | premium-offer bindings, object triggers, and event hooks now have first-class Convex fields instead of living only in object/offer JSON | live |
| Paid interactions | world-triggered premium actions use `x402` from objects/NPCs, not detached wallet-first UI | live |
| Onchain proof | `premium-access-v2` is deployed and service-side `grant-access` wiring exists | wired, verification-focused |
| x402 service | local service runs on testnet STX and returns structured premium JSON | live |
| Market data | Tenero-backed market data is integrated, but local snapshot freshness needs active backend health | partial |
| Ecosystem data | Zero Authority cache is integrated into world surfaces | live |
| SIP-009 artifacts | `floppy-disk-nft`, `cassette-nft`, `wax-cylinder-nft` are deployed on Stacks testnet under Clarity 4 | live |
| SIP-010 currency | `qtc-token` is deployed on testnet, but no live gameplay mint/spend loop is part of the current demo claim | deployed, not integrated |
| SFT layer | `sft-items` is deployed on testnet, but no live item economy loop is part of the current demo claim | deployed, not integrated |
| Agent-to-agent onchain transfers | not a current verified claim | not live |
| Dungeon loop | semantic groundwork exists, but only the media/artifact loop is becoming concrete | partial |
| Cut-scene system | labels and story primitives exist, but no dedicated scene runner is finalized yet | partial |

## Five Agents

| Agent | Role | Wallet-backed | Premium surface | AI runtime |
| --- | --- | --- | --- | --- |
| `guide.btc` | guide / educator | yes | guide brief, bookshelf brief | yes |
| `market.btc` | market / execution surface | yes | paid quote | yes |
| `quests.btc` | quests / opportunity keeper | yes | quest guidance, future reward surfaces | yes |
| `Mel` | curator / artifact signal | yes | signal, wax cylinder memory | yes |
| `Toma` | tavern / merchant / social layer | yes | social / tavern surfaces later | yes |

## Canonical Wallet Fields

The current wallet-backed agent rows should be readable directly from Convex using:

- `agentRegistry.walletProvider`
- `agentRegistry.walletStatus`
- `agentRegistry.testnetAddress`
- `agentRegistry.mainnetAddress`
- `agentRegistry.lineageSource`
- `agentRegistry.lineageRef`
- `agentAccountBindings.*` equivalents for execution/binding state
- `walletIdentities.linkedTestnetAddress`
- `walletIdentities.linkedMainnetAddress`

## Current Contract Stack

| Layer | Contract(s) | Purpose |
| --- | --- | --- |
| proof | `premium-access-v2` | post-payment access proof |
| world | `world-lobby`, `world-objects` | room/object state and access |
| artifacts | `floppy-disk-nft`, `cassette-nft`, `wax-cylinder-nft` | unique collectible media artifacts |
| future economy | `qtc-token`, `sft-items` | fungible and repeatable item economy |

## Contract Evolution Log

- **2026-03-20**: Updated `cassette-nft` and `floppy-disk-nft` with `(trait-of sip009-nft)`, response-wrapped read helpers, `asserts!` guards, and `set-contract-owner` so each artifact meets SIP-009 expectations.
