# VCPChat Directory Migration Third-Pass Closeout Summary

> Date: 2026-04-21  
> Scope: `VCPChat directory migration`  
> Stage: third-pass `Notemodules` / `Memomodules` / `Forummodules` / `Flowlockmodules`

## 1) Migration Result

- `Notemodules` -> `Desktopmodules/legacy/Notemodules`
- `Memomodules` -> `Desktopmodules/legacy/Memomodules`
- `Forummodules` -> `Desktopmodules/legacy/Forummodules`
- `Flowlockmodules` -> `Desktopmodules/legacy/Flowlockmodules`

## 2) Runtime Update Result

已更新以下文件：

- `modules/ipc/notesHandlers.js`
  - `notes.html` 加载路径迁移到 `Desktopmodules/legacy/Notemodules/notes.html`
- `modules/ipc/desktopHandlers.js`
  - Memo/Forum 打开路径更新到 `Desktopmodules/legacy/Memomodules/memo.html`、`Desktopmodules/legacy/Forummodules/forum.html`
- `modules/ipc/windowHandlers.js`
  - Memo/Forum 打开路径更新到 `Desktopmodules/legacy/...`
- `main.html`
  - `Flowlockmodules` 的 css/js 引用更新到 `Desktopmodules/legacy/Flowlockmodules/...`

## 3) Validation Scope

- 目录移动使用 `git mv`，保证文件历史与引用一致性。
- `git grep` 复核完成，当前非文档引用面仅剩 AppData 数据路径语义：
  - `main.js` 中 `APP_DATA_ROOT_IN_PROJECT + 'Notemodules'`（笔记数据目录）保留不变，未作为 UI 窗口加载路径使用。
- 运行态文档与辅助资产文件未纳入本批次改动。

## 4) Rollback Options

- 单文件回滚：`git restore` 回到变更前状态。
- 批次回滚：`git reset --soft <parent>`（在本批次尚未推送且未后续依赖前）回退本批提交。

## 5) Remaining Not-Migrated Families

- `Promptmodules`
- `Groupmodules`
- `Musicmodules`
- `Voicechatmodules`

