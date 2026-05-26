# VCPChat Upstream Sync Stable Closeout

Date: 2026-05-26

Scope: close out the 2026-05-26 upstream sync after promotion into the stable release line.

## Final State

Upstream sync path:

```text
upstream/main -> origin/main -> origin/prod-stable
```

Main integration:

- PR: `#40 Promote upstream main sync candidate`
- Main merge commit: `b3412ddc036056e32029f2876894e12107148ea4`
- Result: merged into `origin/main`

Stable promotion:

- PR: `#41 Promote main sync candidate to prod-stable`
- Stable merge commit: `e593ea759ba4d535620cd764f939f3503c90492e`
- Result: merged into `origin/prod-stable`

Promotion branch:

- `promotion/main-to-prod-stable-20260526`
- Final head: `a60a195 fix: keep log highlight and note windows stable`
- Branch retained as review/rollback evidence.

Runtime artifact:

- `.vcp_ready` remained local runtime output.
- `.vcp_ready` was not staged, committed, or pushed.

## Validation

Before PR #41:

- changed JS syntax check across `origin/prod-stable..HEAD`: passed for 46 changed `.js` files
- `node --check scripts\topic-sponsor-smoke.js`: passed
- `node scripts\topic-sponsor-smoke.js`: passed
- `npm run test:photo-studio`: passed, 25/25
- `ELECTRON_UI_SMOKE_TIMEOUT_MS=70000 node scripts\electron-ui-smoke.js`: passed

PR #41 initial CI:

- JS smoke passed.
- Rust Assistant Engine check/test passed on macOS, Ubuntu, and Windows.
- Rust Assistant Engine release build passed on macOS, Ubuntu, and Windows.

Review-fix validation:

- `node --check Logmodules\log.js`: passed
- `node --check modules\ipc\notesHandlers.js`: passed
- `git diff --check -- Logmodules\log.js modules\ipc\notesHandlers.js`: passed
- UTF-8 Basic auth smoke using `用户:密码`: passed
- log keyword highlight smoke with filter `span`: passed
- Electron UI smoke: passed

Review status:

- Codex Review after final fixes: no major issues.
- All PR #41 review conversations were resolved before merge.
- PR #41 merge state was `CLEAN` before merge.

## Accepted Risk

Whitespace debt:

- `git diff --check origin/prod-stable..HEAD` reported inherited upstream trailing-whitespace debt.
- Counted issue lines during preflight: 3,813.
- This debt was explicitly accepted for stable promotion.
- No broad whitespace cleanup was mixed into the stable promotion.

CI path-filter gap:

- Later review-fix commits touched `Logmodules/log.js` and `modules/ipc/notesHandlers.js`.
- Current GitHub Actions path filters did not trigger new checks for those files.
- Local targeted validation and Electron UI smoke were used for those review fixes.

## Stable-Only Delta After Merge

After PR #41, `origin/prod-stable` includes all of `origin/main` and also has stable-line review fixes that are not yet on `origin/main`:

- `2b2c5e0 fix: harden log center reload and auth`
- `a60a195 fix: keep log highlight and note windows stable`

Files differing from `origin/main`:

- `Logmodules/log.js`
- `modules/ipc/notesHandlers.js`

Governance implication:

- The next upstream/main sync or main maintenance step should backflow these stable-line fixes into `main`, or record them as stable-only hotfixes until the next integration cycle.

## Rollback Anchor

Previous remote stable head:

```text
3b51c7b
```

New remote stable head:

```text
e593ea7
```

Rollback policy:

- Do not force-reset `prod-stable`.
- If rollback is needed after merge, prefer an explicit revert PR against `prod-stable`.
- Keep PR #41 and `promotion/main-to-prod-stable-20260526` as the promotion evidence.

## Decision

Final decision:

```text
upstream-sync-absorbed-to-stable
```

Meaning:

- The upstream sync has been absorbed by `main`.
- The reviewed main candidate has been promoted into `prod-stable`.
- Stable release line has the 2026-05-26 sync plus PR #41 review fixes.
- Remaining governance work is follow-up hygiene, not a blocker for this sync closeout.
