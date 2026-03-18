# Deployment Workflow (Vercel + Convex + x402)

This guide describes a practical deployment workflow for **Dungeons & Agents** while you harden a hosted hackathon baseline.

It is optimized for:

- Vercel hosting the frontend
- Convex cloud hosting backend/functions/database/Braintrust calls
- a separate public x402 host handling paid actions and private signer material
- safe persistent-world evolution over time

---

## Current Hosted Baseline (2026-03-19 04:52 IST)

Current production targets:

- Convex production URL: `https://zealous-bobcat-847.convex.cloud`
- Convex HTTP actions URL: `https://zealous-bobcat-847.convex.site`
- Hosted x402 API URL: `https://stackshub-x402-api.onrender.com`
- Hosted x402 health check: `https://stackshub-x402-api.onrender.com/health`

Known-good Render service shape:

- Branch: `release/dungeons-and-agents`
- Root Directory: `services/x402-api`
- Build Command: `npm install`
- Start Command: `npm run start`
- Health Check Path: `/health`

Minimal hosted verification order:

1. Deploy Convex backend to the production deployment.
2. Verify x402 metadata routes on Render.
3. Set `VITE_CONVEX_URL` and `VITE_X402_API_URL` in Vercel.
4. Deploy the frontend.
5. Run the hosted world smoke test.

---

## 1) Recommended Environment Model

Use three environments:

- **Local**: your daily development (`npm run dev`)
- **Preview/Staging**: branch-based deploy previews
- **Production**: stable live world

Keep frontend + backend paired per environment:

- Local frontend -> Local Convex
- Preview frontend -> Preview Convex deployment
- Production frontend -> Production Convex deployment

---

## 2) Branch Strategy

Simple and safe:

- `release/dungeons-and-agents`: production-ready
- feature branches: active development

Suggested flow:

1. Build/test on feature branch
2. Open PR -> Vercel Preview
3. Validate preview against preview Convex deployment
4. Merge to `release/dungeons-and-agents` -> production deploy

---

## 3) Environment Variables by Layer

## Frontend (Vercel)

Set in Vercel UI (or CLI), per environment:

- `VITE_CONVEX_URL` (required)
  - Preview: preview Convex deployment URL
  - Production: production Convex deployment URL
- `VITE_X402_API_URL` (required for hosted premium actions)
  - Preview: preview/public x402 host URL
  - Production: production/public x402 host URL

Optional based on your auth UX:

- `VITE_APP_ENV` (e.g. `preview`, `production`) for diagnostics/UI

## Convex backend

Set in each Convex deployment:

- `JWT_PRIVATE_KEY`
- `JWKS`
- `ADMIN_API_KEY`
- `AUTH_GITHUB_ID` (if using GitHub auth)
- `AUTH_GITHUB_SECRET` (if using GitHub auth)
- `CONVEX_SITE_URL` (used by auth config/JWKS domain)

Important: each deployment (preview/prod) should have its own values where appropriate.

## x402 host

Set on the separate x402 host:

- `NETWORK`
- `CONVEX_URL`
- `DEPLOYER_PRIVATE_KEY`
- agent server / pay-to addresses

Important:

- do not put signer keys in Vercel
- keep private keys only on the x402 host

---

## 4) First-Time Setup

1. **Create Convex deployments**
   - One for preview/staging
   - One for production

2. **Configure backend env vars** in each Convex deployment
   - especially `JWT_PRIVATE_KEY`, `JWKS`, `ADMIN_API_KEY`

3. **Connect repo to Vercel**
   - Build command: `npm run build`
   - Publish directory: `dist`

4. **Set Vercel frontend env vars**
   - Preview context: `VITE_CONVEX_URL=<preview convex url>`
   - Preview context: `VITE_X402_API_URL=<preview x402 url>`
   - Production context: `VITE_CONVEX_URL=<prod convex url>`
   - Production context: `VITE_X402_API_URL=<prod x402 url>`

5. **Validate auth callback URLs** (if GitHub auth enabled)
   - Callback should target Convex auth route for the correct deployment

---

## 5) Local Development Workflow

Use local backend by default:

```bash
npm run dev
```

This runs:

- Vite frontend
- Convex local backend (`convex dev --local`)

If you need to test against cloud Convex while still local frontend:

```bash
npm run dev:cloud
```

---

## 6) Deploy Workflow (Day-to-Day)

## A) Feature branch / preview

1. Run checks locally:
   - `npm run typecheck`
   - `npm run lint`
   - `npm run audit:maps`

2. Backup before risky backend changes:
   - `npm run backup:world`

3. Push branch -> Vercel creates deploy preview
4. Deploy backend changes to preview Convex deployment
5. Verify preview:
   - login/auth
   - map edit/save/load
   - portals
   - world items/respawn
   - admin scripts with preview `ADMIN_API_KEY`

## B) Production release

1. Final pre-release backup:
   - `npm run dump:full`
2. Merge to `release/dungeons-and-agents`
3. Deploy Convex backend to production deployment
4. Deploy x402 host with production env
5. Vercel deploys production frontend
6. Run smoke checks against production

---

## 7) Keeping Local and Deployed Environments Aligned

- Treat local as **fast iteration**, not source of truth for persistent prod data
- Regularly test critical flows on preview cloud deployment
- Keep schema/migration discipline identical across all envs
- Use the same scripts in all envs (`backup:world`, `restore:world`, `audit:maps`)

Recommended cadence:

- Weekly: compare preview/prod env var completeness
- Before each release: run backup + map audit

---

## 8) Rollback Strategy

If release causes issues:

1. Revert code and redeploy frontend/backend
2. If data corruption occurred, run selective restore:
   - dry-run first
   - then `--confirm`
3. Verify with restore report hashes/counts

Use:

- `docs/Operations.md` for restore/backup runbook

---

## 9) Operational Guardrails

- Do not run destructive admin commands without fresh backup
- Keep `ADMIN_API_KEY` secret and rotated periodically
- Restrict restore to selective allowlisted tables
- Run CI checks before merge (`typecheck`, `lint`, `build`)

---

## 10) Suggested Next Improvements

- Add Vercel env checks to fail build if `VITE_CONVEX_URL` or `VITE_X402_API_URL` is missing
- Add release tags/changelog for production deployments
- Add automated nightly backup job on a trusted runner
- Add production health dashboard/alerts (Convex errors, map-size growth, auth failures)
