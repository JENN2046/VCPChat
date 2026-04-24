# VCPChat V1 Native Host Live Acceptance

## Status

This document records the live acceptance result for the `VCPChat V1` native
host embedding line as of 2026-04-23.

Baseline references:

- `A:\VCP\VCPChat\docs\vcpchat_v1_scope_freeze_20260423.md`
- `A:\VCP\VCPChat\docs\vcpchat_v1_positioning_scope_non_goals_success_criteria_20260423.md`
- `A:\VCP\VCPChat\docs\vcpchat_v1_native_host_pr_closeout_20260423.md`
- `A:\VCP\VCPChat\docs\vcpchat_v1_native_host_merge_readiness_checklist_20260423.md`

## Acceptance Scope

This acceptance covers the first real host path:

1. Main process host wiring
2. Preload bridge wiring
3. Renderer-callable host client
4. Live renderer execution path for:
   - `inspect`
   - `run`
   - `resume`

## Accepted Integration Surface

### Main process / IPC

- `A:\VCP\VCPChat\main.js`
- `A:\VCP\VCPChat\modules\ipc\desktopRemoteHandlers.js`

### Host service

- `A:\VCP\VCPChat\modules\services\codexRouterHost.js`
- `A:\VCP\VCPChat\modules\services\codexRouterDirectives.js`

### Preload and renderer

- `A:\VCP\VCPChat\preloads\chat.js`
- `A:\VCP\VCPChat\preloads\desktop.js`
- `A:\VCP\VCPChat\renderer.js`

## Validation Evidence

### Static checks

- `node --check A:\VCP\VCPChat\modules\services\codexRouterHost.js`
- `node --check A:\VCP\VCPChat\modules\ipc\desktopRemoteHandlers.js`
- `node --check A:\VCP\VCPChat\preloads\chat.js`
- `node --check A:\VCP\VCPChat\preloads\desktop.js`
- `node --check A:\VCP\VCPChat\renderer.js`

### Live smoke

The app was launched in real Electron with:

- `electron . --desktop-only --remote-debugging-port=9222`

Then renderer-side calls were executed through the real window context:

- `window.codexRouterHostClient.inspect()`
- `window.codexRouterHostClient.run(taskEnvelope)`
- `window.codexRouterHostClient.resume(taskEnvelope, options)`

Observed result:

- `inspect`: `status = success`, `ready = true`, `pendingRequiredMethods = []`
- `run`: `status = success`, result includes:
  - `decisionResult`
  - `executionResult`
- `resume`: `status = success`, result includes:
  - `decisionResult`
  - `executionResult`

## Stage Conclusion

`VCPChat` now has a real end-to-end native host path for `codex-router`:

renderer -> preload -> main IPC -> desktopRemoteHandlers -> host bundle

This satisfies the first live host acceptance objective for `VCPChat V1`.

## Open Risk

The main renderer still has ambient legacy initialization noise unrelated to
this host path, including:

- `trayManager module not found`
- `Cannot read properties of undefined (reading 'get')`

Current judgment: non-blocking for this host acceptance, but should be tracked
as separate renderer hygiene work.

## Governance Note

The untracked file `A:\VCP\VCPChat\.vcp_ready` is intentionally kept by explicit
user decision during this line and must not be auto-deleted in this branch
without a new decision.

## Next Gate

This line is ready for PR-oriented closeout work:

1. PR body / merge notes
2. final review-thread and checks sweep
3. optional cleanup split for unrelated renderer noise

## Closeout

PR closeout and merge-readiness notes are tracked in:

- `A:\VCP\VCPChat\docs\vcpchat_v1_native_host_pr_closeout_20260423.md`
- `A:\VCP\VCPChat\docs\vcpchat_v1_native_host_merge_readiness_checklist_20260423.md`
- `A:\VCP\VCPChat\docs\vcpchat_v1_native_host_post_merge_regression_20260423.md`
