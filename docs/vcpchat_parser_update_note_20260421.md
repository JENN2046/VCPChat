# VCPChat Parser Update Note

> Date: 2026-04-21
> Scope: `VCPChat structural refactor`
> Stage: parser and loader update note

## Purpose

This note defines the parser and loader direction for the planned `VCPChat` structural refactor.

It does not implement the refactor yet.

The goal is to converge Node loaders, Rust loaders, and plugin/server config resolution onto one explicit model.

## Problem Statement

The current implementation mixes multiple path bases:

- plugin-local `__dirname`
- executable-relative search
- cwd-based dotenv loading
- server-relative runtime config paths

This creates three concrete problems:

1. the same plugin family does not resolve config the same way across runtimes
2. directory refactor can silently break relative-depth assumptions
3. template placeholders are documented for humans but not yet formalized for loaders

## Target Parser Contract

Every path-sensitive config read should answer these questions explicitly:

1. What is the config source?
2. What is the base root?
3. Is the value a template default or a live runtime override?
4. Does the value require placeholder expansion?

The parser should not infer these answers from ad hoc file depth.

## Canonical Config Sources

### 1. Checked-in template source

Examples:

- `config.env.example`
- `.env.example`

Purpose:

- shared defaults
- documentation of expected keys
- migration-safe examples

Rule:

- never read these as live runtime input automatically in production flow

### 2. Live local runtime source

Examples:

- `config.env`
- `.env`

Purpose:

- local checkout overrides
- developer or machine-specific runtime values

Rule:

- local only
- not committed
- read only when the plugin/runtime explicitly opts into live env loading

### 3. Server-owned generated runtime source

Examples:

- `AppData/generated_lists/config.env`

Purpose:

- runtime-generated server state
- mutable generated config

Rule:

- treated as runtime data, not template or source

## Canonical Base Selection

### Plugin root

Use when reading:

- plugin manifest
- plugin-local templates
- plugin-local live env files

### Runtime data root

Use when reading:

- `AppData`
- downloads
- generated files
- mutable caches

### Workspace root

Use when reading:

- migration documents
- repo-level scripts
- structural config notes

### Server root

Use only for:

- server-owned loader logic
- server-scoped generated config

## Placeholder Expansion Rule

The current `<workspace>` placeholder should not be treated as a plain literal.

There are only two valid future paths:

1. formalize placeholder expansion in the loader
2. remove placeholders and replace them with canonical relative-path rules

Recommended default:

- keep placeholder expansion only for checked-in templates
- do not require live local env files to use placeholders

## Convergence Rules

### DeepMemo

Current mismatch:

- Node layer reads plugin-local `config.env`
- Rust layer searches executable-relative candidates

Target:

- both layers resolve the same config source with the same base contract
- both layers derive runtime data root from the same explicit rule

### FileOperator

Current mismatch:

- dotenv loads from cwd
- fallback directories derive from plugin-relative paths

Target:

- `.env` source becomes explicitly plugin-root based or explicitly injected
- fallback runtime directories derive from runtime data root, not fragile relative depth

### PluginManager

Current overlap:

- manifest `configSchema`
- `process.env`
- plugin-local env files

Target:

- decide one canonical ownership order, for example:
  1. explicit injected config
  2. live local env
  3. checked-in defaults
- avoid making `process.env` and plugin-local files compete implicitly

## Recommended Migration Strategy

### Phase 1

- define helper utilities for canonical roots
- keep old resolution paths readable as fallback

### Phase 2

- migrate plugin loaders to explicit base-aware helpers
- update templates to match the new parser contract

### Phase 3

- remove fragile relative-depth assumptions
- drop deprecated fallback behavior after validation

## Validation Requirements

Before merge, verify:

- Node and Rust implementations agree on config location semantics
- no loader depends on cwd unless explicitly intended
- templates remain sanitized and shareable
- live env files stay out of the repo and out of the staged set
- runtime data still resolves under the chosen runtime data root

## Next Step

The next valid design artifact is a migration and rollback note.

That note should define:

- temporary compatibility fallbacks
- what can be moved first
- what must move together
- how to roll back if path resolution breaks
