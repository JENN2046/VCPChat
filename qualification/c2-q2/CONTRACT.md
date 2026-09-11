# Q2 hardware resource qualification

This additive test successor discovers whether currently admitted hosted runners can
provide the physical-platform evidence missing after Q1. It does not change the
provider, attestor, five-purpose protocol, profile catalog, production source or
canonical authority. Q1 inputs are checked byte-for-byte before compilation.

Read-only discovery invokes Get-Tpm and opens/closes Microsoft Platform Crypto Provider
on Windows; CryptoKit SecureEnclave.isAvailable is queried on macOS. Discovery does not
initialize TPM, enroll, change keychain policy, capture biometric input or modify ACLs.
The exact frozen Q1 TARGET probe then uses a random disposable qualification key
namespace, with cleanup, and never falls back to the software diagnostic provider.

A successful CI job means that probes executed and evidence was collected. It is not
a hardware/provenance/isolation or pre-production qualification PASS. Unavailable
hardware and absent legitimate test signing remain explicit limitations. Production
signing, Host enrollment, receipt creation and deployment are absent from this workflow.

If TARGET succeeds, its actual lifecycle/signature/foreign-process results must be
reviewed before selecting further qualification work. If no accessible hardware path
exists, do not repeat software tests as a substitute, fabricate an attestor, provision
unapproved real machines, or use production signing credentials.
