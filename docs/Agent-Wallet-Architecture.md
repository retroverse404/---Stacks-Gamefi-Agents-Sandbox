# Agent Wallet Architecture

This note records the intended plumbing direction for wallet-backed or account-backed agents in `stacks2d`.

## Goal

The target is not only a single x402 payment flow.

The target is:
- a playable Stacks-facing simulation
- autonomous or semi-autonomous agents
- wallet or account-backed agent identity
- x402-linked premium or gated actions
- contract-backed world structure
- Chainhooks-fed onchain world updates

## Layering

### Convex

Convex remains the backend truth layer for:
- agent registry
- agent state
- world facts
- world events
- access state
- cached integrations

### Agent wallet/account layer

Agents should use a dedicated wallet or account layer.

This should stay separate from:
- renderer logic
- random UI state
- direct frontend-only wallet behavior

Current backend model now distinguishes:
- player payer wallets
- service receiver wallets
- agent identity wallets
- agent execution accounts
- signed intents, including future `SIP-018`-style approvals or policies

### x402

`x402` stays a narrow paid-service boundary.

Best current use:
- `guide.btc`
- later premium rooms, reports, terminals, or services

### Contracts

Current coherent contract stack:

1. `premium-access-v2`
2. `world-lobby.clar`
3. `world-objects.clar`
4. later `sft-items.clar`

### Chainhooks

Chainhooks should be treated as backend event ingestion:

- Hiro Chainhooks
- webhook receiver
- Convex mutations
- world facts / world events / agent updates

## Important Distinctions

- `x402` is not the same as Clarity proof
- agent wallet identity is not the same as agent execution rights
- the browser is not the source of truth

## Current Tactical Order

1. prove one narrow x402 path
2. keep agent wallet/account architecture aligned
3. add Chainhooks ingestion
4. continue contract work for premium access, lobby state, and objects

## Current Convex Boundary

The repo now has explicit persistence surfaces for this:

- `agentRegistry`
- `agentAccountBindings`
- `walletIdentities`
- `signedIntents`

This keeps multiple wallet roles legible without pretending every actor is just a browser extension session.
