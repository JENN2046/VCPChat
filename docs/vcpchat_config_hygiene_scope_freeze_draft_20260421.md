# VCPChat Config Hygiene Scope Freeze Draft

> Date: 2026-04-21
> Status: Draft
> Scope candidate: `VCPChat local config hygiene batch`

## Purpose

This draft opens a separate hygiene batch for local runtime configuration files in `VCPChat`.

The goal is to keep machine-specific config values out of product freeze batches, so they do not expand the desktop shell / IPC denominator or get mixed with feature work.

## Candidate Surface

The first config hygiene slice is:

- `VCPDistributedServer/Plugin/DeepMemo/config.env`
- `VCPDistributedServer/Plugin/FileOperator/.env`

## Reference Templates

The repository already has example counterparts for both files:

- `VCPDistributedServer/Plugin/DeepMemo/config.env.example`
- `VCPDistributedServer/Plugin/FileOperator/.env.example`

These templates are the right place for sanitized defaults if the repo ever needs committed configuration examples.

## Explicit Exclusions

This batch does not count:

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
- `VCPDistributedServer/Plugin/EmojiListGenerator/`
- `Desktopmodules/aiImageGen.html`
- `Desktopmodules/builtinWidgets/AIImageGenWidget.js`
- `Desktopmodules/test_AIImageGenWidget.js`
- `modules/image-viewer-rating.html`
- `VCPChat_ANALYSIS.md`
- `VCP_Plugin_Validator.ps1`
- any `*.bak`
- any `*.log`
- any generated reports or runtime snapshots

## Why This Batch Is Separate

These files are not stable product source:

- they contain local absolute paths and checkout-specific values
- they are already represented by example templates
- they are execution-time settings, not product behavior

Because of that, they should not be folded into the desktop shell / IPC freeze or any product feature batch.

## Validation Expectation

Before this batch is considered complete, the following should be true:

- the live config values are clearly identified as local runtime state
- the matching `*.example` files remain the sanitized reference point
- no product code is changed just to absorb machine-specific paths
- the config files stay out of the repository-level progress denominator unless a separate config hygiene decision says otherwise

## Proposed Next Steps

1. Compare the current local values against the `*.example` templates.
2. Decide whether the repository needs sanitized example defaults only.
3. Keep the runtime files local unless there is a concrete reason to commit new shared defaults.
4. Do not merge this batch with feature work, plugin boundary work, or desktop shell / IPC cleanup.

## Recommendation

Treat these files as a separate local config hygiene batch.

Do not count them as product module source, and do not use them to widen the scope of the current freeze line.
