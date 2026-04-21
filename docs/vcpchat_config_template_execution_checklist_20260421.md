# VCPChat Config Template Execution Checklist

> Date: 2026-04-21
> Scope: `VCPChat config template batch`
> Decision: keep live runtime env files local; review only the `*.example` files

## Current Decision

Status: `in-progress`

- `VCPDistributedServer/Plugin/DeepMemo/config.env.example` is the template under review
- `VCPDistributedServer/Plugin/FileOperator/.env.example` is the template under review
- `VCPDistributedServer/Plugin/DeepMemo/config.env` stays local
- `VCPDistributedServer/Plugin/FileOperator/.env` stays local
- Do not widen this batch into feature work, shell/IPC cleanup, or plugin boundary work

## Objective

Keep the repository's shared defaults clean and safe while leaving checkout-specific runtime values outside the product history.

This batch is only about template files and their sanitized defaults.

## Execution Steps

1. Review the template files
- Inspect `config.env.example`
- Inspect `.env.example`
- Identify which values are safe to share across checkouts

2. Compare template values against the live runtime files
- Check which entries are checkout-specific
- Keep local absolute paths and machine-specific settings out of shared defaults
- Preserve only sanitized template values

3. Decide whether template edits are needed
- If the templates already reflect safe shared defaults, leave them unchanged
- If shared defaults need cleanup, update only the `*.example` files
- Do not copy live runtime values into the repository template files

4. Keep the live runtime files local
- Leave `config.env` untracked or modified locally
- Leave `.env` untracked or modified locally
- Do not stage either file for this batch

5. Keep the batch isolated
- Do not merge this batch with desktop shell / IPC cleanup
- Do not merge this batch with `EmojiListGenerator`
- Do not merge this batch with AI image experiment work
- Do not merge this batch with the local config hygiene batch

## Validation

- `git status` should still show only the live runtime files as local changes if they exist
- The template files remain the only candidate place for shared defaults
- No product code is added or changed unless it is needed to support sanitized templates
- The checklist and scope draft both say the same thing: templates may be updated, runtime files stay local

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
- any runtime snapshots or generated reports

## Closeout Condition

This batch is complete when the example files are reviewed and either:

- kept as-is because they are already safe defaults, or
- updated with sanitized defaults only

The live runtime env files stay local either way.
