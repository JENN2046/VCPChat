# VCPChat Settings Compatibility Execution Checklist

> Date: 2026-04-21
> Scope: `VCPChat settings compatibility`
> Status: Draft

## Objective

Prepare a controlled execution path for settings and runtime-data compatibility work on the canonical root model.

## Preconditions

Before implementation starts, confirm all of the following:

1. The work is being treated as a new compatibility batch.
2. The current local env boundary remains unchanged:
   - `VCPDistributedServer/Plugin/DeepMemo/config.env`
   - `VCPDistributedServer/Plugin/FileOperator/.env`
3. Shared config defaults still belong only in:
   - `VCPDistributedServer/Plugin/DeepMemo/config.env.example`
   - `VCPDistributedServer/Plugin/FileOperator/.env.example`
4. The parser compatibility helper already exists.

## Execution Stages

### 1. Inventory settings lookup points

- Identify core executors and services that still read `settings.json` via `AppData`.
- Keep the review focused on settings/runtime resolution, not feature logic.

### 2. Freeze the settings resolution rule

- Decide whether `settings.json` remains under runtime data root.
- Decide whether the server and executors should use one shared helper.
- Keep the rule compatible with the canonical root model.

### 3. Update the core resolvers

- Apply the minimal compatibility changes needed.
- Avoid expanding the blast radius into unrelated modules.

### 4. Validate the compatibility boundary

- Confirm the updated resolvers still locate `settings.json` correctly.
- Confirm live env files are not staged or committed.
- Confirm the change does not reopen the previously closed cleanup batches.

### 5. Bound the rollout

- Keep the change reviewable as a small compatibility step.
- Stop before any broad directory reshaping unless it becomes unavoidable.

## Required Outputs

This batch should produce:

- a settings compatibility note or small code patch
- validation of settings lookup behavior
- a rollback boundary note if behavior changes

## Explicit Non-Goals

- Do not commit live `config.env` or `.env` values.
- Do not reopen the completed cleanup batches.
- Do not mix settings compatibility with unrelated feature delivery.
- Do not broaden into full directory migration unless explicitly started later.

## Closeout Condition

This checklist is complete when the core settings/runtime-data resolvers are aligned with the canonical root model and the live env boundary remains untouched.
