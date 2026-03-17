# `convex/integrations`

Planned home for external service adapters.

Intended responsibilities:
- Zero Authority data ingestion
- Tenero analytics ingestion
- AIBTC adapter logic
- wallet/provider adapters
- x402 on Stacks transaction adapters

This folder should stay thin and integration-focused.
It should not become the main source of gameplay logic.

Current status:
- `zeroAuthority.ts` is live and syncs real external data into Convex cache tables
- `tenero.ts` is a thin analytics snapshot adapter scaffold
- `x402.ts` manages premium content offer metadata and future payment-gated endpoints

Design rule:
- frontend code should not call these third-party APIs directly
- integrations should normalize into Convex tables first
- NPCs and UI should read cached internal state, not raw remote schemas
