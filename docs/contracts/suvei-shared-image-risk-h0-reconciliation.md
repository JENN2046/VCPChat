# Shared image-risk H0 reconciliation

VCPChat must reconstruct the complete current Core authorization terms when a
Workbench-authorized image-risk intent enters native tool review. Omitting
`imageRiskContext`, `acceptUnresolvedPriorOutcome` or
`acceptRetainedResponsibility` produces `SUVEI_COMMITTED_AUTHORIZATION_MISMATCH`
even though Core already committed the Owner H0.

The existing review now preserves the complete immutable risk context in its
canonical snapshot and verifies the committed digest. It also preserves the
Owner assessment identity when that is the correction basis; exactly one AI or
Owner basis is required. Drift in nested history, costs, source or mask remains
a failure. The modal displays the recorded risk decisions and exposure, keeping
internal execution units separate from money.

Pending risk intents require Workbench H0. Reconciliation only confirms the
existing native transport request; it does not POST another authorization or
execute a provider command. Expired authorization remains nonrecoverable for
execution. The existing revoke path and tool-approval deadline still apply.

Verification covers generation and AI/Owner correction, nested risk drift,
incorrect digest/scope/basis, pending H0 rejection, expiry, and notification
review rendering. Tests use synthetic records and DOM fixtures. Separate local
historical-snapshot verification reproduced the former digest mismatch and
confirmed the full corrected digest, without network or live authority changes.

This does not establish why any particular live button appeared disabled. A
fresh main-window request is enabled in the DOM regression; settled or expired
notifications retain their existing disabled behavior. No approval rule,
credential handling or Core authorization is weakened.

Installation requires checking the exact running service/renderer source,
preserving unrelated working changes and private settings, backing up only the
two changed runtime modules, and using the normal VCPChat restart lifecycle.
Live installation and a fresh native approval remain separate acceptance steps.
