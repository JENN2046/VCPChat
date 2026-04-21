# PR Body — VCPChat Directory Migration (Batches 1-4 Closure)

## Summary
- This PR consolidates the first four directory migration batches for `VCPChat` into `Desktopmodules/legacy`.
- Migrated families: `Promptmodules`, `Groupmodules`, `Musicmodules`, `Voicechatmodules`.
- Updated runtime loader and IPC/rendering references to keep behavior unchanged and preserve compatibility with existing runtime behavior.
- Did not include local runtime env files; they remain outside migration scope as long-term local configuration.
- This is a bounded repository-structure PR with explicit rollback anchors for safe recovery.

## Scope
- Includes commits:
  - `chore(vcpchat): migrate first-pass legacy modules`
  - `chore(vcpchat): migrate second-pass legacy modules`
  - `chore(vcpchat): migrate third-pass directory modules to legacy`
  - `chore(vcpchat): close out fourth-pass directory migration`
- Includes documentation:
  - `docs/vcpchat_directory_migration_fourth_pass_move_set_20260421.md`
  - `docs/vcpchat_directory_migration_fourth_pass_reference_surface_20260421.md`
  - `docs/vcpchat_directory_migration_fourth_pass_closeout_summary_20260421.md`
  - `docs/vcpchat_directory_migration_fifth_batch_pr_plan_20260421.md`

## What Changed
- Moved directories to legacy ownership:
  - `Promptmodules` -> `Desktopmodules/legacy/Promptmodules`
  - `Groupmodules` -> `Desktopmodules/legacy/Groupmodules`
  - `Musicmodules` -> `Desktopmodules/legacy/Musicmodules`
  - `Voicechatmodules` -> `Desktopmodules/legacy/Voicechatmodules`
- Updated loader/runtime references in:
  - `main.html`, `main.js`
  - `modules/ipc/groupChatHandlers.js`
  - `modules/ipc/musicHandlers.js`
  - `renderer.js`
  - `modules/speechRecognizer.js`
  - `modules/utils/appSettingsManager.js`
  - `modules/renderer/domBuilder.js`

## Validation
- Confirmed staged/committed diff is limited to migration paths and reference updates; local runtime env files were not included.
- Runtime-path scan (excluding `docs`, `assets`, `AppData`) shows module references updated for migrated families.
- No feature behavior refactor or transport/runtime contract change is introduced in this migration batch.

## Rollback
- Revert to the immediate previous commit of this batch or run:
  - `git revert <each migration commit>` (first-pass to fourth-pass)
  - or `git reset`-based rollback at migration commit boundary if allowed.
- No manual `.env` reconstruction is required for this rollback.

## Notes
- This PR intentionally stays compatible-first and does not alter `VCPDistributedServer/Plugin/DeepMemo/config.env` / `VCPDistributedServer/Plugin/FileOperator/.env`.

---

### 5-line first-screen version
1) This PR closes Directory Migration Batches 1~4 and unifies legacy family roots into `Desktopmodules/legacy`.  
2) Migrated modules: `Promptmodules`, `Groupmodules`, `Musicmodules`, `Voicechatmodules` (plus path updates only).  
3) Updated runtime and IPC references in `main`/renderer/loader paths without introducing transport or feature logic changes.  
4) No local env files were committed; two runtime envs remain outside source-control scope.  
5) Rollback is bounded by this batch chain (`293eb2b..eb1361b`) and can be reverted commit-by-commit if needed.
