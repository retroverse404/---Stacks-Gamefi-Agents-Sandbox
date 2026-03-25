# Frontend Screen Spec

Updated: 2026-03-14

## Purpose

This document is the screen-by-screen frontend handoff for current TinyRealms.

Use it when:

- designing screens separately in Canva or Figma
- mapping new visual concepts onto existing code
- rebuilding the frontend without breaking current behavior

This is intentionally grounded in the current codebase.

---

## 1. App Flow

Current flow:

```text
App bootstrap
  -> auth screen or local-dev bootstrap
  -> profile selection
  -> game shell
  -> overlay/splash interactions
```

Primary references:

- [App.ts](src/App.ts)
- [GameShell.ts](src/ui/GameShell.ts)

---

## 2. Screen Inventory

## 2.1 Auth Screen

Source:

- [AuthScreen.ts](src/ui/AuthScreen.ts)
- [AuthScreen.css](src/ui/AuthScreen.css)

### Purpose

Authenticate or enter as guest.

### Current visible text

- Title: `Tiny Realms`
- Subtitle: `A persistent shared world`

Inputs:

- `Email`
- `Password (min 8 chars)`

Buttons:

- `Sign In`
- `Sign Up`
- `or explore as a guest`

### States

- checking session
- signing in
- signing up
- signed in
- session expired
- auth error
- guest entry

### Replacement rule

The design may change completely, but these functions must remain:

- sign in
- sign up
- guest join
- local-dev compatibility

---

## 2.2 Profile Screen

Source:

- [ProfileScreen.ts](src/ui/ProfileScreen.ts)
- [ProfileScreen.css](src/ui/ProfileScreen.css)

### Purpose

Select, create, delete, and inspect player profiles.

### Current visible text

Top actions:

- `Account`
- `Superuser`
- `Sign Out`

Heading:

- `Choose Your Character`
- `Select a profile or create a new character to enter the world`

New-card CTA:

- `New Character`

Create form:

- `Create Character`
- `Name`
- `Choose Sprite`
- `Starting world`
- `Starting position`
- `Create & Play`
- `Back`

Delete dialog:

- `Cancel`
- `Delete`
- `Deleting...`

### Dynamic card text

Each profile card can show:

- name
- `superuser`
- `Lv {level}`
- `HP {hp}/{maxHp}`
- `{n} NPCs`
- `{itemCount} items`

### Replacement rule

Preserve:

- profile listing
- live update behavior
- delete confirmation
- create flow
- account/superuser access

---

## 2.3 Game Shell

Source:

- [GameShell.ts](src/ui/GameShell.ts)
- [GameShell.css](src/ui/GameShell.css)

### Purpose

Host the Pixi world canvas and all persistent UI.

### Current shell-owned surfaces

- canvas
- mode toggle
- HUD
- map browser
- chat panel
- character panel
- editors
- splash host
- debug panel in dev

### Replacement rule

Future frontend work should preserve `GameShell` as the shell controller even if the visible UI changes.

---

## 2.4 HUD

Source:

- [HUD.ts](src/ui/HUD.ts)

### Purpose

Show the current mode.

### Current text pattern

- `PLAY MODE`
- `BUILD MODE`
- `SPRITE-EDIT MODE`
- `NPC-EDIT MODE`
- `ITEM-EDIT MODE`

### Future expansion candidate

This is the safest place to add:

- market ticker
- network status
- live snapshot timestamp

---

## 2.5 Mode Toggle

Source:

- [ModeToggle.ts](src/ui/ModeToggle.ts)

### Purpose

Mode switcher and shell utility control.

### Current labels

- `Play`
- `Build`
- `Sprites`
- `NPCs`
- `Items`

Icon-only buttons:

- maps button: globe icon
- sound button: speaker / mute icon
- home button: back to character select

### Replacement rule

The visual presentation can change, but the mode model must stay stable unless the architecture changes too.

---

## 2.6 Map Browser

Source:

- [MapBrowser.ts](src/ui/MapBrowser.ts)
- [MapBrowser.css](src/ui/MapBrowser.css)

### Purpose

Browse, create, edit, and travel to maps.

### Current visible text

- eyebrow: `Atlas desk`
- title: `World Maps`
- subtitle: `Travel, manage access, and shape the public face of the world.`

Legend badges:

- `Private`
- `Public`
- `System`
- `Draft`
- `Combat`

Loading and empty states:

- `Loading maps...`
- `No maps yet. Create one below!`

### Replacement rule

This can be redesigned heavily, but map browsing and travel are core system functions.

---

## 2.7 guide.btc Splash

Source:

- [GuideNpcSplash.ts](src/splash/screens/GuideNpcSplash.ts)
- [stacksGuideContext.ts](src/story/content/stacksGuideContext.ts)

### Purpose

Teach the Stacks ecosystem, show cached ecosystem context, and preview future premium content.

### Current visible text

Hero:

- `Stacks briefing desk`
- `{npcName}` currently `guide.btc`
- `Ecosystem guide powered by verified notes and Zero Authority cache`
- `Learn the Stacks ecosystem, inspect live cached opportunities, and preview premium x402-backed briefings without leaving the world.`

Hero pills:

- `Zero Authority live cache`
- `Stacks education`
- `Premium content via x402`

Status initial:

- `Loading backend context…`

Topic cards:

- `Stacks basics`
- `sBTC and yield`
- `Agents and skills`
- `Opportunities`
- `News and signals`

Live rail:

- `Live ecosystem snapshot`

Premium rail:

- `Premium stack via x402`
- `Unlock premium stack`

Footer:

- `Built for learning, discovery, and future paid actions on Stacks. Press Esc or click outside to close.`
- `Close guide`

### Required states

- loading backend context
- viewing authored intro
- topic response loading
- topic response success
- topic response error
- live cache unavailable
- premium offer loaded
- premium offer unavailable

### Replacement rule

This screen is a high-priority redesign candidate, but it must keep:

- guide topic structure
- live snapshot rail
- premium offer rail
- explicit source framing

---

## 2.8 Existing Utility Splashes

Current utility overlays include:

- [ShopSplash.ts](src/splash/screens/ShopSplash.ts)
- [InventorySplash.ts](src/splash/screens/InventorySplash.ts)
- [StatusSplash.ts](src/splash/screens/StatusSplash.ts)
- [BattleSplash.ts](src/splash/screens/BattleSplash.ts)
- [LoreSplash.ts](src/splash/screens/LoreSplash.ts)

These are useful as behavior references, but they are visually inconsistent and should not be treated as a finished design system.

---

## 3. Replaceable vs Stable

## Replaceable

- layout
- spacing
- colors
- motion
- typography
- iconography
- visual hierarchy

## Stable

- app flow
- mode model
- splash stack behavior
- Convex calls
- input/output behavior
- panel-level responsibilities

---

## 4. Modding Recommendation

If you design separately, map your mockups to these buckets:

1. entry shell
2. shell controls
3. context overlays
4. data widgets

Do not invent a completely new app flow first.

Map your designs onto the current screens and component responsibilities.
That will keep implementation faster and safer.

---

## 5. Best Next UI Targets

The best screens to redesign first are:

1. `ProfileScreen`
2. `AuthScreen`
3. `guide.btc`
4. `HUD` with future market strip
5. one future terminal/kiosk popup

That sequence gives the most visible payoff while staying aligned with the current code.
