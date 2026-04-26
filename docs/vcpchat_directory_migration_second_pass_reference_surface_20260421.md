# VCPChat Directory Migration Second-Pass Reference Surface

> Date: 2026-04-21
> Scope: `VCPChat directory migration`
> Status: Draft

## 迁移路径映射

- `Themesmodules` -> `Desktopmodules/legacy/Themesmodules`
- `Translatormodules` -> `Desktopmodules/legacy/Translatormodules`

## 必更新运行时文件

### `main.js`
- `path.join(__dirname, 'Translatormodules', 'translator.html')`
- （如有其他与译员界面根路径相关的硬编码路径）

### `modules/ipc/desktopHandlers.js`
- `app.getAppPath(), 'Translatormodules', 'translator.html'`
- `app.getAppPath(), 'Themesmodules', 'themes.html'`
- command handler 分支中重复出现的 `'open-translator-window'` 与 `'open-themes-window'`

### `modules/ipc/themeHandlers.js`
- `path.join(PROJECT_ROOT, 'Themesmodules', cleanedPath)`
- `themesWindow.loadFile(path.join(PROJECT_ROOT, 'Themesmodules/themes.html'))`

## 说明

- 第一轮已迁移的目录（`Agenttaskmodules`、`Canvasmodules`、`Dicemodules`、`RAGmodules`、`Sheetmodules`）的引用已冻结在第一批 closeout 中，不应在本批内重复变动。
- `VCPDistributedServer/Plugin/*` 的 runtime 配置文件仍保持本批之外，不纳入迁移引用修正。
- 本批不处理 `VCPChat/backup.py` 中示例字符串。
