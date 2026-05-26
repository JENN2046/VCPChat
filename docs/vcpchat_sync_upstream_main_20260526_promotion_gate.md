# VCPChat sync/upstream-main-20260526 Promotion Gate

Date: 2026-05-26
Candidate branch: `sync/upstream-main-20260526`
Candidate merge commit: `cedda29`
Target integration line: `main`
Decision status: `promote-ready`

## Gate Purpose

This gate defines when `sync/upstream-main-20260526` may be promoted into `main`.

It does not authorize promotion by itself. Promotion into `main` remains a separate local branch movement that requires explicit user confirmation.

## Current Decision

Decision: `promote-ready`

Reason:

- The branch is reviewable and rollback-able.
- Local syntax, smoke, and Electron UI validation passed after narrow fixes on the sync branch.
- TopicSponsor write-path validation passed in an isolated local AppData fixture.
- Upstream trailing whitespace is accepted as sync noise for this candidate and is not a promotion blocker.
- Reviewer acceptance is recorded below with residual risks separated from promotion blockers.

This is not a `freeze-sync-branch` decision because no functional blocker has been found.

This is not a `needs-fix` decision because all required local candidate gates are now either passed or explicitly accepted with bounded residual risk.

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
- TopicSponsor isolated write-path smoke: `node scripts/topic-sponsor-smoke.js`, passed
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

Policy:

- Accept upstream trailing whitespace as sync noise for this candidate.
- Do not block promotion on this whitespace-only check.
- Do not mix whitespace cleanup into this sync candidate.
- If desired, perform cleanup later in a dedicated hygiene branch or post-promotion cleanup commit scoped to upstream-added whitespace.

## Final Gate Outcomes

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

### Passed: TopicSponsor Route Smoke

The controlled-error startup smoke passed.

The write-path smoke also passed through an isolated local fixture:

- command: `node scripts/topic-sponsor-smoke.js`
- fixture: copied TopicSponsor entry and `vcpPathRoots` into an isolated fake workspace under `AppData/topic-sponsor-smoke/`
- verified commands: `CreateTopic`, `ReadTopicContent`, `CheckTopicOwnership`
- verified writes:
  - fake `AppData/Agents/<agent>/config.json`
  - fake `AppData/UserData/<agent>/topics/<topic>/history.json`
  - `current_topic_id`
  - `locked: false`
  - `unread: true`
  - `creatorSource: "plugin:TopicCreator"`
  - `_metadata.topicCreator`
  - `_metadata.creatorAgentId`

This does not invoke a live VCPDistributedServer route and does not touch real user data.

### Accepted: Whitespace Policy Decision

Decision:

- Accept upstream trailing whitespace as sync noise for this candidate.
- Keep the candidate review focused on semantic merge safety and local fixes.
- Defer whitespace cleanup to a separate future hygiene branch or post-promotion cleanup commit if the team wants a clean whitespace baseline.

Rationale:

- The whitespace failures are in upstream-absorbed files, not in the narrow smoke/fix files added after the merge.
- Bulk cleanup would create a large mechanical diff across upstream content and reduce review clarity.
- `git diff --check` was still run against touched smoke/fix files and passed there.

### Accepted: Reviewer Acceptance

