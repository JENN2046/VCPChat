# VCPChat Local Env Final Boundary

> Date: 2026-04-21
> Scope: `VCPChat` runtime configuration boundary

## Final Boundary

The following files remain local runtime state and must not be committed:

- `VCPDistributedServer/Plugin/DeepMemo/config.env`
- `VCPDistributedServer/Plugin/FileOperator/.env`

These files are checkout-specific execution inputs, not shared product source.

## Stable Rules

1. `*.example` files are the only shared defaults surface.
2. Live `config.env` / `.env` files stay local to the current checkout.
3. Do not add the live env files to product PRs or merge commits.
4. Do not count the live env files in module or progress denominators.
5. If folder structure changes again, update the example templates and parsing rules first.
6. Do not push local runtime values back into the repository just to match a refactor.

## Current State

The shared template files have already been sanitized for portable defaults:

- `VCPDistributedServer/Plugin/DeepMemo/config.env.example`
- `VCPDistributedServer/Plugin/FileOperator/.env.example`

The live runtime files are intentionally left outside repository history.

## Operational Implication

Future config work should split into two separate questions:

- shared defaults in `*.example`
- local checkout values in live env files

Those two concerns should not be merged into one batch.

## Closeout

This boundary is the default rule for `VCPChat` local env handling until a separate config migration batch explicitly changes it.
