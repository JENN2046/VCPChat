# VCPChat V1 Native Host Post-Merge Regression Plan (24h)

## Window

Merge time + 24 hours

## Current Status

- PR #11 merged to `main` at `2026-04-24T11:45:20Z`.
- `origin/main` contains merge commit `20a0ba5`.
- Immediate post-merge verification passed for:
  - `.vcp_ready` presence in `HEAD` and `origin/main`
  - DesktopRemote plugin / handler / bridge syntax checks
  - DesktopRemote manifest JSON parsing
  - DesktopRemote HTTP smoke with `CreateWidget`, `QueryDesktop`,
    `ViewWidgetSource`, and `DeleteWidget cleanup PASS`
  - cleanup failure simulation causing the smoke script to fail
  - cleanup success simulation allowing the smoke script to pass
  - renderer `window.codexRouterHostClient.inspect()`
  - renderer `window.codexRouterHostClient.run(taskEnvelope)`
  - renderer `window.codexRouterHostClient.resume(taskEnvelope, { required: false })`
- Renderer control-path validation used `VCP_CODEX_ROUTER_ROOT=A:\codex-router`
  because the router checkout is installed at `A:\codex-router`, not
  `A:\VCP\codex-router`.
- `inspect` returned `status = success`, `ready = true`, and no pending runtime
  or memory methods.
- `run` and `resume` returned `status = success` with both `decisionResult` and
  `executionResult` present.
- The protected release-style smoke task was intentionally blocked before live
  side effects:
  - `decisionStatus = blocked_preflight`
  - `executionStatus = not_ready`
  - decision blocking reason: `memory_recent_rejections:39`
  - execution blocking reason: `telemetry_sink_required`
- Donor memory diagnostics show the `memory_recent_rejections:39` count is from
  the default VCPToolBox memory overview window; latest rejected write was
  `2026-04-22T10:46:03.665Z`, so this is historical memory-health debt rather
  than a new PR #11 regression.
- Test Electron processes were stopped after validation.
- `.vcp_ready` was restored after Electron removed it locally during startup.
- Current post-merge record branch: `postmerge/vcpchat-native-host-regression`.
- A user-accepted 20-minute warm-up was completed with an isolated Electron
  profile and DevTools port `9338`.
  - Start probe at `2026-04-24T12:37:05.605Z`: renderer ready, host client
    present, `inspect.status = success`, `ready = true`, no pending methods.
  - Liveness probes at +5m, +10m, +15m, and +20m: DevTools port remained alive
    and Electron process set remained present.
  - End probe at `2026-04-24T13:03:20.729Z`: renderer ready, host client
    present, `inspect.status = success`, `ready = true`, no pending methods.
  - Test Electron processes were stopped after the warm-up.
  - `.vcp_ready` was restored after Electron removed it locally during startup.

## Pending Windows

- The exact 30-minute warm-up window was not held open; the operator accepted
  the 20-minute warm-up as sufficient for this post-merge pass.
- The 4-hour stability check is still pending.
- The 24-hour operational check is still pending.
- Do not mark `POST_MERGE_STABLE` until the timed windows complete without P1/P0
  regressions.

## Owner

VCPChat host integration owner

## Scope

Validate that the first native `codex-router` host path remains stable after merge:

- `inspect`
- `run`
- `resume`
- DesktopRemote `CreateWidget -> QueryDesktop -> ViewWidgetSource`
- DesktopRemote `DeleteWidget` cleanup for transient smoke widgets
- host startup / readiness signal behavior
- preload ↔ IPC ↔ renderer call path

## Runbook (one-time after merge)

1. Merge verification
   - Confirm PR merge commit landed on target branch.
   - Confirm `.vcp_ready` remains present in worktree history context as explicit artifact.

2. 30-minute warm-up check
   - Start app with desktop-only smoke command used during live acceptance:
     `electron . --desktop-only --remote-debugging-port=9222`
   - Confirm no startup blockers in main log beyond known non-blocking renderer noise.

3. 1-hour end-to-end verification
   - Execute:
     - `window.codexRouterHostClient.inspect()`
     - `window.codexRouterHostClient.run(taskEnvelope)`
     - `window.codexRouterHostClient.resume(taskEnvelope, { required: false })`
   - Expectation per call:
     - `status = success`
     - `decisionResult` and `executionResult` are present
     - `ready = true` for inspect path
   - Execute the local DesktopRemote HTTP smoke:
     `node scripts\desktopremote-http-smoke.js`
   - Expectation:
     - `CreateWidget`, `QueryDesktop`, and `ViewWidgetSource` pass
     - `DeleteWidget cleanup PASS`
     - a follow-up query does not report `desktopremote-http-smoke`

4. 4-hour stability check
   - Repeat `inspect/run/resume` pair once.
   - Confirm no regression in `preload → main` dispatch latency spikes beyond baseline.
   - Confirm no host state object leak in renderer console (no repeated critical host init exceptions).

5. 24-hour operational check
   - Repeat one minimal `run -> checkpoint -> resume` flow.
   - Check logs for explicit failures in host control channel.
   - Confirm unchanged from pre-merge known behavior and unchanged non-blocking warning surface.

## Incident Triage Template

- `symptom`
- `time_detected` (include timezone)
- `repro_steps`
- `expected`
- `actual`
- `component`
  - main process
  - desktopRemoteHandlers IPC
  - preload bridge
  - renderer client
  - codex-router service
- `severity`
  - P0 / P1 / P2
- `impact`
- `workaround`
- `fix_owner`
- `status`
- `resolution_time`

## Exit Criteria

If all checks pass with no P1/P0 regressions in 24 hours, mark this line as
`POST_MERGE_STABLE`.

If any P1/P0 appears, create and escalate immediately before next production exposure step.

## Follow-up

- If non-blocking legacy renderer noise persists, move into dedicated VCPChat renderer cleanup slice.
- Any host-path regression goes to `hotfix-native-host` path with pre-merge parity checks.
