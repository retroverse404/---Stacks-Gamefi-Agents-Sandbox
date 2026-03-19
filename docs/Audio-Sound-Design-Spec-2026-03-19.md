# Audio System and Sound Design Spec

Last updated: 2026-03-19

Purpose:
- evaluate the current audio architecture truthfully
- define a judge-facing sound design pass
- give a practical spec for a UI/SFX session without overbuilding

Audience:
- sound design session
- UX polish pass
- hackathon demo prep

## Executive Summary

The app already has a real audio runtime, but it is not yet a unified audio system.

Current reality:
- world music is live
- profile-screen soundtrack is live
- object ambient loops are live
- object one-shot interactions are live
- door open/close SFX are live
- NPC greeting and ambient SFX are live
- item pickup SFX are live

Current limits:
- UI sounds are mostly not wired
- there is no central audio event catalog
- there are no named mix buses beyond music vs SFX
- `SpatialAudio.ts` exists but is not the live path
- profile-screen audio uses a separate `HTMLAudioElement` path instead of the main `AudioManager`

For hackathon impact, the best move is not "more audio tech". The best move is a small, intentional set of high-value sounds that make the world feel premium and legible.

## Current Architecture Truth

## Live runtime path

Primary live audio engine:
- [`src/engine/AudioManager.ts`](/home/rv404/RV404-Lab/PRODUCTIVITY/Obsidian/Test-1a/Apps/tinyrealms/src/engine/AudioManager.ts)

What it currently does:
- creates one `AudioContext` on first user gesture
- has separate master gain nodes for:
  - music
  - SFX
- supports:
  - looping background music
  - looping ambient sounds
  - one-shot SFX
  - mute toggle
  - playback snapshot/restore for premium video overlay transitions
- caches decoded buffers by URL

