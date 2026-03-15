# X402 Service Boundary

This document explains what the x402 layer is doing in `Stackshub`, why it exists as a separate service, and how it relates to the Clarity contract layer.

## Current Truth

- Premium offer metadata exists in Convex.
- The world UI can display premium offer details.
- The repo contains a separate x402 service at `services/x402-api`.
- Local `guide.btc` payment execution is verified end-to-end on Stacks testnet.
- The premium response is returned as structured JSON.
- The hosted/public facilitator path is still not verified.
- The deployed contract layer exists separately as:
  - `ST2JDN3QED16X524SE8GWQSTP2MW6D2005AEEGJ9S.premium-access-v2`

## Why x402 Exists

x402 is the payment rail.

Its job is:
- return `402 Payment Required`
- accept a signed payment retry
- settle the payment
- return premium content

It is **not** the world-state or onchain-proof layer.

## Why a Separate Service

Payment logic should not live inside:
- Pixi rendering
- HUD code
- NPC movement
- map logic
- random frontend state

The world should expose semantic offers.
The x402 service should enforce payment-required access to those offers.

## Why the Contract Also Exists

The Clarity contract does a different job from x402.

`premium-access-v2` exists to record or prove premium unlock state onchain after payment.

That means:
- x402 = payment and premium delivery
- Clarity = durable proof / unlock state

This is the intended relationship:

```mermaid
flowchart LR
  O[In-world premium offer] --> X[x402 service]
  X --> P[paid premium payload]
  P --> C[premium-access-v2]
  C --> S[onchain proof state]
```

Why this separation is useful:
- the payment rail stays simple
- the proof layer stays explicit
- future rooms, objects, and items can reuse the same contract logic

## Initial Asset Rail

- `STX` on `testnet`

This is the narrowest credible first payment path.

## Active Endpoint

- `GET /api/premium/guide-btc`

Supporting endpoint:
- `GET /api/premium/guide-btc/metadata`

## Expected Flow

1. `guide.btc` exposes a premium offer in-world.
2. The offer metadata references `/api/premium/guide-btc`.
3. The x402 service returns an HTTP `402 Payment Required`.
4. A wallet client signs and retries.
5. The service settles the payment and returns premium JSON payload.
6. The app can record a matching world event or world fact.
7. The next integration step is to call `premium-access-v2.grant-access(...)`.

## Why the Premium Payload Is JSON

The premium response is intentionally JSON-first.

That is important because:
- humans can view it as a styled premium card
- agents can consume it directly
- the same interface can later support:
  - premium rooms
  - premium terminals
  - premium reports
  - pass/item unlocks

## What Is Not Claimed Yet

- No verified hosted/public facilitator path yet
- No automatic x402-to-contract write path yet
- No fully enriched classified briefing payload yet
- No live AIBTC execution path yet

## Next Steps

1. Wire successful x402 settlement to `premium-access-v2.grant-access(...)`
2. Add richer backend-sourced premium briefing fields to the JSON payload
3. Reflect successful unlocks in `worldEvents` / `worldFacts`
4. Extend the same pattern later to:
   - `world-lobby.clar`
   - `world-objects.clar`
   - `sft-items.clar`
