# VCPChat Directory Migration Fourth-Pass Closeout Summary

> Date: 2026-04-21  
> Scope: `VCPChat directory migration`  
> Batch: fourth-pass `Promptmodules` / `Groupmodules` / `Musicmodules` / `Voicechatmodules`

## 1) Migration Result

- `Promptmodules` -> `Desktopmodules/legacy/Promptmodules`
- `Groupmodules` -> `Desktopmodules/legacy/Groupmodules`
- `Musicmodules` -> `Desktopmodules/legacy/Musicmodules`
- `Voicechatmodules` -> `Desktopmodules/legacy/Voicechatmodules`

All files in these four families were moved via `git mv` and keep the same internal structure.

## 2) Runtime Path Update Result

- `main.html`
  - Prompt/Group/Voice 相关 CSS/JS 加载路径更新为 `Desktopmodules/legacy/...`
- `main.js`
  - `require('./Desktopmodules/legacy/Groupmodules/groupchat')`
  - `voiceChatWindow.loadFile(path.join(__dirname, 'Desktopmodules/legacy/Voicechatmodules/voicechat.html'))`
  - `speechRecognizer` fallback 默认路径更新为 `Desktopmodules/legacy/Voicechatmodules/recognizer.html`
- `modules/ipc/groupChatHandlers.js`
  - `require('../../Desktopmodules/legacy/Groupmodules/groupchat')`
- `modules/ipc/musicHandlers.js`
  - `music.html` 加载路径更新为 `Desktopmodules/legacy/Musicmodules/music.html`
- `renderer.js`
  - `speechRecognizerPagePath` 默认值更新为 `Desktopmodules/legacy/Voicechatmodules/recognizer.html`
- `modules/speechRecognizer.js`
  - 识别页默认路径更新为 `Desktopmodules/legacy/Voicechatmodules/recognizer.html`
- `modules/utils/appSettingsManager.js`
  - 默认 `speechRecognizerPagePath` 更新为 `Desktopmodules/legacy/Voicechatmodules/recognizer.html`
- `modules/renderer/domBuilder.js`
  - VoiceChat 页路径判断更新为 `Desktopmodules/legacy/Voicechatmodules/`

## 3) Validation Scope

- `git status --short` 已显示四组目录为 `R`（重命名）且无额外功能性文件混入
- 运行源码级路径扫描（排除 `docs`、`assets`、`AppData`）：
  - 运行时引用不再出现裸旧路径 `Promptmodules/` / `Groupmodules/` / `Musicmodules/` / `Voicechatmodules/`
  - 仅存在于文档、说明性注释和测试/历史快照内的旧路径字符串
- 未做 runtime 功能测试（本批次为纯结构化路径调整）

## 4) Rollback Options

- 软回滚：`git restore --worktree --source=<parent commit> .`（仅恢复当前批次工作区变更）
- 精确回滚：`git restore` / `git checkout -- <file>` 回退已修改加载路径文件
- 对外退场：需要回退整批时使用 `git reset` 回到本批前的提交状态

## 5) Not-Migrated Modules (当前批次外)

- 本批次外无新增待迁移的根目录模块（四类目标模块均已移动到 legacy）；
- 其余内容保持现状：继续沿用既有 `scope_freeze` 中尚未纳入结构迁移的范围。

## 6) Exclusions / Keep-Out

- 本批次不处理：
  - `VCPDistributedServer/Plugin/DeepMemo/config.env`
  - `VCPDistributedServer/Plugin/FileOperator/.env`
- 这两份本地 env 文件继续保持为长期本地态，不入库提交边界

## 7) Next Step

- 继续进入下一批（若有）前，先确认是否需要额外一次源码面扫描清洗旧路径注释/文档中的历史引用；当前状态下该需求为可选，不影响运行时。
