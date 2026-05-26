# VCPChat sync/upstream-main-20260526 Merge Audit

Date: 2026-05-26
Branch: `sync/upstream-main-20260526`
Merge commit: `cedda29 merge upstream main into sync branch`
Base line: `origin/main` at `74238c1`
Merged source: `upstream/main` at `97b08af`

## Purpose

Move `sync/upstream-main-20260526` from "local merge completed" to a reviewable candidate that can be evaluated for promotion into `main`.

This audit records what `cedda29` absorbed, what local contracts were preserved, what was corrected during semantic review, and what risk remains before promotion.

## Absorbed Upstream Capabilities

### Notes and NoteMini

- Added `Desktopmodules/legacy/Notemodules/notemini.css`.
- Added `Desktopmodules/legacy/Notemodules/notemini.html`.
- Added `Desktopmodules/legacy/Notemodules/notemini.js`.
- Absorbed upstream notes UI/editor changes in:
  - `Desktopmodules/legacy/Notemodules/notes.css`
  - `Desktopmodules/legacy/Notemodules/notes.html`
  - `Desktopmodules/legacy/Notemodules/notes.js`
- Absorbed `modules/services/networkNotesCacheStore.js` and related notes cache changes.

### Tavern Advanced Reply

- Added `Tavernmodules/tavern-manager.js`.
- Added `Tavernmodules/tavern.css`.
- Added `modules/ipc/tavernHandlers.js`.
- Added `modules/tavernRulesEngine.js`.
- Wired `main.js` to initialize `tavernHandlers`.
- Wired `main.html` to load tavern CSS, manager, and shared rule engine.
- Wired `Desktopmodules/legacy/Groupmodules/groupchat.js` to apply tavern rules through:
  - `applyUserSuffix`
  - `applySystemSuffix`
  - `applyContextInject`

### TopicSponsor

- Adopted the upstream formal entry name `topicsponsor.js`.
- Updated `VCPDistributedServer/Plugin/TopicSponsor/plugin-manifest.json` to run `node topicsponsor.js`.
- Preserved compatibility with historical naming in logs and metadata:
  - `[TopicSponsor/AgentTopicCreator]`
  - `_metadata.topicCreator`
  - `_metadata.topicSponsor || _metadata.topicCreator` fallback
- Updated `VCPDistributedServer/Plugin/TopicSponsor/README.md` so the documented current entry matches `topicsponsor.js`.

### Desktop and Window Lifecycle

- Absorbed upstream standalone app cleanup behavior:
  - `cleanupStandaloneAppProcesses`
  - `app.once('will-quit', cleanupStandaloneAppProcesses)`
  - `detached: false` for standalone Electron child processes
- Preserved Photo Studio desktop bridge in `modules/ipc/desktopHandlers.js`.

### Message Rendering

- Absorbed upstream `messageRenderer` improvements around:
  - LaTeX protection/restoration
  - markdown table and price-like `$...$` guardrails
  - large tool result handling
  - tool-result layout CSS

### Other Upstream Surface

- Added Log modules:
  - `Logmodules/log.css`
  - `Logmodules/log.html`
  - `Logmodules/log.js`
- Absorbed translator, memo, text viewer, topic list, tray, preload, renderer, and content pipeline updates.
- Absorbed FileOperator changes.

## Preserved Local Contracts

### Package and Script Line

`package.json` and `package-lock.json` were not changed by `cedda29`.

This preserves:

- local package version line
- UTF-8 start scripts
- Photo Studio validation script
- current dependency lockfile

### Legacy Desktop Module Layout

Current repository layout keeps several modules under `Desktopmodules/legacy/**`.

The merge preserved legacy paths for:

- Flowlock CSS in `main.html`
- Prompt module CSS in `main.html`
- Group module scripts in `main.html`
- Notes window path in `modules/ipc/notesHandlers.js`
- NoteMini window path in `modules/ipc/notesHandlers.js`

### Photo Studio Bridge

The sync branch keeps the local Photo Studio bridge in `modules/ipc/desktopHandlers.js`:

- `PhotoStudioOrchestrator`
- `PHOTO_STUDIO` window registration
- `photo-studio-*` IPC handlers
- Photo Studio smoke validation remains available through `npm run test:photo-studio`

### TopicSponsor Runtime Data Root

`topicsponsor.js` uses:

```js
createPluginRoots(__dirname).runtimeDataRoot
```

