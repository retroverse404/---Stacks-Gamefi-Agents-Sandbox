# Current State - 2026-03-14

This note is a timestamped implementation snapshot for `stacks2d (tinyrealms)`.

## Verified Live Now

- `guide.btc` opens a dedicated guide surface
- `market.btc` opens a dedicated market surface
- `quests.btc` opens a dedicated opportunity surface
- the HUD header ticker is driven by live Tenero data
- Zero Authority cached bounties, grants, and quests are queryable and used in-world
- the bottom-left panel is now a `World Feed` backed by `worldEvents`
- the semantic world kernel exists in Convex:
  - `worldZones`
  - `semanticObjects`
  - `npcRoleAssignments`
  - `worldFacts`
  - `worldEvents`
- the AIBTC-compatible registry exists in Convex:
  - `agentRegistry`
  - `agentAccountBindings`
- the wallet/account role model now exists in Convex:
  - `walletIdentities`
  - `signedIntents`

## Verified By

- `npm run build`
- `integrations/tenero:tickerRows`
- `integrations/zeroAuthority:guideSnapshot`
- `agentRegistry:listAgents`

## Connector Execution Proof

Verified backend execution paths:

- `Tenero API -> Convex integration -> tickerRows -> HUD ticker`
- `Tenero API -> Convex integration -> tickerRows -> market.btc surface`
- `Zero Authority API -> Convex integration -> guideSnapshot -> quests.btc surface`
- `Zero Authority API -> Convex integration -> guideSnapshot -> guide.btc live context`

This is intentionally backend-driven.

The browser is not the source of truth for these connectors.
Convex is the integration boundary and cache layer.

## Scaffolded But Not Yet Verified Live

- `services/x402-api` exists as a separate x402 payment boundary
- guide premium offer metadata exists in Convex
- hosted/public x402 settlement infrastructure is not yet verified
- no Clarity proof contract is live yet
- no AIBTC account execution is live yet

## x402 Progress Update - 2026-03-15

The x402 state has improved since this 2026-03-14 snapshot.

Now verified:
- `services/x402-api` boots locally after dependency/runtime fixes
- `GET /health` returns the expected service status
- `GET /api/premium/guide-btc/metadata` returns the premium contract metadata
- `GET /api/premium/guide-btc` returns a real HTTP `402 Payment Required` when configured with a testnet receiver address
- the browser can read the x402 challenge and retry after wallet signing
- the local `guide.btc` path now settles and returns premium content through the service-local facilitator fallback
- `premium-access-v2` is deployed on Stacks testnet under Clarity 4

The verified `402` response now includes:
- x402 v2 response shape
- testnet network identifier
- `STX` asset
- `1 STX` price
- `payTo` receiver address

Also implemented:
- browser-side `402 -> sign -> retry` helper path in the frontend for `guide.btc`
- server-side Hiro API key environment contract for future backend settlement/broadcast work
- repo-local x402 package portability fix using a vendored tarball instead of a symlinked source dependency
- service-local facilitator fallback and env loading for deterministic local settlement
- a JSON-first premium response shape that can act as a receipt/proof envelope for future richer premium payloads

Still not verified:
- public hosted facilitator infrastructure
- clean receipt / transaction-proof UX in the app
- automatic contract grant after successful x402 payment
- hosted end-to-end payment proof outside local development

## Important Truth

The project now has a real Stacks-facing discovery and market slice.

It now **does** have:
- verified local x402 settlement end-to-end for `guide.btc`
- explicit backend persistence for player wallets, service wallets, agent wallets, and signed intents
- a machine-readable premium payload contract suitable for future agent/app consumption
- one deployed Clarity 4 proof contract on Stacks testnet

It does **not** yet have:
- verified hosted/public-facilitator settlement
- verified x402-to-contract write path
- verified AIBTC execution against agent accounts
- a fully enriched classified premium briefing sourced from live backend context

## Immediate Next Steps

1. Wire successful `guide.btc` x402 settlement to `premium-access-v2`
2. Persist successful premium unlocks into world state and visible world events
3. Add receipt / transaction UX to the `guide.btc` premium flow
4. Keep `world-lobby.clar` and `world-objects.clar` as the next contract milestones
5. Continue replacing static NPC behavior with semantic action loops
