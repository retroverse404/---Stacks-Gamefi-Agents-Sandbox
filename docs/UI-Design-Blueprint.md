# UI Design Blueprint

This document is the handoff map for rebuilding the TinyRealms frontend in Canva, Figma, or code.

The intent is to separate:
- what the app **is**
- what the user can **do**
- what data each screen needs
- what states each screen must support

Use this as the current design contract for the existing codebase, not as a final visual style guide.

---

## 1. Product Frame

TinyRealms is currently a shared 2D world app with these layers:

- **Entry layer**
  - auth
  - local dev bootstrap
  - profile selection
- **World layer**
  - PixiJS game canvas
  - mode-based editing and play
- **Overlay layer**
  - panels
  - popups
  - splash screens
- **Data layer**
  - Convex-backed profiles, maps, chat, NPCs, items, story, integrations

For a redesign, treat the frontend as four buckets:

1. `Entry screens`
2. `World shell`
3. `Editor/admin surfaces`
4. `Context overlays`

---

## 2. Top-Level App Flow

Current top-level flow in code:

```text
App bootstrap
  -> local dev auto-auth OR auth screen
  -> profile screen
  -> game shell
  -> optional splash overlays
```

Source references:
- [App.ts](src/App.ts)
- [GameShell.ts](src/ui/GameShell.ts)

### Core app states

| State | Meaning | Exit events |
|---|---|---|
| `booting` | app decides local-dev or normal auth path | auth ready, local bootstrap success, bootstrap failure |
| `auth` | email/password or guest entry | sign in, sign up, guest |
| `profile-select` | choose/create/delete character | select profile, new profile, sign out |
| `game-play` | world is active in play mode | mode switch, open panel, portal, reload |
| `game-build` | world is active in build mode | mode switch |
| `game-sprite-edit` | sprite editor active | mode switch |
| `game-npc-edit` | NPC editor active | mode switch |
| `game-item-edit` | item editor active | mode switch |
| `splash-overlay` | focused interaction layer above world | close, replace, push next splash |

---

## 3. Shared Objects You Must Preserve

These are the main UI-facing data objects.

### Profile

Source:
- [types.ts](src/engine/types.ts)

Key fields:
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
- `x`, `y`, `direction`

### Map

Key fields:
- `id`
- `name`
- `width`, `height`
- `tileWidth`, `tileHeight`
- `tilesetUrl`
- `layers`
- `collisionMask`
- `labels`
- `portals`
- `musicUrl`
- `ambientSoundUrl`
- `combatEnabled`
- `status`
- `mapType`
- `creatorProfileId`
- `editors`

### Portal

Key fields:
- `name`
- `x`, `y`, `width`, `height`
- `targetMap`
- `targetSpawn`
- `direction`
- `transition`

### Presence / player-in-world

Key fields:
- `profileId`
- `name`
- `spriteUrl`
- `x`, `y`
- `vx`, `vy`
- `direction`
- `animation`

### Splash overlay config

Source:
- [SplashTypes.ts](src/splash/SplashTypes.ts)

Key fields:
- `id`
- `transition`
- `pausesGame`
- `capturesInput`
- `transparent`

### App modes

Source:
- [types.ts](src/engine/types.ts)

Current modes:
- `play`
- `build`
- `sprite-edit`
- `npc-edit`
- `item-edit`

Do not redesign away the mode model unless you also plan a real architecture change.

---

## 4. Global Event Map

These are the highest-value UX events to map in your design system.

### Entry events

- `sign_in_clicked`
- `sign_up_clicked`
- `guest_join_clicked`
- `profile_selected`
- `new_profile_clicked`
- `profile_deleted`
- `sign_out_clicked`

### World shell events

- `mode_changed`
- `maps_opened`
- `travel_requested`
- `chat_opened`
- `chat_sent`
- `character_panel_opened`
- `panel_closed`

### In-world interaction events

- `npc_interacted`
- `dialogue_choice_selected`
- `guide_opened`
- `shop_opened`
- `inventory_opened`
- `battle_opened`
- `lore_opened`

### Editor/admin events

- `map_save`
- `map_metadata_changed`
- `sprite_saved`
- `npc_saved`
- `item_saved`
- `collision_painted`
- `portal_created`
- `label_created`

### System events

- `bootstrap_failed`
- `map_load_failed`
- `convex_query_failed`
- `permission_denied`
- `loading`
- `empty_state`
- `success_state`

Every major page should have loading, empty, success, and error states designed explicitly.

---

## 5. Page-By-Page UI Map

This is the actual screen inventory to design.

## 5.1 Auth Screen

