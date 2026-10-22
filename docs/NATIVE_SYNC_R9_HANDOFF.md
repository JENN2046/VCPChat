# R9 Android HTTPS / real-model acceptance

Current result: **BLOCKED — Android home-screen installation**. Real-model and browser-based phone/Windows continuity passed; installed Android operation did not.
Do not report `R9_ANDROID_REAL_MODEL_PASS` from the server-core receipt.

## Boundary

- Chat baseline `7976ba0506e292eff13ddaf5d8edb5665a44f59d`; ToolBox baseline `8838bb70859ea2e6f263c2b84d75dc6eef3fe518`.
- Local R9 sources: `P:\VCPKF\vcp\versions\vcpchat-android-r9` and `vcptoolbox-android-r9`.
- Ubuntu approved config: `/home/admin/VCPKF/vcp/versions/vcptoolbox-android-r9/config.env`. Runtime consumes it; do not print, copy, or commit its values.
- Actual full ToolBox runs retain the proven R7 isolation profile under `/home/admin/VCPKF/vcp/artifacts/native-sync-r7/run-<id>/source/server.js`. Local R9 evidence is under `P:\VCPKF\vcp\artifacts\native-sync-r9`.
- Shared topics retain R8 Queue/NativeSync writer authority. CDS and MobileSync are read-only there. Production `/app/VCPToolBox`, real chats, Rust CDS and upstream provider/tool routing are unchanged. No Push/Merge.

## Changes

The PWA viewport resizes content for the Android soft keyboard. Its existing SVG icon also has 192/512 PNG variants and a stable manifest id. These are minimal installation/layout changes, not proof that installation works on this device.

R9 test transport adds a mobile-only public allowlist through trusted SSH and a temporary Cloudflare HTTPS connector. NativeSync/admin/config paths are denied. The browser uses the existing restricted HttpOnly mobile session and never receives the global ToolBox key.

An Ubuntu-only test relay feeds the original ToolBox model pipeline with the explicitly approved `doubao-seed-2.0-mini`. It bounds calls per experiment, records hashes/status/numeric usage only, sanitizes provider errors and suppresses payload-bearing debug logs. Controlled outage injection is a local transport failure; recovery calls use the real provider.

## Reproduce

From the R9 Chat tree, with the approved isolated config present and a physically authorized USB Android device:

```powershell
node scripts/test-native-sync-r9-model.cjs
node scripts/test-native-sync-r9-android.cjs
```

The Android driver uses its own ADB daemon on port 15037 and task-local key. Unlock, Chinese IME, lock/app switch and installation are manual; it does not grant Android input permissions, disable TLS verification, or alter browser login settings. Temporary endpoints are shut down at test end.

`--r9-resume=<owned-run-root>` reuses a verified experiment. `--r9-phone-proof=<ANDROID_PREINSTALL_PROOF.json>` explicitly references already observed manual Chinese/background evidence. `--r9-install-unavailable` continues remaining checks while keeping installation unverified; it cannot produce the full R9 PASS keyword.

## Evidence available

- Server-core run `run-1792667864348`: actual real replies, long reply, cancellation, controlled outage/recovery, idempotent retry and full host restart, Windows formal A/B UI and sync-off control. Six real upstream requests in its persisted ledger, including one cancelled request with unknown usage.
- Physical phone run `run-1792669114996`: Android 16 / Chrome 154, ordinary trusted HTTPS, two test topics, manual Chinese input, actual soft keyboard, and model completion after the page became hidden. A user-entered additional synthetic question is included in its three real provider requests.
- Installation retry `run-1792669967215`: standard PNG icons served; Jenn again confirmed installation but no icon. Package inventory showed no installed WebAPK in the first attempt. No independent/standalone launch has been verified; root cause is not established.
- Native regression summary `R9_NATIVE_REGRESSION_SUMMARY.json`: 389 Node tests and seven real Electron checks passed. The first aggregate kernel invocation timed out; the same 320 kernel cases passed serially after correcting the runner's temporary-directory setup.

Continuation `run-1792670146749` reused its already persisted long reply, then used actual Android editing/touch events for real recovery and cancellation. Both Windows formal renderers received the same five messages. Original Rust CDS and MobileSync read projections matched canonical hashes and search; A/B cursor=5, Outbox=0, pending=false. Three complete Windows applications and three CDS processes exited 0. `ANDROID_ACCEPTANCE.json` correctly says Android PARTIAL / realModel PASS; the driver exits nonzero for `R9_ANDROID_HOME_SCREEN_INSTALL_UNVERIFIED`.

Independent `REMOTE_STORAGE_PROOF.json` and `INDEPENDENT_STORAGE_INDEX_SHUTDOWN_PROOF.json` verify central/history/CDS integrity and A/B index convergence. The Sync-Off save-only control has two durable messages but stopped before asynchronous indexing (revision 2/0); that run does not prove Sync-Off index convergence. The separate R8 standalone index control passed.

R8 regression `native-sync-r8/run-1792670385994` passed with independent SQLite/index/exit proof. Enhanced R7 regression `native-sync-r7/run-1792670567321` passed: five full clients and three full ToolBox hosts exited 0, plugin-disabled boot created no sync data. Transient SSH exit-255 attempts are retained in `R9_R7_REGRESSION_ATTEMPTS.json`; an export-failure cleanup leak was fixed in the test transport only.

`REMOTE_CLEANUP_AND_CALL_COUNT.json` audited all 13 owned R9 roots: no owned hosts/connectors remain; 12 real provider requests total, ten completed HTTP200 and two actual upstream cancellations. Cancelled usage/cost is unknown. The task-only ADB daemon was stopped. No production service was changed or restarted.

ToolBox local delivery: `e0ac7e92ee673466c46a0183e559cf4bc6134fda`. Chat local delivery and complete receipts are recorded in `R9_FINAL_REPORT.json` in the R9 artifact root. Historical failed attempts remain available; they are not counted as passing evidence. An early server-core aggregate receipt inherited an obsolete synthetic-model label; the projected upstream ledger and `REAL_MODEL_ACCEPTANCE.json` establish the actual approved model. Original trial UI-marker failure and continuation are kept distinct.

Remaining blocker: Chrome installation confirmation produced no icon, both before and after PNG remediation. The observed first-attempt WebAPK package count was zero; no standalone launch/session restoration was observed. Browser installability/manifest checks and trusted HTTPS passed, but the native installation root cause is not established. Do not change phone security settings or production services to bypass it.
