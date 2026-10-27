# Trusted Action v1 — VCPChat consumer

VCPChat is the **consumer and human interaction host** of
[Trusted Action v1, owned by VCPToolBox](https://github.com/JENN2046/VCPToolBox/blob/b0552cd3e109a8cfe38ac5ee292cc026891d7442/docs/TRUSTED_ACTION_V1.md).
That immutable publication is normative; this document maps its requirements to
the existing Chat implementation. It adds no authority model, protocol parser,
client activation, permission or runtime behavior.

The existing path is physical input → source/capture transaction → proposal
presentation → current display validation → human confirmation context → trusted
host delivery → result/unknown/recovery presentation. Chat does not own the
ToolBox receipt authority, adapter business semantics or target receipt database.
The trusted-client `vcp_chat.c2` profile is not activated by this declaration.

## Consumer responsibilities

### TA-1 — Host-owned authority

`human=true`, `approved=true`, `role=user`, `role=administrator`, token, grant and
principal fields in renderer/model JSON do not create authority. The main process
checks the owning webContents and main frame; its native port captures a physical
input event, exact text/conversation and an opaque single-use context. Copies of
that context do not acquire its identity. Window focus or message role alone is
not authentication. This path assumes the existing trusted desktop/session; it
does not claim to prove a person's identity from natural-language text.

Implementation: [native port](../modules/services/trustedConversation/nativePort.cjs)
and [IPC handlers](../modules/ipc/nativeConversationHandlers.js).
Checks: `trusted-conversation-native-port.test.cjs`, `native-conversation-ipc.test.cjs`.

### TA-2 — Preserve the original accepted transaction and the replacement draft

An accepted action remains bound to its **original send/capture transaction**:
client/session, conversation/topic, message/source and captured input generation.
After capture, subsequent edits, identical-text re-entry, attachment changes and
topic/item selection changes are new user state. They MUST NOT change the captured
action, redirect its source to the replacement action, or let completion of the
original action swallow/clear the replacement draft or attachments.

The original action MAY finish against its original source/conversation/topic
while its existing trusted source and transport eligibility remain valid:

`original action continues + replacement draft is preserved`

New draft state is not an implicit cancellation of an already captured action.
The renderer records edit and selection generations and checks attachment-array
identity when consuming the draft. Results are saved to the original send topic;
late display does not move the result into the newly selected conversation.
Text equality alone cannot identify a draft generation.

Existing source/plan retirement rules still apply: explicit invalidation,
ownership mismatch, connection epoch change, session/transport/tool eligibility
loss, and stale/retired proposal state must not be bypassed. A reconnect does not
transfer the old source to the new connection. This acceptance boundary does not
permit any resend after dispatch may have started (TA-4/TA-5).

Implementation: [chatManager](../modules/chatManager.js) draft observation,
`consumeDraft` and original send context; IPC pending records and invalidation.
Checks: `native-websocket.test.cjs`, especially `prepare wait preserves replacement
draft`, `edit then restore identical text during … is a new draft`, and `pending
execute preserves user … and saves reply only in original topic`. Their existing
one-execute expectations are intentional and remain unchanged.

### TA-3 — Confirm only the current displayed proposal

A model proposal is a request to propose, not permission to execute. The renderer
accepts only the existing top-level proposal envelope on the primary chat surface,
then displays the host-returned presentation. Main-process readback checks the
connected DOM element's exact text, plan and conversation. Request/generation
ownership prevents delayed responses from restoring a replaced display.

Unshown, failed, replaced, historical, expired or ambiguous proposals must not
become confirmable. Chat retracts failed presentation acknowledgements and keeps
invalidation barriers until acknowledged. The adapter/host remains responsible
for proposal expiry and argument-digest validation; Chat does not invent a target
business check. A failed or uncertain display is not confirmation.

Implementation: [presentation lifecycle](../modules/renderer/nativeConversationPresentation.js),
IPC `propose` / `presented` / `prepare` and message retirement hooks.
Checks: `native-presentation-lifecycle.test.cjs`, `native-markdown-proposals.test.cjs`,
`native-conversation-ipc.test.cjs`; expiry/business checks also run in the paired profile.

### TA-4 — A single dispatch opportunity

Main-process execute consumes the pending source before invoking transport. Once
send may have started, timeout, lost reply, UI failure or a host error must not
restore that source, create a replacement operation/source, or automatically
execute again. The UI may show unknown; unknown is not proof of failure.

Only a locally minted pre-send proof can establish that this attempt did not
send. Error text or host-supplied `dispatched`/`preserveInput` fields cannot forge
that proof. Even a proven pre-send rejection consumes the old pending source;
retaining a draft does not automatically authorize a new attempt.

Implementation: IPC execute, [WS client](../modules/services/trustedConversation/webSocket.cjs)
and chatManager native result delivery.
Checks: `native-websocket.test.cjs`, `native-result-delivery.test.cjs`.

### TA-5 — Read recovery, never execution replay

Unknown outcomes recover through the original identity owned by the adapter/target.
Chat's recovery timer requests `recover` and projects returned facts; it does not
resend execute or generate a new business operation ID. Missing receipt evidence
stays unknown. Stable client identity locates recovery context; it is not a grant.

Projection/history/rendering failures cannot turn a committed action into a new
business write. Projection retries update the view only. The in-memory projection
retry queue is not a durable operation receipt database or an independent promise
of restart recovery; durable truth remains upstream.

Implementation: IPC recovery timer and [transport projection](../modules/services/trustedConversation/transport.cjs).
Checks: `native-projection-recovery.test.cjs`, `native-result-delivery.test.cjs`,
`native-websocket.test.cjs` disconnect/timeout/recover cases.

### TA-6 — Separate cancellation from reconciliation

Before dispatch, source/proposal invalidation and cancellation use the existing
host/adapter path. Failed revocation keeps the main-process barrier; renderer
reconstruction cannot silently remove it. After dispatch may have started, Chat
must not say the business write was cancelled. It displays reconciliation status
and the original operation identity instead. A local socket close or UI removal
is not evidence of target cancellation. Durable cancellation belongs upstream.

Implementation: IPC invalidation queue, presentation retirement, chatManager's
cancellation/reconciliation result branch.
Checks: `native-conversation-ipc.test.cjs`, `native-presentation-lifecycle.test.cjs`,
`native-result-delivery.test.cjs` mixed cancellation/dispatched-operation case;
paired adapter/target tests own durable cancellation verification.

### TA-7 — Existing secure transport and fresh connection generation

Chat uses the configured native transport. Remote WS requires WSS before sending
application authorization; the existing explicit loopback WS exception is retained.
Forwarded headers or JSON security claims do not establish socket provenance.
Reconnect advances the epoch and rejects pending requests; old source/plan
eligibility and late responses do not transfer to the replacement connection.

WS execution must not silently fall back to HTTP or model execution. Explicitly
configured local HTTP remains a separate existing binding, not a WS retry path.
Neither normal model API settings nor UI retries may override this separation.

Implementation: WS client, transport selection, IPC epoch checks and
[VCPDistributedServer](../VCPDistributedServer/VCPDistributedServer.js) native routing.
Checks: `native-websocket.test.cjs`, `native-conversation-ipc.test.cjs`.

### TA-8 — Target authority stays independent

Human confirmation in Chat does not require the target to execute. ToolBox owns
transport/host authority, Extensions owns the adapter, and the target independently
authenticates, authorizes scope and validates its business preconditions. Chat
must preserve rejection and uncertainty rather than broaden scope, change
credentials, invent receipts or reinterpret confirmation as business permission.
Target resource/revision/command/receipt semantics are not Chat contract fields.

Implementation: native response validation, handled rejection and result display.
Checks: `native-conversation-ipc.test.cjs` configured-session rejection,
`native-send-preflight.test.cjs`, `native-result-delivery.test.cjs`, plus target
permission and business-precondition tests in the canonical paired profile.

### TA-9 — Fail closed with low disclosure

Uncertain presentation, retired source, changed connection, host rejection or
unknown result must not create execution eligibility or automatic retries.
Ordinary chat continues only under the existing unconfigured/unhandled policy;
a configured native rejection is not a model-execution fallback.

Credentials remain behind explicit host environment references. Private native
transport envelopes and raw authorization must not enter ordinary logs/evidence
or user-visible errors. Fixed error categories and original-operation recovery
messages preserve the distinction between not sent and result unknown. This does
not claim arbitrary adapter business output is sanitized by Chat.

Implementation: transport validation, native frame routing/redaction, IPC and
chatManager result delivery. Checks: `native-websocket-redaction.test.cjs`,
`native-websocket.test.cjs`, `native-result-delivery.test.cjs`.

## Verification and immutable CI

All test names above refer to existing files under `tests/`. Run the nine native
files together with Node 22.23.1 and the isolated dependencies used by the paired
profile. The existing static stream-hook fixture requires Git CRLF checkout text;
Git blob/source identity and all assertions remain unchanged. Also run the
**effective** `npm run test:chat-kernel` from a complete checkout with its required
dependencies. Environment setup failures are not product results. These synthetic
tests do not constitute a new physical-human or production acceptance.

The thin caller is
[`.github/workflows/jso-agent-paired-candidate.yml`](../.github/workflows/jso-agent-paired-candidate.yml).
It runs on PR, push to `NuobaoVCPchat`, and manual dispatch with `contents: read`.
The workflow reference and `harness_sha` both pin
`77e89fae03202a3d861d6f3e78c8a06666df304d`. The candidate source is the actual PR
`head.sha` (push/manual `github.sha`), not the PR synthetic merge commit.

| Paired role | Exact source |
| --- | --- |
| Harness / workflow | Extensions `77e89fae03202a3d861d6f3e78c8a06666df304d` |
| VCPChat candidate | Current PR HEAD or push/manual SHA |
| Extensions accepted | `6a6f0a9c0ca27e366bb4d81aa3a09ce999baef9c` |
| ToolBox accepted | `ce904c476f58e0857aa9ee828619158a82d75e7e` |
| JSO accepted | `0936ac209ebfd52c3901b06b43cdcdad9a8c3210` |

The normative ToolBox publication `b0552cd3e109a8cfe38ac5ee292cc026891d7442`
is distinct from the frozen accepted ToolBox test pin. Publishing a contract does
not advance the compatibility manifest. Extensions current main is likewise not
the immutable harness pin. The caller forwards no secrets and adds no cross-repo
write credential or repository dispatch.

A successful receipt must identify the exact candidate and harness separately,
retain the other three accepted pins and report zero required skips. Required
skips fail the central gate. The harness/profile/manifest are unchanged.
[Parent #86](https://github.com/JENN2046/jenn-shooting-operations/issues/86) owns
integration review; docs/CI completion does not authorize merge or deployment.
