# VCPChat V1 Scope Freeze

## Status

This document freezes the approved V1 scope for the `VCPChat` +
`codex-router` embedding line as of 2026-04-23.

This freeze is based on the earlier positioning draft:

- `A:\VCP\VCPChat\docs\vcpchat_v1_positioning_scope_non_goals_success_criteria_20260423.md`
- `A:\VCP\VCPChat\docs\vcpchat_v1_native_host_live_acceptance_20260423.md`
- `A:\VCP\VCPChat\docs\vcpchat_v1_native_host_pr_closeout_20260423.md`
- `A:\VCP\VCPChat\docs\vcpchat_v1_native_host_merge_readiness_checklist_20260423.md`

## Decision

`VCPChat V1` is approved to proceed as a **native VCP agent desktop host**
embedding, with `codex-router` acting as the governance shell and
`VCPToolBox` retained as the donor cognition, memory, and tool runtime core.

This freeze means the V1 line is not to be treated as:

- a generic Codex host replacement
- a new memory-backend project
- a full rewrite of existing VCPChat runtime surfaces

## In Scope

The following items are in scope for V1.

### 1. Real host path

`VCPChat` should host at least one real `codex-router` execution path.

### 2. Donor memory path

The first embedded memory path remains:

- `VCPChat -> VCPToolBox /mcp/codex-memory`

The first-pass host-side memory surface is limited to:

- `record_memory`
- `search_memory`
- `memory_overview`

### 3. Governance shell

The embedded governance shell is expected to cover:

- routing
- preflight
- approval and risk gates
- checkpoint and resume
- telemetry and audit visibility

### 4. First runtime surface

The first runtime surface should stay narrow.

Current first-pass surface:

- `read_thread_terminal`
- `shell_command`
- memory core transport surface

Deferred runtime methods may follow after the first stable host pass.

### 5. Product integrity

The V1 path must preserve native VCP semantics rather than flattening them into
a generic host contract first.

## Explicit Out Of Scope

The following items are frozen out of the initial V1 scope.

- generic Codex-host compatibility as the primary goal
- a new memory system inside `VCPChat`
- full completion of all memory-governance and protocol layers on day one
- router-ization of every historical `VCPChat` feature surface
- broad runtime-method completion before the first stable host path exists
- unrelated VCPChat cleanup or rewrite work not required by the host path

## Acceptance Line

The V1 scope freeze should be considered satisfied only when these conditions
are true.

1. `VCPChat` can host at least one stable `codex-router` execution path.
2. The donor memory path works in the embedded host flow.
3. At least one meaningful `run -> checkpoint -> resume` flow is validated.
4. Governance behavior is explicit and inspectable.
5. Native VCP semantics are preserved through the first embedding pass.
6. The host path is delivered without scope expansion into a broad rewrite.

## Dependencies

The freeze assumes these role boundaries remain intact.

- `VCPToolBox`: donor cognition, memory, and tool runtime
- `VCPChat`: desktop host, interaction shell, renderer, observer surface
- `codex-router`: governance control plane

## Change Control

Any proposal that changes one of the following should be treated as a new
decision point, not as silent V1 continuation work:

- replacing the donor memory path
- redefining V1 as a generic Codex host
- adding broad historical feature migration into the denominator
- expanding V1 into a full runtime rewrite

## One-Line Freeze

`VCPChat V1` is frozen as the first native VCP desktop host embedding for
`codex-router`, using `VCPToolBox` as the donor cognition, memory, and tool
runtime core.

## Merge Readiness

- `A:\VCP\VCPChat\docs\vcpchat_v1_native_host_pr_closeout_20260423.md`
- `A:\VCP\VCPChat\docs\vcpchat_v1_native_host_merge_readiness_checklist_20260423.md`
- `A:\VCP\VCPChat\docs\vcpchat_v1_native_host_post_merge_regression_20260423.md`
