# Frozen VCPChat source candidate: 8f1562ea

This is source-review evidence, not merge approval, a release, installation or
runtime activation. No configuration, authorization token, personal content or
runtime state is part of this change.

## Exact comparison

- Fork base: `008542de728a702cbf35190273375b4990fbcdad` on `NuobaoVCPchat`
  (includes the merged G1B H0 reconciliation from PR #64).
- Previous integrated author source target:
  `3cde846645bab109dfb3b635a43287e63e2ed294`.
- Frozen author target: `8f1562ea8fb851d0e370449a66ba24700d93faf9`.
- Author delta: ten commits, thirty paths. Earlier source updates were
  reconstructed; Git's older merge-base is not an accepted-source baseline.
  This candidate applies the explicit three-way source delta onto the fork base.
  New author commits after this target belong to another batch.

## Disposition of the author delta

| Scope | Disposition |
| --- | --- |
| ProjectForge JS service, argument normalization and indexer client | Accept multi-todo references, safe numbered-edit diagnostics, parsing notes and geometry-language support. Preserve static preload parsing, sender checks and close protection. |
| ProjectForge Rust sources, example, Cargo metadata and blueprint | Accept geometry outlines and conservative damaged-syntax boundary healing. Keep the intentionally invalid Rust sample under `tests/fixtures/`, not as a Cargo integration-test crate. The PowerShell sample is parsed as data, never run. |
| ProjectForge Windows executable | Replace the author blob with this batch's source rebuild; bind exact inputs and delivered SHA256 in the existing native receipt. |
| Music UI and four audio Rust source files | Accept persisted EQ enable/type/taps, output/dither/noise-shaper and related state restoration. No audio device playback or real media is used in validation. |
| Both Windows audio executable names | Replace both with the same source-built portable Rubato/DSP artifact, matching the author's alias layout. They are not different CPU-specific builds. |
| RAG Observer | Accept corrected ANN-based river correction metric. Preserve the fork's Human Owner authorization integration; absent diagnostics display `N/A`. |
| Human ToolBox renderer and tool catalog | Accept bounded explicit `memory_ab` inputs and updated explanatory text. These are client fields, not a server migration or activation. |
| Message renderer, Markdown scanner and tool-marker diagnostics | Accept JEV diagnostic corrections and paragraph-bounded unclosed inline-code handling. Tool-result data must remain non-executable and isolated. |
| Three author test files | Accept stream and marker regressions; merge both lazy-popup lifecycle assertion sets without restoring conflict markers or weakening assertions. |

Only exact source/resource identities, reviewed event positions and necessary
native/fixture admissions are refreshed. Denied paths, denied blobs, ordinary
alias rules, controller bytes, CI permissions, triggers and product commands are
unchanged. The new audio alias is admitted only by its exact path and rebuilt
identity. No wildcard binary or configuration exception is added.

## Native evidence

The existing `docs/native-build-3cde8466.json` filename remains a stable consumer
path; its current `upstreamTarget` identifies this batch. ProjectForge uses Rust
1.89.0; audio uses the compiler version recorded in its per-binary entries.
Local compilation used fresh isolated targets and locked dependencies, followed
by same-batch retries after test-fixture corrections. Local source remaps and
the independent CI recipe are distinguished explicitly. Cross-machine byte
equality is not claimed or required.

ProjectForge: 42 source tests, protocol v3 readiness/ping, JavaScript outline,
PowerShell geometry, malformed-Rust error reporting and invalid-input rejection.
Audio: 430 source tests plus a passing doc test; actual rebuilt executable tested
on a random loopback port with synthetic settings/database in a new temporary
directory, including settings save, cold restart persistence and invalid bit
depth rejection. No supplier calls, real configuration or hardware playback.

Two pre-existing audio FTZ tests now use runtime `black_box` inputs so constant
folding cannot bypass the thread's MXCSR mode. Their zero-output assertions and
the DSP implementation remain unchanged.

## PR #65 EQ review follow-up

The enabled FIR-to-IIR transition and legacy FIR loading issues were reproduced
before fixing them. The UI now selects the type before applying enable/bands;
unchanged FIR slider updates still avoid rebuilding the filter. Switching type
while disabled must not enable EQ.

The settings-file loader preserves the old enabled-FIR interpretation only
when `eq_enabled` is absent and `eq_type` is exactly `FIR`. Explicit `false`,
explicit `true`, missing/default IIR settings and all unrelated preferences keep
their meanings. Typed deserialization still rejects invalid types and duplicate
known controls before the presence check; the new-install default stays off.
No real settings file is migrated by this source task.

Regressions cover both transitions, no redundant FIR rebuild, enabled legacy FIR,
explicit disable, new-install defaults, invalid/duplicate controls and saved
round trips. The delivered Windows audio aliases are rebuilt again after these
source fixes, not repinned to the previous executable.

A second exact-head review identified two additional reproducible P2s. Applying
saved settings now unloads mounted FIR whenever EQ is disabled or IIR is
selected, before applying the desired state. A source regression checks all
four enabled/type combinations without opening devices or media; the actual
loopback server also verifies that saving disabled FIR takes effect immediately,
without a second `/set_eq` request or restart.

Tool-marker diagnostics now trust only the caller's parsed top-level JEV flag.
Raw request text cannot promote a missing-tool-name request to JEV. Regressions
retain legitimate declared JEV and malformed-marker diagnostics while rejecting
JEV literals nested inside regular or ESCAPE parameter values.

The next review's two P2s also have reproducing source tests: completed single-line
geometry definitions now retain an arch, without duplicate nested pairs or
control/comment/string false symbols; saved dither now updates the real atomic
DSP snapshot as well as its UI field. Test inputs are synthetic, never played or
executed as user scripts. Both affected native programs were rebuilt again.

A hosted real-Electron smoke failure retained only one synthetic terminal marker.
Its old two-occurrence assertion depended on input echo. The probe now constructs
the marker from separate constant parts, so it is absent from the typed command;
one full output marker therefore proves execution, not merely echoed input.
Regression coverage executes only that fixed synthetic builtin in a clean child
environment and rejects non-synthetic input. No product terminal code, CI authority,
timeouts, cleanup or other E2E assertions are relaxed.

EQ submission is now serialized from a captured type/taps/bands/toggle snapshot.
An in-flight FIR type change is not rebuilt by queued slider events, and older
type completions cannot overwrite newer synchronization markers. Markers advance
only after type success; both rejected requests and the actual IPC `status:error`
response leave retries usable. A failed band update does not rebuild an already
successful type or persist a false success. Four new mock regressions failed on
the previous source before this bounded frontend correction; native source and
artifacts are unchanged by it.

## Compatibility and limits

Public backend source at `35ec1f7c` accepts the retained `memory_ab`, `k` and
`candidate_k` fields; omitting `compare_jev` keeps its default disabled. Its
LightMemo implementation sets the refinement window to `2×K` and builds the
consensus pool from KNN and RiverMemo. All A/B labels now describe that verified
compatibility behavior, not the author's newer full-candidate/native-snapshot
experiment claims. Query controls and bounded inputs are retained. A future
paired backend/capability review may change these descriptions; this source PR
does not establish such a rollout. No backend code or configuration is changed.

Additional parser regressions exclude continuation heads after leading closing
braces (`} else`, `} catch`) from geometry symbols. A real lazy-renderer regression
checks malformed declared JEV, valid JEV and nested payload literals; malformed
field identity is derived only from the scanned field list when no tool_name
exists, never from raw payload matching. Typed tool_name presentation is retained.

Local Linux regressions are network-disconnected after dependency installation.
Windows-only skips remain skips; hosted Windows checks and PR review are
separate evidence. An actual new installer/manual window acceptance is not
claimed by these source regressions. Merge and deployment remain separately
authorized actions.
