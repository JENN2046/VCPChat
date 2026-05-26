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

- Main closeout checkpoint after upstream sync promotion.

Next boundary:

- Any `main -> prod-stable` movement requires a separate promotion preflight and explicit user approval.
