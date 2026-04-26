# VCPChat Directory Migration Third-Pass Reference Surface

> Date: 2026-04-21  
> Scope: `VCPChat directory migration`  
> Stage: third-pass execution planning  
> Status: Draft

## Frozen Reference Mappings

### `Notemodules`

- `modules/ipc/notesHandlers.js`
  - `file://${path.join(__dirname, '..', '..', 'Notemodules', 'notes.html')}`
  - 预计迁移为：`file://${path.join(__dirname, '..', '..', 'Desktopmodules', 'legacy', 'Notemodules', 'notes.html')}`

### `Memomodules`

- `modules/ipc/desktopHandlers.js`
  - `path.join(app.getAppPath(), 'Memomodules', 'memo.html')`
  - `vchatMemoWindow`/`vchatForumWindow` 的打开路径

- `modules/ipc/windowHandlers.js`
  - `path.join(__dirname, '../../Memomodules/memo.html')`

### `Forummodules`

- `modules/ipc/desktopHandlers.js`
  - `path.join(app.getAppPath(), 'Forummodules', 'forum.html')`

- `modules/ipc/windowHandlers.js`
  - `path.join(__dirname, '../../Forummodules/forum.html')`

### `Flowlockmodules`

- `main.html`
  - `Desktopmodules/legacy/Flowlockmodules/...` 相关静态引用（css + js）直接更新为 legacy 入口

## Current Exclusions for This Batch

本批次不触碰：

- `Promptmodules`（入口与菜单面板耦合）
- `Groupmodules`（群聊核心依赖）
- `Musicmodules`（播放器与主进程启动链路）
- `Voicechatmodules`（语音识别路径分散）

