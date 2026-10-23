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
