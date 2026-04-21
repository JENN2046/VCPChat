# VCPChat Structural Refactor Scope Freeze Draft

> Date: 2026-04-21
> Status: Draft
> Scope candidate: `VCPChat structural refactor`

## Purpose

This draft opens a new task line for structural refactor work in `VCPChat`.

It is not a continuation of the completed cleanup closeout batch.

The goal is to separate two refactor questions that were intentionally left out of the previous cycle:

- directory structure refactor
- config parsing and resolution refactor

## Why This Is A New Batch

The previous `VCPChat` cycle already closed:

- cleanup and scope narrowing
- bounded feature slice merges
- config template sanitization
- local env final boundary
- branch and PR closeout

Structural refactor changes the shape of the source tree and the meaning of config paths.

That makes it a new task line with a different blast radius.

## Proposed Scope

This batch may include:

- directory layout changes for source-bearing modules
- path resolution updates for config templates
- config loading rules that distinguish:
  - shared defaults in `*.example`
  - local runtime values in live env files
- migration notes for any path-sensitive runtime entry points

## Explicit Exclusions

This batch must not automatically include:

- live runtime env values from:
  - `VCPDistributedServer/Plugin/DeepMemo/config.env`
  - `VCPDistributedServer/Plugin/FileOperator/.env`
- old cleanup slices that were already merged
- AI image experiment follow-up
- shell / IPC behavior changes unless directly required by the refactor
- unrelated feature work

## Config Rule

This structural refactor implicitly opens a new `config/template` batch.

Reason:

- directory structure changes can invalidate current placeholder paths
- template defaults may need new relative or placeholder rules
- parsing rules may need to resolve `<workspace>` or future equivalents differently

However, this does **not** reopen the local env boundary:

- live `config.env` / `.env` remain local runtime state
- only templates and parsers are eligible for repository changes

## Validation Expectation

Before this batch should be executed, the following need to be clear:

- which directories are being moved or renamed
- which config keys depend on the old structure
- whether the runtime resolves paths relative to workspace, plugin root, or process cwd
- whether a migration shim is needed to avoid breaking existing local setups

## Recommended Next Step

Do not start editing the tree blindly.

First open a concrete execution checklist for:

1. current path resolution inventory
2. target directory layout
3. parser and loader update points
4. template migration rules
5. rollback boundary

## Recommendation

Treat `VCPChat structural refactor` as a new scope freeze.

It should start only when you are ready to make repository-shape changes and accept a new `config/template` companion batch.
