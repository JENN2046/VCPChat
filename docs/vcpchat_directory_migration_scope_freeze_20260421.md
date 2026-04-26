# VCPChat Directory Migration Scope Freeze

> Date: 2026-04-21
> Status: Draft
> Scope candidate: `VCPChat directory migration`

## Purpose

This batch opens the first real directory migration line for `VCPChat`.

It starts only after the structural refactor compatibility line has already landed helper, parser, settings, and AppData compatibility support.

This is not a compatibility batch.

This is the first batch that may actually move or rename source-bearing directories.

## Why This Is A New Batch

The compatibility line already closed these prerequisites:

- canonical root helpers
- Rust and JavaScript path compatibility
- settings compatibility
- selected AppData anchor compatibility
- migration and rollback notes

That line reduced path ambiguity, but it intentionally did **not** move directories.

Directory migration changes the repository shape itself, so it must be treated as a separate batch with a different rollback surface.

## Proposed Scope

This batch may include:

- moving or renaming source-bearing directories
- updating import and module path references required by those moves
- updating loader references that point to moved source locations
- updating checked-in template and documentation references that become invalid after directory moves
- validating that canonical roots remain the only supported ownership model

## Explicit Exclusions

This batch must not automatically include:

- live runtime env values from:
  - `VCPDistributedServer/Plugin/DeepMemo/config.env`
  - `VCPDistributedServer/Plugin/FileOperator/.env`
- unrelated feature delivery
- AI image follow-up
- branch cleanup or release work
- broad runtime behavior changes unrelated to directory ownership

## Migration Rule

Directory migration must build on the completed compatibility layer.

That means:

- helpers and compatibility fallbacks already exist before directories move
- directory moves must not redefine the live env boundary
- the migration batch must keep repo history limited to source, templates, docs, and loader references

## Candidate Migration Surface

The initial migration surface should stay narrow.

Recommended first-pass candidates:

- source-bearing plugin directories that still rely on old relative-depth assumptions
- shared runtime or server-owned directories whose names or placement conflict with the target ownership model
- docs and template references that still describe the old layout as canonical

The first migration pass should avoid renaming everything at once.

## Validation Expectation

Before implementation starts, the following should be frozen:

- the exact directories that will move or rename
- the exact references that will be updated in the same batch
- the rollback anchor that restores the old layout
- the migration order for any multi-step move

## Recommended Next Step

Open a concrete execution checklist for:

1. migration candidates
2. move order
3. reference update surface
4. validation points
5. rollback boundary

## Recommendation

Treat `VCPChat directory migration` as a new high-discipline batch.

It should remain separate from the compatibility closeout and should not begin with ad hoc file moves.
