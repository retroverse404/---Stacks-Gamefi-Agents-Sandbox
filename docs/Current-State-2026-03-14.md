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
- `/api/premium/guide-btc` exists in scaffold form only
- guide premium offer metadata exists in Convex
- real x402 settlement is not yet verified
- no Clarity proof contract is live yet
- no AIBTC account execution is live yet

## Important Truth

The project now has a real Stacks-facing discovery and market slice.

It does **not** yet have:
- verified x402 execution
- verified onchain proof contract
- verified AIBTC execution against agent accounts

## Immediate Next Steps

1. Bring up `services/x402-api` on testnet
2. Verify `/health` and `/api/premium/guide-btc/metadata`
3. Test the 402 flow with a funded testnet wallet
4. Add one narrow Clarity proof contract
5. Continue replacing static NPC behavior with semantic action loops
