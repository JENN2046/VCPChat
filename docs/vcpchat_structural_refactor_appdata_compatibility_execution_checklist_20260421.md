# VCPChat AppData Compatibility Execution Checklist

> Date: 2026-04-21
> Scope: `VCPChat AppData compatibility`
> Status: Draft

## Objective

Prepare a controlled execution path for modules that still use `AppData` as a direct runtime anchor.

## Preconditions

Before implementation starts, confirm all of the following:

1. The work is being treated as a new compatibility batch.
2. The current local env boundary remains unchanged:
   - `VCPDistributedServer/Plugin/DeepMemo/config.env`
   - `VCPDistributedServer/Plugin/FileOperator/.env`
3. Shared config defaults still belong only in:
   - `VCPDistributedServer/Plugin/DeepMemo/config.env.example`
   - `VCPDistributedServer/Plugin/FileOperator/.env.example`
4. The parser and settings compatibility layers already exist.

## Execution Stages

### 1. Inventory remaining `AppData` anchors

- Identify modules that still compute defaults via `AppData`.
- Focus on default roots, not unrelated logic.

### 2. Freeze the default mapping

- Decide whether each anchor maps to `runtimeDataRoot`.
- Keep custom-root overrides compatible where they already exist.

### 3. Update the entry points

- Apply minimal compatibility edits only.
- Avoid broad directory reshaping.

### 4. Validate the compatibility boundary

- Confirm the updated defaults still resolve runtime files correctly.
- Confirm live env files are not staged or committed.
- Confirm the change does not reopen earlier cleanup batches.

### 5. Bound the rollout

- Keep the change reviewable as a small compatibility step.
- Stop before turning this into a full migration batch.

## Required Outputs

This batch should produce:

- a small compatibility patch
- a validation result
- a rollback boundary note if behavior changes

## Explicit Non-Goals

- Do not commit live `config.env` or `.env` values.
- Do not reopen the completed cleanup batches.
- Do not mix runtime anchor updates with unrelated feature delivery.

## Closeout Condition

This checklist is complete when the remaining `AppData`-anchored entry points are mapped onto the canonical runtime root model without disturbing the live env boundary.