This preserves the local runtime data root contract instead of reverting to a hardcoded `AppData` path.

## Semantic Review Fixes Applied

### NoteMini Path Fix

During semantic review, `createOrFocusNoteMiniWindow()` still pointed to the non-existent upstream path:

```text
Notemodules/notemini.html
```

It was corrected to the actual local layout:

```text
Desktopmodules/legacy/Notemodules/notemini.html
```

### TopicSponsor Documentation Fix

`TopicSponsor` runtime and manifest now use `topicsponsor.js`, but the upstream README still described `topicCreator.js` as the current entry.

The README was corrected to distinguish:

- current entry: `topicsponsor.js`
- historical metadata/log naming: retained for compatibility

### Electron UI Smoke Fixes

The first Electron UI smoke runs exposed renderer and IPC startup blockers that were not visible in syntax-only validation.

Fixes applied on top of `cedda29`:

- `modules/ipc/promptHandlers.js`: added duplicate registration protection. `main.js` initializes prompt handlers twice on the normal startup path; the second registration previously stopped later initialization before `tavernHandlers.initialize(...)`.
- `Desktopmodules/legacy/Notemodules/notes.html`: corrected vendor/style/pretext asset paths for the legacy notes directory depth.
- `Desktopmodules/legacy/Notemodules/notes.js`: corrected dynamic highlight theme paths used after theme application.
- `modules/filterManager.js`: made `checkMessageFilter` safe before `filterManager.init(...)`, because early `vcp-log-message` events can arrive before renderer module initialization completes.
- `preloads/chat.js`: added channel-tagged diagnostics for subscription callback failures while preserving existing throw behavior.
- `scripts/electron-ui-smoke.js`: added a reusable Electron/Puppeteer UI smoke covering the sync promotion surfaces.

## Validation Performed

### Merge and Conflict Integrity

- `git diff --name-only --diff-filter=U`: no unmerged paths.
- Conflict marker scan for `<<<<<<<` and `>>>>>>>`: no merge conflict markers found.
- Precise stale critical path scan: passed.

Note: `FileOperator.js` intentionally contains literal patch marker strings such as `<<<<<<< SEARCH`; those are not merge conflict markers.

### Syntax and Local Smokes

- `node --check` passed for 42 changed `.js` paths.
- `npm run test:photo-studio`: 25/25 passed.
- `tavernRulesEngine` smoke: passed.
- TopicSponsor controlled-error smoke: passed.
- Key path existence check: passed.
- Electron UI smoke: `ELECTRON_UI_SMOKE_TIMEOUT_MS=70000 node scripts/electron-ui-smoke.js`, passed after the smoke fixes above.
  - opened `main.html`
  - confirmed `messageRenderer.renderMessage`
  - confirmed `TavernManager` and `TavernRulesEngine`
  - confirmed `GroupRenderer`
  - confirmed `tavernGetRules`
  - opened `Desktopmodules/desktop.html`
  - opened `Desktopmodules/legacy/Notemodules/notes.html`
  - opened `Desktopmodules/legacy/Notemodules/notemini.html`

### Known Non-Passing Check

`git diff --check cedda29^1..cedda29` fails due trailing whitespace in upstream-absorbed files.

This was not auto-cleaned because a bulk whitespace cleanup would pollute the upstream sync diff and make review harder.

## Remaining Risk

### Promotion Blockers

- TopicSponsor full VCPDistributedServer write-path route smoke has not been run.
- Whitespace policy is undecided:
  - accept upstream whitespace as sync noise
  - or perform a separate cleanup commit before promotion

### Review Risks

- `messageRenderer` and content pipeline changes are broad and user-visible.
- notes and notemini now pass startup smoke, but UI editing/save flows still need manual or deeper automated verification.
- tavern/groupchat rule injection changes affect prompt assembly behavior.
- TopicSponsor writes runtime data; only startup/error-path smoke was run, not live topic creation.

## Rollback Anchor

Current candidate commit:

```text
cedda29 merge upstream main into sync branch
```

Rollback to pre-sync local integration base:

```text
74238c1 origin/main
```

Safe rollback strategy before promotion:

1. Keep `sync/upstream-main-20260526` as the review branch.
2. Do not move `main` until promotion gates pass.
3. If the candidate is rejected, freeze this sync branch and create a new `sync/upstream-main-YYYYMMDD-r2` branch from `origin/main`.
