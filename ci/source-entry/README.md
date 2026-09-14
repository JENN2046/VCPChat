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
The nine native code assets require their separate exact identity and format
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

The four current profiles contain 45, 18, 846 and 727 paths respectively. Their
deduplicated body counts are 45, 18, 835 and 726. Running all four jobs makes 20
Git Data REST metadata requests and 1,644 public raw body requests including
the five bootstrap controls in each job. Bodies do not consume the authenticated
Git Data request budget. HTTP failures and rate limits still fail the job;
there is no alternate transport or automatic fallback.

The kernel command retains its original 47 test files in order and appends
`tests/resident-ephemeral-presentation.test.js` as the 48th file. The Chat profile
pins that test and its existing Resident presentation dependencies.

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
