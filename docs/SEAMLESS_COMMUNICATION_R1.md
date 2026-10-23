# Seamless communication R1 desktop candidate

Separate feature branch from `ffed975c`; V1 `223cc38` and Draft PR #269 remain
untouched. Opt into private execution configuration publication with
`publishExecutionConfigs:true` in the existing non-secret NativeSync connection
selection. Existing same-origin HTTPS/Bearer authority and explicit topic scope
remain required. Do not enable this in production as part of development.

The publisher projects native Agent/Group DTO fields and active Tavern rules;
it does not spread full configs or publish credentials. The server assigns and
validates configuration versions. The desktop checks for changes every five
seconds. Group publication requires native Group manager access and the matching
server member alias bindings. Configuration initialization precedes publication
so the first version contains active Tavern rules.

Current isolated publisher tests: 2/2 on Ubuntu Node24. Full R1 desktop/mobile
integration and final physical-device acceptance have not yet been performed.

Metadata protocol2 preserves independently versioned Checkpoint/tool/thinking
and attachment-content fields without changing the original message fingerprint.
Queue capture detects same-hash metadata changes, persists their Outbox intent,
and stores metadata versions in ACK/Pending state. Remote metadata still enters
history through HistoryMutationQueue; restart does not create an echo event.
Both the new desktop and new server are required for metadata-enabled topics.
Legacy readers receive an explicit upgrade refusal. The desktop wire fixture is
updated to the new central contract; product code does not import ToolBox code.

The two-repository 90-test focused Linux run includes original NativeSync IPC,
deletion, pagination and recovery regression, plus new metadata/authority tests.

Enable `syncAttachments:true` only together with explicit private configuration
publication. The desktop uploader reads the existing native attachment root,
checks actual bytes and never uploads a client-provided arbitrary host path.
Downloads verify SHA before calling native `fileManager.storeFile`; Queue adds
device-local handles without changing shared content hashes. Missing source
binary preserves the historical attachment reference. Large PDF image frames
offload to CAS and return as local native frames through the same metadata
contract. Both new client and server advertise/require `attachments-v1`.

Group publication uses the original Group manager and native Agent DTOs with
the host's explicit member alias mappings. The same publisher freezes native
stream parameters and a small execution-policy whitelist; it does not copy all
desktop settings or provider authority. A failed private config publication is
visible in adapter diagnostics while authorized history capture/catch-up keeps
working. The host independently rejects execution without verified config.

Deleting a shared Group or Group Topic now refuses before modifying native
config or history, using the same physical-history writer boundary as Agent
deletion and CDS/MobileSync isolation. NativeSync-off behavior is retained.
All local/remote attachment handle changes still pass through the shared Queue.

Current development validation is 124/124 focused tests on Ubuntu Node24 across
both repositories, plus fixed author-rule output checks and a separate full
ToolBox server.js synthetic acceptance. The cloud counterpart retains three
native group modes, versioned plans, per-member Journal intents and original
tool approval gates. Physical Electron/fileManager and real mobile acceptance
remain required before an overall R1 PASS or production release declaration.
