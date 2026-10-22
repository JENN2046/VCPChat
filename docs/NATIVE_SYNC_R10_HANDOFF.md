# R10 desktop integration candidate

Result: **BLOCKED on real deployment conditions**, not daily-use acceptance. Base `15e8675` is preserved in the R9 worktree; R10 uses `codex/vcpchat-daily-r10`.

Added `modules/services/nativeSync/dailyConnection.js`, `initialImport.js`, `catalog.js` and `scripts/inspect-native-sync-history.cjs`. The existing runtime reads the explicit non-secret opt-in file, obtains the existing desktop Key through its settings authority, verifies protected loopback transport/backend identity, and checks approved source fingerprints plus central duplicate/conflict/tombstone state before first capture. Metadata publication projects only selected public directory fields; Agent prompts, credential fields and local paths are excluded. Redirects are refused. Queue, wire protocol, local history format and R8 write exclusion are preserved.

`main.js` supplies existing settings/Agent authority and a bounded native thumbnail function. No daily sync is enabled when the opt-in file is absent or disabled. A different existing desktop backend identity fails closed; do not change existing model channels merely to bypass that gate.

The user-authorized real history preflight covers four selected topics / 189 messages, read-only. No real history, opt-in file or credential has been installed in the actual AppData. Existing runtime source customizations and its Rust binary remain untouched. Five desktop focused tests plus nine ToolBox tests pass on Ubuntu; PWA build and patch dry-runs also pass. The full actual daily desktop application has not been started or accepted in R10.

Complete implementation/evidence/next gates: `P:/VCPKF/vcp/versions/vcptoolbox-daily-r10/docs/NATIVE_SYNC_R10_HANDOFF.md`. Artifact index: `P:/VCPKF/vcp/artifacts/native-sync-r10/R10_REPORT.json`. Stable HTTPS and authoritative wp10-to-host mapping are pending user input. Production restart requires the user's confirmed window after exact changes/backup are ready. No Push/Merge or Rust modification.
