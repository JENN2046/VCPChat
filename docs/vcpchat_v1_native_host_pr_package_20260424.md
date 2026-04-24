# VCPChat V1 Native Host PR Package (2026-04-24)

## PR Title

`feat(vcpchat): embed codex-router native host path`

## PR Body

This PR delivers the first native `codex-router` host path inside `VCPChat`.

Delivered runtime path:

- main-process host bootstrap
- `desktopRemoteHandlers` IPC command dispatch
- preload bridge exposure
- renderer-side `window.codexRouterHostClient`
- host service/directive wiring for `inspect`, `run`, and `resume`
- `PTYShellExecutor` interactive session support used by the host runtime bindings

Validation posture:

- Code review pass: no blocker found.
- Prior live acceptance: Electron renderer smoke passed for `inspect/run/resume`.
- Memory audit overview confirms prior VCPChat live acceptance checkpoints.
- Shell validation recovered: targeted native host `node --check` commands pass.
- Memory recall recovered: `search_memory` can recall the prior caveat checkpoint.
- Fresh Electron startup smoke passed in the isolated worktree after
  `node_modules` junction setup.
- Fresh Electron renderer control-path smoke passed for `inspect/run/resume`;
  `run/resume` returned blocked-preflight/not-ready as intended to avoid live
  primitive side effects.
- Local DesktopRemote dispatch smoke passed for
  `CreateWidget/QueryDesktop/ViewWidgetSource`, followed by `DeleteWidget`
  cleanup and a post-cleanup query confirming the smoke widget was gone.

## LGTM + Caveats

```md
LGTM, no blocker found; the main inspect/run/resume path is wired. Caveats: default runtime scope is currently limited to `A:\VCP\VCPChat`, host policy/memory changes require process restart because starter/bundle are cached, renderer host client is initialized once, and this PR intentionally includes the `PTYShellExecutor` interactive session state machine.
```

## Merge Conditions

- Review threads are clear.
- Merge set excludes unrelated churn.
- Validation recovery notes are included in the PR body or final comment.
- DesktopRemote dispatch-smoke notes are included in the PR body or final
  comment if the cleanup change is part of the merge set.
- Post-merge 24h regression checklist is linked.

## Closing Artifacts

- `A:\VCP\VCPChat\docs\vcpchat_v1_scope_freeze_20260423.md`
- `A:\VCP\VCPChat\docs\vcpchat_v1_native_host_live_acceptance_20260423.md`
- `A:\VCP\VCPChat\docs\vcpchat_v1_native_host_pr_closeout_20260423.md`
- `A:\VCP\VCPChat\docs\vcpchat_v1_native_host_merge_readiness_checklist_20260423.md`
- `A:\VCP\VCPChat\docs\vcpchat_v1_native_host_validation_addendum_20260424.md`
- `A:\VCP\VCPChat\docs\vcpchat_v1_native_host_post_merge_regression_20260423.md`

## Post-Merge

After merge, run the 24h watchdog from:

- `A:\VCP\VCPChat\docs\vcpchat_v1_native_host_post_merge_regression_20260423.md`
