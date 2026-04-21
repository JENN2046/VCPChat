# VCPChat Directory Migration Second-Pass Closeout Summary

> Date: 2026-04-21
> Scope: `VCPChat directory migration`
> Batch: second-pass `Themesmodules` + `Translatormodules`

## 1) 迁移结果

本批完成了如下目录迁移：

- `Themesmodules` -> `Desktopmodules/legacy/Themesmodules`
- `Translatormodules` -> `Desktopmodules/legacy/Translatormodules`

迁移采用 `git mv`，历史可回滚。

## 2) 必改引用更新

- `main.js`
  - `file://${path.join(__dirname, 'Desktopmodules', 'legacy', 'Translatormodules', 'translator.html')}`

- `modules/ipc/desktopHandlers.js`
  - `app.getAppPath(), 'Desktopmodules', 'legacy', 'Translatormodules', 'translator.html'`
  - `app.getAppPath(), 'Desktopmodules', 'legacy', 'Themesmodules', 'themes.html'`
  - command 分支 `'open-translator-window'` 与 `'open-themes-window'` 内对应路径同步更新

- `modules/ipc/themeHandlers.js`
  - `path.resolve(PROJECT_ROOT, 'Desktopmodules', 'legacy', 'Themesmodules', cleanedPath)`
  - `themesWindow.loadFile(path.join(PROJECT_ROOT, 'Desktopmodules', 'legacy', 'Themesmodules', 'themes.html'))`

## 3) 验证范围（本批）

- 运行时入口已覆盖：translator 及 theme 两类入口在 `desktopHandlers.js` 有两处使用点。
- 已确认两目录仅在上述受控位置出现运行时路径修改。
- 未引入新引用点到 `Themesmodules` / `Translatormodules` 的根路径。

## 4) 回滚点

- 回滚锚点：`git revert <本批提交>` 可恢复第二批目录与路径引用。
- 或使用 `git restore --staged --worktree --source=HEAD~1 -- .` 回退本批变更。
- 不需要人工重建 AppData 目录或本地 env 文件；本批不修改 runtime env 语义。

## 5) 未改项与排除项

- 不改动：`VCPDistributedServer/Plugin/DeepMemo/config.env`
- 不改动：`VCPDistributedServer/Plugin/FileOperator/.env`
- 不改动：`Promptmodules`、`Groupmodules`、`Musicmodules`、`Voicechatmodules` 等未本批定义范围外目录
- 不改动：历史的第一批迁移清单文档（按历史记录保留）
