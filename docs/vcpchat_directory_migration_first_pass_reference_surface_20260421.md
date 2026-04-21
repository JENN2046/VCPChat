# VCPChat Directory Migration First-Pass Reference Surface

> Date: 2026-04-21
> Scope: `VCPChat directory migration`
> Stage: first-pass reference-surface freeze
> Status: Draft

## Purpose

Freeze the reference-update surface for the first directory-migration pass.

This document is downstream of:

- `docs/vcpchat_directory_migration_scope_freeze_20260421.md`
- `docs/vcpchat_directory_migration_execution_checklist_20260421.md`
- `docs/vcpchat_directory_migration_first_pass_move_set_20260421.md`

It exists to keep the first move pass bounded before any real directory move starts.

## Covered Move Set

This reference surface applies only to the frozen first-pass move set:

- `Agenttaskmodules`
- `Canvasmodules`
- `Dicemodules`
- `RAGmodules`
- `Sheetmodules`

Frozen target family:

- `Desktopmodules/legacy/Agenttaskmodules`
- `Desktopmodules/legacy/Canvasmodules`
- `Desktopmodules/legacy/Dicemodules`
- `Desktopmodules/legacy/RAGmodules`
- `Desktopmodules/legacy/Sheetmodules`

## Runtime Reference Surface

The current runtime update surface is concentrated and small.

### Must-update runtime files

1. `modules/ipc/canvasHandlers.js`

Observed current reference:

- `path.join(__dirname, '..', '..', 'Canvasmodules', 'canvas.html')`

Expected migration effect:

- update load path to `Desktopmodules/legacy/Canvasmodules/canvas.html`

### 2. `modules/ipc/diceHandlers.js`

Observed current reference:

- `express.static(path.join(projectRoot, 'Dicemodules'))`

Expected migration effect:

- update static root to `Desktopmodules/legacy/Dicemodules`

### 3. `modules/ipc/ragHandlers.js`

Observed current references:

- `path.join(app.getAppPath(), 'RAGmodules', 'RAG_Overlay.html')`
- `path.join(app.getAppPath(), 'RAGmodules', 'RAG_Observer.html')`

Expected migration effect:

- update both HTML entry paths to `Desktopmodules/legacy/RAGmodules/*`

### 4. `modules/ipc/sheetHandlers.js`

Observed current reference:

- `path.join(__dirname, '..', '..', 'Sheetmodules', 'sheet-studio.html')`

Expected migration effect:

- update file target to `Desktopmodules/legacy/Sheetmodules/sheet-studio.html`

## Low-Confidence Or Indirect Runtime Surface

### `Agenttaskmodules`

Current code reconnaissance did not find a strong runtime reference in the main IPC / launcher surface.

Implication:

- first-pass implementation must re-check whether this directory is dormant, dynamically resolved elsewhere, or simply not wired today
- if hidden runtime coupling appears, split it out instead of widening the move patch silently

## Secondary Documentation Surface

These files may need path updates if the first move pass lands:

- `Desktopmodules/SheetAI桌面优先方案.md`
- `VCPDistributedServer/Plugin/Flowlock/README.md`

Why they matter:

- they refer to the current root-level module names
- they are not primary runtime blockers
- they should only be updated if the moved paths become part of the reviewed target layout

## Explicit Non-Surface For This Pass

Do not pull these files into the first pass just because they contain adjacent path debt:

- `main.html`
- `main.js`
- `renderer.js`
- `modules/speechRecognizer.js`
- `modules/renderer/domBuilder.js`
- `modules/ipc/desktopHandlers.js`
- `modules/ipc/themeHandlers.js`
- `modules/ipc/groupChatHandlers.js`
- `modules/ipc/musicHandlers.js`

Reason:

- these are tied to excluded high-coupling directory families such as `Promptmodules`, `Groupmodules`, `Musicmodules`, `Themesmodules`, `Translatormodules`, and `Voicechatmodules`
- including them now would break the proving-pass boundary

## Frozen Update Rule

The first move implementation may update only:

1. selected moved directories
2. runtime references directly broken by those moves
3. minimal documentation references that become objectively incorrect

It must not:

- opportunistically normalize unrelated path strings
- rename excluded module families
- mix parser work or config ownership changes into the move patch

## Pre-Implementation Recheck

Before real directory moves begin, confirm again:

1. the four must-update runtime files still contain the same references
2. `Agenttaskmodules` still has no additional hidden runtime entrypoint
3. the target paths under `Desktopmodules/legacy/` are still unused
4. live env files are still unstaged:
   - `VCPDistributedServer/Plugin/DeepMemo/config.env`
   - `VCPDistributedServer/Plugin/FileOperator/.env`

## Recommendation

Treat this document as the hard stop against scope drift.

If implementation reveals required updates outside this frozen surface, open a follow-up batch instead of absorbing the new surface into the first-pass move.
