# VCPChat Checkpoint

Date: 2026-05-26

Checkpoint: upstream sync merged to main

Completed:

- PR #40 was merged into `origin/main`.
- Merge commit: `b3412ddc036056e32029f2876894e12107148ea4`.
- Local `main` was fast-forwarded to `origin/main`.
- Review findings from Codex were fixed in follow-up commits.
- All review conversations were resolved before merge.
- `promotion/upstream-main-20260526` remains available as evidence and rollback reference.
- `prod-stable` was not touched.
- `.vcp_ready` was not staged, committed, or pushed.

Validation:

- `node --check scripts\topic-sponsor-smoke.js`: passed.
- `node scripts\topic-sponsor-smoke.js`: passed.
- `npm run test:photo-studio`: passed, 25/25.
- `ELECTRON_UI_SMOKE_TIMEOUT_MS=70000 node scripts\electron-ui-smoke.js`: passed.
- GitHub PR checks passed before merge.

Residual risk:

- Main is now the integration baseline, not a stable release line.
- Notes/notemini deeper edit and persistence flows still need broader manual or automated validation before stable promotion.
- Tavern/groupchat prompt behavior should be observed in real conversations.
- `prod-stable` requires a separate promotion decision.

Next:

- `main -> prod-stable` preflight has started.
- Local branch `promotion/main-to-prod-stable-20260526` was created from `origin/prod-stable`.
- `origin/main` was merged into it as local commit `a972109`.
- Current preflight decision: `promotion-branch-validated-with-accepted-whitespace-risk`.
- PR #41 was merged into `origin/prod-stable` as `e593ea7`.
- Final closeout decision: `upstream-sync-absorbed-to-stable`.
- Next safe action is to decide whether to backflow PR #41 stable-only fixes into `main`.
