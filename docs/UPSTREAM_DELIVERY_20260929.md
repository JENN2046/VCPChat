# VCPChat upstream integration — 2026-09-29

## Frozen source boundary

- Local base: `8b1657de5fdb85b50b60c0b7765efc64a87e10a0` (`NuobaoVCPchat`).
- Previous included author head: `2c3f654ffbfbb92ae94425bca78922ea4a4f0cd3`.
- Integrated author head: `a5c26ff01601e8d1e51f6056a31e1f90937ca067` (48 additional commits).
- Existing uncommitted configuration, chart work and local integration files are
  excluded from this delivery and must remain untouched in the original checkout.
- Sensitive configuration paths were excluded from the isolated worktree. Their
  contents were not inspected, copied, edited or newly staged.

## Reconciliation

The complete author delta is adopted, including workspace indexing, ProjectForge,
Git UI, voice composition, window pinning, terminal output, music stages and the
new role-preload registry. Existing downstream stream/ephemeral presentation
contracts remain and pass their fixture tests.

Two textual conflicts were resolved:

1. Lyrics: adopt upstream identity-score-first ranking and unknown-duration
   fallback. Keep a null-safe target guard and add its regression test. The old
   local quality-score-first ordering failed the upstream identity regression and
   is retired rather than weakening that test.
2. Chat event graph: regenerate from merged source and registered contracts;
   268 events, 466 source files, 3 registered dynamic sites, none undiscovered.

Jenn explicitly accepted upstream `a5c26ff0`'s `sandbox: false` settings for the
22 role-preload windows, after being informed of the security-boundary change.
`contextIsolation: true` and `nodeIntegration: false` remain. This is an explicit
acceptance of that upstream tradeoff, not a claim that renderer sandboxing remains
enabled or that context isolation replaces the sandbox.

## Validation

Jenn authorized Windows-isolated regression for this integration. A separate
dependency tree was installed from the merged lockfile with `npm ci
--ignore-scripts`; the running checkout's dependencies were not used by the suite.

- Chat kernel: **183/183 PASS**.
- Focused source/preload, lyrics, Git, voice, workspace, ProjectForge, window,
  chart, group and downstream ephemeral-presentation fixtures: **125/125 PASS**.
- UI/UX: **114/114 PASS**.
- Registered chat contracts and runtime invariants: PASS.
- Generated event graph freshness: PASS.
- UI interaction inventory, async-state matrix, task journeys and theme
  provenance: PASS.
- Changed JavaScript syntax checks: **161 files PASS**.

No real provider requests, real configuration reads, user database access or
running VCPChat restart were part of these checks. A full application packaging
build, real-provider acceptance and live GUI acceptance were **NOT RUN**. The
native voice artifact is the author's tracked artifact, not a new local rebuild.

Source integration is separate from runtime activation. After the local branch
is advanced, an already-running Electron process must not be claimed to be fully
running the new source until a separately authorized restart and UI verification.
