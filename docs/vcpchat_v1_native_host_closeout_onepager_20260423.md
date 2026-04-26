# VCPChat V1 Native Host Closeout One-Pager (2026-04-23)

## Decision

- `VCPChat V1 native host` embedding is **merge-ready once hard gates clear**.
- Host path covered: `inspect` / `run` / `resume` end-to-end.

## Merge Gate

- Must clear:
  1) PR review-thread sweep has no blocking comments.
  2) Merge set excludes unrelated churn.
- Preconditions already satisfied:
  - Static checks on touched host/preload files.
  - Scope/documentation chain linked and consistent.
  - `.vcp_ready` artifact preserved by decision.
  - Non-blocking renderer noise moved to backlog.

## Immediate Execution

- Post-merge 24h regression:
  - [ ] 24h regression checklist executed
  - Reference: [vcpchat_v1_native_host_post_merge_regression_20260423.md]
- Reporting path:
  - Any regression follows the incident template in the 24h regression doc.

## Known Follow-ups

- `trayManager module not found`
- `Cannot read properties of undefined (reading 'get')`

These remain renderer hygiene follow-ups and are out of scope for V1 native host merge.

## Merge Note (one-line)

`feature/vcpchat-v1-native-host` delivers the first stable native host control path for `VCPChat` (`inspect/run/resume`) via codex-router; with hard gates clear, this is ready for merge and 24h post-merge watchdog.
