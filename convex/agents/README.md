# `convex/agents`

Planned home for the agent sandbox layer.

Intended responsibilities:
- NPC memory
- NPC planning / intent updates
- transaction simulation
- future agent-to-agent interactions
- future bridges to external agent tooling

Current status:
- `stateMachine.ts` provides a minimal backend agent-state store and guarded transitions
- `runtime.ts` provides a cheap agent epoch loop, cast join query, and AI budget registration
- this is intended for NPCs like `guide.btc` and future service agents
- payment execution should stay outside this folder and flow through integration adapters
- wallet/account role persistence now lives alongside this layer in:
  - `agentRegistry`
  - `agentAccountBindings`
  - `walletIdentities`
  - `signedIntents`

This folder should stay focused on agent behavior and state transitions.
It should not contain rendering code or direct UI logic.
