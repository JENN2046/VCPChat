# VCPChat V1 Positioning / Scope / Non-Goals / Success Criteria

## Status

This document freezes the intended V1 product positioning for the `VCPChat` + `codex-router` embedding line as of 2026-04-23.

It is a product-definition draft for the first real embedding pass. It is not a claim that the full V1 implementation is already complete.

Approved scope freeze:

- `A:\VCP\VCPChat\docs\vcpchat_v1_scope_freeze_20260423.md`

## Positioning

`VCPChat V1` is positioned as a **native VCP agent desktop host**, not as a generic Codex host replacement.

Under this positioning:

- `VCPToolBox` remains the cognition, memory, and tool runtime core.
- `VCPChat` remains the desktop interaction shell, renderer, observer surface, and local host carrier.
- `codex-router` is embedded as the governance shell that adds explicit routing, approval and risk gates, checkpoint and resume, memory preflight, telemetry, and audit.

The practical meaning of this positioning is:

- V1 should preserve native VCP semantics instead of flattening them into a generic host abstraction first.
- V1 should reuse the donor VCP memory and tool runtime instead of rebuilding them inside `VCPChat`.
- V1 should make the existing runtime more governable, recoverable, and observable on desktop.

## Core Product Goal

The V1 goal is to make `VCPChat` a reliable desktop host for native VCP agent execution with an explicit governance layer.

This means V1 is primarily about:

- hosting task execution on desktop
- reusing VCP-native memory and tool capabilities
- making runs checkpointable and resumable
- adding explicit control-plane behavior where the existing system is currently implicit

V1 is not primarily about creating a new standalone agent runtime from scratch.

## Scope

The intended V1 scope is limited to the first practical host path.

### 1. Host role

`VCPChat` should act as the real desktop host surface for `codex-router`.

This includes:

- accepting router-driven task execution
- exposing the host bindings needed by the governance shell
- supporting a recoverable run and resume path

### 2. Memory role

V1 should reuse the existing donor VCP memory stack through:

- `VCPChat -> VCPToolBox /mcp/codex-memory`

The host-side first-pass memory surface is:

- `record_memory`
- `search_memory`
- `memory_overview`

This should be described as reuse of the full VCP Agent memory core with the core transport entrypoints wired first.

### 3. Governance role

`codex-router` should provide the explicit governance shell for the host path, including:

- routing decisions
- preflight checks
- approval and risk gates
- checkpoint and resume behavior
- telemetry and audit visibility

### 4. Runtime surface

The first host pass should focus on the smallest useful runtime surface.

Already aligned or targeted first:

- `read_thread_terminal`
- `shell_command`
- memory core transport surface

Planned after the first stable host pass:

- `spawn_agent`
- `wait_agent`
- `send_input`
- `close_agent`
- `apply_patch`
- `automation_update`

## Non-Goals

The following are explicit V1 non-goals.

### 1. Not a generic Codex host first

V1 should not be optimized first as a generic Codex-compatible host abstraction.

Broader Codex-style compatibility may become a later direction, but it is not the primary V1 definition.

### 2. Not a new memory backend

V1 should not build a new standalone memory backend inside `VCPChat`.

The donor memory path should remain the default for the first embedding pass.

### 3. Not full protocol completion on day one

V1 should not claim that all memory protocol, recall governance, visibility policy, or package-level protocol layers are already complete inside the host.

The first pass is about getting the host path real and governable, not about finishing every governance layer.

### 4. Not total unification of all legacy entrypoints

V1 should not attempt to router-ize every historical `VCPChat` feature surface in one pass.

The first pass should prioritize the host path required for a stable native VCP agent desktop execution line.

### 5. Not a full rewrite

V1 should not replace the existing VCP runtime model.

The correct strategy is to add an explicit governance shell around the existing runtime and host boundaries.

## Success Criteria

V1 should be considered successful when the following conditions are met.

### 1. Real host path

`VCPChat` can act as a real `codex-router` desktop host for at least one stable execution path.

### 2. Donor memory path works in host reality

The donor memory path through `VCPToolBox /mcp/codex-memory` is available and stable for the host embedding flow.

### 3. Recoverability exists

At least one meaningful `run -> checkpoint -> resume` path is present and validated.

### 4. Governance is explicit

Routing, preflight, risk gating, and audit are exposed as explicit control-plane behavior rather than remaining only as scattered implicit logic.

### 5. Native VCP semantics are preserved

The first embedding pass does not break or flatten native VCP memory and runtime semantics beyond what is necessary for host integration.

### 6. Scope remains controlled

The host path reaches a usable baseline without expanding into a broad rewrite of unrelated `VCPChat` surfaces.

## Decision Summary

The V1 definition can be summarized in one sentence:

`VCPChat V1` is the desktop host and governance carrier for native VCP agent execution, with `VCPToolBox` retained as the donor cognition, memory, and tool runtime core.

## Future Direction

If V1 is stable, later versions may expand toward:

- broader Codex-style host compatibility
- richer runtime-method coverage
- fuller recall governance and visibility policy
- stronger package-schema enforcement across host and runtime boundaries

Those are later-stage evolution goals, not required conditions for the initial V1 positioning.