Key integration points:
- game creates the audio manager in [`src/engine/Game.ts#L246`](/home/rv404/RV404-Lab/PRODUCTIVITY/Obsidian/Test-1a/Apps/tinyrealms/src/engine/Game.ts#L246)
- audio unlock on first click/key in [`src/engine/Game.ts#L300`](/home/rv404/RV404-Lab/PRODUCTIVITY/Obsidian/Test-1a/Apps/tinyrealms/src/engine/Game.ts#L300)
- mute toggle on `M` in [`src/engine/Game.ts#L309`](/home/rv404/RV404-Lab/PRODUCTIVITY/Obsidian/Test-1a/Apps/tinyrealms/src/engine/Game.ts#L309)
- map music playback in [`src/engine/Game.ts#L421`](/home/rv404/RV404-Lab/PRODUCTIVITY/Obsidian/Test-1a/Apps/tinyrealms/src/engine/Game.ts#L421)
- premium video temporarily pauses world music in [`src/engine/Game.ts#L2230`](/home/rv404/RV404-Lab/PRODUCTIVITY/Obsidian/Test-1a/Apps/tinyrealms/src/engine/Game.ts#L2230)

## Spatial ambient path actually in use

Object ambient audio:
- object sounds start in [`src/engine/ObjectLayer.ts#L302`](/home/rv404/RV404-Lab/PRODUCTIVITY/Obsidian/Test-1a/Apps/tinyrealms/src/engine/ObjectLayer.ts#L302)
- object ambient volumes are updated every frame in [`src/engine/ObjectLayer.ts#L358`](/home/rv404/RV404-Lab/PRODUCTIVITY/Obsidian/Test-1a/Apps/tinyrealms/src/engine/ObjectLayer.ts#L358)
- the game calls this updater in [`src/engine/Game.ts#L1028`](/home/rv404/RV404-Lab/PRODUCTIVITY/Obsidian/Test-1a/Apps/tinyrealms/src/engine/Game.ts#L1028)

NPC ambient audio:
- NPC ambient starts in [`src/engine/EntityLayer.ts#L240`](/home/rv404/RV404-Lab/PRODUCTIVITY/Obsidian/Test-1a/Apps/tinyrealms/src/engine/EntityLayer.ts#L240)
- NPC ambient attenuation is updated in [`src/engine/EntityLayer.ts#L621`](/home/rv404/RV404-Lab/PRODUCTIVITY/Obsidian/Test-1a/Apps/tinyrealms/src/engine/EntityLayer.ts#L621)

This means the live architecture already supports simple spatial mixing through distance-based volume, but not true stereo scene design.

## Prototype path not currently wired

There is also:
- [`src/engine/SpatialAudio.ts`](/home/rv404/RV404-Lab/PRODUCTIVITY/Obsidian/Test-1a/Apps/tinyrealms/src/engine/SpatialAudio.ts)

Important truth:
- it is not referenced by the live app
- it appears to be an unused prototype for panning + panner nodes
- do not build the hackathon sound pass on this file tonight

## Separate profile-screen audio path

Profile/character-select soundtrack:
- uses `new Audio(...)` in [`src/ui/ProfileScreen.ts#L1341`](/home/rv404/RV404-Lab/PRODUCTIVITY/Obsidian/Test-1a/Apps/tinyrealms/src/ui/ProfileScreen.ts#L1341)
- has its own enable/toggle flow in [`src/ui/ProfileScreen.ts#L1365`](/home/rv404/RV404-Lab/PRODUCTIVITY/Obsidian/Test-1a/Apps/tinyrealms/src/ui/ProfileScreen.ts#L1365)

This is fine for now, but it means the app has two audio control paths:
- `AudioManager` for world audio
- `HTMLAudioElement` for profile soundtrack

That split is acceptable for the submission build, but it is not ideal long-term.

## Current Audio Data Model

The schema already supports sound assignment on world content.

Sprite definitions:
- ambient loop
- ambient radius
- ambient volume
- interact/greeting one-shot
- toggleable "on" loop
- door open one-shot
- door close one-shot

Source:
- [`convex/schema.ts#L124`](/home/rv404/RV404-Lab/PRODUCTIVITY/Obsidian/Test-1a/Apps/tinyrealms/convex/schema.ts#L124)

Item definitions:
- pickup one-shot

Source:
- [`convex/schema.ts#L618`](/home/rv404/RV404-Lab/PRODUCTIVITY/Obsidian/Test-1a/Apps/tinyrealms/convex/schema.ts#L618)

Map data:
- `musicUrl`

Source:
- [`src/engine/types.ts#L52`](/home/rv404/RV404-Lab/PRODUCTIVITY/Obsidian/Test-1a/Apps/tinyrealms/src/engine/types.ts#L52)

Editor support already exists:
- map music picker in [`src/editor/MapEditorPanel.ts#L1599`](/home/rv404/RV404-Lab/PRODUCTIVITY/Obsidian/Test-1a/Apps/tinyrealms/src/editor/MapEditorPanel.ts#L1599)
- sprite sound fields in [`src/sprited/SpriteEditorPanel.ts#L371`](/home/rv404/RV404-Lab/PRODUCTIVITY/Obsidian/Test-1a/Apps/tinyrealms/src/sprited/SpriteEditorPanel.ts#L371)
- item pickup sound field in [`src/ui/ItemEditorPanel.ts#L342`](/home/rv404/RV404-Lab/PRODUCTIVITY/Obsidian/Test-1a/Apps/tinyrealms/src/ui/ItemEditorPanel.ts#L342)

## Current Asset Reality

Existing audio assets in `public/assets/audio/` already cover:
- background music
- rain
- fire
- vinyl
- writing desk
- book
- clock
- chicken
- door open/close
- fire start
- item pickup

This is enough to create a polished judge-facing audio pass without inventing a whole new library.

## Evaluation

Current score for audio architecture:
- foundation: strong enough for hackathon polish
- consistency: medium
- extensibility: good
- UX completeness: incomplete

What is good:
- audio is not faked; it is integrated into game systems
- sound data is already attached to world objects and items
- music pause/resume around premium media is a nice touch
- there is already a mute button and hotkey

What is weak:
- no dedicated UI SFX layer
- no one naming convention for sound intent
- no central table of "which interaction should sound like what"
- volume balancing is manual and scattered
- no ducking, limiting, or bus-based mixing
- profile and world audio are separate systems

## Hackathon Goal

The sound pass should sell three things to judges:
- the world feels alive
- interactions feel intentional
- premium moments feel premium

The sound pass should not try to simulate a full RPG audio engine.

## Judge-Facing Sound Design Spec

## Priority 1: must-have sounds

These are the highest leverage sounds for presentation.

1. UI confirmation/click
- every major button press should feel deliberate
- especially:
  - login
  - create/select character
  - close/open overlay
  - map/browser open

2. Hover/focus hint
- subtle sound on important hover/focus targets
- use sparingly on premium CTAs and main nav only

3. Error/reject
- wrong action
- unavailable premium action
- failed auth/payment/message state

4. Success/confirm
- profile selected
- login success
- purchase/unlock success
- item pickup success

5. NPC interaction cue
- one short tactile sound when conversation opens
- current per-NPC greeting can cover part of this

6. Premium unlock stinger
- short branded "you unlocked something real" sound
- should play on paid content success, not before payment

7. Object one-shots
- bookshelf
- phonograph
- fireplace
- desk
- door

8. Environmental loops
- fire crackle
- vinyl/phonograph
- clock tick
- rain

## Priority 2: strong polish sounds

These add richness if time allows.

1. Map transition whoosh
2. Dialogue open/close soft paper or panel sound
3. World-feed event ping for meaningful events only
4. Quest/objective update chime
5. Ambient zone accents for:
   - study wing
   - music corner
   - tavern/bar hub

## Priority 3: defer until after submission

Do not spend tonight on:
- footsteps for every surface
- combat soundscape overhaul
- procedural music system
- true 3D spatial panning
- NFT/media ownership-triggered audio logic
- adaptive stem mixing

## Interaction-to-Sound Matrix

This is the session checklist.

| Interaction | Current hook exists | Recommended sound type | Priority |
| --- | --- | --- | --- |
| profile screen soundtrack | yes | looping identity track | P1 |
| map loads / world enters | partly | soft arrival stinger | P2 |
| mute/unmute | yes UI control exists | subtle toggle click | P2 |
| button click | no central hook | short UI click | P1 |
| button hover on important CTA | no | soft tick/chime | P2 |
| auth success | no dedicated sound | soft confirm swell | P1 |
| auth failure | no dedicated sound | short reject blip | P1 |
| NPC speak/open surface | yes | per-NPC one-shot or shared convo cue | P1 |
| item pickup | yes | short collectible tick | P1 |
| object toggle on | yes | tactile activation sound | P1 |
| object toggle off | partial | subtle down/off click | P2 |
| door open | yes | fuller creak/open | P1 |
| door close | yes | softer latch close | P1 |
| premium payment success | not clearly distinct | premium unlock stinger | P1 |
| premium video open | yes music pause exists | cinematic open sting | P2 |
| premium video close | yes | soft return cue | P2 |
| world event received | no dedicated audio | rare notification ping | P2 |
| map browser open/close | no dedicated audio | soft menu slide | P2 |

## Sound Palette Direction

The project should sound:
- warm
- mystical
- tactile
- slightly retro
- not cartoonish
- not mobile-casual

Recommended sonic vocabulary:
- wood
- paper
- analog switches
- soft bell metal
- glass taps
- low warm synth beds
- archive / phonograph / vinyl texture in selected moments

Avoid:
- harsh sci-fi beeps
- slot-machine reward spam
- exaggerated fantasy UI sparkles on every click
- noisy layered effects that mask dialogue or music

## Mix Rules

Use these rules during sound selection.

Music:
- ambient and identity-first
- do not overpower interaction cues
- target calmer average loudness than the current temptation

UI sounds:
- short
- dry or lightly reverbed
- mostly mid/high frequency
- should not fight with music

World one-shots:
- stronger body than UI sounds
- should sound like physical space and materials

Premium/paywall moments:
- special but restrained
- one recognizable branded unlock tone is better than many flashy sounds

Looping ambience:
- low-information
- low fatigue
- never draw attention every few seconds

## Recommended Volume Relationships

Treat these as relative targets, not exact LUFS requirements.

- music bed: 1.0 reference
- ambient object loops: 0.25 to 0.45 of music feel
- UI clicks: 0.35 to 0.55
- world one-shots: 0.55 to 0.8
- premium unlock stinger: 0.8 to 1.0 briefly
- reject/error sound: 0.45 to 0.65

Important:
- the app currently has only broad music/SFX separation, so sound design discipline matters more than mix tech

## Technical Spec for New Assets

Safe, practical asset rules for the submission pass:

Format:
- `mp3` is acceptable for now
- use short files for one-shots
- use longer compressed loops for music/ambience

Naming:
- use lower-case kebab-case
- include category prefix

Examples:
- `ui-click-soft.mp3`
- `ui-hover-subtle.mp3`
- `ui-error-soft.mp3`
- `ui-confirm-soft.mp3`
- `world-premium-unlock.mp3`
- `world-dialogue-open.mp3`
- `world-dialogue-close.mp3`
- `obj-bookshelf-rustle.mp3`
- `obj-phonograph-start.mp3`

Placement:
- `public/assets/audio/`

Length targets:
- UI click/hover: `50ms` to `250ms`
- confirm/error: `150ms` to `500ms`
- premium stinger: `400ms` to `1500ms`
- ambient loops: `10s+` if looped

## Implementation Guidance

## Submission-safe implementation path

For the hackathon pass, keep everything on `AudioManager`.

Do:
- add a thin UI SFX wrapper on top of `AudioManager.playOneShot()`
- keep map music where it is
- keep object/NPC/item sound assignments where they are
- add a named sound catalog for common UI and premium cues

Do not do tonight:
- migrate the profile screen soundtrack into `AudioManager`
- replace the current distance-volume logic with panner nodes
- rewrite audio around ECS/event buses

## Minimal architectural addition recommended

After the submission-safe demo is locked, add:
- `src/audio/soundCatalog.ts`
- `src/audio/uiSounds.ts`

Responsibilities:
- central names for shared sounds
- one place for default per-sound volumes
- one place to play UI sounds

Example categories:
- `ui.click`
- `ui.hover`
- `ui.confirm`
- `ui.error`
- `world.dialogueOpen`
- `world.dialogueClose`
- `world.premiumUnlock`
- `world.mapTransition`

## Concrete Wiring Targets

Best immediate code hooks for a polish pass:

UI:
- [`src/ui/ModeToggle.ts`](/home/rv404/RV404-Lab/PRODUCTIVITY/Obsidian/Test-1a/Apps/tinyrealms/src/ui/ModeToggle.ts)
- [`src/ui/ProfileScreen.ts`](/home/rv404/RV404-Lab/PRODUCTIVITY/Obsidian/Test-1a/Apps/tinyrealms/src/ui/ProfileScreen.ts)
- [`src/ui/MapBrowser.ts`](/home/rv404/RV404-Lab/PRODUCTIVITY/Obsidian/Test-1a/Apps/tinyrealms/src/ui/MapBrowser.ts)

World:
- [`src/engine/Game.ts`](/home/rv404/RV404-Lab/PRODUCTIVITY/Obsidian/Test-1a/Apps/tinyrealms/src/engine/Game.ts)
- [`src/engine/ObjectLayer.ts`](/home/rv404/RV404-Lab/PRODUCTIVITY/Obsidian/Test-1a/Apps/tinyrealms/src/engine/ObjectLayer.ts)
- [`src/engine/EntityLayer.ts`](/home/rv404/RV404-Lab/PRODUCTIVITY/Obsidian/Test-1a/Apps/tinyrealms/src/engine/EntityLayer.ts)

Data-authored sound assignment:
- [`src/sprited/SpriteEditorPanel.ts`](/home/rv404/RV404-Lab/PRODUCTIVITY/Obsidian/Test-1a/Apps/tinyrealms/src/sprited/SpriteEditorPanel.ts)
- [`src/ui/ItemEditorPanel.ts`](/home/rv404/RV404-Lab/PRODUCTIVITY/Obsidian/Test-1a/Apps/tinyrealms/src/ui/ItemEditorPanel.ts)

## Sound Design Session Checklist

Use this during the session.

1. Choose one emotional direction:
   warm retro-mystic, not arcade, not cyber UI

2. Pick or source:
   - 1 click
   - 1 hover
   - 1 confirm
   - 1 error
   - 1 premium unlock stinger
   - 1 dialogue open
   - 1 dialogue close
   - 1 map transition cue

3. Audit current world sounds:
   - fireplace
   - phonograph/vinyl
   - writing desk
   - bookshelf/book
   - door open/close
   - item pickup
   - NPC greeting for the most important 2-3 characters

4. Normalize the set by ear:
   no sound should feel 2x louder than the others

5. Test on:
   - profile screen
   - initial world spawn
   - object interaction
   - item pickup
   - premium unlock
   - video open/close

6. Record a demo only after:
   - no missing files
   - no duplicate-trigger spam
   - no painfully loud first-click audio

## Recommendation

For the hackathon build:
- treat audio as a polish multiplier, not a systems project
- keep the current `AudioManager`
- ignore `SpatialAudio.ts` for now
- add a small, deliberate UI + premium sound layer
- tune the existing object/NPC/item sounds to feel curated

If this pass is done well, the judges will not describe it as "nice audio tech". They will describe it as "this feels like a real world".

## TinyRealms Wiring Map

This is the direct "prepare these sounds, then wire them here" brief.

## Sounds to prepare

Prepare these first:
- `ui-click-soft`
- `ui-hover-subtle`
- `ui-panel-open`
- `ui-panel-close`
- `ui-confirm-soft`
- `ui-error-soft`
- `txn-start`
- `txn-waiting-pulse`
- `txn-success`
- `txn-fail`
- `txn-unlock-stinger`

## Where each sound should play

### `ui-click-soft`

Use for:
- main mode buttons
- map browser open button
- profile actions
- non-destructive modal buttons

Primary code surfaces:
- [`src/ui/ModeToggle.ts`](/home/rv404/RV404-Lab/PRODUCTIVITY/Obsidian/Test-1a/Apps/tinyrealms/src/ui/ModeToggle.ts)
- [`src/ui/ProfileScreen.ts`](/home/rv404/RV404-Lab/PRODUCTIVITY/Obsidian/Test-1a/Apps/tinyrealms/src/ui/ProfileScreen.ts)
- [`src/ui/MapBrowser.ts`](/home/rv404/RV404-Lab/PRODUCTIVITY/Obsidian/Test-1a/Apps/tinyrealms/src/ui/MapBrowser.ts)
- [`src/ui/AuthScreen.ts`](/home/rv404/RV404-Lab/PRODUCTIVITY/Obsidian/Test-1a/Apps/tinyrealms/src/ui/AuthScreen.ts)

Do not use for:
- premium unlock success
- error states
- important transaction milestones

### `ui-hover-subtle`

Use sparingly for:
- premium unlock button
- key auth buttons
- key map/navigation buttons

Primary code surfaces:
- [`src/ui/AuthScreen.ts`](/home/rv404/RV404-Lab/PRODUCTIVITY/Obsidian/Test-1a/Apps/tinyrealms/src/ui/AuthScreen.ts)
- [`src/splash/screens/GuideNpcSplash.ts`](/home/rv404/RV404-Lab/PRODUCTIVITY/Obsidian/Test-1a/Apps/tinyrealms/src/splash/screens/GuideNpcSplash.ts)
- [`src/splash/screens/MarketNpcSplash.ts`](/home/rv404/RV404-Lab/PRODUCTIVITY/Obsidian/Test-1a/Apps/tinyrealms/src/splash/screens/MarketNpcSplash.ts)

Rule:
- not every hover
- only high-value interactables

### `ui-panel-open`

Use when opening:
- guide splash
- market splash
- map browser
- account/details overlays

Primary code surfaces:
- NPC dialogue entry in [`src/engine/EntityLayer.ts#L979`](/home/rv404/RV404-Lab/PRODUCTIVITY/Obsidian/Test-1a/Apps/tinyrealms/src/engine/EntityLayer.ts#L979)
- splash push/open paths in `src/splash/screens/*`
- map browser toggle paths in [`src/ui/GameShell.ts`](/home/rv404/RV404-Lab/PRODUCTIVITY/Obsidian/Test-1a/Apps/tinyrealms/src/ui/GameShell.ts)

### `ui-panel-close`

Use when closing:
- guide splash
- market splash
- premium video overlay
- map browser

Primary code surfaces:
- splash close handlers
- premium video close in [`src/engine/Game.ts#L2208`](/home/rv404/RV404-Lab/PRODUCTIVITY/Obsidian/Test-1a/Apps/tinyrealms/src/engine/Game.ts#L2208)

### `ui-confirm-soft`

Use for:
- password sign-in success
- wallet connected
- profile selected
- local save/apply actions

Primary code surfaces:
- auth success in [`src/ui/AuthScreen.ts#L333`](/home/rv404/RV404-Lab/PRODUCTIVITY/Obsidian/Test-1a/Apps/tinyrealms/src/ui/AuthScreen.ts#L333)
- wallet connected in [`src/ui/AuthScreen.ts#L496`](/home/rv404/RV404-Lab/PRODUCTIVITY/Obsidian/Test-1a/Apps/tinyrealms/src/ui/AuthScreen.ts#L496)
- profile entry points in [`src/ui/ProfileScreen.ts`](/home/rv404/RV404-Lab/PRODUCTIVITY/Obsidian/Test-1a/Apps/tinyrealms/src/ui/ProfileScreen.ts)

### `ui-error-soft`

Use for:
- missing email/password
- invalid credentials
- wallet connect failure
- generic failed UI action

Primary code surfaces:
- form validation and auth errors in [`src/ui/AuthScreen.ts#L316`](/home/rv404/RV404-Lab/PRODUCTIVITY/Obsidian/Test-1a/Apps/tinyrealms/src/ui/AuthScreen.ts#L316)
- wallet failure in [`src/ui/AuthScreen.ts#L507`](/home/rv404/RV404-Lab/PRODUCTIVITY/Obsidian/Test-1a/Apps/tinyrealms/src/ui/AuthScreen.ts#L507)
- generic status/error panels in [`src/ui/ProfileScreen.ts`](/home/rv404/RV404-Lab/PRODUCTIVITY/Obsidian/Test-1a/Apps/tinyrealms/src/ui/ProfileScreen.ts) and [`src/ui/MapBrowser.ts`](/home/rv404/RV404-Lab/PRODUCTIVITY/Obsidian/Test-1a/Apps/tinyrealms/src/ui/MapBrowser.ts)

### `txn-start`

This is the first "important action" sound.

Use when the user commits to:
- password sign-in request
- GitHub sign-in redirect
- wallet connect request
- premium unlock request
- paid quote request

Primary code surfaces:
- sign-in start in [`src/ui/AuthScreen.ts#L329`](/home/rv404/RV404-Lab/PRODUCTIVITY/Obsidian/Test-1a/Apps/tinyrealms/src/ui/AuthScreen.ts#L329)
- GitHub redirect start in [`src/ui/AuthScreen.ts#L347`](/home/rv404/RV404-Lab/PRODUCTIVITY/Obsidian/Test-1a/Apps/tinyrealms/src/ui/AuthScreen.ts#L347)
- wallet connect start in [`src/ui/AuthScreen.ts#L477`](/home/rv404/RV404-Lab/PRODUCTIVITY/Obsidian/Test-1a/Apps/tinyrealms/src/ui/AuthScreen.ts#L477)
- guide premium request start in [`src/splash/screens/GuideNpcSplash.ts#L723`](/home/rv404/RV404-Lab/PRODUCTIVITY/Obsidian/Test-1a/Apps/tinyrealms/src/splash/screens/GuideNpcSplash.ts#L723)
- market quote request start in [`src/splash/screens/MarketNpcSplash.ts#L469`](/home/rv404/RV404-Lab/PRODUCTIVITY/Obsidian/Test-1a/Apps/tinyrealms/src/splash/screens/MarketNpcSplash.ts#L469)

### `txn-waiting-pulse`

This should communicate:
- "we are waiting on network / challenge / wallet"
- not "success"
- not "error"

Use when entering a pending state:
- auth pending
- wallet chooser pending
- x402 challenge requested
- wallet approval requested

Primary code surfaces:
- auth pending text states in [`src/ui/AuthScreen.ts#L331`](/home/rv404/RV404-Lab/PRODUCTIVITY/Obsidian/Test-1a/Apps/tinyrealms/src/ui/AuthScreen.ts#L331)
- wallet connection pending in [`src/ui/AuthScreen.ts#L489`](/home/rv404/RV404-Lab/PRODUCTIVITY/Obsidian/Test-1a/Apps/tinyrealms/src/ui/AuthScreen.ts#L489)
- guide x402 pending in [`src/splash/screens/GuideNpcSplash.ts#L774`](/home/rv404/RV404-Lab/PRODUCTIVITY/Obsidian/Test-1a/Apps/tinyrealms/src/splash/screens/GuideNpcSplash.ts#L774)
- market trace pending rows in [`src/splash/screens/MarketNpcSplash.ts#L483`](/home/rv404/RV404-Lab/PRODUCTIVITY/Obsidian/Test-1a/Apps/tinyrealms/src/splash/screens/MarketNpcSplash.ts#L483)

Implementation note:
- do not make this a loud loop
- either one pulse on state entry or a very sparse repeating cue

### `txn-success`

Use for:
- password sign-in completed
- wallet connected
- transaction completed
- quote delivered

Primary code surfaces:
- sign-in success in [`src/ui/AuthScreen.ts#L336`](/home/rv404/RV404-Lab/PRODUCTIVITY/Obsidian/Test-1a/Apps/tinyrealms/src/ui/AuthScreen.ts#L336)
- wallet connected in [`src/ui/AuthScreen.ts#L504`](/home/rv404/RV404-Lab/PRODUCTIVITY/Obsidian/Test-1a/Apps/tinyrealms/src/ui/AuthScreen.ts#L504)
- guide premium delivered in [`src/splash/screens/GuideNpcSplash.ts#L805`](/home/rv404/RV404-Lab/PRODUCTIVITY/Obsidian/Test-1a/Apps/tinyrealms/src/splash/screens/GuideNpcSplash.ts#L805)
- market quote result after successful `x402Fetch` in [`src/splash/screens/MarketNpcSplash.ts#L487`](/home/rv404/RV404-Lab/PRODUCTIVITY/Obsidian/Test-1a/Apps/tinyrealms/src/splash/screens/MarketNpcSplash.ts#L487)

### `txn-fail`

Use for:
- auth failure
- wallet rejection
- wallet timeout
- x402 request failure
- quote request failure

Primary code surfaces:
- auth failure in [`src/ui/AuthScreen.ts#L339`](/home/rv404/RV404-Lab/PRODUCTIVITY/Obsidian/Test-1a/Apps/tinyrealms/src/ui/AuthScreen.ts#L339)
- wallet failure in [`src/ui/AuthScreen.ts#L507`](/home/rv404/RV404-Lab/PRODUCTIVITY/Obsidian/Test-1a/Apps/tinyrealms/src/ui/AuthScreen.ts#L507)
- guide premium failure in [`src/splash/screens/GuideNpcSplash.ts#L807`](/home/rv404/RV404-Lab/PRODUCTIVITY/Obsidian/Test-1a/Apps/tinyrealms/src/splash/screens/GuideNpcSplash.ts#L807)
- market quote failure in [`src/splash/screens/MarketNpcSplash.ts#L490`](/home/rv404/RV404-Lab/PRODUCTIVITY/Obsidian/Test-1a/Apps/tinyrealms/src/splash/screens/MarketNpcSplash.ts#L490)

### `txn-unlock-stinger`

This is the hero sound.

Use only for:
- premium content delivered
- paywalled content unlocked
- premium video successfully opened

Primary code surfaces:
- guide premium delivered in [`src/splash/screens/GuideNpcSplash.ts#L805`](/home/rv404/RV404-Lab/PRODUCTIVITY/Obsidian/Test-1a/Apps/tinyrealms/src/splash/screens/GuideNpcSplash.ts#L805)
- premium video open path in [`src/engine/Game.ts#L2230`](/home/rv404/RV404-Lab/PRODUCTIVITY/Obsidian/Test-1a/Apps/tinyrealms/src/engine/Game.ts#L2230)

Rule:
- do not reuse this for ordinary confirms
- this should be the sonic signature of "something valuable unlocked"

## Demo-Critical Wiring Order

If time is limited, wire in this exact order:

1. `txn-unlock-stinger`
   because judges remember premium unlocks

2. `txn-start`
   because it makes wallet/payment moments feel intentional

3. `txn-success`
   because the demo needs resolution

4. `txn-fail`
   because broken flows feel less broken when clearly signaled

5. `ui-click-soft`
   because it upgrades the whole app feel

6. `ui-panel-open`
   because dialogue and premium surfaces need to feel authored

7. `txn-waiting-pulse`
   only if done tastefully and sparsely

## Fast Session Brief

If you are briefing a sound designer quickly, say this:

"We need a compact sound pack for a retro-mystic playable Stacks world. The most important sounds are premium transaction start, waiting, success, fail, and a distinct unlock stinger. Then we need a soft UI click, panel open/close, confirm, and error. Everything should feel tactile, warm, and slightly analog, not arcade or casino."
