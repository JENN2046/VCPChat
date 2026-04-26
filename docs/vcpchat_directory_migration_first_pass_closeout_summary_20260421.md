# VCPChat Directory Migration First-Pass Closeout Summary

> Date: 2026-04-21
> Scope: `VCPChat directory migration`
> Pass: first-pass source migration

## 1) 变更范围（本批次）

### 1.1 目录迁移

- 已迁移：
  - `Desktopmodules/legacy/Agenttaskmodules`  
  - `Desktopmodules/legacy/Canvasmodules`  
  - `Desktopmodules/legacy/Dicemodules`  
  - `Desktopmodules/legacy/RAGmodules`  
  - `Desktopmodules/legacy/Sheetmodules`
- 对应原始位置已清空（文件从根目录 legacy `*modules` 离场）。

### 1.2 引用更新

- 更新 loader/入口路径：
  - [modules/ipc/canvasHandlers.js](/A:/VCP/VCPChat/modules/ipc/canvasHandlers.js)  
    `Canvasmodules/canvas.html` -> `Desktopmodules/legacy/Canvasmodules/canvas.html`
  - [modules/ipc/diceHandlers.js](/A:/VCP/VCPChat/modules/ipc/diceHandlers.js)  
    `Dicemodules` -> `Desktopmodules/legacy/Dicemodules`
  - [modules/ipc/ragHandlers.js](/A:/VCP/VCPChat/modules/ipc/ragHandlers.js)  
    `RAGmodules/RAG_Overlay.html` -> `Desktopmodules/legacy/RAGmodules/RAG_Overlay.html`  
    `RAGmodules/RAG_Observer.html` -> `Desktopmodules/legacy/RAGmodules/RAG_Observer.html`
  - [modules/ipc/sheetHandlers.js](/A:/VCP/VCPChat/modules/ipc/sheetHandlers.js)  
    `Sheetmodules/sheet-studio.html` -> `Desktopmodules/legacy/Sheetmodules/sheet-studio.html`

### 1.3 保持边界

- 本批次未改动 `VCPDistributedServer/Plugin/DeepMemo/config.env`
- 本批次未改动 `VCPDistributedServer/Plugin/FileOperator/.env`
- 本批次未改动 `main.js`、`renderer.js`、`desktopHandlers.js`、`groupChatHandlers.js`、`musicHandlers.js`、`themeHandlers.js`
- 本批次未改动尚未冻结的高耦合目录家族（`Promptmodules`、`Groupmodules`、`Musicmodules`、`Voicechatmodules` 等）

## 2) 回滚点与回滚操作

### 2.1 推荐回滚锚点

- 回滚基准：本次 closeout 提交前的工作树快照（`origin/feature/vcpchat-ai-image-split` 上一提交状态）。

### 2.2 回滚方式

- 若尚未提交：
  - 可单独将移动后的目录与引用恢复到上一次提交状态再提交回滚。
  - 典型命令思路：撤回本批次修改的 4 个 IPC 文件和 5 个目录层；
- 若已提交：
  - 通过 `git revert <commit>` 回退本批次提交。
  - 回退时仅覆盖本批次涉及路径，不涉及本次未纳入目录迁移的文件。

## 3) 未改动项（下一批次保持）

- 仍待下一批次处理的高耦合或边界外目录：
  - `Themesmodules`
  - `Translatormodules`
  - `Promptmodules`
  - `Groupmodules`
  - `Musicmodules`
  - `Voicechatmodules`
  - `Notemodules`
  - `Memomodules`
  - `Forummodules`
  - `Flowlockmodules`
- 本批次未触及文档级“全量目录地图”重写。

## 4) 风险与观察

- `Agenttaskmodules` 无明显运行时入口引用记录，暂未发现 loader 入口，需要在下一次验证确认其是否为独立可用模块。
- 尚未执行运行时冒烟；此批次已完成结构迁移与引用冻结。
