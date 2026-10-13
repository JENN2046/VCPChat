# JSO conversational scheduling — local candidate

Opt-in integration only. No production configuration is discovered or changed. The main process owns the Owner capability; Extensions receives only its independent assistant token. ToolBox core is unchanged.

## Trust boundary

Assume the signed-in terminal, native application and OS input path are trusted. This does not defend against a compromised host or modified Electron main/preload. `role:user`, `human:true`, renderer `isTrusted` and being a main-window sender are insufficient: a focused eligible native composer event must be observed, its original text/context snapshotted, the bound Owner session independently verified, and its one-shot main-process ticket consumed unchanged. The journal keeps that original source immutable and supplies the durable chat message ID. History persistence precedes execution.

There is no claim of voice biometrics or a new login system. The opt-in binding must use the host's existing request-based Owner authentication callback (`createBusinessRuntimeAuthV1` is exercised with synthetic identities), not an assistant token promoted to Owner. `createConversationBoundary` is the JSO composition point; the isolated verification fixture uses synthetic identities. Production identity and endpoint configuration remain outside this candidate.

## Supported first action

`把产品3D主图延后12分钟`, `把产品3D主图提前7分钟`, and a new message `再延后10分钟` after a committed action in that same conversation. Exact unique order/session identification is required. The parser is deliberately bounded; unrecognized/conditional/composite language asks for clarification. It is not general model intent authorization. JSO independently computes the new interval, enforces same local day, availability, locks and CAS revisions.

An assistant can propose, never authorize, using a completed message with one block:

```jso-shift-proposal
{"scheduleItemId":"<ID from read_state>","minutes":7}
```

The renderer asks main to obtain a fresh JSO preview. It shows the canonical old/new times, target, scope, no-notification effect and expiry. Main verifies this exact card is connected in the same conversation before recording presentation. A later native `可以` confirms only one open, presented, unexpired plan. Message edits/regeneration replace its plan; removed/hidden cards cannot authorize. Negation, conditional modification, cancellation and ambiguous multiple plans do not approve the old command. This local marker is a readonly proposal convention, not a ToolBox core protocol change.

## Persistence and recovery

`JSO/conversation-journal.json` under isolated app data atomically records immutable source, canonical command, operationId and phase, with fsync before dispatch. Repeat delivery reuses the same operation; a new native message gets a new ID. Unknown results/restarts read the original receipt and never dispatch a new operation automatically. Timer recovery also reads authoritative state into actual ChartController/ChartService. Component-wise stale schedule/projection revisions are discarded, and chart revisions use existing CAS. Chart refresh failure does not turn an already committed operation into a failure.

The JSO boundary reuses its durable grant-attempt table and existing atomic business receipt; no pending/decision table was added. Local grants are exact command digests, scoped to the assistant and short-lived. Cancelling after dispatch requires receipt reconciliation, not a claim that mutation did not occur.

## Local composition

Set `VCPCHAT_JSO_LOCAL_CANDIDATE=1`, `VCPCHAT_JSO_LOCAL_BINDING_FILE=<private local JSON>`, and `VCPCHAT_APP_DATA_DIR=<isolated profile>`. Binding keys: `jsoUrl`, `toolboxUrl` (loopback HTTP), `ownerSubjectId`, `assistantSubjectId`, `resourceId`, `ownerToken`, `toolboxToken`. Do not commit real credentials. Extensions candidate manifest is `plugin-manifest.local-agent.json`; only the test-isolated plugin directory copies it to its ordinary manifest name. Existing live plugin registration remains untouched.

Historical local acceptance used a real saved model reply, a fresh JSO preview, native human confirmation, one committed operation and matching server/VChart revisions 6/9. It used a temporary test administrator and synthetic business data on a trusted local terminal. Re-preview and confirmation made no new model request. This evidence belongs to the prior local runtime (which included separate tray/transport support changes), not automatically to every new commit or production configuration.


## Native JSO administrator login (identity completion)

JSO currently authenticates administrators using its existing server-side Bearer identity registry (`createBusinessRuntimeAuthV1` / `createBusinessRuntimeOptionsFromEnv`). This candidate does not create accounts, mint tokens, promote SUVEI owners or use Kiosk credentials. `createConversationBoundary.ownerAuthenticate` must be the existing trusted JSO verifier for the selected isolated composition.

For interactive login, configure only the existing local endpoints, expected `ownerSubjectId`, `resourceId`, assistant identity and existing ToolBox transport binding. Omit `ownerToken` from the VCPChat binding. The main window's **JSO 登录** button opens a dedicated sandboxed local credential window. The user enters an already-issued JSO administrator Bearer credential there, never in chat. The credential is verified against `/api/v2/agent/owner-session`; the returned administrator subject and resource scope must match the configured values. It remains private main-process memory, with no new session token or disk persistence. Logout, main-window destruction, rejected verification and process restart clear interactive login. Every sensitive operation rechecks the existing server authenticator. A renderer status response never contains the credential. Legacy `ownerToken` binding remains supported only for existing explicit compositions; the new interactive test omits it.

This is one identity login, not an approval per operation. Clear commands retain their existing execution flow, and proposals retain one natural chat confirmation. SUVEI login APIs are intentionally unused. A not-configured or logged-out window displays **JSO 未接通**. No real identity or permission is provisioned by this code. If no suitable existing JSO administrator identity is available, credential or resource-scope provisioning is a separate explicit action, not silently performed here.

Local acceptance also exercised interactive administrator login. Production identity verification and deployment remain separate; no credentials or private operator state are included in this package.
