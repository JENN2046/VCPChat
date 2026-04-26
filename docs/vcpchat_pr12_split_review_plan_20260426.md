# PR12 正式审查拆分计划

日期：2026-04-26

分支：`integration/upstream-main-vcp-20260425`

基线：`origin/custom`

PR：`https://github.com/JENN2046/VCPChat/pull/12`

## 结论

PR12 适合作为 Draft 整合快照，不适合作为一个整体直接进入正式审查或生产合并。

原因：

- 相对 `origin/custom` 当前覆盖约 273 个文件。
- 变更同时包含宿主能力、Photo Studio、legacy 目录迁移、配置卫生、插件实验、工具链、文档和二进制资源。
- 其中部分能力已经验证，但部分变更来自历史整合线，不能混在一个正式 PR 内要求审查者一次性接受。

推荐做法：

- 保留 PR12 Draft 作为可回溯整合快照。
- 从 PR12 拆出多个小 PR，每个 PR 只处理一个主题。
- 每个小 PR 都必须有独立验证、回滚口径和风险说明。
- 不直接把 PR12 合并到 `custom` 或生产线。

## 拆分批次

### PR-A：收口文档、CI 与安全边界

目标：

- 先把“我们已经验证了什么、没有验证什么、为什么保持 Draft”讲清楚。

建议范围：

- `.github/workflows/vcpchat_js_smoke.yml`
- `.gitignore`
- `.vcp_ready`
- `docs/vcpchat_pr12_*`
- `docs/vcpchat_upstream_*`
- `docs/vcpchat_v1_*`

验证：

- `git diff --check`
- 本地等价 CI：关键 JS 文件 `node --check`
- `npm run test:photo-studio`

风险：

- 低到中。
- 主要风险是 `.vcp_ready` 的语义必须保持清楚，不能被误解为生产发布标记。

### PR-B：桌面宿主与 Native Host 基础能力

目标：

- 单独合入桌面入口、preload、IPC、DesktopRemote、窗口 app id、启动脚本等宿主基础能力。

建议范围：

- `main.js`
- `main.html`
- `preload.js`
- `preloads/**`
- `Desktopmodules/api/ipcBridge.js`
- `Desktopmodules/desktop.html`
- `Desktopmodules/builtinWidgets/vchatApps.js`
- `Desktopmodules/debug/debugTools.js`
- `modules/ipc/*`
- `modules/services/windowAppIds.js`
- `modules/utils/vcpPathRoots.js`
- `scripts/desktopremote-http-smoke.js`
- `start-vcpchat-utf8.cmd`

验证：

- `node --check main.js`
- `node --check preload.js`
- `node --check modules/ipc/desktopHandlers.js`
- DesktopRemote HTTP smoke。
- 手工拉起桌面端，确认普通 VCPChat 主窗口不被破坏。

风险：

- 中到高。
- 这是共享宿主层，必须避免混入 Photo Studio 业务逻辑和实验插件。

### PR-C：Photo Studio 工作台

目标：

- 单独合入 Photo Studio 五页面、前端事件、状态、编排器、动作目录和本地影子数据能力。

建议范围：

- `Desktopmodules/photoStudio/**`
- `modules/services/photoStudio/**`
- `scripts/photo-studio-closeout-smoke.js`
- `scripts/photo-studio-prune-shadow-data.js`
- 宿主挂载点中仅 Photo Studio 必需的最小改动。

验证：

- `node --check Desktopmodules/photoStudio/photoStudio.js`
- `node --check Desktopmodules/photoStudio/services/photoStudioEvents.js`
- `node --check Desktopmodules/photoStudio/services/photoStudioState.js`
- `node --check modules/services/photoStudio/PhotoStudioOrchestrator.js`
- `node --check modules/services/photoStudio/actionCatalog.js`
- `node --check modules/services/photoStudio/uiHints.js`
- `npm run test:photo-studio`
- 手工验收五页、搜索、创建项目、编辑项目、客户/线索/报价、预约、交付包、中文文案。

风险：

- 中。
- 当前已通过多轮本地 smoke 和手工视觉验收，但仍不代表生产发布。

### PR-D：Codex TODO / Plan 面板渲染

目标：

- 单独合入消息渲染层对 Markdown TODO / Plan 块的展示增强。

建议范围：

- `modules/renderer/contentPipeline.js`
- `styles/messageRenderer.css`
- 与消息渲染直接相关的最小文档。

验证：

- `node --check modules/renderer/contentPipeline.js`
- 桌面端视觉验收。

风险：

- 中。
- 改动位于消息渲染链路，需确认不影响普通聊天消息、代码块、Markdown 原有渲染。

