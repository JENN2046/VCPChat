# R9 Android HTTPS / real-model acceptance

Result: **R9_ANDROID_REAL_MODEL_PASS**. Physical Android installation, installed-app recovery, real-model execution and formal Windows continuity are now verified. This supersedes the earlier installation BLOCKED result; failed attempts remain preserved.

## Scope and source

- R8 baselines: Chat `7976ba0506e292eff13ddaf5d8edb5665a44f59d`, ToolBox `8838bb70859ea2e6f263c2b84d75dc6eef3fe518`.
- R9 source roots: `P:/VCPKF/vcp/versions/vcpchat-android-r9` and `P:/VCPKF/vcp/versions/vcptoolbox-android-r9`. Prior deliveries `47fb675` / `e0ac7e9` are preserved; final local commit IDs are in `P:/VCPKF/vcp/artifacts/native-sync-r9/R9_FINAL_REPORT.json`.
- Only Jenn's approved isolated Ubuntu runtime consumes the configured `doubao-seed-2.0-mini` credential. No credential contents belong in source, receipts or console output. Authorization applies to this R9 task only.
- Actual full ToolBox entry: `/home/admin/VCPKF/vcp/artifacts/native-sync-r7/run-1792671713255/source/server.js`; the R7 directory name retains the proven isolation profile. Final local evidence: `P:/VCPKF/vcp/artifacts/native-sync-r9/run-1792671713255`.
- Shared topics retain Queue/NativeSync write authority; CDS/MobileSync are read-only. No production, Rust CDS, sync protocol/store, real chat or phone security configuration changes. No Push/Merge.

## Actual acceptance

`INSTALL_RECOVERY_ACCEPTANCE.json` and `R9_APP_PASS_RECEIPT.json` establish:

- Real Android 16 / Chrome 154, trusted HTTPS, installed WebAPK `org.chromium.webapk.a5da775e87f767de1_v2`, standalone mode and controlling Service Worker. The restricted session survives without another pairing; no readable cookie or local/session storage token.
- Final automated openings use the installed package's actual Android MAIN/LAUNCHER activity with ordinary launcher flags. These are OS launcher invocations, not claims of a human tap. Earlier human desktop-icon startup is separately recorded in `PRIOR_FIRST_LAUNCH_VALIDATION.json` for the previous installed origin, with preserved messages/task ownership. Its full attempt did not pass.
- The same HTTPS origin, authenticated session, committed messages and completed/cancelled task states survive full ToolBox shutdown/restart. Previously terminal tasks do not execute again.
- The owned installed PWA document is closed while the real model task is running. The server persists its 1,316-character reply before reopening. Reopening through the installed Launcher restores login, messages, task ownership and completion. Exact request replay returns the same execution without another attempt or duplicate messages.
- Windows A/B are complete `main.js` / preload / formal Renderer applications. Each displays the same ten messages, with cursor 10, Outbox 0, pending false. Original Rust CDS and MobileSync read projections/search agree with canonical hashes.
- Sync-Off saves two local messages and reaches CDS content/index revisions 2/2. Plugin-Off also preserves standalone saving/indexing; the disabled plugin creates no sync data or writable sync endpoint.
- Four complete Windows clients and four original CDS processes exit 0. Full host shutdown receipts and independent read-only SQLite verification pass. Final central journal/messages/applied operations all equal ten; no owned host remains.

Independent proofs: `REMOTE_STORAGE_PROOF.json`, `INDEPENDENT_STORAGE_INDEX_SHUTDOWN_PROOF.json`, `PUBLIC_HTTPS_PROOF.json`. Screenshots: `android-installed-restored-final.png`, `Windows-A-installed-recovery.png`, `Windows-B-installed-recovery.png`.

Earlier real-model core evidence remains under `run-1792667864348/REAL_MODEL_ACCEPTANCE.json`: long replies, controlled transport outage/recovery, explicit cancellation, restart and idempotence. Actual manual Chinese input, soft keyboard, scrolling and user lock/background proof remain under `run-1792669114996/ANDROID_PREINSTALL_PROOF.json`. These distinct runs are identified rather than presented as one uninterrupted attempt.

## Minimal follow-up changes

This follow-up changes test coordination and evidence, not product sync architecture or ToolBox runtime code:

