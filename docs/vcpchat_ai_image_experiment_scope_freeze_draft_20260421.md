# VCPChat AI Image Experiment Scope Freeze Draft

> Date: 2026-04-21
> Status: Draft
> Scope candidate: `VCPChat AI image experiment slice`

## Purpose

This draft separates the Desktopmodules AI image experiment from the desktop shell / IPC slice and from official plugin surfaces.

The goal is to keep the experiment layer reviewable on its own, so it does not get mixed with the official `EmojiListGenerator` plugin or with the first countable desktop shell module.

## Candidate Surface

The first AI image experiment slice is:

- `Desktopmodules/aiImageGen.html`
- `Desktopmodules/builtinWidgets/AIImageGenWidget.js`
- `Desktopmodules/test_AIImageGenWidget.js`
- `modules/image-viewer-rating.html`
- `assets/iconset/ImageAutoRegister/`

Optional adjacent files may be added only if they are direct dependencies of the AI image experiment path and not part of the desktop shell / IPC baseline.

## Explicit Exclusions

This draft does not count:

- `.claude/`
- `.omc/`
- `Desktopmodules/.omc/`
- `AppData/`
- `node_modules/`
- `vendor/`
- any `*.env` or `config.env`
- any `*.bak`
- any `*.log`
- `VCPDistributedServer/Plugin/EmojiListGenerator/`
- `VCPChat_ANALYSIS.md`
- `VCP_Plugin_Validator.ps1`

The author-official `EmojiListGenerator` plugin is not part of this experiment slice. It remains a separate official plugin boundary.

## Why This Slice Is Separate

This slice is distinct from the desktop shell / IPC work because it is a feature experiment rather than the core app frame:

- it is visually and behaviorally isolated in Desktopmodules
- it is not the same boundary as the desktop shell bootstrap
- it should not be counted with official plugin surfaces
- it can be cleaned, tested, or frozen without moving the shell/IPC baseline

## Validation Expectation

Before this slice can become a frozen module, the following should be true:

- the experiment files are separated from runtime and generated artifacts
- the experiment has a repeatable launch or smoke path
- any direct shell integration points are reviewable as explicit dependencies
- the slice is not relying on local secrets or user-specific config files

## Proposed Next Steps

1. Clean and classify only the AI image experiment files.
2. Review whether the supporting UI hooks belong here or should be split further.
3. Keep `EmojiListGenerator` out of this slice entirely.
4. Freeze the AI image experiment slice only after the source/runtime split is real.

## Recommendation

Do not count the AI image experiment together with the desktop shell / IPC slice.

Treat it as its own reviewable boundary, or leave it out of the denominator until the split is clean.
