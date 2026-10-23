# R10_POST_REVIEW_P1_FIX

Result: `P1_REMEDIATION_PASS` (isolated tests only, 2026-10-23).

Product baselines: VCPChat `0f748f06f2e008035d9a0aa6860230c7ba17cee4`,
VCPToolBox `fe8e6a2f79c9410f9b46d4920bf0b0e6481a5cef`.
Worktree parents `dafa72d` / `34679b7` add only the existing R10 handoff documents.
Both new worktrees use `codex/r10-p1-remediation`; original worktrees and the
pre-existing daily Chat runtime-file modification were preserved.

| Scope | Minimal implementation |
| --- | --- |
| Desktop `adapter.js` | One latest-operation Map per capture; unchanged first-occurrence key order, hashes, baseHash, tombstones and persistence. Validate global scan cursors, apply legal events durably, then checkpoint remaining scanned positions, including empty pages. |
| Desktop `initialImport.js` | Reuse the cursor validator and follow nextSeq across scoped empty pages; otherwise a new device would still fail before normal pull. |
| Desktop `runtime.js` | Preserve dormant `createNativeSyncRuntime({})` behavior with a missing-root guard. A pre-existing R10 default-off regression was exposed by the original native test. |
| Toolbox `mobile/execution.js` | Remove tail; default four in-flight tasks, one per Topic. Exclude running Topics before selecting the oldest eligible queued job. Coalesced wake/reentry guard, release only after cleanup, synchronous beginDrain, close awaits all tasks. |
| Toolbox portal / manifest | Pass `NativeMobileMaxConcurrency` (integer 1–64, default 4). No actual configuration changed. |
| Toolbox CentralStore / HTTP | Scan the limited global log window, filter exact device scope before serializing events, expose scanned nextSeq rather than skipping to headSeq. No schema or apply changes. |
| Tests / drivers | Add deterministic concurrency, recovery, scope and performance fixtures. `--p1-toolbox` selects this isolated source/build and strict existing SSH connection; old driver defaults remain unchanged. |

No changes to Queue, Rust CDS, canonicalization, SHA-256, durableJson, pending
format/recovery, SQLite schema, Journal body, model/tool interfaces or the R8
shared-Topic write exclusion. There is no hash cache or Outbox format change.

## Before / after evidence

Pinned pre-fix Toolbox modules were loaded directly from Git, with fresh synthetic
SQLite and a loopback model. They reproduced actual concurrency 1 despite a
requested 4, A2 preceding B/C/D, and a mixed-scope pull returning 403.
The fixed HTTP execution test observed maximum 4 and start order A1/B/C/D/A2,
ten journal messages, one attempt per job, and no remaining locks/tasks.

Cancellation held A's lock while its cleanup was gated; B/C completed independently.
Drain prevented queued starts; close waited for every gated cleanup. Recreated
engines recovered queued/preparing/publishing intents without duplicate messages;
uncertain running/cancelling executions were terminal and never reissued.

With seq 1 and 151 authorized, seq 2–150 unauthorized upserts/tombstones and limit
100, the client crossed an empty filtered page ending 101 and received 151.
Unauthorized identities/content/tombstones never reached history. Tests also cover
exactly full pages, final empty pages and malformed/rewinding/stalled cursors.
An injected final ACK write failure left cursor 101 and pending 151 with both
revisions; restart finished at 151 without duplicates. An empty-window checkpoint
failure left durable cursor 1; restart rescanned safely and reached 151.

Same Electron 44.0.0 / Node 24.18.1 main process, real durableJson, deterministic
UUIDs, original message/hash functions, 5,000 history messages plus 5,000 operations:

| Measurement | Pinned baseline | Fixed |
| --- | ---: | ---: |
| Capture elapsed | 6917.35 ms | 57.90 ms |
| CPU user / system | 6578 / 140 ms | 140 / 32 ms |
| Main-thread heartbeat max lateness | 6869.55 ms | 34.96 ms |
| Zero-delay timer probe | 6879.45 ms | 44.89 ms |
| messageKey calls | 37,743,800 | 10,000 |
| Persist calls | 1 | 1 |

Final persisted state bytes/SHA-256 match exactly, including latest duplicates,
foreign operations, edits, baseHash, tombstones and order. Hash/canonical function
call counts match. At 1,000 rows the fixed key count is 2,000, versus 10,000 at
5,000, confirming linear indexing. This machine reproduced a 6.92-second baseline
block, not the reviewer's approximately 51 seconds. Relative paired results and
operation counts are the acceptance basis. Windows process CPU samples are coarse;
Electron perf_hooks alone missed the block, so direct timer/heartbeat probes are
reported separately and their raw perf_hooks values retained.

## Validation and evidence

Artifact root: `P:/VCPKF/vcp/artifacts/native-sync-p1`.
`NODE_FINAL_RECEIPT.json`: 541 Node test executions, zero failures/skips (legacy
suites overlap): P1 10, R7/R9 execution/relay 5, R8/R9 transport 13, R10 16,
daily desktop 10, native IPC/refresh 19, native regressions 37, MobileSync 93,
plugin lifecycle/provenance 5, chat kernel 320, original proof 13.

Additional actual Windows runs, all successful:

- R2: seven real Electron preload/IPC/Renderer checks;
  `native-sync-p1/native-sync-r2-20261023T005549628Z/electron-result.json`.
- R3 full app: `native-sync-r3/run-1792716859862/R3_APP_RECEIPT.json`.
- R8 original Rust CDS + MobileSync + NativeSync, group terminals/redo,
  exclusion, conflicts, offline/restart: `native-sync-r8/run-1792716822806`.
  Independent read-only SQLite/history/CDS/index proof: A/B nine messages each,
  central 17 operations, cursor 17, empty Outbox/pending; six CDS exits zero,
  16 observed ports closed.
- R7 PWA HTTPS/SSH/full server.js/SQLite/official Windows Renderer with CDS:
  `native-sync-r7/run-1792716713740`. Browser exit, background completion,
  cancellation, queued/session restart and sync/plugin-off controls passed.
  A/B seven messages, cursor 7, no pending/Outbox; remote SQLite integrity ok,
  three jobs (two completed, one cancelled), one attempt each; all three hosts
  shut down with exit 0 and matched initialization/shutdown counts.
- `electron-perf-20261023T004640663Z/PERFORMANCE.json`,
  `baseline-repro/BASELINE_REPRODUCTION.json` and `P1_FINAL_REPORT.json` retain
  measured comparisons, source correspondence and final Git state.

Reproduce from Linux sibling source trees using Node 24 and approved dependencies:

```sh
VCP_P1_CHAT_SOURCE=/path/vcpchat-p1-remediation node --test \
  tests/native-sync-p1-execution.test.cjs tests/native-sync-p1-pull.test.cjs
node scripts/reproduce-native-sync-p1.cjs /isolated/native-sync-p1/baseline-repro
```

Run the PWA driver from Windows Chat with the Linux-built P1 frontend metadata
at `artifacts/native-sync-p1/FRONTEND_BUILD.json`:

```text
node scripts/test-native-sync-r7.cjs --p1-toolbox --coexist-services
node scripts/test-native-sync-r8.cjs
node scripts/test-native-sync-r3.cjs
electron scripts/benchmark-native-sync-p1.cjs <isolated-p1-root> <pinned-0f748f-adapter.js>
```

All data and model responses were synthetic. Android/iPhone hardware, real provider,
real history, production deployment and a fresh all-feature Toolbox regression
were NOT RUN. R9 affected core/session/cancel/recovery paths were covered by the
isolated tests; this is not a new R9 real-device acceptance. No Push/Merge.
