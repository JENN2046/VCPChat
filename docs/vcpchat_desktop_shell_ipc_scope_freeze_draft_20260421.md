# VCPChat Desktop Shell and IPC Scope Freeze Draft

> Date: 2026-04-21
> Status: Draft
> Scope candidate: `VCPChat desktop shell and IPC`

## Purpose

This draft narrows the first potentially countable `VCPChat` module down to the desktop shell and IPC layer.

It intentionally excludes the distributed server, media engines, product-specific submodules, runtime state, and dependency trees.

## Candidate Surface

The first source slice to consider is:

- `Desktopmodules/desktop.html`
- `Desktopmodules/builtinWidgets/vchatApps.js`
- `Desktopmodules/debug/debugTools.js`
- `modules/ipc/desktopHandlers.js`
- `modules/ipc/sheetHandlers.js`
- `modules/services/windowAppIds.js`
- `preloads/chat.js`
- `preloads/desktop.js`
- `preloads/shared/catalog.js`
- `preloads/shared/roles.js`
- `preloads/utility.js`
- `main.js`
- `preload.js`
- `renderer.js`
- `style.css`
- `assets/`
- `public/`
- `styles/`

Optional adjacent files may be added only if they are direct dependencies of the shell/IPC path and not a separate product module.

## Explicit Exclusions

This draft does not count:

- `.claude/`
- `.omc/`
- `Desktopmodules/.omc/`
- `AppData/`
- `node_modules/`
- `vendor/`
- `config.json` when used as local runtime configuration
- `loudness_cache.db`
- `NativeSplash.exe`
- any `*.bak`
- any `*.log`
- any `*.env` or `config.env`
- generated reports or debug captures
- `VCPDistributedServer/Plugin/EmojiListGenerator/`
- `Desktopmodules/aiImageGen.html`
- `Desktopmodules/builtinWidgets/AIImageGenWidget.js`
- `Desktopmodules/test_AIImageGenWidget.js`
- `modules/image-viewer-rating.html`
- `VCPChat_ANALYSIS.md`
- `VCP_Plugin_Validator.ps1`

## Why This Slice Comes First

This slice is the smallest source surface that still looks like a coherent product unit:

- it owns the desktop frame
- it owns window and IPC plumbing
- it is already implicated in the current dirty worktree
- it can be reviewed separately from the distributed server and engine layers

## Validation Expectation

Before this slice can become a frozen module, the following should be true:

- the source files in the slice are separated from runtime and generated artifacts
- the slice has a repeatable smoke path or test entry
- its IPC surface is explicit enough to be reviewed independently
- secret or user-specific config files are excluded from the count

## Proposed Next Steps

1. Clean and classify only the files in this slice.
2. Review whether the AI image desktop experiment belongs here or should become its own module.
3. Freeze this slice as the first `VCPChat` countable module only after the clean split is real.
4. Leave distributed server and engine families for later freezes.

## Recommendation

Do not count the full `VCPChat` tree yet.

Count this slice first, and only if the worktree can be reduced to a clean, reviewable desktop shell and IPC surface.
