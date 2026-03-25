# Frontend Function Contract

This document defines the stable functional boundary between the frontend and the current TinyRealms backend.

Use it when:
- replacing the current UI
- designing in Figma or Canva
- rebuilding screens in React, Svelte, vanilla DOM, or another client
- deciding what is presentation-only versus system-critical

The goal is simple:

- **frontend is replaceable**
- **behavior contracts are not**

Important current limitation:

- several important overlays are still implemented as DOM + inline styles + embedded copy in one TypeScript file
- this means the frontend is replaceable in principle, but not yet frictionless to redesign in practice

---

## 1. Product Rule

The current frontend should be treated as temporary scaffolding.

What must remain stable:
- data objects
- event flow
- queries / mutations / actions
- mode model
- overlay model

What can be replaced freely:
- styling
- layout
- motion
- typography
- iconography
- wording, if it preserves meaning

Reference:
- [UI-Design-Blueprint.md](docs/UI-Design-Blueprint.md)

---

## 2. Architecture Boundary

### Frontend responsibilities

- render entry screens
- render world shell
- render editor and overlay surfaces
- collect user input
- call backend queries / mutations / actions
- display loading, empty, success, and error states

### Backend responsibilities

- auth/session validation
- profile persistence
- map storage
- placed object persistence
- world item persistence
- NPC runtime
- chat persistence
- story/AI generation
- external integrations
- premium-offer metadata

### Strict rule

Frontend should not call third-party services directly.

External services should flow through Convex adapters:
- Zero Authority
- Tenero
- Braintrust
- future x402 services

Additional rule:

Frontend should also avoid becoming the source of truth for:

- market ranking
- payment status
- opportunity freshness
- agent state transitions

Reference:
- [convex/integrations/README.md](convex/integrations/README.md)

---

## 3. Core Frontend Modules

Current module map:

| Layer | Current module(s) | Purpose |
|---|---|---|
| app flow | [App.ts](src/App.ts) | boot, auth flow, local-dev bootstrap |
| world shell | [GameShell.ts](src/ui/GameShell.ts) | canvas + shell UI |
| shell controls | [ModeToggle.ts](src/ui/ModeToggle.ts), [HUD.ts](src/ui/HUD.ts) | mode and persistent status |
| shell panels | `ChatPanel`, `CharacterPanel`, `MapBrowser` | persistent world tools |
| editors | `MapEditorPanel`, `SpriteEditorPanel`, `NpcEditorPanel`, `ItemEditorPanel` | admin / creator tools |
| overlay system | [SplashTypes.ts](src/splash/SplashTypes.ts), `SplashHost`, `SplashManager`, splash screens | focused interaction screens |

---

## 4. Screen-To-Backend Map

This is the most important section for a replacement frontend.

## 4.1 Auth Screen

Source:
- [AuthScreen.ts](src/ui/AuthScreen.ts)

### Inputs

- `email`
- `password`
- `flow = signIn | signUp`

### Actions

- local auth manager sign-in
- local auth manager sign-up
- guest join

### Backend dependency

Indirect through auth manager, not direct `api.*` calls in this screen.

### Required states

- idle
- checking session
- signing in
- signing up
- session resumed
- auth error
- guest entry

### Frontend replacement rule

You may redesign the screen completely, but you must preserve:
- sign-in
- sign-up
- guest path
- local-dev compatibility

## 4.2 Profile Screen

Source:
- [ProfileScreen.ts](src/ui/ProfileScreen.ts)

### Reads

- `api.profiles.list`
- `api.maps.listStartMaps`
- `api.admin.myAccountInfo`
- `api.profiles.get`
- `api.profiles.list` live subscription

### Writes

- `api.profiles.create`
- `api.profiles.remove`
- superuser calls through `(api as any).superuser`

### Key events

- select profile
- create profile
- delete profile
- open account panel
- open superuser panel
- sign out

### Required state handling

- profile list
- empty profile list
- create-profile success/failure
- delete confirm
- account info loading/error
- superuser controls visible/hidden

## 4.3 Game Shell

Source:
- [GameShell.ts](src/ui/GameShell.ts)

### Inputs

- active `ProfileData`
- active `Game`
- current mode

### Subsystems it owns

- map browser
- chat panel
- map editor
- sprite editor
- NPC editor
- item editor
- character panel
- splash host

### Key shell events

- `onTravel(mapName)`
- `onMapChanged(mapName)`
- `onModeChange(mode)`
- `onToggleSound()`

### Replacement rule

Any future frontend needs a shell-level controller that can:
- mount the canvas
- switch mode
- route panel visibility
- survive map changes
- host modal/overlay layers

## 4.4 Map Browser

Source:
- [MapBrowser.ts](src/ui/MapBrowser.ts)

### Reads

- `api.maps.listSummaries`

### Writes

- `api.maps.updateMetadata`
- `api.maps.create`

### Key events

- open browser
- close browser
- travel to map
- update map visibility type
- create map

### Required data per map row

- `name`
- `width`, `height`
- `portalCount`
- `mapType`
- `status`
- `combatEnabled`
- `ownedByCurrentUser`

### Functional rule

This screen is not just visual navigation. It is also the policy surface for:
- travel
- map visibility
- map creation

## 4.5 Chat Panel

Source:
- [ChatPanel.ts](src/ui/ChatPanel.ts)

### Reads

- `api.chat.listRecent`

### Writes

- `api.chat.send`

### Key state

- open / closed
- unread count
- hydrated initial history
- send failure

### Functional rule

Chat is currently world-level, not map-scoped, because the query is called with `mapName: undefined`.

Any new frontend should preserve that intentionally unless backend behavior is changed.

## 4.6 Character Panel

Source:
- [CharacterPanel.ts](src/ui/CharacterPanel.ts)

