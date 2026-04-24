# VCPChat V1 Native Host Post-Merge Regression Plan (24h)

## Window

Merge time + 24 hours

## Owner

VCPChat host integration owner

## Scope

Validate that the first native `codex-router` host path remains stable after merge:

- `inspect`
- `run`
- `resume`
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
