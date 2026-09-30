# Reviewed CI source entry

The workflows materialize the required sources in a new private runner-temporary
directory. They do not check out this repository, download an archive or import
Git history. The existing product commands run in that completed directory and
keep their original failure propagation.

The workflow's inline bootstrap is the reviewable trust root. It pins the size,
Git blob OID and SHA-256 of four Python control modules and the profile manifest.
It verifies all five paths in the actual `GITHUB_SHA` commit's complete Git Data
tree before fetching their bodies, and verifies every body before running the
controller. Push uses its event commit; pull requests retain the platform's merge
commit semantics. A missing event object fails without substituting another ref.

Git Data API requests use the job's read-only `GITHUB_TOKEN` for commit/tree
metadata. Body requests use only the public
`raw.githubusercontent.com/JENN2046/VCPChat/<event-sha>/<admitted-path>` endpoint;
they never include that token. This transport is intentionally limited to this
public repository. Redirects, ambient proxies, Git, archives, LFS and alternate
network fallbacks are refused. Size, blob OID and SHA-256 are checked independently
of HTTP response headers. Identical admitted blobs are fetched once per job.

Only required profile inputs are pinned. New unrelated paths are not downloaded;
they do not require expanding the manifest. Missing or changed required inputs,
incomplete metadata, unsafe paths, and any alias of held content fail admission.
Known ordinary aliases are explicit metadata exceptions and remain unmaterialized.
The ten native code assets require their separate exact identity and format
admission; this does not admit new native binaries or prove reproducible builds.
Runtime configuration, screenshots and font diagnostic reports remain excluded.

The materializer returns only a complete in-memory projection. The writer uses
fresh private directories, refuses symlinks and existing destinations, checks
immutable bytes and metadata again, and publishes an output directory only after
complete verified placement. A failed attempt may retain private temporary staging;
it never publishes a successful source output. This is not a deployment mechanism.

The three Mobile profiles preserve the existing nine build/test commands. The
Node contracts job additionally installs its locked dependencies with
`npm ci --ignore-scripts`. No dependency lifecycle is run by the source entry.
The product commands' own install/build/database/native behavior remains visible
in the workflows and has separate validation requirements.

The Chat Kernel/UI profile supplies the original filesystem scan inputs and a
separate, SHA-256-bound metadata context. Its event, design-source and accepted
upstream frames contain every tracked leaf; historical file bodies are not
downloaded. The design guard independently reconstructs all three Git tree OIDs
and verifies the projected bytes before applying the original assertions. The
context stays outside the source directory. The normal Git-based guard remains
available when this context is absent.

The graph, design-runtime, UI application and package input scans have explicit
reviewed selection rules. A newly tracked file within those rules fails before
body reads if its source identity has not been admitted; a new unrelated file is
not fetched. Package selection is tied to this manifest's exact package input
and the reviewed matcher defaults, not a general replacement packaging engine.

The four current profiles contain 49, 18, 1067 and 931 paths respectively. Their
deduplicated body counts are 49, 18, 1055 and 930. Running all four jobs makes 20
Git Data REST metadata requests and 2,072 public raw body requests including
the five bootstrap controls in each job. Bodies do not consume the authenticated
Git Data request budget. HTTP failures and rate limits still fail the job;
there is no alternate transport or automatic fallback.

The effective kernel command is the final `test:chat-kernel` value parsed from
`package.json` (which currently contains a duplicate script key). Its glob and
explicit arguments select 40 unique current test files. The Chat profile includes
all 40, retains the earlier Resident presentation fixture, and records the exact
reviewed input list. The maintainer test compares the effective command with the
complete staged tree so newly matching tests cannot be silently omitted during a
refresh. This does not change Node's command or fix the duplicate key.

## September 29 identity refresh

The product comparison frame is the previously delivered and locally validated
`b02741fc5198659855eb892f55c220371167352b` (tree
`dccf74d99cf206a75d57695108bbd57e9d6d7dd9`). The independent upstream frame is
`a5c26ff01601e8d1e51f6056a31e1f90937ca067`. Neither frame is the CI-refresh
commit. This preserves the existing difference and upstream Classic parity
guards without adding guard exceptions for the already-delivered lyric fixture
and delivery note. These CI comparison frames do not establish the separate
workspace-wide accepted-upstream baseline or runtime activation.

The refresh admits the new role-preload sources and current Chart packaging
roots, removes only the three deleted shared-preload entries, and refreshes
required source identities. The new author showcase image
`assets/E1.5-Vchat前端应用群.jpg` is excluded both by the package definition and
the exact admission rules; diorama screenshots remain outside the projection.
All existing held paths and object identities are retained.

The set of ten separately admitted native paths is unchanged. Only the existing
Windows voice executable's exact identity changes to the author's tracked
artifact; PE classification remains required. No binary is executed by admission,
and this update is not a reproducible-build or native runtime acceptance claim.

The four bootstrap manifest pins change together. A separately authorized
equivalent guard adaptation checks the new `preloads/api/*.js` declarations
instead of the deleted shared catalog. Both retired presentation-subscription
patterns remain forbidden, and empty declarations now fail explicitly. This does
not refresh the separate shared-business hash baseline.
No controller, writer, permission, transport, fallback or product test command
changes are included.
Maintainers can stage the reviewed refresh and run:

```sh
python3 -B -m unittest discover -s ci/source-entry/tests -p test_github_source_entry.py -k ManifestRefreshTests -v
```

These metadata-only checks can run on Windows. The full original writer suite
requires Linux and its POSIX directory-safety primitives; do not weaken it to
make Windows placement succeed. Hosted source placement and downstream product
gates must still be observed separately.

Controller tests exercise injected HTTP responses and synthetic temporary files.
They do not establish that a full package, Electron runtime, all original commands
or hosted CI passed. The Chat profile also contains the exact extensionless
CommonJS support module and the 96-file vendored Web Awesome import closure;
missing vendor files must not substitute for the adapter test's expected
browser-runtime error. When required source changes, review the changed required
entries, update their exact identities and the workflow's manifest pin together,
and rerun source-entry tests and the relevant original validation.

The source entry itself does not execute dependency lifecycle scripts. The Chat
workflow retains its original `npm ci --omit=optional`, Electron runtime check,
kernel tests, evidence generation and complete UI gate. Their actual build,
temporary database and runtime effects need their own results. The summary step
uses a quoted Node heredoc so Markdown backticks are written literally and all
eight evidence fields retain their original meaning. A source-entry
test result is not a CI result, release approval or runtime readiness claim.

## September 30 upstream comparison refresh

The delivered-product comparison stays at `b02741fc5198659855eb892f55c220371167352b`.
For this frozen update batch, the independent author comparison advances from
`a5c26ff01601e8d1e51f6056a31e1f90937ca067` to
`190f754500a3b0448d22e7501c0fc245bbbbfcd2` (tree
`cfc7b52d895e3e1c3db1a7b567e410abb9b75fa3`).
The Windows ProjectForge rebuild and its verification files have exact
design-subtraction exceptions. PR #52 also admits five exact reviewed paths
for tool-result framing and dirty-editor close protection. The forbidden-path
and Classic parity checks remain active. The package profile includes the
locked ProjectForge Rust build inputs. Both package and Chat profiles admit
the source-verified Windows indexer at its pinned identity; generated Linux
binaries and config.env are excluded. Run manifest refresh tests after staging:
the maintainer checks intentionally audit the Git index, not unstaged files.
