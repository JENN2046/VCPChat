# VCPChat Config Hygiene Execution Checklist

> Date: 2026-04-21
> Scope: `VCPChat local config hygiene batch`
> Decision: keep runtime env files local, do not commit them

## Current Decision

Status: `in-progress`

- `VCPDistributedServer/Plugin/DeepMemo/config.env` stays local
- `VCPDistributedServer/Plugin/FileOperator/.env` stays local
- Do not add either file to a product freeze commit
- Do not widen this batch into feature work, shell/IPC cleanup, or plugin boundary work

## Objective

Keep machine-specific runtime configuration out of the repository history while preserving a clear hygiene boundary for future review.

This batch is only about classification and handling rules. It is not a product change batch.

## Execution Steps

1. Confirm the two live files are local runtime state
- Verify both files remain outside the product denominator
- Keep the current working values uncommitted
- Do not treat either file as a source-bearing module input

2. Compare against the template counterparts
- Check `config.env.example` for `DeepMemo`
- Check `.env.example` for `FileOperator`
- If shared defaults are ever needed, update only the example templates in a separate batch

3. Enforce local-only handling
- Leave the runtime files untracked or modified locally
- Do not stage them for the current product freeze line
- Do not rewrite product code just to absorb these paths

4. Keep the hygiene batch isolated
- Do not merge this batch with desktop shell / IPC cleanup
- Do not merge this batch with `EmojiListGenerator`
- Do not merge this batch with AI image experiment work

5. Document the decision boundary
- Keep the local/runtime status visible in project notes
- Use the hygiene batch as the reference for future config reviews
- Keep the repository-level progress denominator unchanged

## Validation

- `git status` still shows the two env files as local runtime changes
- No new product files are added by this batch
- The checklist and scope draft both say the same thing: these env files stay local
- The example files remain the only candidate place for sanitized shared defaults

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
- any runtime snapshots or generated reports

## Closeout Condition

This batch is complete when the two runtime env files are consciously left local and no commit is created for them.

If a future change needs shared defaults, it must happen as a separate config-template batch using the `*.example` files only.
