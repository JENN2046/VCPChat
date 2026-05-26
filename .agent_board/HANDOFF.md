# VCPChat Handoff

Date: 2026-05-26

Goal:

- Move VCPChat from branch stack state toward sustainable branch governance.
- Complete upstream sync candidate promotion into `main` while preserving stable-line control.

Current status:

- `origin/main` contains PR #40 via merge commit `b3412ddc036056e32029f2876894e12107148ea4`.
- Local `main` is fast-forwarded to `origin/main`.
- `promotion/upstream-main-20260526` remains as a review/rollback reference.
- `prod-stable` is unchanged.
- `.vcp_ready` is local runtime output and should stay uncommitted.
- `main -> prod-stable` preflight decision is `preflight-pass-with-conditions`.

Changed in this checkpoint:

- `docs/vcpchat_sync_upstream_main_20260526_promotion_gate.md`
- `docs/vcpchat_main_to_prod_stable_preflight_20260526.md`
- `.agent_board/RUN_STATE.md`
- `.agent_board/CHECKPOINT.md`
- `.agent_board/TASK_QUEUE.md`
- `.agent_board/VALIDATION_LOG.md`
- `.agent_board/HANDOFF.md`

Validation run after merge:

- `node --check scripts\topic-sponsor-smoke.js`
- `node scripts\topic-sponsor-smoke.js`
- `npm run test:photo-studio`
- `ELECTRON_UI_SMOKE_TIMEOUT_MS=70000 node scripts\electron-ui-smoke.js`

Next safe action:

- Decide whether to create local branch `promotion/main-to-prod-stable-20260526` from `origin/prod-stable` and merge `origin/main` into it for branch-specific validation.

Hard boundary:

- Do not move `prod-stable`, delete branches, or push new checkpoint commits without explicit user instruction.
