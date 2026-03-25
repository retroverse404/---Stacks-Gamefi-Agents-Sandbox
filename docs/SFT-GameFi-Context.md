# SFT GameFi Context

This note captures how the Stacks GameFi SFT model fits `stacks2d`.

Source context:
- [SFTs: Flow and Smart Contracts](https://gamefi-stacks.gitbook.io/stacks-degens-gaming-universe/sfts-flow-and-smart-contracts)

## Why This Matters

Stacks GameFi documentation shows a strong pattern for semi-fungible tokens (`SFTs`) in games:
- resources
- items
- crafting
- acquisition
- level-up
- token URI metadata

That pattern is highly relevant to the long-term direction of `stacks2d`.

## What SFTs Are Good For Here

In `stacks2d`, SFTs are a strong fit for:
- resources
  - stamina
  - crafting parts
  - upgrade materials
  - world keys
- access items
  - room passes
  - station access badges
  - event tickets
  - premium scene passes
- upgradeable items
  - tools
  - gear
  - modules
  - media passes

## What SFTs Are Not Replacing

SFTs are not the same thing as:
- world/session state
- object ownership binding
- x402 payment-required HTTP access
- one-off collectible artifact NFTs

Those concerns map better to:
- `world-lobby.clar`
- `world-objects.clar`
- `x402` service boundaries
- narrow SIP-009 contracts for unique media artifacts such as floppy disk, cassette, and wax cylinder

## Recommended Contract Stack

The strongest layered contract story is:

1. `world-lobby.clar`
   - room/world lifecycle
   - owner, members, flow-state
2. `world-objects.clar`
   - object binding and ownership
   - terminals, booths, props, media objects
3. `floppy-disk-nft.clar`, `cassette-nft.clar`, `wax-cylinder-nft.clar`
   - unique collectible media artifacts
   - narrow SIP-009 ownership layer
4. `sft-items.clar`
   - items, resources, crafting, upgrades, passes

This is stronger than trying to make the SFT contract carry the whole world by itself.

## Why Judges May Care

This shows a credible path from:
- semantic world
- onchain world/session structure
- object ownership
- GameFi resources and items
- later x402, STX, sBTC, USDCx interactions

That is a much stronger story than a generic game token.

## Important Truth

SFTs are currently a design and architecture direction here.

They are **not** yet implemented in `stacks2d`.

They should be described as:
- a planned GameFi layer
- strongly aligned with Stacks GameFi patterns
- future-facing until contract code and wallet flow are actually wired

## Backlog Status

SFTs and GameFi are part of the active backlog, not discarded scope.

Use [GameFi-Backlog.md](docs/status/GameFi-Backlog.md) as the canonical next-layer reference for:

- repeatable item classes
- tavern consumables
- dungeon resources
- access passes
- later `QTC`/SIP-010 currency direction
