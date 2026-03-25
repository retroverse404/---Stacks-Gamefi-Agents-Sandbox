# Agent Wallet Ledger

Purpose: provide one canonical wallet-tracking page for the five in-world agents.

Audience:
- builders
- operators
- reviewers who need a clean wallet matrix quickly

Last verified: 2026-03-18

## Public vs Private

Use this split strictly:

- public repo docs:
  - wallet addresses
  - provider lineage
  - binding status
  - role and permission tier
- private notes only:
  - mnemonics
  - private keys
  - recovery phrases
  - faucet or custody handling notes

Private credential note:

- [wallet-mnemonics.PRIVATE.md](agents/AIBTC/wallet-mnemonics.PRIVATE.md)

Do not copy secrets into repo docs, README files, or submission material.

## Canonical Backend Source

The live canonical Convex query is:

- `agentRegistry:listCanonicalAgentWalletMatrix`

This query returns the current normalized wallet-backed agent rows, including:

- `agentId`
- `displayName`
- `walletProvider`
- `walletStatus`
- `testnetAddress`
- `mainnetAddress`
- `lineageSource`
- `lineageRef`
- `bindingStatus`
- `permissionTier`

## Current Wallet Matrix

| Agent | Role | Testnet address | Mainnet address | Provider | Lineage | Permission tier | Binding |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `guide.btc` | guide | `ST3P76BS18H1QZN8HCQKYRHRAT9GC2XTJ0GZ0HWXE` | `SP3P76BS18H1QZN8HCQKYRHRAT9GC2XTJ0GZ0HWXE` | `aibtc` | `aibtc-template / guide-btc-t1` | `service` | `bound` |
| `market.btc` | market | `ST3EGPYCJ8JTC9QETJHM2T47ZCCWNM9VX98ZEPXWT` | `SP1SRTS9MKZH8ZNFRBYFWM9WA75KVK2AZ8K1JSSD7` | `aibtc` | `bitflow-tutorial-1 / market-btc-m1` | `execution` | `bound` |
| `quests.btc` | quests | `ST19P5Y1XSYNNYM8JM6QDX95BAP7659742WF0FEQ2` | `SP19P5Y1XSYNNYM8JM6QDX95BAP7659742WF0FEQ2` | `aibtc` | `aibtc-template / quests-btc-t1` | `service` | `bound` |
| `Mel` | curator | `ST3YJTXH81SR6YPSG59RBJDBV5H2DD164Y1855ZK5` | `SP3YJTXH81SR6YPSG59RBJDBV5H2DD164Y1855ZK5` | `aibtc` | `aibtc-template / mel-curator-t1` | `service` | `bound` |
| `Toma` | merchant | `STXE8MZ5Y35646XT8MEXHJZ3YKWS20CSE31NP92R` | `SPXE8MZ5Y35646XT8MEXHJZ3YKWS20CSE31NP92R` | `aibtc` | `aibtc-template / toma-merchant-t1` | `identity-only` | `bound` |

## Documentation Locations

Primary repo docs:

- [Agent-Wallet-Architecture.md](docs/Agent-Wallet-Architecture.md)
- [Current-Truth-Matrix.md](docs/status/Current-Truth-Matrix.md)
- [submission.json](submission/submission.json)

Supporting lineage docs:

- [AIBTC-Agent-Ingress.md](docs/AIBTC-Agent-Ingress.md)
- [Bitflow-Tutorial-1/README.md](agents/AIBTC/Bitflow-Tutorial-1/README.md)

## Explorer Direction

The next clean UI surface should be an in-app agent explorer page, similar to a lightweight blockchain explorer or midnight.city-style roster.

Recommended first columns:

- agent name
- role
- wallet address
- provider
- lineage
- permission tier
- last premium event
- latest world thought

Later fields can add human-readable attributes:

- alignment
- mood
- expertise
- active room
- artifact affinity

## Practical Rule

When someone asks "what wallet does this agent use?" the answer should come from this page or from `agentRegistry:listCanonicalAgentWalletMatrix`, not from a private note or a JSON blob.
