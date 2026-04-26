# VCPChat Structural Refactor Execution Checklist

> Date: 2026-04-21
> Scope: `VCPChat structural refactor`
> Status: Draft

## Objective

Prepare a controlled execution path for:

- directory structure refactor
- config parsing and resolution refactor

This checklist is for staging the work, not for mixing it into the completed cleanup closeout batch.

## Preconditions

Before implementation starts, confirm all of the following:

1. The refactor is being treated as a new batch.
2. The current local env boundary remains unchanged:
   - `VCPDistributedServer/Plugin/DeepMemo/config.env`
   - `VCPDistributedServer/Plugin/FileOperator/.env`
3. Shared config defaults still belong only in:
   - `VCPDistributedServer/Plugin/DeepMemo/config.env.example`
   - `VCPDistributedServer/Plugin/FileOperator/.env.example`
4. The refactor target is concrete enough to describe:
   - current layout
   - target layout
   - migration boundary

## Execution Stages

### 1. Inventory current path resolution

- Identify where config paths are resolved from:
  - process cwd
  - plugin root
  - repository root
  - workspace root
- List the config keys whose meaning depends on current directory layout.
- Identify hardcoded relative paths that would break if directories move.

### 2. Freeze the target directory model

- Define which source-bearing directories are actually moving or being renamed.
- Separate product code layout changes from runtime/state exclusions.
- Do not mix source reorganization with unrelated feature edits.

### 3. Freeze config resolution rules

- Define the new canonical base for path resolution.
- Decide whether placeholders such as `<workspace>` remain valid, change shape, or need replacement.
- Define how existing example files should map onto the new structure.

### 4. Define migration behavior

- Decide whether a compatibility shim is required.
- Decide whether old paths remain temporarily readable.
- Decide whether templates need one-step or two-step migration.

### 5. Bound the implementation surface

- Limit code edits to:
  - directory references
  - config parsers/loaders
  - template defaults
  - migration notes
- Keep live env values out of the implementation surface.

### 6. Validate before merge

- Confirm moved directories still resolve correctly.
- Confirm template files still represent sanitized shared defaults.
- Confirm live env files are not staged or committed.
- Confirm no unrelated feature slices were pulled into the refactor batch.

## Required Outputs

This batch should produce:

- a path-resolution inventory
- a target layout note
- a parser update note
- a template migration note
- a rollback boundary

## Explicit Non-Goals

- Do not commit live `config.env` or `.env` values.
- Do not reopen the completed shell / IPC, AI image, or plugin boundary batches.
- Do not mix feature delivery with structural refactor.
- Do not assume the current placeholder rules survive unchanged without inventory.

## Closeout Condition

This checklist is complete when the structural refactor can be described as a bounded, reviewable batch with:

- a known source surface
- a known config parsing surface
- unchanged live env boundary
- a separate `config/template` companion path
