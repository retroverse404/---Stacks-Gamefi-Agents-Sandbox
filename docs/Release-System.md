# Release System

Purpose: define the minimum operating system that keeps `stackshub.space`, Render, Convex, and GitHub aligned without guessing.

## Ownership

| Layer | Source of truth | What it owns |
|---|---|---|
| GitHub | `release/dungeons-and-agents` | code history, review, branch promotion |
| Vercel | connected production deployment | frontend bundles and env-bound UI |
| Render | `services/x402-api` deployment | x402 payment endpoints, signer material, premium API |
| Convex | production deployment | auth, world state, runtime policy, AI budget, events |
| Obsidian | timestamped PM notes | live truth, next actions, release memory |

## Release Loop

1. Make the change in the smallest owning layer.
2. Commit to `release/dungeons-and-agents`.
3. Let the relevant host redeploy.
4. Smoke test the live URL.
5. Record the result in Obsidian.

## What Triggers What

- Frontend UI or auth copy changes:
  - push GitHub
  - Vercel rebuilds
- x402 or payment boundary changes:
  - push GitHub
  - redeploy Render
- Convex schema, auth, runtime policy, agent, or event changes:
  - push GitHub
  - run `convex deploy`
- Docs-only changes:
  - push GitHub
  - no production redeploy required

## Minimum Safety Checks

- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `npm run demo:doctor` before demo capture or judge claims

## Sync Rule

Do not assume GitHub push equals full production sync.

The live stack is only aligned when:

- the code is pushed
- the owning host redeploys
- the live URL is smoke-tested
- the result is written into a timestamped note

## Judge-Window Rule

During judge window:

- prefer explicit deploys over clever automation
- keep the release branch stable
- avoid broad architecture changes
- change only what affects the judge path, evidence, or cost