Source:
- [AuthScreen.ts](src/ui/AuthScreen.ts)

### Purpose

Authenticate or enter as guest.

### Required content

- title
- subtitle
- email input
- password input
- `Sign In` button
- `Sign Up` button
- status/error message
- guest entry button

### Required states

- default
- sign-in loading
- sign-up loading
- validation error
- auth failure
- local-dev fallback failure

### Notes for redesign

- This screen can be rebuilt from scratch visually.
- Keep the two auth actions distinct.
- Keep guest entry visible.
- OAuth is not the current primary path in the hosted build.

## 5.2 Profile Screen

Source:
- [ProfileScreen.ts](src/ui/ProfileScreen.ts)

### Purpose

Select, create, inspect, or delete profiles.

### Required panels

- top bar
- profile card grid/list
- create-profile form
- account info panel
- superuser panel
- delete confirmation modal

### Required actions

- select profile
- create new character
- delete character
- open account
- open superuser tools
- sign out

### Required card content

- avatar
- profile name
- role badge
- level / HP / NPC count
- item count
- delete affordance

### Required states

- profile list populated
- no profiles
- create form open
- delete confirm
- account view
- superuser view
- live profile updates

## 5.3 Game Shell

Source:
- [GameShell.ts](src/ui/GameShell.ts)

### Purpose

Host the world canvas and all persistent overlays.

### Required layout zones

- full-screen world canvas
- top-left mode/action controls
- top-right mode label / status
- bottom-left chat entry point
- bottom-right character entry point
- modal/overlay layer above world

### Persistent shell objects

- Pixi canvas
- mode toggle
- HUD mode label
- chat panel
- character panel
- map browser
- editor panels
- splash host

### Major shell states

- guest shell
- player shell
- superuser shell
- editor-active shell
- splash-active shell
- engine-error shell

## 5.4 Mode Toggle

Source:
- [ModeToggle.ts](src/ui/ModeToggle.ts)

### Current buttons

- `Play`
- `Build`
- `Sprites`
- `NPCs`
- `Items`
- `Maps`
- `Sound`
- `Home / reload`

### Visibility rules

- non-admin users should not see build/editor modes
- guests should not get the map browser action

### Design requirement

Treat this as a primary world command bar, not a random utility strip.

## 5.5 HUD

Source:
- [HUD.ts](src/ui/HUD.ts)

### Current role

Very minimal. It only shows the current mode label.

### Likely redesign opportunity

This should probably become a real world status rail later:
- current mode
- current map
- contextual hint
- selected tool or target
- story or objective indicator

For now, preserve at least:
- visible mode state

## 5.6 Map Browser Overlay

Source:
- [MapBrowser.ts](src/ui/MapBrowser.ts)
- [MapBrowser.css](src/ui/MapBrowser.css)

### Purpose

Browse maps, travel, inspect map type, create new maps.

### Required sections

- header
- close button
- visibility legend
- map list
- per-map badges
- travel action
- owner/admin type controls
- create-map section

### Per-map card requirements

- map icon
- map name
- map dimensions
- portal count
- map type badge
- draft badge if relevant
- combat badge if relevant
- `Travel` or `Current`
- optional `Map Type` select and `Save Type`

### Create-map form requirements

- map name
- width
- height
- tileset
- music
- combat toggle
- map type
- create
- cancel
- inline status

### Required states

- loading maps
- empty list
- populated list
- current map highlighted
- create form collapsed
- create form expanded
- create success
- create failure

## 5.7 Chat Panel

Source:
- [ChatPanel.ts](src/ui/ChatPanel.ts)

### Purpose

World-level chat with unread state and inline send.

### Required pieces

- floating toggle button
- unread badge
- panel header
- close button
- messages list
- empty state
- input field
- send button

### Message types

- player chat
- NPC/system style message
- system error/status

### Required states

- closed
- open
- unread present
- empty
- hydrated with history
- send error

## 5.8 Character Panel

Source:
- [CharacterPanel.ts](src/ui/CharacterPanel.ts)

### Purpose

Profile/stats/items/NPC history panel for the active character.

### Required pieces

- floating open button
- panel header with avatar
- name and role badge
- level tag
- XP bar
- stats section
- items section
- NPCs met section
- current map info
- close button
- admin-only save-stats action

### Required states

- closed
- open
- player view
- admin-editable view
- empty items
- empty NPC history

## 5.9 Build Mode / Map Editor

Source:
- [MapEditorPanel.ts](src/editor/MapEditorPanel.ts)

### Purpose

Edit tiles, collisions, labels, portals, placed objects, placed items, and map metadata.

### Design guidance

This is one of the highest-complexity surfaces. Design it as a workstation, not a modal.

