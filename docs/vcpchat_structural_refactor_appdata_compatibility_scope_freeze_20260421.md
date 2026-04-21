# VCPChat AppData Compatibility Scope Freeze

> Date: 2026-04-21
> Status: Draft
> Scope candidate: `VCPChat AppData compatibility`

## Purpose

This batch opens the remaining compatibility work for modules that still resolve runtime state through `AppData` directly.

The earlier helper foundation, parser compatibility, and settings compatibility batches already narrowed the surface.

What remains here is specifically the set of entry points that still encode `AppData` as their default runtime root or path anchor.

## Why This Is A New Batch

This is narrower than the previous compatibility batches:

- it focuses on runtime state path anchors
- it does not expand into directory reshaping
- it does not reopen the live env boundary

## Proposed Scope

This batch may include:

- `ChatRoomViewer` default root resolution
- `PromptSponsor` default agent and preset path resolution
- any other runtime entry point that still assumes `AppData` as the base anchor

## Explicit Exclusions

This batch must not automatically include:

- live runtime env values from:
  - `VCPDistributedServer/Plugin/DeepMemo/config.env`
  - `VCPDistributedServer/Plugin/FileOperator/.env`
- unrelated feature slices
- shell / IPC behavior changes
- AI image follow-up
- broad directory migration

## Config Rule

This batch keeps the live env boundary unchanged.

- shared defaults still belong in `*.example`
- live `config.env` / `.env` remain local runtime state
- `AppData` anchors should be resolved through the canonical root model or an explicit compatibility shim

## Validation Expectation

Before implementation, the following should be clear:

- which modules still use `AppData` directly
- whether their default path can be mapped to `runtimeDataRoot`
- whether a compatibility shim is needed for custom roots

## Recommended Next Step

Open an execution checklist for:

1. remaining `AppData` anchors
2. default root mapping
3. minimal compatibility edits
4. validation and rollback boundary

## Recommendation

Treat `VCPChat AppData compatibility` as a separate batch from settings compatibility and parser compatibility.
