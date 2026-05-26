# VCPChat Task Queue

Date: 2026-05-26

Done:

- Built branch governance plan for the four-line model.
- Created `sync/upstream-main-20260526`.
- Completed staged upstream merge and semantic review.
- Produced sync merge audit and promotion gate docs.
- Ran local promotion validation, including Electron UI smoke.
- Promoted candidate through PR #40 into `origin/main`.
- Resolved Codex Review findings.
- Resolved review conversations and merged PR #40.
- Fast-forwarded local `main` to `origin/main`.
- Ran post-merge main validation.
- Created main closeout checkpoint.

In progress:

- None.

Remaining:

- Decide whether to observe `main` before stable promotion.
- Prepare `main -> prod-stable` promotion preflight.
- Define stable-line rollback command plan before moving `prod-stable`.
- Decide whether to keep, rename, or clean up `promotion/upstream-main-20260526` after the stable decision.

Blocked:

- `prod-stable` movement is blocked until explicit user approval after a separate preflight.
