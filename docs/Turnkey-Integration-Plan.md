# Turnkey Embedded Wallet Integration Plan

> **Status:** Post-submission feature — do NOT merge to `release/dungeons-and-agents`
> **Branch:** `feature/turnkey-embedded-wallet`
> **Reference implementation:** `/home/rv404/Dev/finding-nakamoto/sbtc-cool-turnkey-stacks-demo`

---

## The Vision

> "The Stacks ecosystem, made playable.
> An agentic sandbox for simulated worlds, wallets and transactions."

The three words map to three technical pillars:
- **Worlds** — TinyRealms 2D environment, zones, NPCs, semantic objects
- **Wallets** — every player and agent has a real Stacks wallet, no browser extension needed (Turnkey)
- **Transactions** — x402 payments, on-chain access proofs, agent tips, Clarity contract calls

Right now worlds and transactions are live. **Turnkey completes the wallet layer.**

---

## Why Turnkey

Current auth: email + password → Convex → profile → world (requires Leather/Xverse for payments)

Problem:
- iPad, mobile, any device without a browser wallet = broken x402 flow
- Judges who don't have Stacks wallets installed can't demo the payment loop
- Friction kills the UX judging criterion

Turnkey fix:
- Passkey auth (Face ID / Touch ID) — works on any device
- Real Stacks wallet provisioned silently in the background
- No browser extension ever needed
- x402 payments signed via Turnkey — same result, zero friction

---

## New Auth Flow

```
Current:
  email + password form → Convex auth → profile → world

New:
  "Enter with passkey" button
        ↓
  Face ID / Touch ID (Turnkey passkey auth)
        ↓
  Turnkey sub-org + wallet provisioned silently
        ↓
  STX address saved to Convex profile automatically
        ↓
  Player enters world — wallet already ready
```

---

## Toma's "Pay It Forward" Welcome

Toma is the right agent — he's the tavern host. Not a mechanical tip, a cultural act.

```
Player enters Cozy Cabin
        ↓
Toma: "Welcome to the tavern, traveller.
       The first round is on me — pay it forward."
        ↓
World Feed: "Toma gifted 2 STX to [player] ✦ pay it forward"
        ↓
Player now has STX. guide.btc is standing nearby.
The game has already shown them how x402 works
without explaining anything.
```

**Pitch line:** *"Agents don't just earn. They set the tone. Toma tips every newcomer and asks them to pay it forward. That's how an agentic economy develops culture."*

**Tip amount: 2 STX** — enough to pay the 1 STX guide.btc paywall and have change.

**First-time only guard:**
```typescript
if (!profile.turnkeyWalletAddress) {
  // First login — tip them
  await welcomeNewPlayer(playerAddress, playerName)
}
// Returning player — skip tip, just reconnect wallet
```

**Faucet topup (silent, no World Feed):**
- Toma tips 2 STX (visible, narrative)
- Faucet wallet silently tops up to 5 STX total (invisible, functional)
- Player has enough for multiple premium interactions
- Demo never breaks on insufficient funds

---

## How Toma Gets the Player's Wallet Address

```
1. Player completes passkey login (Turnkey)
2. Turnkey returns wallet public key + Stacks address
3. Frontend saves to Convex profile:

   await convex.mutation(api.profiles.saveWallet, {
     profileId: currentProfile._id,
     turnkeyWalletAddress: stacksAddress,
     turnkeyOrgId: subOrganizationId,
   });

4. That mutation also fires:

   await convex.mutation(api.agents.agentTips.welcomeNewPlayer, {
     playerAddress: stacksAddress,
     playerName: profile.name,
   });

5. agentTips.ts reads address from profile → signs STX transfer → Toma tips player
```

Toma never needs blockchain awareness. The address is in Convex the moment the wallet exists.

---

## Agent Tip Flow (Full Bidirectional Economy)

```
Player enters Cozy Cabin
        ↓
Toma tips 2 STX (visible in World Feed — "pay it forward")
Faucet tops up to 5 STX (silent)
        ↓
Player pays guide.btc 1 STX for premium brief (via Turnkey signing, no extension)
        ↓
premium-access-v2 records access proof on Stacks
        ↓
World Feed shows payment + on-chain txid
        ↓
Agent earned STX → can sustain future tips → loop continues
```

