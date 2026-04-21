# VCPChat Parser Compatibility Scope Freeze

> Date: 2026-04-21
> Status: Draft
> Scope candidate: `VCPChat parser compatibility`

## Purpose

This batch opens the next layer of the structural refactor work.

The helper foundation is already in place. The remaining question is whether the current loaders, path parsers, and template defaults are fully compatible with the new canonical root model.

This batch is not a general cleanup batch. It is a compatibility batch.

## Why This Is A New Batch

The previous structural-refactor step already completed:

- canonical path helper foundation
- first Rust compatibility layer
- initial config path normalization
- rollback and migration notes

What remains now is narrower:

- loader compatibility at the remaining entry points
- parser behavior for template placeholders
- any small adjustment needed to keep old and new path conventions working together

That is a distinct scope from the earlier helper foundation.

## Proposed Scope

This batch may include:

- parser compatibility fixes for the new root model
- loader updates for path-sensitive config values
- template placeholder compatibility adjustments
- small migration notes if parsing behavior changes

## Explicit Exclusions

This batch must not automatically include:

- live runtime env values from:
  - `VCPDistributedServer/Plugin/DeepMemo/config.env`
  - `VCPDistributedServer/Plugin/FileOperator/.env`
- unrelated feature slices
- shell / IPC behavior changes
- AI image follow-up
- broad directory reshaping unless directly required by parser compatibility

## Config Rule

This batch keeps the `config/template` companion path active, but it does not reopen the live env boundary.

- shared defaults remain in `*.example`
- live `config.env` / `.env` remain local runtime state
- parser changes must remain compatible with the sanitized template model

## Validation Expectation

Before implementation, the following should be clear:

- which loaders still depend on old path assumptions
- which placeholder forms are accepted
- whether compatibility needs a shim or a direct parser change
- whether the change can be validated without touching live env values

## Recommended Next Step

Open a matching execution checklist for:

1. remaining loader compatibility points
2. placeholder handling and fallback rules
3. minimal test coverage for parser changes
4. rollback boundary

## Recommendation

Treat `VCPChat parser compatibility` as a bounded new batch.

It should stay separate from the previous helper foundation commit and should not absorb live env files or unrelated refactors.
