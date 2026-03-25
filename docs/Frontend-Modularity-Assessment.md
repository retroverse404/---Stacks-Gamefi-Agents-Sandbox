# Frontend Modularity Assessment

Updated: 2026-03-14

## Purpose

This document evaluates how modular the current TinyRealms frontend actually is, and what needs to improve before a separate design workflow becomes easy and low-risk.

This is not a visual style guide.
This is a structural assessment of:

- how well the frontend is separated from backend logic
- how easily the UI can be redesigned
- how safe it is to map external designs onto the current code

---

## Executive Summary

The frontend is **partly modular**, but not yet clean enough for frictionless redesign.

Current rating:

- world/runtime separation: **good**
- backend integration separation: **good**
- overlay architecture: **good**
- screen-level replaceability: **medium**
- design-system maturity: **weak to medium**
- styling separation: **mixed**

The important truth:

- the project is already modular enough to keep building
- it is not yet modular enough to make UI redesign effortless

The biggest blocker is not PixiJS.
The biggest blocker is that several UI surfaces still mix:

- structure
- copy
- visual styling
- transient behavior

inside single TypeScript files.

---

## What Is Already Modular

## 1. Runtime vs UI

The game runtime is clearly separated from overlay UI:

- world runtime lives in `src/engine`
- shell UI lives in `src/ui`
- modal overlays live in `src/splash`

This is the strongest architectural win in the frontend.

Key references:

- [GameShell.ts](src/ui/GameShell.ts)
- [SplashHost.ts](src/splash/SplashHost.ts)
- [SplashManager.ts](src/splash/SplashManager.ts)

## 2. Backend vs Frontend

The current frontend mostly talks to Convex or the local auth manager, not directly to third-party APIs.

That is correct.

External integrations are already being routed through backend adapters:

- Zero Authority
- Tenero
- Braintrust
- x402 offer metadata

That means a future frontend redesign does not need to re-solve external API logic.

## 3. Splash / Overlay Model

The splash stack is a strong abstraction.

It already gives us:

- push/pop/replace overlay flow
- top-layer ownership
- `Escape` behavior
- optional pause semantics
- transparent vs modal layers

That makes the overlay system a good long-term UI composition point.

---

## What Is Not Modular Enough Yet

## 1. Inline Style Coupling

Several important overlays are still authored as DOM + inline style systems in TypeScript.

Examples:

- [GuideNpcSplash.ts](src/splash/screens/GuideNpcSplash.ts)
- [ShopSplash.ts](src/splash/screens/ShopSplash.ts)
- [BattleSplash.ts](src/splash/screens/BattleSplash.ts)

This creates three problems:

1. redesign requires code edits instead of style swaps
2. copy, layout, and behavior are tightly bundled
3. reusable components are harder to establish

## 2. Copy Is Embedded In Components

Many strings are still authored directly inside screen builders.

Examples:

- [ProfileScreen.ts](src/ui/ProfileScreen.ts)
- [AuthScreen.ts](src/ui/AuthScreen.ts)
- [GuideNpcSplash.ts](src/splash/screens/GuideNpcSplash.ts)

This is acceptable for a fast-moving prototype, but it is not ideal for:

- separate design handoff
- content iteration
- localization
- variant-based theming

## 3. Shared Component Vocabulary Is Weak

There is no unified reusable component layer yet for:

- glass panel
- CTA button
- section header
- stat tile
- market ticker item
- premium card
- terminal panel

Those patterns exist visually, but not as reusable frontend primitives.

## 4. Design Tokens Are Fragmented

Some screens use CSS variables well:

- [AuthScreen.css](src/ui/AuthScreen.css)
- [ProfileScreen.css](src/ui/ProfileScreen.css)

Other surfaces define their visual system ad hoc inside TS files.

That means:

- theme consistency is fragile
- future reactive/audio styling will be inconsistent
- replacement work is higher than it should be

---

## Current Frontend Composition Points

These are the safest frontend replacement boundaries.

## 1. Entry Layer

Replaceable with relatively low risk:

- [AuthScreen.ts](src/ui/AuthScreen.ts)
- [ProfileScreen.ts](src/ui/ProfileScreen.ts)

These should become the first clean design targets.

## 2. Shell Layer

Stable controller:

- [GameShell.ts](src/ui/GameShell.ts)

This should remain the shell controller even if the visual shell is redesigned.

## 3. Overlay Layer

Stable interaction container:

- [SplashHost.ts](src/splash/SplashHost.ts)
- [SplashManager.ts](src/splash/SplashManager.ts)

This is the correct place to preserve behavior while replacing presentation.

## 4. Data/Interaction Contract

The frontend should continue to treat these as behavioral contracts:

- auth/session state
- profile list/create/remove/select
- mode changes
- map browser actions
- splash push/pop/replace
- Convex-backed reads/writes

---

## Refactor Priorities

## Phase 1: Low-Risk Cleanup

Do this before any large redesign:

1. move more inline styles into CSS modules/files
2. extract screen copy into constants/config where practical
3. create base classes or tokens for:
   - panel
   - card
   - button
   - badge
   - status text

## Phase 2: Screen Contract Stabilization

Every important screen should have:

- purpose
- inputs
- outputs
- states
- visible copy

Start with:

- auth
- profile select
- guide.btc
- map browser
- future market ticker

## Phase 3: Visual System

Create a thin reusable system for:

- dark glass surfaces
- border treatments
- light-on-dark readable text hierarchy
- motion tokens
- audio-reactive hooks

---

## Recommended Frontend Rule Set

Use these rules from now on:

1. Backend data and integrations stay out of direct presentation files.
2. New overlays should not define their full visual system inline if avoidable.
3. New UI work should prefer reusable classes/tokens over one-off style strings.
4. Any new screen should ship with explicit states:
   - idle
   - loading
   - success
   - empty
   - error
5. New gameplay-facing UI should be designed as:
   - node
   - state
   - event surface

---

## Practical Conclusion

The frontend is modular enough to keep building.

It is not modular enough yet to support:

- effortless redesign
- parallel frontend experimentation
- large-scale visual iteration

without some discipline.

The good news is that this can be fixed incrementally.

The right next move is not a rewrite.
The right next move is:

- preserve the current architecture
- harden the frontend contracts
- make the visual layer more replaceable

That keeps the project shippable while improving future flexibility.
