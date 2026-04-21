# VCPChat Directory Migration Execution Checklist

> Date: 2026-04-21
> Scope: `VCPChat directory migration`
> Status: Draft

## Objective

Prepare a controlled execution path for the first real directory migration pass in `VCPChat`.

This checklist assumes the structural refactor compatibility line has already landed.

## Preconditions

Before implementation starts, confirm all of the following:

1. The compatibility line is already closed and documented.
2. The current local env boundary remains unchanged:
   - `VCPDistributedServer/Plugin/DeepMemo/config.env`
   - `VCPDistributedServer/Plugin/FileOperator/.env`
3. Shared defaults still belong only in checked-in template files.
4. The migration surface is narrowed to explicit directories and references.
5. A rollback anchor exists before any move happens.

## Execution Stages

### 1. Freeze the candidate move set

- List each directory to move or rename.
- Record the current path and the target path.
- Keep the first pass intentionally small.

### 2. Freeze the reference update surface

- List imports, loader references, docs, and template references that must change with the move.
- Separate runtime-path references from source-layout references.
- Do not rely on opportunistic cleanup during the move.

### 3. Define migration order

- Decide whether the move is single-step or staged.
- If staged, define the stop points between steps.
- Keep rollback simple enough to restore the pre-migration layout quickly.

### 4. Execute the move as one bounded patch

- Move directories only after the update surface is frozen.
- Update references in the same batch.
- Keep unrelated code untouched.

### 5. Validate the moved layout

- Confirm imports and loaders still resolve.
- Confirm path helpers still point to the same canonical roots.
- Confirm template references still describe valid checked-in locations.
- Confirm live env files are not staged or committed.

### 6. Review rollback readiness

- Verify the old layout can be restored by reverting only this migration batch.
- Do not require manual env recreation for rollback.

## Required Outputs

This batch should produce:

- a bounded move plan
- a migrated directory layout patch
- updated path/reference documentation
- validation notes
- a rollback note tied to the migration anchor

## Explicit Non-Goals

- Do not commit live `config.env` or `.env` values.
- Do not reopen the completed compatibility line.
- Do not mix feature delivery into the migration patch.
- Do not widen the first pass into a repo-wide rename sweep.

## Closeout Condition

This checklist is complete when the first directory migration pass is reviewable as a bounded layout change with:

- a known move set
- a known reference update surface
- validated canonical root behavior
- unchanged live env boundary
