# VCPChat Validation Log

Date: 2026-05-26

Context: post-merge validation on `main` after PR #40.

Local validation:

- `node --check scripts\topic-sponsor-smoke.js`: passed.
- `node scripts\topic-sponsor-smoke.js`: passed.
  - `CreateTopic`
  - `history.json`
  - `config.json`
  - `ReadTopicContent`
  - `CheckTopicOwnership`
- `npm run test:photo-studio`: passed, 25/25.
- `ELECTRON_UI_SMOKE_TIMEOUT_MS=70000 node scripts\electron-ui-smoke.js`: passed.
  - main renderer probes passed
  - desktop window probes passed
  - notes window probes passed
  - notemini window probes passed

Remote validation:

- PR #40 checks passed before merge.
- JS smoke passed.
- Rust Assistant Engine check/test passed on macOS, Ubuntu, and Windows.
- Rust Assistant Engine release build passed on macOS, Ubuntu, and Windows.

Not validated:

- No `prod-stable` release validation was run.
- No stable-line promotion was performed.
- Notes rich edit/save persistence depth was not exhaustively tested.
- Tavern/groupchat prompt semantics were not tested through long real conversation fixtures.

## main -> prod-stable Preflight

Date: 2026-05-26

Source/target:

- Source: `origin/main@b3412dd`
- Target: `origin/prod-stable@3b51c7b`

Validation:

- changed JS syntax check across `origin/prod-stable..origin/main`: passed for 46 changed `.js` files.
- `node --check scripts\topic-sponsor-smoke.js`: passed.
- `node scripts\topic-sponsor-smoke.js`: passed.
- `npm run test:photo-studio`: passed, 25/25.
- `ELECTRON_UI_SMOKE_TIMEOUT_MS=70000 node scripts\electron-ui-smoke.js`: passed.
- `git merge-tree --write-tree origin/prod-stable origin/main`: produced tree `ddc74cb192c96867221e09f769a5c5fe84c501e6`, no textual conflict reported.

Known non-pass:

- `git diff --check origin/prod-stable..origin/main`: failed with 3,813 trailing-whitespace issue lines inherited from the upstream sync candidate.

Not validated:

- The actual `promotion/main-to-prod-stable-20260526` branch has not been created.
- No PR to `prod-stable` has been opened.
- No stable branch movement has been performed.

## promotion/main-to-prod-stable-20260526

Date: 2026-05-26

Branch:

- `promotion/main-to-prod-stable-20260526@a972109`
- Base: `origin/prod-stable@3b51c7b`
- Merged source: `origin/main@b3412dd`

Validation:

- changed JS syntax check across `origin/prod-stable..HEAD`: passed for 46 changed `.js` files.
- `node --check scripts\topic-sponsor-smoke.js`: passed.
- `node scripts\topic-sponsor-smoke.js`: passed.
- `npm run test:photo-studio`: passed, 25/25.
- `ELECTRON_UI_SMOKE_TIMEOUT_MS=70000 node scripts\electron-ui-smoke.js`: passed.

Known non-pass:

- `git diff --check origin/prod-stable..HEAD`: failed with 3,813 trailing-whitespace issue lines inherited from upstream sync.

Not validated:

- No remote promotion branch was pushed.
- No PR to `prod-stable` was opened.
- No stable branch movement was performed.
