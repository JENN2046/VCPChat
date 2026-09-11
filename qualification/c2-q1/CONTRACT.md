# Q1 qualification-only successor

This is a separate native target and separate packaged test application. All40 frozen
C2 source entries are copied byte-identically under frozen-c2. The production native
loader, Main bootstrap and Host profile catalog are unchanged. This application does
not start Host admission or contact a Host. Two frozen Host modules supply transcript
canonicalization and cryptographic verification. Importing the frozen receipt module
creates its default empty in-memory singleton; it remains unconfigured and is used
only for explicit fail-closed negative controls, never for Human admission or minting.

qualificationInit requires a fresh32-hex test namespace and one of TARGET or
SOFTWARE_DIAGNOSTIC. OS key names/tags are forced under VCPChat.Qualification.Q1 or
com.vcp.qualification.q1. Test runners create random namespaces, verify initially
absent keys, and destroy only those test keys/descriptors at completion. No production
namespace, root credentials, signing certificates, keychain reset or registry reset.

TARGET uses the historical Windows Platform Crypto Provider or macOS Secure Enclave
code. SOFTWARE_DIAGNOSTIC uses the standard OS software provider solely to distinguish
protocol/API compatibility from hardware availability. Its evidence is never promoted
to target hardware assurance. Linux remains a rejecting provider.

Five frozen Human Client transcript purposes only. The actual frozen C2 wrapper does
binding checks, nonce replay exclusion, DER/P1363 conversion and low-S normalization.
Frozen Host crypto verifies actual native signatures. No per-decision signatures.
Private export probes return a boolean only; private material is never returned or
logged. A nonexportable API result is not a claim of full extraction resistance.

Cross-process reopen/sign probes deliberately measure the same-user boundary. If a
foreign process succeeds, the report says SHARED_PRINCIPAL, never ISOLATED. Every
security-properties result remains productionEligible=false. No attestor is installed:
UI automation measures rendering/IPC only, HumanInputProvenance remains UNPROVEN.

The qualification application packages frozen C2 components and the new test native
module. This is not whole VCPChat startup/release qualification. ASAR fuses and a native
hash anchored inside ASAR are tested against copied artifact tampering. Unsigned or
ad-hoc test signing does not establish production signing or installation ACL trust.

CI lives only on an isolated qualification branch in the project-owned fork. Workflow
permissions are contents:read, no secrets references, no release/deploy, no admission,
and no change to the default branch. Artifacts are test evidence retained7 days.

Official API references:
- https://learn.microsoft.com/en-us/windows/win32/api/ncrypt/nf-ncrypt-ncryptcreatepersistedkey
- https://developer.apple.com/documentation/security/seckeycopyexternalrepresentation(_:_:)
- https://www.electronjs.org/docs/latest/tutorial/fuses

Q1 build corrections are isolated: helper names avoid Windows/macOS SDK collisions; Windows custom descriptor uses PERSIST + PERSIST_ONLY flags. Software macOS diagnostic omits the Secure-Enclave-only privateKeyUsage flag (Apple documents failure outside Secure Enclave); TARGET retains it. Native ad-hoc signing precedes the ASAR hash commitment, and the builder preserves that exact signed native byte sequence. None is a production source change.

The hosted macOS target returns OSStatus -34018 (missing entitlement) under test signing: it remains UNPROVEN. Software diagnostic uses the ordinary file-based Keychain path (no Secure Enclave token or data-protection AccessControl constraint); this intentionally weaker diagnostic cannot qualify hardware protection, code identity, or Human provenance.
