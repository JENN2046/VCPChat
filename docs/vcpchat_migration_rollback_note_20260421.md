# VCPChat Migration And Rollback Note

> Date: 2026-04-21
> Scope: `VCPChat structural refactor`
> Stage: migration and rollback note

## Purpose

This note defines the migration and rollback boundary for the planned `VCPChat` structural refactor.

It exists to prevent a directory refactor from breaking runtime path resolution without a recovery path.

## Core Rule

Do not move directories and update parsers in unrelated passes.

The following surfaces are coupled and should be treated as one migration unit:

- path resolution helpers
- plugin loader rules
- plugin-local config readers
- checked-in template defaults

## Migration Sequence

### Phase 1. Introduce canonical path helpers

Add explicit helpers for:

- workspace root
- server root
- plugin root
- runtime data root

At this stage:

- do not remove old path logic yet
- do not move directories yet
- do not change live env boundary

### Phase 2. Add parser compatibility layer

Update Node and Rust loaders so they can resolve:

- the current layout
- the target layout

At this stage:

- old layout remains readable
- new layout becomes valid
- placeholder handling is formalized for checked-in templates only

### Phase 3. Update templates and docs

Only after compatibility exists:

- update `*.example` files
- update parser notes
- update migration docs

At this stage:

- no live `config.env` or `.env` values are committed
- only template and loader contracts change in repo history

### Phase 4. Move source-bearing directories

Move or rename directories only after:

- parser compatibility is already merged or locally validated
- target directory ownership is frozen
- migration notes are current

### Phase 5. Remove deprecated fallbacks

Remove old path assumptions only after:

- the new directory model is active
- path helpers are the canonical source
- compatibility testing succeeds

## What Can Move First

Safe early changes:

- add root helper utilities
- add inventory and migration docs
- add parser abstraction layers
- add template placeholder resolver logic

Unsafe early changes:

- renaming plugin directories before parser compatibility exists
- removing cwd-based or executable-relative fallbacks before replacement paths are active
- changing runtime data locations without a compatibility shim

## What Must Move Together

The following should move together in one bounded batch:

1. loader path base rules
2. plugin config source rules
3. template placeholder interpretation
4. any directory move that changes relative-depth assumptions

If these are split apart, the risk of partial breakage is high.

## Rollback Boundary

Rollback should restore only the structural refactor batch, not the completed cleanup cycle.

Minimum rollback anchors should include:

- pre-refactor parser behavior
- pre-refactor directory layout
- pre-refactor template path semantics

Live local env files are not rollback anchors because they are intentionally outside repo history.

## Rollback Trigger Conditions

Rollback should be used if any of the following occur:

- Node and Rust loaders disagree on config location
- a plugin can no longer locate its checked-in template or live local config
- runtime data resolves into source directories
- placeholder expansion produces invalid paths
- directory moves break server-owned generated config resolution

## Validation Before Merge

Before the structural refactor merges, confirm:

- old layout still works during compatibility phase
- new layout works with the same logical config contract
- Node and Rust implementations resolve the same canonical roots
- checked-in templates remain sanitized
- live env files were not staged or modified for repo history

## Final Recommendation

Treat the structural refactor as a staged migration, not a one-shot rename pass.

The safe sequence is:

1. helper layer
2. parser compatibility
3. template/doc updates
4. directory moves
5. fallback removal
