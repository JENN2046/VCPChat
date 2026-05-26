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
- Local syntax, smoke, and Electron UI validation passed after narrow fixes on the sync branch.
- Remaining promotion prerequisites are still open:
  - whitespace policy for upstream trailing whitespace has not been decided.
  - TopicSponsor full write-path validation is still deferred unless explicitly accepted.

This is not a `freeze-sync-branch` decision because no functional blocker has been found.

This is not yet `promote-ready` because promotion still needs a whitespace-policy decision and final reviewer acceptance.

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
- Electron UI smoke: `ELECTRON_UI_SMOKE_TIMEOUT_MS=70000 node scripts/electron-ui-smoke.js`, passed
  - main window loaded
  - `messageRenderer.renderMessage` was present
  - `TavernManager` and `TavernRulesEngine` were present
  - `GroupRenderer` was present
  - `tavernGetRules` returned successfully
  - desktop window opened
  - notes window opened from `Desktopmodules/legacy/Notemodules/notes.html`
  - notemini window opened from `Desktopmodules/legacy/Notemodules/notemini.html`

Known non-passing:

- `git diff --check cedda29^1..cedda29` reports trailing whitespace in upstream-absorbed files

## Required Gates Before `promote-ready`

### Passed: Electron UI Smoke

Local smoke verification now covers:

- main app window starts
- desktop window starts
- notes window opens from current legacy path
- notemini window opens from current legacy path
- tavern manager UI loads
- groupchat renderer surface loads alongside tavern rule engine
- message renderer module loads and exposes `renderMessage`

Smoke fixes made on top of the merge candidate:

- `modules/ipc/promptHandlers.js`: added duplicate IPC registration guard so the second prompt handler initialization no longer prevents later `tavernHandlers.initialize(...)`.
- `Desktopmodules/legacy/Notemodules/notes.html`: fixed legacy notes vendor/style/pretext paths from `../...` to root-relative traversal from the notes module directory.
- `Desktopmodules/legacy/Notemodules/notes.js`: fixed dynamic highlight theme paths used during theme application.
- `modules/filterManager.js`: made notification filtering safe before `filterManager.init(...)`, preventing early `vcp-log-message` events from crashing the renderer.
- `preloads/chat.js`: added channel-tagged subscription callback diagnostics while preserving throw behavior.
- `scripts/electron-ui-smoke.js`: added reusable local Electron/Puppeteer smoke.

Evidence:

- `node --check` passed for changed JS files.
- `git diff --check` passed for the touched smoke/fix files.
- Electron UI smoke passed without page-level failures or failed file/script/style requests.

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

Resolve the remaining promotion gates:

- decide whitespace policy for upstream trailing whitespace
- run or explicitly defer TopicSponsor write-path route smoke
- perform final reviewer acceptance on the listed changed surfaces

Until those pass or are explicitly accepted, the candidate remains:

```text
needs-fix
```
