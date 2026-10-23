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