- `native-sync-r9-android.cjs`: resolve only the exact test-origin WebAPK and its actual Launcher activity; track the owned page target and visible screenshot context.
- `native-sync-r9-install-recovery.cjs`: verify installed startup, session/state preservation, complete host restart, closed-document execution, reopen/retry and formal Windows/CDS controls. Allow additional legitimate messages while rejecting missing/changed anchors, duplicate IDs, ownership changes or terminal-state regression.
- `native-sync-r9-live-transport.cjs`: scope a fresh coordinator to the existing experiment's loopback transport and protected origin. Read independent SQLite projections before taking over; stop the verified original host gracefully, restart the actual full host, and retain lifecycle proof. Borrowed forwards remain owned by their original coordinator.
- `test-native-sync-r3.cjs`: include all configured topics in persistence comparisons; bounded same-origin retry; reload both scenario/helper modules on retry; verify Plugin-Off CDS convergence.
- `native-sync-r9-model-transport.cjs`: test-only installation display-name overlay with original/served hashes; export the existing transport for reuse.
- Targeted tests cover restoration negatives, exact Android origin and live-attachment boundaries.

Lessons from retained failures: changing temporary origins forces a different installed app/session; hard reload with cache bypass can remove Service Worker control during an install check; whole-snapshot equality wrongly rejects legitimate new chat messages. Reuse one live origin, preserve anchor records, perform ordinary reload, and inspect package/Launcher state before asking for another installation. An earlier stale helper cache and fresh-coordinator snapshot assumption were test defects, now corrected.

Initial native WebAPK requests timed out. Jenn observed installation succeed with proxy access and clarified that the later proxy was already global. Subsequent native server errors/timeouts were also observed. Final install succeeded, but these observations do not prove a permanent external WebAPK-service root-cause fix. No proxy, certificate, installation-permission or browser-login settings were changed by the agent.

## Validation and reproduction

Fresh checks after the follow-up changes:

- 32 targeted Node tests pass: installation restoration/boundaries, public gateway, shared-writer exclusion, lifecycle, native IPC and renderer refresh. Output/receipt: `R9_INSTALL_RECOVERY_REGRESSIONS.log` / `.json` in the R9 artifact root.
- Full R3 cold-start suite passes, seven complete application launches exit 0: `P:/VCPKF/vcp/artifacts/native-sync-r3/run-1792674269605/R3_APP_RECEIPT.json`.
- Retained earlier R9 regressions: 389 native Node cases (including the original 13) and seven real Electron checks; R8 coexistence `run-1792670385994`; enhanced R7 `run-1792670567321`. They passed earlier in R9 and were not all rerun in this follow-up. The initial aggregate timeout and serial recovery are preserved in `R9_NATIVE_REGRESSION_SUMMARY.json`.

From the Chat source root, only with an explicitly authorized provider session, isolated Ubuntu configuration and physically authorized Android device:

```powershell
node scripts/test-native-sync-r9-model.cjs
node scripts/test-native-sync-r9-android.cjs --r9-install-recovery
node --test tests/r9-install-recovery.test.cjs tests/r9-public-gateway.test.cjs tests/sync-writer-boundary.test.cjs tests/native-sync-r4-lifecycle.test.cjs tests/native-sync-ipc.test.cjs tests/native-sync-refresh.test.mjs
```

The Android driver uses task-local ADB port 15037/key. Initial installation, unlock and Chinese IME interaction require the human; installed restart can use the exact package's standard Launcher. A recoverable assertion/timeout holds the existing endpoint for a bounded five-minute retry-control window, at most three attempts, instead of immediately forcing another origin. Live attachment is restricted to an already owned R9 root/loopback/origin and is not a general service manager.

## Closure

`REMOTE_CLEANUP_AND_CALL_COUNT.json` audits all 14 R9 experiment roots: no owned process remains, including task-only connectors. Across R9 there were 15 real requests, 13 completed HTTP 200 and two cancelled upstream requests with unknown cancelled usage/cost. The final root accounts for three completed calls; resumes reused existing completed seeds.

Temporary public URLs, owned SSH forwards and task-only ADB 15037 are closed. Installed test icons remain; their temporary server is offline. No production deployment or permanent availability is claimed. Final source delivery is local Git only; no Push/Merge. No remaining R9 acceptance blocker.
