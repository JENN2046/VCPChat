# VCPChat V1 Native Host Validation Addendum (2026-04-24)

## Purpose

This addendum records the final pre-PR validation posture for the
`feature/vcpchat-v1-native-host` line after local shell validation became
temporarily unavailable.

## Current Validation Status

- Code review: pass, no blocker found in the current host path.
- Prior live acceptance: pass, Electron renderer smoke previously validated
  `inspect`, `run`, and `resume`.
- Memory audit overview: pass, prior VCPChat native host checkpoints are visible.
- Shell validation: recovered in the current environment for the targeted
  native host syntax checks.
- Memory recall search: recovered in the current environment; the prior
  `unable to open database file` degradation is not currently reproducing.
- Fresh Electron startup smoke: pass after the isolated worktree was given a
  real `node_modules` path via a local junction.
- Fresh Electron renderer control-path smoke: pass for `inspect`, `run`, and
  `resume` through the real `VCPChat` renderer. The `run/resume` task was
  intentionally approval/preflight-blocked to avoid dispatching live desktop
  primitives.
- Side-effecting DesktopRemote dispatch smoke: pass for local
  `CreateWidget -> QueryDesktop -> ViewWidgetSource -> DeleteWidget cleanup`.

## Shell Validation Recovery

The earlier local shell executor failure is no longer reproducing for targeted
project validation.

Recovered validation on 2026-04-24:

```text
node --check modules/services/codexRouterHost.js
node --check modules/ipc/desktopRemoteHandlers.js
node --check preloads/chat.js
node --check preloads/desktop.js
node --check renderer.js
```

All five commands completed successfully in the current environment.

The earlier observed failure signature remains useful historical context:

```text
Windows PowerShell ... 8009001d
```

Treat it as a recovered local execution-environment caveat unless it reappears.

## Memory Recovery

`memory_overview` is available and confirms the prior accepted checkpoints.

`search_memory` also succeeded in the current environment and recalled the
checkpoint that recorded the earlier shell and memory caveats.

The earlier one-off failure remains useful historical context:

```text
unable to open database file
```

Treat it as a recovered memory-recall caveat unless it reappears.

## Host Inspect Smoke

A non-GUI host skeleton smoke was run through the native host service layer.

Observed result:

- `ready = true`
- `pendingRuntimeMethods = []`
- `pendingMemoryMethods = []`
- `pendingOptionalMemoryMethods = []`
- wired methods include `read_thread_terminal`, `spawn_agent`, `wait_agent`,
  `send_input`, `close_agent`, `shell_command`, `apply_patch`,
  `automation_update`, `record_memory`, `search_memory`, and
  `memory_overview`

This confirms the host service can load the `codex-router` host client, policy,
directive builders, and VCPChat bindings in the current Node environment.
It does not replace a fresh Electron renderer smoke.

## Electron Startup Smoke

The isolated worktree at `A:\VCP\VCPChat_native_host` initially failed to start
because it did not have a real `node_modules` directory:

```text
Error: Cannot find module 'fs-extra'
Require stack:
- A:\VCP\VCPChat_native_host\main.js
```

`NODE_PATH` did not resolve that Electron main-process module lookup. A local
directory junction was created:

```text
A:\VCP\VCPChat_native_host\node_modules -> A:\VCP\VCPChat\node_modules
```

After that, Electron was launched with:

```text
electron . --desktop-only --remote-debugging-port=9225
```

Observed result:

- process remained alive after 20 seconds
- Rust audio engine started and reported ready
- desktop handlers and desktop remote handlers initialized
- distributed server listened on port `5974`
- desktop window auto-opened
- preload and renderer initialization logs were emitted

Observed non-blocking local-data caveats:

- `AppData/settings.json` was missing in the isolated worktree
- VCP server URL was not configured, so model fetch was skipped
- distributed server could not connect without `mainServerUrl` / `vcpKey`

This validates isolated-worktree startup far enough for desktop shell
initialization. It does not validate the renderer-side `inspect/run/resume`
flow.

## Renderer Control-Path Smoke

Electron was then launched without `--desktop-only` so the main chat renderer
would be available:

```text
electron . --remote-debugging-port=9227
```

The DevTools protocol was used to find the real chat page:

```text
file:///A:/VCP/VCPChat_native_host/main.html
```

Observed page state:

- title: `VCPChat`
- `window.__vcpRendererReady = true`
- `window.codexRouterHostClient` present
- `window.chatAPI` present

Renderer-side calls were executed through the real window context:

```text
window.codexRouterHostClient.inspect()
window.codexRouterHostClient.run(taskEnvelope)
window.codexRouterHostClient.resume(taskEnvelope, options)
```

Observed result:

- `inspect`: `status = success`, `ready = true`
- `run`: `status = success`, with `decisionResult` and `executionResult`
- `resume`: `status = success`, with `decisionResult` and `executionResult`

The `run/resume` task intentionally targeted a protected release-style path.
That kept the smoke side-effect bounded:

- `decisionStatus = blocked_preflight`
- `executionStatus = not_ready`
- `blockingReasons = ["telemetry_sink_required"]`

This validates the renderer -> preload -> main IPC -> native host control path
for all three public client methods. It does not validate a side-effecting
desktop primitive dispatch.

## DesktopRemote Dispatch Smoke

After explicit approval, a bounded local DesktopRemote HTTP smoke was run
against the isolated worktree Electron runtime:

```text
electron . --desktop-only --remote-debugging-port=9233
node scripts\desktopremote-http-smoke.js
```

The distributed server reported the DesktopRemote test route enabled and
listening on `127.0.0.1:5974`. The smoke script did not print the file key; it
resolved the key through the same local config aliases used by the server.

Observed result:

- `CreateWidget`: pass for widget `desktopremote-http-smoke`
- `QueryDesktop`: pass; the smoke widget was visible
- `ViewWidgetSource`: pass; the expected smoke marker was present
- `DeleteWidget`: pass; the smoke widget cleanup succeeded
- post-cleanup `QueryDesktop`: pass; `containsSmokeWidget = false`

This validates a real local DesktopRemote dispatch path and verifies that the
test artifact is removed after the smoke run.

Observed non-blocking local-data caveats remained unchanged:

- `AppData/settings.json` was missing in the isolated worktree
- VCP server URL was not configured, so model fetch was skipped
- distributed server could not connect without `mainServerUrl` / `vcpKey`

## PR Validation Text

```md
Validation:
- Code review pass: no blocker found.
- Prior live acceptance: Electron renderer smoke passed for inspect/run/resume.
- Memory audit overview confirms prior VCPChat live acceptance checkpoints.
- Shell validation recovered: targeted native host `node --check` commands pass.
- Memory recall recovered: `search_memory` can recall the prior caveat checkpoint.
- Fresh Electron startup smoke passed in the isolated worktree after `node_modules` junction setup.
- Fresh Electron renderer control-path smoke passed for inspect/run/resume; run/resume returned blocked-preflight/not-ready as intended to avoid live primitive side effects.
- Local DesktopRemote dispatch smoke passed for CreateWidget/QueryDesktop/ViewWidgetSource with DeleteWidget cleanup; post-cleanup query confirmed the smoke widget was gone.
```

## Next Action

Proceed with PR preparation using this addendum as the validation recovery and
dispatch-smoke record. Remaining work is PR/diff review, merge-set hygiene, and
any branch or release action only after an explicit decision.
