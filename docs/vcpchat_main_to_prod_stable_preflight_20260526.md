# VCPChat main -> prod-stable Promotion Preflight

Date: 2026-05-26

Purpose: evaluate whether the current integration line can be promoted toward the stable release line.

This document is a preflight only. It does not authorize moving `prod-stable`.

## Lines

Promotion source:

- Remote source line: `origin/main`
- Source commit: `b3412ddc036056e32029f2876894e12107148ea4`
- Source PR: `#40 Promote upstream main sync candidate`

Promotion target:

- Remote stable line: `origin/prod-stable`
- Stable commit: `3b51c7b`

Local-only checkpoint:

- Local `main` has checkpoint commit `5959ef5 docs: checkpoint upstream sync main closeout`.
- That commit is not on `origin/main`.
- Stable promotion should use a clean promotion branch from `origin/prod-stable` and merge `origin/main`, unless the user separately decides to include local governance docs.

Local branch caveat:

- Local `prod-stable` is at `f7e95ed`, ahead of `origin/prod-stable` by two local documentation commits.
- Remote reality for stable promotion remains `origin/prod-stable@3b51c7b`.

## Branch Shape

Merge base:

```text
74238c1ad6df7d9b49eb5dbcd53e0accfd8063ce
```

Ahead/behind:

```text
origin/prod-stable...origin/main = 3 left / 53 right
```

`origin/prod-stable`-only commits:

- `3b51c7b Merge pull request #39 from JENN2046/codex/promote-vt-path-fix-prod-stable-20260513`
- `a422de1 Merge pull request #37 from JENN2046/codex/promote-prod-stable-20260513`
- `c23fc85 fix: support VirusTotal batch command wrapper`

Interpretation:

- Do not hard-reset `prod-stable` to `main`.
- Prefer a merge-based promotion from a branch based on `origin/prod-stable`.
- The promotion branch should preserve stable-only history while absorbing `origin/main`.

## Candidate Diff Summary

Diff from `origin/prod-stable` to `origin/main`:

- 64 files changed.
- About 9,380 insertions and 1,119 deletions.
- No `package.json` or `package-lock.json` changes.
- No `.env` or `config.env` changes.
- No secret/key/token-like files detected in the candidate diff.
- `README.md` changed.

Primary changed surfaces:

- notes / notemini
- tavern / groupchat
- message renderer / content pipeline
- TopicSponsor
- FileOperator ApplyDiff
- desktop/window IPC
- text viewer
- topic list manager
- Electron UI smoke scripts and promotion audit docs

## Merge Feasibility

Non-working-tree merge check:

```text
git merge-tree --write-tree origin/prod-stable origin/main
```

Result:

```text
ddc74cb192c96867221e09f769a5c5fe84c501e6
```

Interpretation:

- Git can produce a merge tree without textual conflicts.
- This does not replace runtime validation.
- This does not move any branch.

## Validation Run

Local validation on current main/preflight workspace:

- changed JS syntax check across `origin/prod-stable..origin/main`: passed for 46 changed `.js` files
- `node --check scripts\topic-sponsor-smoke.js`: passed
- `node scripts\topic-sponsor-smoke.js`: passed
- `npm run test:photo-studio`: passed, 25/25
- `ELECTRON_UI_SMOKE_TIMEOUT_MS=70000 node scripts\electron-ui-smoke.js`: passed

Remote validation already observed for PR #40:

- JS smoke passed.
- Rust Assistant Engine check/test passed on macOS, Ubuntu, and Windows.
- Release builds passed on macOS, Ubuntu, and Windows.
- Codex Review re-review found no major issues after follow-up fixes.

## Non-Passing / Accepted Risk Candidate

Whitespace check:

```text
git diff --check origin/prod-stable..origin/main
```

Result:

- failed with trailing whitespace findings
- counted issue lines: 3,813
- largest affected files:
  - `Desktopmodules/legacy/Notemodules/notes.js`: 816
  - `modules/ipc/notesHandlers.js`: 425
  - `modules/topicListManager.js`: 319
  - `modules/text-viewer.js`: 307
  - `Desktopmodules/legacy/Translatormodules/translator.js`: 253
  - `Desktopmodules/legacy/Notemodules/notes.css`: 252
  - `Desktopmodules/legacy/Translatormodules/translator.css`: 240
  - `modules/messageRenderer.js`: 185
  - `modules/ipc/assistantHandlers.js`: 163
  - `modules/chatManager.js`: 112

