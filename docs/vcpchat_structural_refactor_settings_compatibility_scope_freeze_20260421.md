# VCPChat Settings Compatibility Scope Freeze

> Date: 2026-04-21
> Status: Draft
> Scope candidate: `VCPChat settings compatibility`

## Purpose

This batch opens the settings and runtime-data compatibility layer that remains after the path helper foundation and parser compatibility work.

The open question is how the core executors and server entry points should resolve `AppData/settings.json` and related runtime state under the canonical root model.

## Why This Is A New Batch

The parser compatibility batch already narrowed the problem to remaining loader behavior.

This batch is narrower still:

- settings file resolution
- runtime data root usage
- executor compatibility for code paths that still assume `AppData`

It is not a directory migration batch by itself.

## Proposed Scope

This batch may include:

- server-side settings path resolution
- executor-side settings path resolution
- runtime data path compatibility for core executor modules
- small migration notes if the settings lookup order changes

## Explicit Exclusions

This batch must not automatically include:

- live runtime env values from:
  - `VCPDistributedServer/Plugin/DeepMemo/config.env`
  - `VCPDistributedServer/Plugin/FileOperator/.env`
- unrelated feature slices
- AI image follow-up
- shell / IPC behavior changes
- broad directory reshaping

## Config Rule

This batch keeps the live env boundary unchanged.

- shared defaults still belong in `*.example`
- live `config.env` / `.env` remain local runtime state
- settings compatibility must stay aligned with the canonical root model

## Validation Expectation

Before implementation, the following should be clear:

- which executors still read settings from `AppData`
- whether `settings.json` should remain under runtime data root
- whether the server and executors should share a single helper
- what rollback means if settings lookup order changes

## Recommended Next Step

Open an execution checklist for:

1. core settings lookup points
2. runtime data root usage
3. minimal compatibility edits
4. validation and rollback boundary

## Recommendation

Treat `VCPChat settings compatibility` as a separate batch from parser compatibility and directory layout migration.
