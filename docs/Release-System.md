# Release System

Purpose: define the minimum operating system that keeps `stackshub.space`, Render, Convex, and GitHub aligned without guessing.

Last updated: 2026-03-24 11:26:00 IST

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

## Definition Of Synced

Do not call the stack synced until all of these are true:

- GitHub has the commit pushed on `release/dungeons-and-agents`
- Vercel is on the expected frontend commit if UI code changed
- Render is on the expected commit if x402 code changed
- Convex production is deployed if backend code changed
- the hosted URL has been smoke-tested in a fresh incognito tab
- the result is written into the timestamped release ledger

## Branch Of Truth

The public build must be served from the same branch that contains the verified fixes.

- Current branch of truth: `release/dungeons-and-agents`
- Do not assume `main` is safe for production if it is behind the release branch
- If production is pointed at `main`, either:
  - switch Vercel production to `release/dungeons-and-agents`, or
  - merge/cherry-pick the verified release commits into `main` before redeploying

If the live site regresses, verify the deployed asset commit before making new code changes.

## Required Release Record

Every live-affecting change gets one release record with:

- timestamp in `YYYY-MM-DD HH:MM:SS IST`
- branch
- commit sha
- Vercel status and deployment id
- Render status and deploy id
- Convex deployment status
- smoke-test result
- unresolved risks

If one of those fields is unknown, the release is still in progress.

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
- `npm run demo:doctor` before demo capture or live claims

## Smoke Test Sequence

Run this sequence in a fresh incognito tab after any live-affecting change:

1. load `https://stackshub.space`
2. confirm auth screen renders correctly
3. confirm guest entry works
4. confirm wallet buttons are visible
5. confirm world loads
6. confirm one premium interaction opens cleanly
7. confirm session timeout path does not trap the user

## No-Guess Rule

If production behavior conflicts with local behavior:

- trust the live evidence, not memory
- write the discrepancy into the release ledger
- identify the owning layer
- only then patch the relevant service

## Temporary Stabilization Rule

If a live issue blocks the hosted flow and the fix is not ready:

- prefer a reversible fallback over a broken paywall or dead-end
- record the fallback in the release ledger
- remove it only after the owning path is verified

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
- change only what affects the hosted path, evidence, or cost
