# VCPChat Directory Migration First-Pass Move Set

> Date: 2026-04-21
> Scope: `VCPChat directory migration`
> Stage: first-pass move-set freeze
> Status: Draft

## Purpose

Freeze the first bounded directory-migration candidate set for `VCPChat`.

This document does not execute any move yet.

It defines the narrowest useful first pass after the compatibility line and after the directory-migration batch was opened.

## First-Pass Principle

The first migration pass should move only low-coupling, source-bearing legacy root directories.

The goal is to prove:

- the canonical root model is sufficient for real directory moves
- reference updates can be kept bounded
- rollback remains simple

The first pass should not start with the most entangled runtime surfaces.

## Frozen Candidate Set

Recommended first-pass move set:

1. `Agenttaskmodules`
2. `Canvasmodules`
3. `Dicemodules`
4. `RAGmodules`
5. `Sheetmodules`

These directories are all source-bearing and still live at the workspace root in the old `*modules` pattern.

They are materially easier to isolate than the high-coupling roots such as `Promptmodules`, `Groupmodules`, `Musicmodules`, or `Voicechatmodules`.

## Current Path To Target Path

Freeze the first-pass target family as:

- `Agenttaskmodules` -> `Desktopmodules/legacy/Agenttaskmodules`
- `Canvasmodules` -> `Desktopmodules/legacy/Canvasmodules`
- `Dicemodules` -> `Desktopmodules/legacy/Dicemodules`
- `RAGmodules` -> `Desktopmodules/legacy/RAGmodules`
- `Sheetmodules` -> `Desktopmodules/legacy/Sheetmodules`

This keeps the first pass conservative:

- preserve each module directory name
- change only the ownership prefix
- avoid redesigning internal file layout in the same batch

## Why These Directories Were Chosen

### `Agenttaskmodules`

Current content is small and self-contained:

- `task.html`
- `task.js`
- `task.css`

No strong runtime fan-out was identified in the current migration reconnaissance.

### `Canvasmodules`

Current reference surface is narrow and obvious:

- `modules/ipc/canvasHandlers.js`
- supporting documentation references only

This is a good representative UI window migration candidate.

### `Dicemodules`

Current runtime entry is narrow:

- `modules/ipc/diceHandlers.js`

This is a low-blast-radius legacy static surface.

### `RAGmodules`

Current runtime entry is concentrated in:

- `modules/ipc/ragHandlers.js`

The module is still root-level legacy layout, but the update surface is compact enough for a first pass.

### `Sheetmodules`

Current runtime entry is concentrated in:

- `modules/ipc/sheetHandlers.js`

Even though `Sheetmodules` has multiple HTML shells, the ownership change is still relatively bounded compared with the more entangled root-level module families.

## Deferred But Plausible Second-Tier Candidates

These are not in first pass, but could become a later bounded batch:

- `Themesmodules`
- `Translatormodules`

Reason:

- both are still manageable
- but they already touch more shared desktop launcher paths and should not be mixed into the smallest proving pass

## Explicit First-Pass Exclusions

Do not include these in the first move set:

- `Promptmodules`
- `Groupmodules`
- `Musicmodules`
- `Voicechatmodules`
- `Notemodules`
- `Memomodules`
- `Forummodules`
- `Flowlockmodules`

Reason:

- they have materially higher reference counts
- several are tied directly into `main.html`, `main.js`, `renderer.js`, or multiple IPC and renderer paths
- mixing them into the proving pass would turn a bounded migration into a broad root-layout rewrite

## Frozen Reference Update Surface

The first pass should expect updates at least in:

- `modules/ipc/canvasHandlers.js`
- `modules/ipc/diceHandlers.js`
- `modules/ipc/ragHandlers.js`
- `modules/ipc/sheetHandlers.js`

Possible documentation or secondary surface updates:

- `Desktopmodules/SheetAI桌面优先方案.md`
- `Flowlockmodules/README.md`
- `VCPDistributedServer/Plugin/Flowlock/README.md`

The move patch should update only references that become invalid because of the chosen move set.

It should not use the move as an excuse to clean unrelated path debt.

## Non-Goals

This first pass does not:

- move `Promptmodules`
- move group chat roots
- move music or voicechat roots
- redefine runtime data ownership
- reopen the local live env boundary

The following files remain local runtime overlays and are still excluded:

- `VCPDistributedServer/Plugin/DeepMemo/config.env`
- `VCPDistributedServer/Plugin/FileOperator/.env`

## Validation Rule

Before any move begins, implementation should confirm:

1. each selected directory still exists at the frozen current path
2. each selected target path is still unused
3. the reference update surface is still limited to the frozen files
4. no live env file is staged

## Rollback Rule

The first pass should be reversible by reverting one bounded migration commit.

No rollback path should depend on manual recreation of runtime env files.

## Recommendation

Treat this move set as the first proving pass for directory migration, not as the beginning of a repo-wide rename sweep.

If implementation reveals wider coupling than expected, stop and split a new batch instead of widening this one in place.
