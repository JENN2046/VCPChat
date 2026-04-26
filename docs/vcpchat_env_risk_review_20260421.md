# VCPChat Env Risk Review

> Date: 2026-04-21
> Scope: local runtime and configuration files in `VCPChat`

## Conclusion

The current `config.env` and `.env` files in `VCPChat` should be treated as local runtime configuration, not as part of a frozen product module.

They are useful for execution, but they are not stable product source and should stay out of the repository-level progress denominator.

## Reviewed Files

- `VCPDistributedServer/Plugin/DeepMemo/config.env`
- `VCPDistributedServer/Plugin/FileOperator/.env`

## Findings

### `VCPDistributedServer/Plugin/DeepMemo/config.env`

This file contains local path and token limit settings:

- `VchatDataURL=A:\\VCP\\VCPChat`
- `MaxMemoTokens=60000`

This is runtime configuration tied to the local checkout layout. It is not a product capability by itself.

### `VCPDistributedServer/Plugin/FileOperator/.env`

This file is explicitly framed as a configuration template and includes local absolute paths and debug settings.

The values point at local developer directories and machine-specific behavior, so it should be treated as a runtime template or local config artifact rather than a frozen module input.

## Recommended Handling

These files should be handled in one of two ways:

1. Keep them excluded from the countable source surface and treat them as local runtime state.
2. If the repository eventually needs committed defaults, replace them with sanitized example files and keep the runtime versions untracked.

## Effect on Scope Freeze

Neither file should be counted in the first `VCPChat` module freeze.

They do not belong to the desktop shell / IPC slice, and they do not justify expanding the denominator.

## Next Step

Keep the current `VCPChat` cleanup focused on source-bearing files only.
Any later cleanup of these env files should be treated as a separate, explicit config hygiene batch.
