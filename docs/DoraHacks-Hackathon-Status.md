# DoraHacks Hackathon Status

Updated: 2026-03-16

## Competition Reality

This DoraHacks competition has:

- one main hackathon with open submission on Stacks
- three separate bounty tracks
- one round of judging for main placement

Main hackathon prizes:

- 1st place: `$6,000`
- 2nd place: `$3,000`
- 3rd place: `$2,000`

Bounties:

- three bounty prizes of `$3,000` total per announced theme

Bonus support for the top three:

- introduction to the Stacks Endowment
- a 1:1 working session with Stacks Labs

Current working assumption for this repo:

- treat the next 4 days as a submission sprint
- optimize for one highly legible proof loop, not broad feature expansion

## Judging Criteria To Optimize For

Projects are judged on:

- `Innovation`
- `Technical Implementation`
- `Stacks Alignment`
- `User Experience`
- `Impact Potential`

What that means for this submission:

- `Innovation`: playable Stacks ecosystem explorer inside a world
- `Technical Implementation`: verified x402 flow, deployed Clarity contract, live backend adapters
- `Stacks Alignment`: Clarity 4, x402 on Stacks, AIBTC-aligned agent model, Stacks ecosystem data
- `User Experience`: one clean in-world loop that is understandable quickly
- `Impact Potential`: credible path toward modular agent worlds, creator economy, and ecosystem-native interactions

## Verified Today

- `Stackshub` runs as a playable 2D world on the `tinyrealms` base
- backend-driven Stacks ecosystem surfaces exist for:
  - `guide.btc`
  - `market.btc`
  - `quests.btc`
- Convex remains the persistence and integration truth layer
- local `guide.btc` x402 payment now works end-to-end on Stacks testnet
  - `402 Payment Required`
  - wallet signing
  - signed retry
  - local facilitator fallback settlement
  - premium payload returned
- local `market.btc` x402 paid quote loop now works end-to-end on Stacks testnet
  - separate funded testnet agent wallet
  - `0.001 STX` payment
  - signed retry
  - `200 OK`
  - quote payload returned
- `premium-access-v2` is deployed on Stacks testnet under Clarity 4
  - contract: `ST2JDN3QED16X524SE8GWQSTP2MW6D2005AEEGJ9S.premium-access-v2`
  - records paid premium-access proof on testnet
  - contract explorer: `https://explorer.hiro.so/address/ST2JDN3QED16X524SE8GWQSTP2MW6D2005AEEGJ9S?chain=testnet`
  - txid: `96afaf46c0e1ed8f86aceb0b0687fa6bdd284f9ea1366cd5437dc25901e969c3`
  - tx explorer: `https://explorer.hiro.so/txid/0x96afaf46c0e1ed8f86aceb0b0687fa6bdd284f9ea1366cd5437dc25901e969c3?chain=testnet`
- `world-lobby` is deployed on Stacks testnet
  - records room creation, open or closed state, and room access on testnet
  - contract: `ST2JDN3QED16X524SE8GWQSTP2MW6D2005AEEGJ9S.world-lobby`
  - tx explorer: `https://explorer.hiro.so/txid/e411bff9d554b55f12a19c30fa4d278525f8c197f4deac3391cb4362b0e6d84f?chain=testnet`
- `world-objects` is deployed on Stacks testnet
  - records object registration, active state, and object access on testnet
  - contract: `ST2JDN3QED16X524SE8GWQSTP2MW6D2005AEEGJ9S.world-objects`
  - tx explorer: `https://explorer.hiro.so/txid/37518e87cdb28578cdc9c8afcd5ba42245fca3c45d2adda4b4dfbd0bea5d385f?chain=testnet`

## What This Proves

The project now has a real technical Stacks proof, not only architecture:

- real Stacks wallet interaction
- real x402 payment challenge
- real settlement path in local development
- real premium content unlock
- real paid quote delivery
- real Clarity 4 deployment path from this repo
- real onchain premium proof contract deployed on testnet
- real onchain room access contract deployed on testnet
- real onchain object access contract deployed on testnet

## JSON Scaling Logic

The premium x402 response should be understood as a JSON interface contract, not just a paywall receipt.

Why this matters:

- humans can see the result as an in-world premium card
- agents can consume the same payload directly
- future apps and world objects can rely on the same typed response shape

Current honest truth:

- the verified local payload proves payment and premium delivery
- the current content shape is still closer to a receipt/proof envelope than a fully enriched classified briefing

Why this still matters for the hackathon:

- it proves the payment rail is real
- it gives a scalable contract for richer premium payloads later
- it naturally extends into:
  - `premium-access-v2`
  - `world-lobby.clar`
  - `world-objects.clar`
  - later `sft-items.clar`

## AIBTC-Relevant State

The repo is aligned to an AIBTC-style execution model at the schema and boundary level:

- `agentRegistry`
- `agentAccountBindings`
- typed world actions for service/execution boundaries
- modular external-adapter framing

This is honest AIBTC alignment, not a claim that live AIBTC agents are already operating in-world.

## Lightweight Gossip Layer

The simulation is also being shaped around a lightweight gossip model using `worldEvents`.

Current honest claim:

- Convex already stores typed world events
- the world feed already consumes those events
- the next step is to let premium unlocks, agent actions, and ecosystem changes propagate through those same events to agent surfaces

Why this matters:

- it makes the world feel socially alive
- it gives x402 purchases visible world consequences
- it avoids claiming a full autonomous distributed protocol before it exists

## Contract Story For Judges

The strongest contract sequence is:

1. `premium-access-v2`
2. `world-lobby.clar`
3. `world-objects.clar`
4. later `sft-items.clar`

Why this order:

- `premium-access-v2` matches the verified x402 proof path and is already deployed
- `world-lobby.clar` makes rooms and gated spaces legible onchain
- `world-objects.clar` maps directly to semantic objects like boards, desks, and terminals
- `sft-items.clar` is the future item/pass/resource layer, not the first proof

## Recommended Hackathon Scope

Ship:

- one polished playable world slice
- three named agents
- one verified x402 premium flow
- one verified paid quote flow or equivalent paid service flow
- one visible world-event consequence of a paid action
- one visible AIBTC-aligned account-binding story
- one first deployed contract, `premium-access-v2`
- deployed world-layer contracts:
  - `world-lobby`
  - `world-objects`
- one JSON-first premium payload contract that can scale to agents and apps

Show as roadmap:

- autonomous trading agents
- multisig / basket strategy logic
- broad Chainhooks rollout
- full SFT item economy
- broader world/theme expansion

## Four-Day Sprint Rule

Until submission, prefer work that directly improves judging performance:

1. make one flagship loop undeniable
2. make the protocol/payment rail visible
3. keep Stacks alignment explicit
4. keep the UI legible enough for non-specialist judges
5. do not widen scope unless it clearly improves the demo

## Public Claim Rule

Safe claim:

- `Stackshub is a playable agentic sandbox for simulated worlds, wallets and transactions, with verified local x402 paid flows, deployed Clarity 4 premium/room/object contracts on Stacks testnet, and an AIBTC-aligned backend architecture.`

Unsafe claim:

- `AIBTC agents are already fully integrated and transacting autonomously in-world.`
- `Hosted production x402 settlement is already proven.`
