# VCPChat PR12 差异范围分组审计

日期：2026-04-26

工作区：`A:\VCP\VCPChat_integration_upstream_vcp_20260425`

分支：`integration/upstream-main-vcp-20260425`

PR：`https://github.com/JENN2046/VCPChat/pull/12`

对比基线：`origin/custom...HEAD`

## 结论

PR12 当前更像一条“整合候选线快照”，不是一个适合直接进入 Ready Review 的单功能 PR。

原因是它同时包含：

- 上游底座与生产定制线的整合结果
- 桌面宿主与 preload / IPC / window app id 相关改动
- Photo Studio 工作台主体
- legacy 目录迁移
- VCPDistributedServer 插件与工具链改动
- VCPHumanToolBox / audio / rust_audio_engine 等非 Photo Studio 改动
- 大量历史执行文档和本次收尾文档

## 总量

本地统计：

```powershell
git diff --shortstat origin/custom...HEAD
```

结果：

```text
268 files changed, 34477 insertions(+), 11139 deletions(-)
```

按变更类型统计：

| 类型 | 数量 | 说明 |
| --- | ---: | --- |
| 新增 | 115 | 新文件、Photo Studio、文档、工具脚本、部分插件文件 |
| 修改 | 79 | 宿主、IPC、preload、服务、插件、样式等 |
| 重命名 | 74 | 主要来自旧模块移动到 `Desktopmodules/legacy/**` |

## 按范围分组

### 1. Photo Studio 主体

约 23 个文件。

范围包括：

- `Desktopmodules/photoStudio/**`
- `modules/services/photoStudio/**`
- `scripts/photo-studio-closeout-smoke.js`
- `scripts/photo-studio-prune-shadow-data.js`

当前判断：

- 这是本轮业务目标的核心范围。
- 已通过目标语法检查。
- 已通过 `npm run test:photo-studio`，结果为 `25/25 passed`。
- 用户此前已手工确认 Photo Studio 主体没有明显异常。

建议：

- 如果拆 PR，这是最适合单独拆出的业务 PR。
- 拆出时需要带上必要宿主挂载点，否则入口、IPC 或 preload 会失效。

### 2. 桌面宿主 / preload / IPC / 应用入口

约 29 个文件。

代表范围：

- `main.js`
- `main.html`
- `package.json`
- `preloads/**`
- `modules/ipc/**`
- `modules/services/windowAppIds.js`
- `modules/services/codexRouterHost.js`
- `modules/services/codexRouterDirectives.js`
- `modules/trayManager.js`
- `Desktopmodules/api/ipcBridge.js`
- `Desktopmodules/builtinWidgets/**`
- `Desktopmodules/desktop.html`

当前判断：

- 这是 Photo Studio 能在桌面端出现并工作的必要宿主层。
- 同时它也影响桌面主窗口、预加载 API、IPC 边界和应用入口，风险高于普通页面改动。

建议：

- 如果拆 PR，应作为“宿主基础能力 PR”或与 Photo Studio 最小挂载点一起审。
- 进入 Ready 前至少保留当前语法检查，并补一次桌面端手工启动确认。

### 3. legacy 目录迁移

约 86 个文件。

代表范围：

- `Desktopmodules/legacy/Agenttaskmodules/**`
- `Desktopmodules/legacy/Canvasmodules/**`
- `Desktopmodules/legacy/Dicemodules/**`
- `Desktopmodules/legacy/Flowlockmodules/**`
- `Desktopmodules/legacy/Forummodules/**`
- `Desktopmodules/legacy/Groupmodules/**`
- `Desktopmodules/legacy/Memomodules/**`
- `Desktopmodules/legacy/Musicmodules/**`
- `Desktopmodules/legacy/Notemodules/**`
- `Desktopmodules/legacy/Promptmodules/**`
- `Desktopmodules/legacy/RAGmodules/**`
- `Desktopmodules/legacy/Sheetmodules/**`
- `Desktopmodules/legacy/Themesmodules/**`
- `Desktopmodules/legacy/Translatormodules/**`
- `Desktopmodules/legacy/Voicechatmodules/**`

当前判断：

- 这是 PR 变大的主要来源之一。
- 大部分是重命名或目录迁移，但仍会影响运行时路径解析。
- 不应和 Photo Studio 业务逻辑混在同一个 Ready PR 内做细审。

建议：

- 如果后续拆 PR，legacy 迁移应独立成“目录迁移 / 兼容性 PR”。
- 需要保留路径解析、旧入口兼容和回滚说明。

### 4. 文档

约 59 个文件。

代表范围：

- `docs/vcpchat_*_20260421.md`
- `docs/vcpchat_v1_native_host_*_20260423.md`
- `docs/vcpchat_upstream_*_20260426.md`
- `docs/vcpchat_pr12_*_20260426.md`

当前判断：

- 文档数量较大，包含历史迁移、native host、配置卫生、PR readiness、PR12 审计等。
- 它们能解释整合过程，但也会显著增加 PR 噪音。

建议：

