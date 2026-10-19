# G1B committed H0 reconciliation

The VCPChat authorization review reconstructed an ordinary generation digest for
an already-authorized Workbench risk-replacement intent. Core includes the exact
recoveryContext, acceptUnresolvedPriorOutcome, and
acceptUnverifiedContinuationOutcome in that digest. Omitting them caused
SUVEI_COMMITTED_AUTHORIZATION_MISMATCH before execution.

This patch recognizes the exact G1B risk-replacement policy and single-output
limits for committed authority only. Pending recovery intents still require
Workbench H0. The recovery evidence participates in the preview snapshot, and
the decision rereads and verifies the complete terms digest. No credential,
allowlist, Core authorization, or ToolBox approval bypass is introduced.

Current base: JENN2046/VCPChat default branch `NuobaoVCPchat` at
`5af217ad99091e673060c2540ebf8db5bda69223` (checked 2026-10-19).
The fork default branch is not `main`; `main` is a historical branch.
The original patch was prepared against local HEAD `28a1c85a`. The current
remote default branch has 51 additional commits, while this authorization
service and its existing authorization test are unchanged across those bases.
The patch was carried into a separate clean worktree on the current base.
The active runtime directory has extensive unrelated uncommitted updates and
was not changed. This work has not been pushed, merged, or installed there.

Current-base validation:
- node --test tests/suvei-human-authorization.test.js
  tests/notification-change-audit.test.js: 77 passed, zero failures.
- Existing local runtime node_modules was resolved through NODE_PATH for jsdom;
  this is a source regression check, not a clean dependency-install check.
- git diff --check against the current remote base passed.
- The earlier read-only comparison against the October 8 C receipt confirmed
  that legacy terms mismatch and recovery-aware Core terms match. That is
  historical evidence; no fresh production receipt or execution was read or
  performed during this October 19 compatibility check.
- No receipt, credential, or secret is included in this patch.

Deployment remains pending: verify the running desktop build/source, back up
its existing service module, install this narrowly scoped module change only
if the base matches, and restart VCPChat through the user's normal lifecycle.
Rollback restores the previous service module and restarts the client. Do not
resend until the client is updated; check C's canonical state first. The October 8 H0 has expired, so any new
execution requires a fresh applicable Owner H0.
No provider execution or new H0 was performed as part of this fix.