| Surface | Evidence | Residual risk |
| --- | --- | --- |
| `modules/ipc/desktopHandlers.js` | Photo Studio smoke passed; Electron UI smoke opened the desktop window. | Standalone child-process cleanup behavior was not stress-tested across all standalone apps. |
| `modules/ipc/notesHandlers.js` | Electron UI smoke opened notes and notemini using the corrected legacy paths. | Notes edit/save interaction depth remains manual/deeper-test territory. |
| `Desktopmodules/legacy/Notemodules/**` | Electron UI smoke loaded `notes.html` and `notemini.html`; fixed asset path failures were verified absent in the smoke. | Rich editor workflows and persistence edge cases were not exhaustively automated. |
| `VCPDistributedServer/Plugin/TopicSponsor/**` | Controlled-error startup smoke passed; isolated write-path smoke passed for create/read/ownership. | Live server route wiring was not invoked; entrypoint and data-write behavior were validated locally. |
| `Tavernmodules/**` | Electron UI smoke confirmed `TavernManager` and `TavernRulesEngine`; tavern rule engine smoke passed. | Prompt semantics should still be watched in real conversations. |
| `modules/ipc/tavernHandlers.js` | Electron UI smoke confirmed `tavernGetRules` returns successfully. | Broader IPC route combinations were not exhaustively tested. |
| `modules/tavernRulesEngine.js` | Standalone tavern rule engine smoke passed; Electron UI smoke loaded the shared engine. | Complex rule ordering/conflict cases were not fully enumerated. |
| `Desktopmodules/legacy/Groupmodules/groupchat.js` | Electron UI smoke confirmed `GroupRenderer` loads alongside tavern rule surfaces. | End-to-end groupchat prompt injection behavior needs real workflow observation. |
| `modules/messageRenderer.js` | Electron UI smoke confirmed `messageRenderer.renderMessage` is present. | Deep markdown/LaTeX/tool-result visual regressions require broader renderer fixtures or manual review. |
| `modules/renderer/contentPipeline.js` | Main renderer loaded through Electron UI smoke after the content pipeline sync. | Pipeline edge cases beyond startup/render availability remain review risk. |
| `styles/messageRenderer.css` | Main renderer loaded without failed CSS requests in Electron UI smoke. | Pixel-level layout and long-content visual regressions were not fully snapshotted. |

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

The candidate is now locally `promote-ready`.

Next safe actions are decision-only until the user explicitly approves branch movement:

- review this branch as a promotion candidate
- decide whether to locally merge `sync/upstream-main-20260526` into `main`
- if approved later, perform the promotion procedure above and rerun post-merge validation on `main`

Current candidate decision:

```text
promote-ready
```

## Post-Main Merge Closeout

Date: 2026-05-26

Status: `merged-to-main`

Remote PR:

- PR: `#40 Promote upstream main sync candidate`
- Head branch: `promotion/upstream-main-20260526`
- Base branch: `main`
- PR head: `0231245 fix: preserve translator and group history state`
- Merge commit on `origin/main`: `b3412ddc036056e32029f2876894e12107148ea4`

Merge evidence:

- PR #40 was merged into `origin/main`.
- Local `main` was fast-forwarded to `origin/main`.
- Local `main` now points at `b3412dd`.
- `promotion/upstream-main-20260526` remains available as a rollback/review reference.
- `prod-stable` was not touched.
- `.vcp_ready` remains local runtime output and is not part of the sync or merge commits.

Post-merge validation on `main`:

- `node --check scripts\topic-sponsor-smoke.js`: passed
- `node scripts\topic-sponsor-smoke.js`: passed
  - verified `CreateTopic`
  - verified generated `history.json`
  - verified generated `config.json`
  - verified `ReadTopicContent`
  - verified `CheckTopicOwnership`
- `npm run test:photo-studio`: passed, 25/25
- `ELECTRON_UI_SMOKE_TIMEOUT_MS=70000 node scripts\electron-ui-smoke.js`: passed
  - main renderer probes passed
  - desktop window probes passed
  - notes window probes passed
  - notemini window probes passed

GitHub validation:

- JS smoke checks passed.
- Rust Assistant Engine checks passed on macOS, Ubuntu, and Windows.
- Release builds passed on macOS, Ubuntu, and Windows.
- Codex Review re-review reported no major issues after the final review fixes.
- All review conversations were resolved.
- PR merge state was `CLEAN` before merge.

Current governance decision:

```text
main-integrated
```

This closeout does not authorize `prod-stable` promotion.

Next safe phase:

1. Observe `main` as the new integration baseline.
2. Prepare a separate `main -> prod-stable` promotion preflight when explicitly requested.
3. Keep `promotion/upstream-main-20260526` and PR #40 as the review and rollback evidence for this sync.