- 如果需要降低评审噪音，可以把文档拆为独立 docs PR。
- 当前 PR 中至少保留 `vcpchat_upstream_main_integration_closeout_20260426.md`、`vcpchat_upstream_integration_pr_readiness_20260426.md`、`vcpchat_pr12_post_create_audit_20260426.md` 作为审计锚点。

### 5. VCPDistributedServer / 插件层

约 24 个常规路径文件，另有 5 个带中文路径在 PowerShell 输出中被转义显示。

代表范围：

- `VCPDistributedServer/VCPDistributedServer.js`
- `VCPDistributedServer/Plugin/DesktopRemote/**`
- `VCPDistributedServer/Plugin/DeepMemo/**`
- `VCPDistributedServer/Plugin/DistImageServer/**`
- `VCPDistributedServer/Plugin/FileOperator/**`
- `VCPDistributedServer/Plugin/PTYShellExecutor/**`
- `VCPDistributedServer/Plugin/PowerShellExecutor/**`
- `VCPDistributedServer/Plugin/ScreenPilot/**`
- `VCPDistributedServer/Plugin/EmojiListGenerator/**`

当前判断：

- 这部分不是 Photo Studio 前端工作台的主目标，但属于整合底座中的共享能力。
- 它影响服务端插件、执行器、DesktopRemote 和潜在外部工具能力，风险高于普通前端页面。

建议：

- Ready 前单独做插件层审计。
- 若目标是先交付 Photo Studio，建议不要把这些插件层改动混入小 PR。

### 6. 敏感配置风险

发现以下配置相关路径在 diff 中：

- `VCPDistributedServer/Plugin/DeepMemo/config.env.example`
- `VCPDistributedServer/Plugin/FileOperator/.env.example`
- `VCPDistributedServer/Plugin/DistImageServer/config.env`

当前判断：

- `.env.example` 或 `config.env.example` 一般可以进入 PR，但仍需确认没有真实密钥。
- `config.env` 是真实配置文件命名，应作为高优先级风险处理。
- 本审计没有读取或打印该文件内容，避免暴露秘密。

处理记录：

- 已确认 `.gitignore` 中存在 `VCPDistributedServer/Plugin/DistImageServer/config.env` 和 `VCPDistributedServer/Plugin/*/config.env` 规则。
- 已执行 `git rm --cached -- VCPDistributedServer/Plugin/DistImageServer/config.env`。
- 本地文件保留，Git 索引中移除。
- `git status --short --ignored VCPDistributedServer/Plugin/DistImageServer/config.env` 显示该文件为 ignored。
- 已新增安全模板 `VCPDistributedServer/Plugin/DistImageServer/config.env.example`。
- 模板字段来自 `plugin-manifest.json` 和 `image-server.js`，未读取或复制真实 `config.env` 内容。

建议：

- 进入 Ready 前仍建议做敏感配置审计，确认没有其他真实配置文件进入 PR。
- 后续只维护安全的 `.example` 模板，不恢复跟踪真实 `config.env`。
- 不应在 PR 评论、文档或日志中打印该文件内容。

### 7. 其他非 Photo Studio 范围

代表范围：

- `VCPHumanToolBox/**`
- `audio_engine/audio_server.exe`
- `rust_audio_engine/**`
- `styles/**`
- `renderer.js`
- `modules/renderer/**`
- `modules/messageRenderer.js`
- `modules/SovitsTTS.js`
- `modules/contextSanitizer.js`

当前判断：

- 这些变化可能来自生产定制线、上游底座或历史整合批次。
- 它们不应被误认为 Photo Studio 必要改动。

建议：

- 如果拆 PR，应先判断这些改动是否已经属于 `custom` 应保留能力，还是整合线带入的额外范围。
- 不建议把它们作为 Photo Studio PR 的评审重点。

## 推荐拆分路线

如果后续决定拆 PR，推荐顺序是：

1. 宿主基础能力 PR
   - 只包含桌面入口、preload、IPC、window app id、DesktopRemote 必要修复。

2. Photo Studio 工作台 PR
   - 包含 `Desktopmodules/photoStudio/**`、`modules/services/photoStudio/**`、必要 smoke 脚本和最小宿主挂载点。

3. legacy 目录迁移 PR
   - 独立处理旧模块移动、路径兼容和回滚说明。

4. 文档 PR
   - 收拢历史执行记录、审计记录和 PR readiness 说明。

5. 插件 / 工具链 PR
   - 单独审 `VCPDistributedServer/**`、`VCPHumanToolBox/**`、audio / rust 相关变化。

## 当前不建议做的事

- 不建议把 PR12 直接切到 Ready。
- 不建议直接合入 `custom`。
- 不建议把 PR12 作为生产推广依据。
- 不建议在没有敏感配置审计前保留 `config.env` 进入可审状态。
- 不建议继续往 PR12 里加入新的大功能。

## 当前推荐下一步

继续做减风险收口：

1. 单独审计 `VCPDistributedServer/Plugin/DistImageServer/config.env` 是否应该从 PR 移除或替换为模板。
2. 复核 `.vcp_ready` 在 PR 中的定位说明是否足够清楚。
3. 决定 PR12 是继续作为“大整合快照”，还是拆出小 PR。
