# VCPChat Target Directory Model Draft

> Date: 2026-04-21
> Scope: `VCPChat structural refactor`
> Stage: target directory model

## Purpose

This draft defines the target directory model for the next `VCPChat` structural refactor step.

It does not move files yet.

The goal is to freeze a stable ownership model before changing directory layout or config parsing rules.

## Core Rule

The refactor should reduce path ambiguity by using a small number of explicit roots.

Recommended canonical roots:

1. `workspace root`
2. `server root`
3. `plugin root`
4. `runtime data root`

Everything path-sensitive should resolve relative to one of these roots, not by ad hoc depth walking.

## Target Ownership Model

### 1. Workspace Root

Meaning:

- the checkout root of `A:\VCP\VCPChat`

Should own:

- source tree layout
- shared docs
- repo-level scripts
- checked-in defaults and templates

Should not directly own:

- plugin-local private config files
- generated runtime state

### 2. Server Root

Meaning:

- `VCPDistributedServer`

Should own:

- server bootstrap
- plugin discovery
- server-level generated config or runtime coordination files
- shared plugin loader logic

Should not own:

- plugin-local template defaults
- user-local runtime secrets

### 3. Plugin Root

Meaning:

- each plugin directory under `VCPDistributedServer/Plugin/<PluginName>`

Should own:

- plugin source
- plugin manifest
- plugin-local checked-in template defaults such as `config.env.example` or `.env.example`
- plugin-specific parser/loader code if local config is required

Should not own:

- workspace-global runtime directories
- unrelated server state

### 4. Runtime Data Root

Meaning:

- a dedicated runtime-owned data tree such as `AppData`

Should own:

- generated state
- runtime caches
- downloaded files
- server-generated env-like runtime config
- mutable user data

Should not own:

- checked-in source
- checked-in templates
- product manifests

## Target Resolution Model

### Shared Defaults

Shared defaults should resolve from checked-in template files only.

Examples:

- `config.env.example`
- `.env.example`

These belong to plugin root ownership.

### Live Runtime Values

Live runtime values remain local and out of repo history.

Examples:

- `VCPDistributedServer/Plugin/DeepMemo/config.env`
- `VCPDistributedServer/Plugin/FileOperator/.env`

These should be treated as local runtime overlays, not structural anchors.

### Server-Owned Generated Config

Generated server-side config should move toward runtime data root ownership rather than being mixed into source layout assumptions.

Example:

- `AppData/generated_lists/config.env`

## Recommended Base Rules

### Plugin-local files

Resolve from plugin root.

Use for:

- manifests
- checked-in templates
- plugin-owned loaders

### Shared runtime data

Resolve from runtime data root.

Use for:

- `AppData`
- downloads
- generated outputs
- caches

### Repo-level scripts and docs

Resolve from workspace root.

Use for:

- migration scripts
- structural docs
- shared tooling

### Server-owned generated state

Resolve from server root only when the file is truly server-scoped.

Otherwise move it conceptually under runtime data root.

## What Should Change Later

The refactor should aim to remove these current anti-patterns:

- walking fixed numbers of `..` segments to infer project root
- mixing cwd-based dotenv loading with plugin-relative fallback paths
- letting the same plugin family use different path bases across runtimes
- treating live env files as if they define structural ownership

## Directory Model Implications

This target model implies:

- path parsers need an explicit base contract
- template placeholders such as `<workspace>` need a formal resolver or replacement
- plugin code should stop inferring workspace root through fragile relative depth
- runtime data and source layout should stop sharing the same path assumptions

## Recommended Next Step

Use this target model to draft a parser update note.

That note should define:

- canonical base selection
- placeholder expansion
- migration fallback behavior
- how Node and Rust layers converge on the same rules
