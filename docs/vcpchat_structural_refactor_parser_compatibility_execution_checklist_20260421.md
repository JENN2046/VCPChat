# VCPChat Parser Compatibility Execution Checklist

> Date: 2026-04-21
> Scope: `VCPChat parser compatibility`
> Status: Draft

## Objective

Prepare a controlled execution path for parser and loader compatibility work on top of the canonical path helper foundation.

## Preconditions

Before implementation starts, confirm all of the following:

1. The work is being treated as a new compatibility batch.
2. The current local env boundary remains unchanged:
   - `VCPDistributedServer/Plugin/DeepMemo/config.env`
   - `VCPDistributedServer/Plugin/FileOperator/.env`
3. Shared config defaults still belong only in:
   - `VCPDistributedServer/Plugin/DeepMemo/config.env.example`
   - `VCPDistributedServer/Plugin/FileOperator/.env.example`
4. The helper foundation already exists and is the base for the next step.

## Execution Stages

### 1. Identify remaining compatibility points

- List every loader or parser that still assumes the old path model.
- Mark which ones are already covered by the helper foundation.
- Keep the review focused on compatibility, not redesign.

### 2. Define accepted placeholder behavior

- Confirm which placeholder forms stay valid.
- Confirm how unknown or malformed placeholders should fall back.
- Keep the rules aligned with the sanitized template model.

### 3. Update the remaining loaders

- Apply only the minimal compatibility changes needed.
- Avoid expanding the blast radius into unrelated modules.

### 4. Validate the compatibility boundary

- Confirm the adjusted loaders still resolve current paths correctly.
- Confirm example files remain sanitized and portable.
- Confirm live env files are not staged or committed.

### 5. Bound the rollout

- Keep the change reviewable as a small compatibility step.
- Stop before any directory rename or broad reshaping unless that becomes unavoidable.

## Required Outputs

This batch should produce:

- a compatibility note or small code patch
- a loader/parser validation result
- a rollback boundary note if behavior changes

## Explicit Non-Goals

- Do not commit live `config.env` or `.env` values.
- Do not reopen the completed cleanup batches.
- Do not mix parser compatibility with unrelated feature delivery.
- Do not expand this into a broad directory migration unless the user explicitly starts that batch.

## Closeout Condition

This checklist is complete when parser and loader behavior is aligned with the new root model and the live env boundary remains untouched.
