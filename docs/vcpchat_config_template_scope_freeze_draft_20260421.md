# VCPChat Config Template Scope Freeze Draft

> Date: 2026-04-21
> Status: Draft
> Scope candidate: `VCPChat config template batch`

## Purpose

This draft opens a separate config-template batch for the example files in `VCPChat`.

The goal is to decide whether the repository should carry sanitized shared defaults in the `*.example` files, without pulling local runtime values into product batches.

## Candidate Surface

The template slice is:

- `VCPDistributedServer/Plugin/DeepMemo/config.env.example`
- `VCPDistributedServer/Plugin/FileOperator/.env.example`

## Relationship to the Local Config Hygiene Batch

This batch is not the same as the local config hygiene batch.

The hygiene batch keeps the live runtime files local:

- `VCPDistributedServer/Plugin/DeepMemo/config.env`
- `VCPDistributedServer/Plugin/FileOperator/.env`

This template batch only decides what belongs in the example counterparts.

## Explicit Exclusions

This batch does not count:

- `VCPDistributedServer/Plugin/DeepMemo/config.env`
- `VCPDistributedServer/Plugin/FileOperator/.env`
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

The example files are the only reasonable place for sanitized shared defaults.

They should be reviewed independently because:

- they define what a fresh checkout sees
- they may need to be cleaned up without changing the live runtime files
- they are template artifacts, not product behavior

## Validation Expectation

Before this batch is considered complete, the following should be true:

- the repository has a clear answer for what belongs in `*.example`
- the live runtime files remain local and are not rewritten by this batch
- no product code is changed just to support template defaults
- the template files stay isolated from feature work and plugin boundary work

## Proposed Next Steps

1. Compare each live config file against its `*.example` template.
2. Decide whether the template should keep only sanitized defaults.
3. Update template files only if the defaults are safe to share.
4. Keep the live runtime files local unless a separate config hygiene decision says otherwise.

## Recommendation

Treat this as a separate `config/template` batch.

Do not fold it into feature work, and do not use it to change the status of the local runtime config files.
