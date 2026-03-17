# `agents/`

This folder is the modular workspace for external agent builds that should stay
decoupled from the main TinyRealms runtime.

Use this folder for:

- AIBTC-aligned agent prototypes
- skill-driven agent experiments
- wallet/account setup flows
- Bitflow / Tenero / ecosystem-specific agent modules
- future adapters that can be linked back into in-world characters

Do **not** use this folder for:

- core game rendering
- frontend UI wiring
- direct map logic
- Convex world-state ownership

Those responsibilities stay in the main app.

The intent is:

- build agents modularly here
- prove one external agent loop
- then map that agent into characters like `guide.btc`, `market.btc`, or `quests.btc`

Current module path:

- `agents/AIBTC/Bitflow-Tutorial-1`

Top-level system frame:

- Agents
- Identity
- Apps
- Ecosystem
- Worlds
