# VCPChat Config Template Placeholder Rules

> Date: 2026-04-21
> Scope: `VCPChat config template batch`
> Status: Draft

## Purpose

This note defines how placeholder values in the `*.example` files should be interpreted.

The goal is to keep template files portable without hardcoding developer-specific absolute paths.

## Placeholder Rules

### `<workspace>`

Use `<workspace>` to mean the current checkout root or an equivalent workspace root resolved by the runtime.

Examples:

- `<workspace>/Downloads`
- `<workspace>/backups/FileOperator`
- `<workspace>/dailynote`

This placeholder is intentionally not a literal filesystem path.

### Relative Defaults

Relative defaults are preferred when the plugin already resolves paths relative to the repository or plugin root.

Examples:

- `../../AppData`
- `./downloads`

Use relative defaults only when the plugin behavior is already stable and documented.

### Explicit Local Values

Do not put developer-specific absolute paths in the example files.

Avoid values like:

- `A:\VCP\VCPChat`
- `/Users/zhaoyuanhao/Documents`
- `A:\VCP\备份`

If a real absolute path is needed for local execution, it belongs in the live runtime file, not in the shared example file.

## Example File Expectations

### DeepMemo

The example file may show:

- a relative `VchatDataURL`
- neutral numeric limits
- optional rerank placeholders

It should not show:

- a real API key
- a developer checkout path
- a machine-specific rerank endpoint

### FileOperator

The example file may show:

- a placeholder allowlist
- a workspace-relative download directory
- a workspace-relative backup directory

It should not show:

- user home directories
- desktop-specific paths
- machine-specific backup folders

## Migration Rule

If a future folder-structure refactor changes how paths are resolved, update the placeholder interpretation first.

Only after that should the example files be adjusted again.

This keeps the template batch portable and reduces repeated rewrites.
