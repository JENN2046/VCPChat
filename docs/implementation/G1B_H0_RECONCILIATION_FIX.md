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

Base: VCPChat 28a1c85ad5b8cdf28fc4ac9c80223122ab9e9617 (local runtime source).
The separately fetched JENN2046/VCPChat main currently resolves to 39e074fb;
therefore this patch has not been pushed as a main-target PR or deployed.
The active runtime has unrelated changes and was not modified.

Validation:
- node --test tests/suvei-human-authorization.test.js: 59 passed.
- notification-change-audit.test.js: 18 passed, using the existing local
  runtime node_modules through NODE_PATH (initial clean worktree lacked jsdom).
- git diff --check passed.
- A read-only comparison against the current C receipt confirmed that legacy
  terms mismatch and the recovery-aware Core terms match. No receipt or secret
  is included in this patch.

Deployment remains pending: verify the running desktop build/source, back up
its existing service module, install this narrowly scoped module change only
if the base matches, and restart VCPChat through the user's normal lifecycle.
Rollback restores the previous service module and restarts the client. Do not
resend until the client is updated; check C's canonical state and H0 expiry first.
No provider execution or new H0 was performed as part of this fix.