This changes the story from "player pays agent" to "agent economy is bidirectional — agents earn AND reward players."

---

## World Ledger Page (In-App Block Explorer)

A dedicated page — route `/ledger` — that acts as a live dashboard of the economy.

### Three Panels

**Panel 1 — Live World Events (left)**
Real-time stream from `worldEvents` Convex table
```
🎯 guide.btc granted premium access to ST3P...HWXE
💰 Toma welcomed "Ragav" — pay it forward ✦ 2 STX
📈 market.btc delivered live quote to ST2J...E9S
🎵 Mel shared wax cylinder memory with ST19...EQ2
```

**Panel 2 — Agent Leaderboard (center)**
Aggregated from `agentEarningsLedger` Convex table
```
AGENT EARNINGS (testnet)

#1  guide.btc    ████████  14.2 STX earned  |  9 interactions
#2  Mel          ██████     8.0 STX earned  |  8 interactions
#3  market.btc   ████       3.1 STX earned  | 31 interactions
#4  Toma         ──         2.0 STX given   |  4 tips
#5  quests.btc   █          0.5 STX earned  |  1 interaction
```

**Panel 3 — On-Chain Proof (right)**
From stored txids in `agentEarningsLedger`
```
VERIFIED ON STACKS

premium-access-v2 · 2 min ago
ST3P...HWXE paid 1 STX → guide.btc
Txid: 0x96af...  [View on Hiro ↗]
```

### Why This Wins Judges
A judge can watch the World Feed update live, click a Hiro explorer link, and see the actual Clarity contract call on Stacks testnet — without playing the game at all. Directly demonstrates the Stacks Alignment criterion.

**Data sources:** All data already exists in Convex. This is a frontend-only page — no new backend needed.

---

## What Changes in the Codebase

### Files coming from finding-nakamoto (almost unchanged)

| Source file | Destination | Purpose |
|---|---|---|
| `src/lib/turnkey/client.ts` | `src/lib/turnkey/client.ts` | SDK init |
| `src/app/providers/TurnkeyProvider.tsx` | `src/providers/TurnkeyProvider.ts` | React context wrapper |
| `src/app/utils/core/signingUtils.ts` | `src/lib/turnkeySigningUtils.ts` | VRS signature formatter |
| `src/app/api/turnkey/grant-access/route.ts` | `services/x402-api/src/turnkeyProvision.ts` | Sub-org + wallet provisioning |
| `src/app/api/stacks/send-stx/route.ts` | reference for agent tip signing | STX transfer pattern |

### New files needed in tinyrealms

| File | Purpose |
|---|---|
| `convex/agents/agentTips.ts` | Mutation to trigger agent → player micro-STX tip |
| `src/screens/TurnkeyAuthScreen.ts` | New passkey login UI (replaces email form) |

### Schema changes

Add to `profiles` table in `convex/schema.ts`:
```typescript
turnkeyWalletAddress: v.optional(v.string()),
turnkeyOrgId: v.optional(v.string()),
turnkeyWalletId: v.optional(v.string()),
```

### x402 signing change

```
Current: src/lib/x402.ts → makeUnsignedSTXTokenTransfer → @stacks/connect popup
New:     src/lib/x402.ts → makeUnsignedSTXTokenTransfer → Turnkey signRawPayload
         (no popup, works on any device)
```

---

## Environment Variables Needed

Add to `services/x402-api/.env.local` and Render dashboard:

```bash
# Turnkey parent org (store only in local/server env, never in repo docs)
NEXT_PUBLIC_TURNKEY_ORGANIZATION_ID=your_turnkey_org_id
TURNKEY_API_PUBLIC_KEY=your_turnkey_api_public_key
TURNKEY_API_PRIVATE_KEY=your_turnkey_api_private_key

# Delegated API keys (STILL NEED TO CREATE in Turnkey dashboard)
TURNKEY_DELEGATED_API_PUBLIC_KEY=your_turnkey_delegated_api_public_key
TURNKEY_DELEGATED_API_PRIVATE_KEY=your_turnkey_delegated_api_private_key
```

