# VCPChat AI Image Execution Checklist

> Date: 2026-04-21
> Scope: `feature/vcpchat-source-runtime-cleanup`
> Line: `VCPChat` AI image experiment

## 当前进度

状态：`in-progress`

- `feature/vcpchat-ai-image-split` 已就绪并切换完成
- 已完成范围重新切分：AI image 试验件已从桌面壳/IPC 切出

## 目标

把 `Desktopmodules` 下的 AI image 试验件独立为可审查批次，不混入桌面壳/IPC 冻结，也不与官方插件边界混进同一次提交。

## Scope

- `Desktopmodules/aiImageGen.html`
- `Desktopmodules/builtinWidgets/AIImageGenWidget.js`
- `Desktopmodules/test_AIImageGenWidget.js`
- `modules/image-viewer-rating.html`
- `assets/iconset/ImageAutoRegister/`

排除项（保持在外）:
- `VCPDistributedServer/Plugin/EmojiListGenerator/`（官方插件，不在本线）
- `VCPChat_ANALYSIS.md`
- `VCP_Plugin_Validator.ps1`

## 执行顺序

1. 建立分支承接
- 确认仍在 `feature/vcpchat-source-runtime-cleanup`
- 新建 `feature/vcpchat-ai-image-split` 或在已有分支继续细拆时确认不混入其他模块文件

2. 文件级归类（不改代码）
- 将 AI image 相关路径标记为 `ai-image` 候选
- 在当前状态表里补齐：是否引用 `desktop.html`、`debugTools.js`、`preload` 入口
- 记录 `AIImageGenWidget.js` 对 `spawnAIImageGenWidget` 等关键入口的依赖关系
- 在本分支里对照 `git status`，确认试验文件与桌面壳/IPC 文件未交叉

3. 分离边界
- 明确 experiment 文件只做 AI image 业务，不写入 desktop shell/IPC 首批候选清单
- 标注是否仍被 `desktop.html` 直接加载（若是，记录为“实验挂接点”）
- 处理 `assets/iconset/ImageAutoRegister/` 的归属（experiment 资产或其他可复用资源）

4. 风险清理
- 若本线存在环境变量、绝对路径、机器路径写死，先全部清点，标记为“实验约定”并延后到 env 风险批次
- 删除或转移不属于本线的文件（如旧备份、报告、临时脚本）前先确认不影响官方插件路径

5. 草案冻结前检查
- 更新 [vcpchat_ai_image_experiment_scope_freeze_draft_20260421.md](A:\VCP\VCPChat\docs\vcpchat_ai_image_experiment_scope_freeze_draft_20260421.md) 的实验边界与 exclude 列表
- 再确认桌面壳/IPC 文档里已经剥离了 AI image 引用

6. 提交动作
- 本线第一阶段仅提交 `Desktopmodules` + `modules/image-viewer-rating.html` + `assets/iconset/ImageAutoRegister/` 的边界整理
- 不在同一批次提交官方插件、env 修复、desktop shell / IPC 主路径变更

## 验收标准

1. `git status` 里实验线只剩本批范围相关的变更（或明确标记的排除文件）
2. `Desktopmodules/aiImageGen.html`、`AIImageGenWidget.js`、`test_AIImageGenWidget.js` 被归在同一实验清单下
3. `VCPDistributedServer/Plugin/EmojiListGenerator/` 与 `desktop shell/IPC` 清单无交叉
4. `vcpchat_desktop_shell_ipc_inventory_20260421.md` 与 `vcpchat_desktop_shell_ipc_scope_freeze_draft_20260421.md` 中指向关系一致
5. 给出下一步提交流程：是否可进入独立 `AI image` freeze 或先补并行清理批次

## 阻塞项

- 若发现 `AIImageGen` 代码与桌面壳启动路径深度耦合，需要先做一层“接入层隔离”
- 若实验资产依赖不明确（特别是 `ImageAutoRegister` 与渲染流转），先不冻结，转为“待澄清”

## 下一步输出（完成后）

- 写 AI image 专用 freeze commit note
- 在该线可冻结后，再出 PR 或与 desktop shell / IPC 先后顺序同步说明
