# Start Here

Purpose: provide one clean reading order for `tinyrealms` so contributors do not have to infer the architecture from scattered notes.

Audience:
- builders joining the codebase
- reviewers trying to understand current truth quickly
- future documentation cleanup passes

Last verified: 2026-03-19

## Reading Order

Read these in order:

1. [Overview.md](/home/rv404/RV404-Lab/PRODUCTIVITY/Obsidian/Test-1a/Apps/tinyrealms/docs/Overview.md)
2. [Current-Truth-Matrix.md](/home/rv404/RV404-Lab/PRODUCTIVITY/Obsidian/Test-1a/Apps/tinyrealms/docs/status/Current-Truth-Matrix.md)
3. [Project-Timeline.md](/home/rv404/RV404-Lab/PRODUCTIVITY/Obsidian/Test-1a/Apps/tinyrealms/docs/status/Project-Timeline.md)
4. [Backend-Contract.md](/home/rv404/RV404-Lab/PRODUCTIVITY/Obsidian/Test-1a/Apps/tinyrealms/docs/Backend-Contract.md)
5. [System-Diagrams.md](/home/rv404/RV404-Lab/PRODUCTIVITY/Obsidian/Test-1a/Apps/tinyrealms/docs/architecture/System-Diagrams.md)
6. [Spatial-Intelligence-Direction.md](/home/rv404/RV404-Lab/PRODUCTIVITY/Obsidian/Test-1a/Apps/tinyrealms/docs/architecture/Spatial-Intelligence-Direction.md)
7. [Five-Pillars-and-Reality-Protocol.md](/home/rv404/RV404-Lab/PRODUCTIVITY/Obsidian/Test-1a/Apps/tinyrealms/docs/architecture/Five-Pillars-and-Reality-Protocol.md)
8. [Stacks-Implementation-Status.md](/home/rv404/RV404-Lab/PRODUCTIVITY/Obsidian/Test-1a/Apps/tinyrealms/docs/Stacks-Implementation-Status.md)
9. [X402-Service-Boundary.md](/home/rv404/RV404-Lab/PRODUCTIVITY/Obsidian/Test-1a/Apps/tinyrealms/docs/X402-Service-Boundary.md)
10. [Clarity-Contract-Plan.md](/home/rv404/RV404-Lab/PRODUCTIVITY/Obsidian/Test-1a/Apps/tinyrealms/docs/Clarity-Contract-Plan.md)
11. [Contract-Cheat-Sheet.md](/home/rv404/RV404-Lab/PRODUCTIVITY/Obsidian/Test-1a/Apps/tinyrealms/docs/Contract-Cheat-Sheet.md)
12. [Agent-Wallet-Ledger.md](/home/rv404/RV404-Lab/PRODUCTIVITY/Obsidian/Test-1a/Apps/tinyrealms/docs/Agent-Wallet-Ledger.md)
13. [Agent-Wallet-Architecture.md](/home/rv404/RV404-Lab/PRODUCTIVITY/Obsidian/Test-1a/Apps/tinyrealms/docs/Agent-Wallet-Architecture.md)
14. [Operations.md](/home/rv404/RV404-Lab/PRODUCTIVITY/Obsidian/Test-1a/Apps/tinyrealms/docs/Operations.md)

## Codex Session Logs

AI session changelogs — read these to understand what was changed and why, in order:

- [5.3Codex.md](5.3Codex.md) — auth hardening, map cascade, world-item upsert, CI, backup/restore
- [Codex-2026-03-19-Bandwidth-Fix.md](Codex-2026-03-19-Bandwidth-Fix.md) — npcEngine tick bandwidth emergency fix, presence-gated loop
- [Convex-Bandwidth-Optimizations.md](Convex-Bandwidth-Optimizations.md) — living doc, deferred bandwidth improvements

## Folder Map

- `docs/status/`
  - current truth
  - milestone timeline
  - status-oriented docs only
- `docs/architecture/`
  - system map
  - ERD
  - UML / sequence diagrams
- `docs/`
  - canonical core docs that already anchor the repo
- `docs/archive/`
  - notes that should no longer be treated as first-stop documentation

## Practical Rule

If a document is not linked from this file, it should be treated as one of:

- a focused subsystem note
- a working note
- a legacy note pending archive

## Repo vs Obsidian

Keep the split disciplined:

- repo docs = engineering truth and submission-facing docs
- Obsidian = timestamped backlog, PM, strategy, and session notes

Obsidian project hub:

- [Stackshub Project Hub](/home/rv404/RV404-Lab/PRODUCTIVITY/Obsidian/Test-1a/PMOG-Obsidian-Research/00_meta/2026-03-18%20Stackshub%20Project%20Hub.md)

## Current Canonical Scope

The current canon should answer four questions fast:

1. what the project is
2. what is actually working
3. how the backend and payment boundaries are shaped
4. which contracts, wallets, and world systems are real today