Policy option:

- Accept whitespace noise as inherited upstream sync debt and do not block stable promotion on it.
- Or run a separate whitespace hygiene branch before stable promotion.

Recommendation:

- Do not mix whitespace cleanup into the stable promotion merge unless the user explicitly wants a hygiene gate first.
- If cleanliness is required before stable, create a separate `hygiene/whitespace-upstream-20260526` branch from `origin/main`, validate it, then reassess.

## Promotion Gate

Required before moving `prod-stable`:

1. User explicitly chooses the promotion strategy.
2. Create a promotion branch from `origin/prod-stable`.
3. Merge `origin/main` into that promotion branch.
4. Run the same validation on the actual promotion branch:
   - changed JS syntax check
   - TopicSponsor smoke
   - Photo Studio smoke
   - Electron UI smoke
5. Confirm `.vcp_ready` remains excluded.
6. Open a PR from the promotion branch to `prod-stable`.
7. Require CI and review conversation resolution before merge.

Suggested branch:

```text
promotion/main-to-prod-stable-20260526
```

Suggested merge direction:

```text
origin/prod-stable <- promotion/main-to-prod-stable-20260526
```

Suggested local setup:

```text
git switch -c promotion/main-to-prod-stable-20260526 origin/prod-stable
git merge --no-ff origin/main
```

Do not use:

```text
git reset --hard origin/main
```

## Decision

Current preflight decision:

```text
preflight-pass-with-conditions
```

Meaning:

- The promotion appears technically mergeable.
- Core validation passed on the current main candidate.
- No dependency or secret/config-file changes were detected.
- Stable promotion should proceed only through a dedicated promotion branch and PR.
- Whitespace debt must be either accepted as inherited upstream noise or handled in a separate hygiene branch before stable movement.

This is not `promote-ready` yet because the actual promotion branch has not been created and validated.

This is not `freeze-main` because no functional blocker was found in preflight.

## Promotion Branch Validation

Date: 2026-05-26

Local promotion branch:

- Branch: `promotion/main-to-prod-stable-20260526`
- Base: `origin/prod-stable@3b51c7b`
- Merged source: `origin/main@b3412dd`
- Local merge commit: `a972109 Merge origin/main into prod-stable promotion candidate`

Merge result:

- `origin/main` merged into the local promotion branch without conflicts.
- `.vcp_ready` remained a local runtime artifact and was not part of the merge commit.
- No remote branch was pushed.
- `origin/prod-stable` was not moved.
- The promotion branch intentionally does not include local-only governance checkpoint commits `5959ef5` or `781a528`.

Validation on the actual promotion branch:

- changed JS syntax check across `origin/prod-stable..HEAD`: passed for 46 changed `.js` files
- `node --check scripts\topic-sponsor-smoke.js`: passed
- `node scripts\topic-sponsor-smoke.js`: passed
- `npm run test:photo-studio`: passed, 25/25
- `ELECTRON_UI_SMOKE_TIMEOUT_MS=70000 node scripts\electron-ui-smoke.js`: passed

Known non-pass on the actual promotion branch:

- `git diff --check origin/prod-stable..HEAD`: failed with the same upstream trailing-whitespace debt
- counted issue lines: 3,813
- largest affected files remain:
  - `Desktopmodules/legacy/Notemodules/notes.js`: 816
  - `modules/ipc/notesHandlers.js`: 425
  - `modules/topicListManager.js`: 319
  - `modules/text-viewer.js`: 307
  - `Desktopmodules/legacy/Translatormodules/translator.js`: 253
  - `Desktopmodules/legacy/Notemodules/notes.css`: 252
  - `Desktopmodules/legacy/Translatormodules/translator.css`: 240
  - `modules/messageRenderer.js`: 185
  - `modules/ipc/assistantHandlers.js`: 163
  - `modules/chatManager.js`: 112
  - `styles/messageRenderer.css`: 100
  - `modules/renderer/contentProcessor.js`: 92

Updated decision:

```text
promotion-branch-validated-with-accepted-whitespace-risk
```

Meaning:

- The actual local promotion branch is built and validation has passed.
- The branch is suitable for review as a `prod-stable` promotion candidate if the team accepts the inherited whitespace debt.
- Next remote step would be pushing `promotion/main-to-prod-stable-20260526` and opening a PR to `prod-stable`.
- That remote step requires explicit user approval.
