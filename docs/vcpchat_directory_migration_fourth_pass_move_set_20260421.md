# VCPChat Directory Migration Fourth-Pass Move Set

> Date: 2026-04-21  
> Scope: `VCPChat directory migration`  
> Stage: fourth-pass candidate  
> Status: Completed (batch closed)

## Frozen Candidate Set

- `Promptmodules`
- `Groupmodules`
- `Musicmodules`
- `Voicechatmodules`

## Target Layout

All four candidates move into legacy ownership in-place by adding `Desktopmodules/legacy/`:

- `Promptmodules` -> `Desktopmodules/legacy/Promptmodules`
- `Groupmodules` -> `Desktopmodules/legacy/Groupmodules`
- `Musicmodules` -> `Desktopmodules/legacy/Musicmodules`
- `Voicechatmodules` -> `Desktopmodules/legacy/Voicechatmodules`

## Scope

This pass is a bounded high-coupling migration batch and does not include feature or behavior refactors.

## Explicit Non-Goals

- `Theme/translator/sheet/rag/canvas/dice/group/chat...` unrelated families already handled by earlier passes.
- runtime state files.
- config and template hygiene work.

## Reference Update Boundary (expected)

- `main.html`
- `main.js`
- `modules/ipc/groupChatHandlers.js`
- `modules/ipc/musicHandlers.js`
- `renderer.js`
- `modules/speechRecognizer.js`
- `modules/renderer/domBuilder.js`
- `modules/utils/appSettingsManager.js`
