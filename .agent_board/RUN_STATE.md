# VCPChat Run State

Date: 2026-05-26

Workspace: `A:\VCP\VCPChat`

Current branch: `main`

Current remote integration baseline:

- `origin/main`: `b3412ddc036056e32029f2876894e12107148ea4`
- Source PR: `#40 Promote upstream main sync candidate`
- Promotion branch: `promotion/upstream-main-20260526`
- PR head: `0231245 fix: preserve translator and group history state`

State:

- Upstream sync candidate has been merged into `origin/main`.
- Local `main` has been fast-forwarded to the same merge commit.
- `prod-stable` has not been moved.
- `.vcp_ready` is local runtime output and must remain uncommitted.

Mode:

- Main to prod-stable promotion preflight.

Next boundary:

- Any `main -> prod-stable` movement requires a separate promotion preflight and explicit user approval.

Current preflight:

- Source: `origin/main@b3412dd`
- Target: `origin/prod-stable@3b51c7b`
- Local promotion branch: `promotion/main-to-prod-stable-20260526@a972109`
- Decision: `promotion-branch-validated-with-accepted-whitespace-risk`
- Required next step before stable movement: push the promotion branch and open a PR to `prod-stable` only after explicit user approval.

Stable closeout:

- PR #41 merged into `origin/prod-stable`.
- New `origin/prod-stable`: `e593ea759ba4d535620cd764f939f3503c90492e`.
- Final promotion branch head: `a60a195`.
- PR #42 backflowed stable-only fixes into `origin/main` as `642256b9919f0574ff81eba96895717886ad5d03`.
- Branch asset table prepared in `docs/vcpchat_branch_asset_table_20260526.md`.
- Decision: `upstream-sync-absorbed-to-stable-and-backflowed`.
