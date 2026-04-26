# VCPChat Directory Migration Third-Pass Move Set

> Date: 2026-04-21  
> Scope: `VCPChat directory migration`  
> Stage: third-pass candidate  
> Status: Draft

## Background

本批次在第一、二批完成后继续处理未迁移的低耦合目录，范围覆盖以下四个根目录：

- `Notemodules`  
- `Memomodules`  
- `Forummodules`  
- `Flowlockmodules`

## Target Layout

全部迁移到 legacy 归集路径：

- `Notemodules` -> `Desktopmodules/legacy/Notemodules`
- `Memomodules` -> `Desktopmodules/legacy/Memomodules`
- `Forummodules` -> `Desktopmodules/legacy/Forummodules`
- `Flowlockmodules` -> `Desktopmodules/legacy/Flowlockmodules`

## Scope Exclusions (本批未迁移)

仍保留到下一批的高耦合或待确认目录：

- `Promptmodules`
- `Groupmodules`
- `Musicmodules`
- `Voicechatmodules`
- `Themesmodules`
- `Translatormodules`

## Migration Surface Snapshot

本批次预计直接改动三类文件：

1. 目标目录本体（`git mv`）。
2. 运行时路径引用更新文件。
3. closeout 文档。

