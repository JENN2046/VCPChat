# PR-F Legacy 路径收口拆分说明

日期：2026-04-26

分支：`codex/pr12-legacy-paths`

目标基线：`custom`

## 目标

本批次只处理旧桌面模块的目录口径：

- 将根目录下的旧桌面模块移动到 `Desktopmodules/legacy/`。
- 修正主窗口、IPC handler、语音识别、主题、Sheet、RAG、音乐、笔记等入口路径。
- 保留 `AppData` 下的用户数据目录口径，不把数据目录误改成模块目录。

## 迁移目录

以下目录从仓库根移动到 `Desktopmodules/legacy/`：

- `Agenttaskmodules`
- `Canvasmodules`
- `Dicemodules`
- `Flowlockmodules`
- `Forummodules`
- `Groupmodules`
- `Memomodules`
- `Musicmodules`
- `Notemodules`
- `Promptmodules`
- `RAGmodules`
- `Sheetmodules`
- `Themesmodules`
- `Translatormodules`
- `Voicechatmodules`

## 安全说明

- 没有直接复用整合线里的 `main.html`，因为审计时发现该文件 diff 出现乱码/标签破损风险。
- 本批次只手工替换必要路径，不带入 Photo Studio、DesktopRemote、Codex TODO、AI Image 等其他批次内容。
- `AppData/Notemodules`、`AppData/Translatormodules` 等用户数据路径保持不变。

## 验证建议

- `node --check main.js`
- `node --check modules/ipc/desktopHandlers.js`
- `node --check modules/ipc/canvasHandlers.js`
- `node --check modules/ipc/diceHandlers.js`
- `node --check modules/ipc/groupChatHandlers.js`
- `node --check modules/ipc/musicHandlers.js`
- `node --check modules/ipc/notesHandlers.js`
- `node --check modules/ipc/ragHandlers.js`
- `node --check modules/ipc/sheetHandlers.js`
- `node --check modules/ipc/themeHandlers.js`
- `node --check modules/ipc/windowHandlers.js`
- `node --check modules/speechRecognizer.js`
- `node --check modules/utils/appSettingsManager.js`
- `node --check renderer.js`
- `git diff --check`

## 手工验收建议

- 主窗口能打开。
- 系统提示词模块正常加载。
- 群聊设置渲染正常。
- Flowlock 样式与脚本正常加载。
- Memo / Forum / Translator / Theme / Notes / Music / Dice / Canvas / RAG / Sheet / Voicechat 入口能打开。