### Reads

- profile already present in game shell

### Writes

- `api.profiles.updateStats`
- `api.profiles.removeItem`

### Key functions

- inspect stats
- inspect XP
- inspect inventory
- inspect met NPCs
- admin stat edits

### Functional rule

This panel mixes readonly player-facing data with admin-only editing. That distinction should remain explicit in any redesign.

## 4.7 Map Editor

Source:
- [MapEditorPanel.ts](src/editor/MapEditorPanel.ts)

### Reads

- `api.spriteDefinitions.list`
- `api.items.list`
- `api.maps.getByName`
- `api.maps.listSummaries`
- `api.mapObjects.listByMap`
- `api.worldItems.listByMap`

### Writes

- `api.maps.saveFullMap`
- `api.mapObjects.bulkSave`
- `api.worldItems.bulkSave`

### Functional groups

- map load
- map save
- collision editing
- layer editing
- label editing
- portal editing
- object placement
- item placement

### Functional rule

This is the single most state-heavy surface in the app. A replacement frontend should treat it like a workstation with explicit tool state, not just a pretty sidebar.

## 4.8 Sprite Editor

Source:
- [SpriteEditorPanel.ts](src/sprited/SpriteEditorPanel.ts)

### Reads

- `api.spriteDefinitions.list`

### Writes

- `api.spriteDefinitions.save`
- `api.spriteDefinitions.remove`

### Functional rule

This screen is definition management, not just art preview.

## 4.9 NPC Editor

Source:
- [NpcEditorPanel.ts](src/ui/NpcEditorPanel.ts)

### Reads

- `api.spriteDefinitions.list`
- `api.npcProfiles.listInstances`

### Writes

- `api.spriteDefinitions.save`
- `api.spriteDefinitions.remove`
- `api.npcProfiles.assignInstanceName`
- `api.npcProfiles.save`
- `api.npcProfiles.remove`

### Functional rule

There are two different objects here:
- sprite definition
- NPC profile / instance

Do not collapse them into one UI object without redesigning the backend meaning.

## 4.10 Item Editor

Source:
- [ItemEditorPanel.ts](src/ui/ItemEditorPanel.ts)

### Reads

- `api.items.list`

### Writes

- `api.items.save`
- `api.items.remove`

## 4.11 Guide NPC Splash

Source:
- [GuideNpcSplash.ts](src/splash/screens/GuideNpcSplash.ts)

### Reads

- `integrations/zeroAuthority:guideSnapshot`
- `integrations/x402:getOffer`
- `agents/stateMachine:get`

### Writes

- `agents/stateMachine:transition`

### Actions

- `story/storyAi:generateDialogue`

### Functional rule

This screen is currently doing three jobs:
- ecosystem education
- live cached ecosystem context
- premium-offer preview

That is functionally valid, but visually it should probably be decomposed later.

### Important wording note

The current CTA text `Open premium brief` is weak.

If the offer is only metadata, the safer temporary wording is one of:
- `Unlock premium stack`
- `View premium offer`
- `Inspect premium contract`

If real payment execution is not live, do not imply payment was completed.

---

## 5. Shared Domain Objects

Frontend rebuilds should continue to treat these as first-class objects:

### `ProfileData`

Source:
- [types.ts](src/engine/types.ts)

Fields used heavily by UI:
- `_id`
- `name`
- `spriteUrl`
- `color`
- `role`
- `stats`
- `items`
- `npcsChatted`
- `mapName`
- `startLabel`

### `MapData`

Fields used heavily by world/editor UI:
- `name`
- `width`, `height`
- `tileWidth`, `tileHeight`
- `tilesetUrl`
- `layers`
- `collisionMask`
- `labels`
- `portals`
- `musicUrl`
- `combatEnabled`
- `status`
- `mapType`

### `PresenceData`

Fields used for world rendering:
- `profileId`
- `name`
- `spriteUrl`
- `x`, `y`
- `direction`
- `animation`

### `SplashConfig`

Used by overlay system:
- `id`
- `create`
- `transition`
- `pausesGame`
- `capturesInput`
- `transparent`

---

## 6. Required UI State Categories

Every replacement frontend should explicitly design and implement these state classes:

### Fetch state

- `idle`
- `loading`
- `success`
- `empty`
- `error`

### Permission state

- guest
- player
- superuser

### Interaction state

- closed
- open
- selected
- disabled
- pending

### Save lifecycle

- unsaved
- saving
- saved
- failed

---

## 7. Minimal Frontend Requirements

A replacement frontend is valid if it can do all of this:

1. authenticate or enter as guest
2. list / create / delete / select profiles
3. enter the world with a selected profile
4. move through maps and portals
5. show world chat
6. show character state
7. browse maps and travel
8. support mode switching
9. support editor/admin surfaces
10. render splash overlays
11. consume backend integrations through Convex, not directly

If those are preserved, the shell can be visually rebuilt from scratch.

---

## 8. Frontend Swap Strategy

If the goal is “any frontend should work with this repo,” build around this order:

### Phase 1

Preserve the current backend and write:
- a `frontend contract` doc
- a `component inventory` doc
- a `screen event registry`

### Phase 2

Build a new shell that only covers:
- auth
- profile
- world shell
- chat
- character panel
- map browser

### Phase 3

Port:
- splash system
- guide flow
- editors

### Phase 4

Only after functional parity:
- visual polish
- motion system
- brand treatment
- full UI kit

That order matches your stated priority: function and modularity first, cosmetics later.

---

## 9. Recommendation

For now, treat the current UI as an operator console.

Do not spend time trying to make the existing DOM UI beautiful.
Do spend time making sure:
- every screen has a clear purpose
- every interaction has a backend contract
- every object and state is documented
- every external integration remains adapter-based

That is the correct base for a future full redesign.
