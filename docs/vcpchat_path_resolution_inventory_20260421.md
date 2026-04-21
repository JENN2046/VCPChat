# VCPChat Path Resolution Inventory

> Date: 2026-04-21
> Scope: `VCPChat structural refactor`
> Stage: current path-resolution inventory

## Summary

The current `VCPChat` path-resolution model is not unified.

At least four different base-path strategies are in active use:

1. plugin-local file path via `__dirname`
2. executable-relative search path via `current_exe()`
3. process environment loaded from current working directory
4. server-internal fixed relative paths from `VCPDistributedServer`

This is exactly why directory structure refactor and config parsing refactor should be treated as one bounded task line.

## Inventory

### 1. DeepMemo Node layer

File:

- `VCPDistributedServer/Plugin/DeepMemo/DeepMemo.js`

Observed behavior:

- reads `config.env` from `path.join(__dirname, 'config.env')`
- derives fallback `AppData` root from `path.join(__dirname, '..', '..', '..', 'AppData')`
- parses config with `dotenv.parse`, not `dotenv.config`

Implication:

- `config.env` location is plugin-local
- fallback data root is plugin-relative
- moving the plugin directory or changing plugin depth changes the meaning of the fallback path

Reference points:

- `DeepMemo.js:135-139`
- `DeepMemo.js:148-158`

### 2. DeepMemo Rust layer

File:

- `VCPDistributedServer/Plugin/DeepMemo/src/main.rs`

Observed behavior:

- resolves `config.env` by searching:
  - `exe_dir/config.env`
  - `exe_dir/../config.env`
  - `exe_dir/../../config.env`
- if `VchatDataURL` is not set, computes project root by walking four levels up from `config_path`
- then falls back to `project_root/AppData`

Implication:

- the Rust executable uses executable-relative search, not the same rule as the Node layer
- the fallback assumes a fixed directory depth from `config.env` back to project root
- directory refactor can break this logic even if the env file still exists

Reference points:

- `src/main.rs:749-775`

### 3. FileOperator Node layer

File:

- `VCPDistributedServer/Plugin/FileOperator/FileOperator.js`

Observed behavior:

- calls `require('dotenv').config()` with no explicit `path`
- this means dotenv loads from the process working directory unless overridden externally
- also hardcodes:
  - `CANVAS_DIRECTORY = path.join(__dirname, '..', '..', '..', 'AppData', 'Canvas')`
  - fallback download dir = `path.join(__dirname, '..', '..', '..', 'AppData', 'file')`
- access control uses `path.resolve()` against each allowed directory entry

Implication:

- `.env` loading is cwd-sensitive, not plugin-local by definition
- path semantics are split:
  - config source comes from cwd
  - fallback directories come from plugin-relative `__dirname`
  - allowed-dir enforcement normalizes all values to absolute paths
- the current placeholder form in `.env.example` will need parser support if it is ever interpreted literally

Reference points:

- `FileOperator.js:13-30`
- `FileOperator.js:128-140`
- `FileOperator.js:928-939`

### 4. PluginManager config injection layer

File:

- `VCPDistributedServer/Plugin.js`

Observed behavior:

- `PluginManager` reads `configSchema` from `plugin-manifest.json`
- values come from:
  - `pluginManifest.pluginSpecificEnvConfig`
  - `process.env`
- plugin manager sets `manifest.basePath = pluginPath`

Implication:

- there is already a separate config path besides plugin-local `.env` / `config.env`
- manifest schema and live plugin dotenv loading are not the same mechanism
- structural refactor should decide whether config should come from:
  - plugin-local env files
  - process env
  - manifest-bound values
  - or an explicit normalized loader

Reference points:

- `Plugin.js:64-101`
- `Plugin.js:112-125`

### 5. DistributedServer internal config path

File:

- `VCPDistributedServer/VCPDistributedServer.js`

Observed behavior:

- hardcodes `generated_lists/config.env` under `AppData`
- path is resolved as `path.join(__dirname, '..', 'AppData', 'generated_lists', 'config.env')`
- parsed with `dotenv.parse`

Implication:

- there is at least one server-owned config path outside plugin-local env files
- not all config moves with plugins
- directory structure refactor must distinguish:
  - plugin-owned config
  - server-owned generated/runtime config

Reference points:

- `VCPDistributedServer.js:28-39`

## Current Resolution Bases

The active bases in use today are:

- plugin directory via `__dirname`
- executable directory via `current_exe()`
- current working directory via default dotenv behavior
- server root relative to `VCPDistributedServer.js`

These should be collapsed into a smaller, explicit model during refactor.

## Main Risks

1. Same plugin family uses different config resolution strategies across runtimes.
2. Relative fallback depth assumptions will break under directory moves.
3. `*.example` placeholders are sanitized for humans, but current runtime code does not yet define a universal placeholder resolver.
4. Plugin manifest config schema and plugin-local dotenv files overlap without one canonical source of truth.

## Refactor Implications

The structural refactor now has a concrete inventory target:

- unify config origin rules
- unify path base rules
- define which paths are plugin-relative, workspace-relative, or server-relative
- decide whether placeholder expansion belongs in loaders, templates, or both

## Recommended Next Step

Freeze a target resolution model before editing directories.

At minimum, define:

- canonical config base
- canonical runtime data base
- plugin-local vs server-local ownership
- placeholder expansion rules for `config/template`
