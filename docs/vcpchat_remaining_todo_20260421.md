# VCPChat Remaining TODO

> Date: 2026-04-21
> Status: Active

## Current Position

The main VCPChat cleanup and template workstreams are complete enough to stop expanding scope.

The remaining work is intentionally narrow.

## Open TODOs

1. Keep these runtime files local and uncommitted:
   - `VCPDistributedServer/Plugin/DeepMemo/config.env`
   - `VCPDistributedServer/Plugin/FileOperator/.env`

2. Do not fold live env values back into repo history.

3. If future config work is needed, split it into a separate batch:
   - `config/template` for `*.example`
   - `config/hygiene` for local runtime handling

4. If folder structure changes again, update the templates and parsing rules first.

5. Do not reopen the completed feature batches unless a separate fix is explicitly requested.

## Non-Goals

- No new feature work
- No shell / IPC expansion
- No plugin boundary reshaping
- No AI image follow-up in this batch
- No commit for the two live env files

## Closeout Rule

This TODO list is complete when the two local env files stay local and no new config work is opened without a separate scope freeze.
