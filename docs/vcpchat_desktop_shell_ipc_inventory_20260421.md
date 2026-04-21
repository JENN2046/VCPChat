# VCPChat Desktop Shell and IPC Inventory

> Date: 2026-04-21
> Scope: `VCPChat` cleanup branch `feature/vcpchat-source-runtime-cleanup`

## Purpose

This inventory classifies the current dirty worktree around the first candidate `VCPChat` slice: desktop shell and IPC.

The document is intentionally operational. It separates source-bearing files from runtime artifacts, secret-risk env files, and experiment-only files so a future freeze can be based on a smaller, reviewable surface.

## Source-Bearing Files

These files are the strongest candidates for the first countable `VCPChat` module:

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

Adjacent shell-entry files to review alongside them:

- `main.js`
- `preload.js`
- `renderer.js`
- `style.css`

## Runtime / Local-State Files

These should stay out of any denominator:

- `.claude/`
- `.omc/`
- `Desktopmodules/.omc/`
- `AppData/`
- `config.json` when it is local runtime configuration
- `loudness_cache.db`
- `NativeSplash.exe`
- `modules/utils/*.bak`

## Secret-Risk Files

These need manual review before any staging decision:

- `VCPDistributedServer/Plugin/DeepMemo/config.env`
- `VCPDistributedServer/Plugin/FileOperator/.env`

If these are product-required defaults, they should be replaced with sanitized templates before any freeze. If they are purely local, they should remain excluded from the count.

## Experiment / Ad Hoc Files

These files look like feature experiments or side paths that may or may not belong in the first slice:

- `Desktopmodules/aiImageGen.html`
- `Desktopmodules/builtinWidgets/AIImageGenWidget.js`
- `Desktopmodules/test_AIImageGenWidget.js`
- `modules/image-viewer-rating.html`
- `VCPDistributedServer/Plugin/EmojiListGenerator/`
- `assets/iconset/ImageAutoRegister/`
- `VCPChat_ANALYSIS.md`
- `VCP_Plugin_Validator.ps1`

These should not be counted until they are explicitly assigned to a frozen module.

## Working Conclusion

The first likely countable module is still the desktop shell and IPC layer.

However, the current worktree is not yet clean enough to freeze it because:

- source files and experiment files are mixed together
- secret-risk env files are still present
- runtime-state exclusion is now explicit, but the source surface still needs a pass to separate the real module from nearby experiments

## Next Action

Proceed in this order:

1. Review the source-bearing files as one module boundary.
2. Decide whether the AI image experiment files belong to that module or should become a separate module.
3. Sanitize or replace the env files if they are intended as committed defaults.
4. Only then consider freezing the desktop shell / IPC slice.