Do not commit live Turnkey keys to this repo. Treat any key that has appeared in Git history, screenshots, chat logs, or shared docs as compromised and rotate it.

---

## What Delegated API Keys Are

Turnkey has two levels of keys:

**Parent API Keys** (already have)
- Belong to your root organization
- Used to create sub-organizations and provision wallets

**Delegated API Keys** (need to create)
- A second keypair for server-side automation
- Added as a "user" inside each sub-org with a policy allowing them to sign transactions
- Your server uses these to sign on behalf of agent/player wallets without the user present
- Private key never leaves Turnkey's HSM

**How to create:**
1. Turnkey Dashboard → your org → API Keys → Create new keypair
2. Copy the public + private key
3. That's your `TURNKEY_DELEGATED_API_PUBLIC_KEY` / `TURNKEY_DELEGATED_API_PRIVATE_KEY`

---

## Build Order (post-submission)

### Step 1 — Branch setup
```bash
cd /home/rv404/RV404-Lab/PRODUCTIVITY/Obsidian/Test-1a/Apps/tinyrealms
git checkout -b feature/turnkey-embedded-wallet
git push -u origin feature/turnkey-embedded-wallet
```

### Step 2 — Create delegated API keys in Turnkey dashboard
(Claude will walk through this step by step)

### Step 3 — Install Turnkey SDK
```bash
npm install @turnkey/react-wallet-kit @turnkey/sdk-server
```

### Step 4 — Wire auth (TurnkeyProvider + new AuthScreen)

### Step 5 — Convex schema update (add wallet fields to profiles)

### Step 6 — Agent tip flow (agentTips.ts mutation)

### Step 7 — Replace x402 browser signing with Turnkey signing

---

## Funding Model

- Turnkey wallets are real blockchain wallets — start at zero balance
- **Agent wallets** (already funded on testnet) send small STX tips to player addresses
- **Player's Turnkey wallet** receives tips passively — no action needed
- For x402 payments from player, STX comes from tips accumulated over time or testnet faucet

---

## Competitive Advantage This Adds

Against AlphaClaw and other submissions:
- No browser extension required — works on iPad, mobile, any device
- Agents can tip players — bidirectional economy, not just "pay the agent"
- Player wallet is part of identity from first login — not bolted on
- Directly fixes the UX weakness in hackathon judging criteria

---

## Before Starting Any of This

1. ✅ Deploy latest commit (done)
2. ⬜ Capture guide.btc premium txid
3. ⬜ Capture market.btc premium txid
4. ⬜ Capture Mel premium txid
5. ⬜ Screenshot World Feed showing premium-access-granted
6. ⬜ Record demo video
7. ⬜ Update submission.json with video URL and live demo URL
8. ⬜ Freeze release/dungeons-and-agents branch

**Do not touch the codebase until all of the above are done.**

---

## Claude Insights — 2026-03-20 05:30 IST

- Reference implementation is fully working at `/home/rv404/Dev/finding-nakamoto/sbtc-cool-turnkey-stacks-demo`
- Turnkey parent org keys are already configured in that repo's `.env.local` — delegated API keys are still placeholder, need to be created in Turnkey dashboard
- Branch `feature/turnkey-embedded-wallet` created locally and pushed to GitHub
- User is a creative, not an engineer — needs step-by-step execution guidance, not high-level direction
- The "pay it forward" framing from Toma is the cultural centerpiece — preserve this in the UX copy
- Toma tips 2 STX on first login only (guard: `if (!profile.turnkeyWalletAddress)`)
- Faucet wallet silently tops up to 5 STX total — not shown in World Feed
- Player address flows: Turnkey login → frontend has address → saved to Convex profile → agentTips.ts reads it → Toma tip fires
- World Ledger page (`/ledger`) is frontend-only — all data already exists in Convex, no new backend needed
- GitHub token `[REVOKED]` was exposed in chat — user must revoke it
- Codex: first action when starting this branch is `npm install @turnkey/react-wallet-kit @turnkey/sdk-server` then create delegated API keys in Turnkey dashboard