### PR-E：legacy 目录迁移

目标：

- 单独审查旧模块迁移到 `Desktopmodules/legacy/**` 的结构变化。

建议范围：

- `Desktopmodules/legacy/**`
- 原 `Agenttaskmodules/**`
- 原 `Canvasmodules/**`
- 原 `Dicemodules/**`
- 原 `Flowlockmodules/**`
- 原 `Forummodules/**`
- 原 `Groupmodules/**`
- 原 `Memomodules/**`
- 原 `Musicmodules/**`
- 原 `Notemodules/**`
- 原 `Promptmodules/**`
- 原 `RAGmodules/**`
- 原 `Themesmodules/**`
- 原 `Translatormodules/**`
- 原 `Voicechatmodules/**`

验证：

- 路径引用审计。
- 桌面端 legacy 模块入口抽样打开。
- 回滚路径确认。

风险：

- 高。
- 文件移动范围很大，应独立审查，不能夹在 Photo Studio 或宿主能力 PR 中。

### PR-F：配置卫生与模板化

目标：

- 单独处理真实配置退出 Git 跟踪、`.example` 模板补齐、路径和占位规则。

建议范围：

- `.gitignore`
- `VCPDistributedServer/Plugin/DistImageServer/config.env.example`
- `VCPDistributedServer/Plugin/FileOperator/.env.example`
- `VCPDistributedServer/Plugin/DeepMemo/config.env.example`
- `docs/vcpchat_config_*`
- `docs/vcpchat_env_*`

验证：

- 确认真实 `.env` / `config.env` 不被打印、不被提交。
- `git status --ignored` 抽查。
- 只验证模板结构，不触发真实外部写入。

风险：

- 中到高。
- 关键风险是不能泄露或覆盖用户本地真实配置。

### PR-G：实验插件与工具链

目标：

- 延后审查 AI image、EmojiListGenerator、ScreenPilot、DeepMemo、PTYShellExecutor、PowerShellExecutor 等实验或工具链变化。

建议范围：

- `Desktopmodules/aiImageGen.html`
- `Desktopmodules/builtinWidgets/AIImageGenWidget.js`
- `Desktopmodules/test_AIImageGenWidget.js`
- `VCPDistributedServer/Plugin/EmojiListGenerator/**`
- `VCPDistributedServer/Plugin/ScreenPilot/**`
- `VCPDistributedServer/Plugin/DeepMemo/**`
- `VCPDistributedServer/Plugin/PTYShellExecutor/**`
- `VCPDistributedServer/Plugin/PowerShellExecutor/**`
- `VCP_Plugin_Validator.ps1`
- 相关实验文档。

验证：

- 每个插件独立 dry-run。
- 不触发真实外部写入。
- 不混入 Photo Studio 主线。

风险：

- 高。
- 当前不建议阻塞 PR-A 到 PR-D。

### PR-H：音频、Rust 与二进制资源

目标：

- 单独审查 Rust/audio 相关变更和二进制资源更新。

建议范围：

- `audio_engine/audio_server.exe`
- `rust_audio_engine/**`
- `.github/workflows/rust_assistant_engine_build.yml`

验证：

- Rust workflow。
- 二进制来源说明。
- Windows 本地音频 smoke。

风险：

- 高。
- 二进制资源必须确认来源和回滚方式。

## 推荐顺序

1. PR-A：收口文档、CI 与安全边界。
2. PR-B：桌面宿主与 Native Host 基础能力。
3. PR-C：Photo Studio 工作台。
4. PR-D：Codex TODO / Plan 面板渲染。
5. PR-F：配置卫生与模板化。
6. PR-E：legacy 目录迁移。
7. PR-G：实验插件与工具链。
8. PR-H：音频、Rust 与二进制资源。

## 不建议做的事

- 不建议把 PR12 直接切 Ready。
- 不建议把 PR12 直接合入 `custom`。
- 不建议在生产线 `A:\VCP\VCPToolBox-prod-stable` 存在未归类本地修改时做任何推广。
- 不建议把 Photo Studio、legacy 迁移、AI image 实验和二进制更新混在同一个正式 PR 内。

## 当前阻塞

- `npm run pack` 被本机 `winCodeSign` 符号链接权限和依赖卫生阻塞。
- 生产线 `prod/stable` 存在多项未归类本地修改。
- PR12 当前仍是 Draft 快照，不是正式合并候选。

## 下一步

- 先从 PR-A 开始拆出最小正式审查 PR。
- 拆 PR 前需要重新确认目标 base 分支和是否继续以 `origin/custom` 为正式审查基线。
- 每个拆分 PR 都单独跑验证并单独写回滚说明。