### Must-support tool groups

- tileset selection
- brush / erase / fill
- layer selection
- collision editing
- portal editing
- label editing
- placed objects management
- placed items management
- save / reset / status

### Required states

- no map loaded
- map loaded
- tool selected
- object selected
- save in progress
- save success
- save failure

## 5.10 Sprite Editor

Source:
- [SpriteEditorPanel.ts](src/sprited/SpriteEditorPanel.ts)

### Purpose

Manage sprite sheets and sprite definitions used in maps and characters.

### Must-support groups

- sheet selector
- preview
- animation selection
- sound assignment
- metadata/definition fields
- save controls

## 5.11 NPC Editor

Source:
- [NpcEditorPanel.ts](src/ui/NpcEditorPanel.ts)

### Purpose

Create and manage NPC profiles and placed NPC instances.

### Must-support groups

- NPC identity
- greeting/dialogue fields
- placement or instance data
- save status
- permission-sensitive controls

### Important distinction

Design for:
- `NPC profile`
- `NPC placed in map`

Those are related but not the same thing.

## 5.12 Item Editor

Source:
- [ItemEditorPanel.ts](src/ui/ItemEditorPanel.ts)

### Purpose

Define item records and item placement/editing workflows.

### Must-support groups

- item identity
- icon/tileset slice
- metadata
- placement behavior
- save status

## 5.13 Splash Screens

Source folder:
- [src/splash/screens](src/splash/screens)

Current splash inventory:
- `IntroSplash`
- `DialogueSplash`
- `GuideNpcSplash`
- `InventorySplash`
- `StatusSplash`
- `LoreSplash`
- `ShopSplash`
- `BattleSplash`
- `CutsceneSplash`

### Why this matters

These are not random popups. They are a formal overlay system with their own transitions and input capture rules.

### Required splash design states

For every splash type, design:
- entry state
- content state
- loading state if remote-backed
- close action
- replace/push follow-up path if multistep

### Most important splash types

#### Dialogue splash

Needs:
- NPC name
- dialogue text
- response list
- close/escape handling

#### Guide NPC splash

Needs:
- briefing header
- topic chooser
- live ecosystem data blocks
- premium offer block
- visible close action

#### Shop splash

Needs:
- item list
- cost display
- buy action
- inventory feedback

#### Battle splash

Needs:
- participants
- combat state
- action choices
- result messaging

---

## 6. Object-State Matrix For Design

Use this to decide what variants to design first.

| Object | Minimum variants |
|---|---|
| button | default, hover, active, disabled, loading, danger |
| panel | default, collapsed, expanded, empty, error |
| modal/splash | default, loading, error, dismissible |
| list item/card | default, hover, selected, current, disabled |
| badge | system, public, private, draft, combat, role |
| input | default, focused, filled, error, disabled |
| map card | default, hover, current, editable, system-only |
| profile card | default, hover, selected, superuser |
| chat message | self, other, NPC, system |

---

## 7. Design Order

If you are rebuilding from scratch, do it in this order:

1. `Shell primitives`
   - typography
   - spacing
   - buttons
   - cards
   - badges
   - inputs
   - modal frame
2. `Entry flow`
   - auth
   - profile selection
3. `Game shell`
   - top command bar
   - HUD
   - bottom utilities
4. `Core overlays`
   - map browser
   - character panel
   - chat panel
5. `Splash system`
   - dialogue
   - guide
   - shop
   - lore
6. `Editor workstations`
   - map editor
   - sprite editor
   - NPC editor
   - item editor

Do not start with editor screens first. They are the highest complexity and easiest to redesign badly without a shared component system.

---

## 8. Figma / Canva Deliverables Checklist

For each page or overlay, prepare:

- desktop frame
- mobile/narrow frame
- loading state
- empty state
- error state
- permission-limited state if relevant
- annotated button list
- annotated panel list
- annotated data requirements

Also prepare one shared component page for:

- buttons
- pills/badges
- cards
- form fields
- tabs or segmented controls
- modal/splash chrome
- editor rail layout

---

## 9. Recommended Rebuild Rule

When converting designs into code:

- preserve data contracts first
- preserve event flow second
- change visuals freely

That means the redesign should keep:
- the app state flow
- the object model
- the mode model
- the overlay model

But it can completely replace:
- colors
- typography
- spacing
- panel layout
- iconography
- motion

---

## 10. Immediate Next Design Doc

After this blueprint, the next useful artifact should be:

`UI Component Inventory`

That doc should list every reusable component with:
- name
- purpose
- props/data
- variants
- where it appears

That is the best bridge from design files into implementation.
