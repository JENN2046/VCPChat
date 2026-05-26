# VCPChat sync/upstream-main-20260526 Promotion Gate

Date: 2026-05-26
Candidate branch: `sync/upstream-main-20260526`
Candidate merge commit: `cedda29`
Target integration line: `main`
Decision status: `needs-fix`

## Gate Purpose

This gate defines when `sync/upstream-main-20260526` may be promoted into `main`.

It does not authorize promotion by itself. Promotion into `main` remains a separate local branch movement that requires explicit user confirmation.

## Current Decision

Decision: `needs-fix`

Reason:

- The branch is reviewable and rollback-able.
- Local syntax and smoke validation passed.
- Two promotion prerequisites are still open:
  - Electron UI smoke has not been run.
  - whitespace policy for upstream trailing whitespace has not been decided.

This is not a `freeze-sync-branch` decision because no functional blocker has been found.

This is not yet `promote-ready` because validation has not covered the real Electron renderer flows.

## Passed Gates

### Branch Shape

- Candidate branch exists locally: `sync/upstream-main-20260526`.
- Candidate commit exists locally: `cedda29`.
- Candidate was created from `origin/main`.
- `upstream/main` was merged locally.
- No remote write was performed.
- No push was performed.
- No production or stable branch was moved.

### Merge Integrity

- No unmerged paths remain.
- No merge conflict markers remain.
- `package.json` and `package-lock.json` are unchanged.
- `.env` and `config.env` were not modified.
- `.vcp_ready` remains outside the sync candidate and is treated as runtime output.

### Local Validation

Passed:

- changed JS syntax check: `node --check` passed for 42 changed `.js` paths
- Photo Studio smoke: `npm run test:photo-studio`, 25/25 passed
- tavern rule engine smoke: passed
- TopicSponsor controlled-error startup smoke: passed
- critical path existence check: passed
- precise stale critical path scan: passed

Known non-passing:

- `git diff --check cedda29^1..cedda29` reports trailing whitespace in upstream-absorbed files

## Required Gates Before `promote-ready`

### Required: Electron UI Smoke

Run local smoke verification for:

- main app window starts
- desktop window starts
- notes window opens from current legacy path
- notemini window opens from current legacy path
- tavern manager UI loads
- groupchat can reach tavern rule engine without runtime import failure
- message rendering still handles:
  - markdown tables containing `$`
  - LaTeX inline and block expressions
  - large tool results

Acceptable evidence:

- manual observation log, or
- browser/Electron automation screenshot and console-log pass, or
- local smoke script that opens the relevant windows and checks load failures

### Required: TopicSponsor Route Smoke

The controlled-error startup smoke passed.

Before promotion, run one of:

- dry-run style VCPDistributedServer route invocation if available, or
- local temp AppData fixture that exercises `CreateTopic` without touching real user data, or
- explicit human acceptance that full write-path validation is deferred

### Required: Whitespace Policy Decision

Choose one:

- accept upstream trailing whitespace as sync noise and do not block promotion, or
- make a separate whitespace cleanup commit after `cedda29`, scoped to upstream-added whitespace only

Do not mix whitespace cleanup into future conflict resolution commits.

### Required: Reviewer Acceptance

Reviewer should explicitly accept these changed surfaces:

- `modules/ipc/desktopHandlers.js`
- `modules/ipc/notesHandlers.js`
- `Desktopmodules/legacy/Notemodules/**`
- `VCPDistributedServer/Plugin/TopicSponsor/**`
- `Tavernmodules/**`
- `modules/ipc/tavernHandlers.js`
- `modules/tavernRulesEngine.js`
- `Desktopmodules/legacy/Groupmodules/groupchat.js`
- `modules/messageRenderer.js`
- `modules/renderer/contentPipeline.js`
- `styles/messageRenderer.css`

## Promotion Procedure After Gates Pass

When all required gates pass:

1. Confirm current branch is `sync/upstream-main-20260526`.
2. Confirm only approved candidate changes are present.
3. Confirm `.vcp_ready` remains excluded.
4. Switch to `main`.
5. Merge `sync/upstream-main-20260526` locally.
6. Run post-merge validation on `main`.
7. Do not push without explicit remote-write approval.

## Rollback Procedure

Before `main` promotion:

- rollback is simply: do not promote; keep or freeze `sync/upstream-main-20260526`

After local `main` promotion but before push:

- reset or revert should be chosen explicitly by the user because it moves local branch state
- preferred safe path is a local revert commit if `main` has already been shared or inspected

After remote push:

- remote rollback requires a separate explicit approval and is outside this gate

## Next Safe Action

Run Electron UI smoke for the required windows and renderer flows.

Until that passes, the candidate remains:

```text
needs-fix
```
