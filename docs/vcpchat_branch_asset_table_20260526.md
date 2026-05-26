# VCPChat Branch Asset Table

Date: 2026-05-26

Purpose: classify current local and remote branch assets after the upstream sync, stable promotion, and stable-fix backflow.

## Strategic Lines

| Branch | Commit | Role | Status | Policy |
| --- | --- | --- | --- | --- |
| `upstream/main` | `97b08af` | external upstream source | absorbed for this cycle | read-only intake source; do not use as stable line |
| `origin/main` | `642256b` | integration main | current remote integration baseline | absorbs upstream, local fixes, and backflow fixes |
| `origin/prod-stable` | `e593ea7` | stable release line | current stable baseline | only promote through reviewed PRs |
| `origin/custom` | `0d1137c` | long-lived custom line | not evaluated in this closeout | preserve until a separate custom strategy decision |

## Completed 2026-05-26 Work Branches

| Branch | Commit | Type | Status | Keep / Cleanup Decision |
| --- | --- | --- | --- | --- |
| `sync/upstream-main-20260526` | `0d9b639` | local sync candidate | completed, superseded by PR #40 | keep short-term as local audit/reference branch |
| `origin/promotion/upstream-main-20260526` | `0231245` | remote PR branch | PR #40 merged to `main` | keep short-term as PR evidence; cleanup later after observation window |
| `promotion/main-to-prod-stable-20260526` | `a60a195` | local stable promotion branch | PR #41 merged to `prod-stable` | keep short-term as stable promotion evidence |
| `origin/promotion/main-to-prod-stable-20260526` | `a60a195` | remote stable promotion branch | PR #41 merged | keep until stable observation completes; then delete through explicit cleanup |
| `backflow/prod-stable-review-fixes-20260526` | `7806bdd` | local backflow branch | PR #42 merged to `main` | keep short-term as stable-to-main backflow evidence |
| `origin/backflow/prod-stable-review-fixes-20260526` | `7806bdd` | remote backflow branch | PR #42 merged | keep until docs closeout PR lands; then delete through explicit cleanup |
| `docs/branch-governance-closeout-20260526` | current docs branch | remote-docs candidate | pending PR to `main` | intended to land governance docs only |

## Local Divergent / Historical Branches

| Branch | Commit | Status | Classification | Policy |
| --- | --- | --- | --- | --- |
| `main` | `d67285c` | local-only governance commits, behind remote main backflow merge | local docs staging history | do not push directly; superseded by `docs/branch-governance-closeout-20260526` PR path |
| `prod-stable` | `f7e95ed` | local-only older stable docs checkpoint, behind `origin/prod-stable` | local historical checkpoint | do not use for promotion; real stable line is `origin/prod-stable` |
| `dev` | `6892020` | old local branch | historical / unknown | freeze until separately audited |
| `my-custom` | `d0406a6` | old local custom branch | custom asset / unknown | preserve until custom-line strategy |
| `custom` | `6bd83c9` local, `origin/custom@0d1137c` remote | divergent custom line | strategic custom asset | do not clean without a dedicated custom audit |

## Backup / Archaeology Branches

| Branch Pattern | Examples | Classification | Policy |
| --- | --- | --- | --- |
| `backup/*` | `backup/prod-stable-pre-pr33-promotion-20260430`, `backup/origin-custom-pre-upstream-integration-20260425` | rollback archaeology | keep until branch-retention policy is agreed |
| `codex/*` | `codex/promote-prod-stable-20260513`, `codex/custom-stabilization-followup-20260427` | historical task branches | keep until reviewed for deletion |
| `feature/*` | `feature/vcpchat-ai-image-split` | feature archaeology | freeze; clean only after feature ownership review |
| `postmerge/*`, `rebuild/*` | `postmerge/vcpchat-native-host-regression`, `rebuild/vcpchat-ai-image-split-clean` | historical integration helpers | freeze until branch cleanup pass |

## Naming Policy Going Forward

- `sync/upstream-main-YYYYMMDD`: local upstream merge candidates before main promotion.
- `promotion/upstream-main-YYYYMMDD`: remote PR branches from sync candidate to `main`.
- `promotion/main-to-prod-stable-YYYYMMDD`: stable promotion PR branches.
- `backflow/prod-stable-*-YYYYMMDD`: fixes flowing from stable back to `main`.
- `docs/branch-governance-closeout-YYYYMMDD`: governance-only documentation PRs.
- `hygiene/*`: mechanical cleanup, CI path-filter changes, whitespace cleanup.

## Current Final Decision

```text
upstream-sync-absorbed-to-stable-and-backflowed
```

Meaning:

- `upstream/main` was absorbed into `origin/main`.
- `origin/main` was promoted into `origin/prod-stable`.
- PR #41 review fixes were backflowed into `origin/main`.
- Governance docs are now being prepared for a separate docs-only PR into `main`.
