# VCPChat PR12 Draft 整合快照收口说明

日期：2026-04-26

工作区：`A:\VCP\VCPChat_integration_upstream_vcp_20260425`

分支：`integration/upstream-main-vcp-20260425`

PR：`https://github.com/JENN2046/VCPChat/pull/12`

base：`custom`

head：`integration/upstream-main-vcp-20260425`

## 收口结论

PR12 已收成一个“干净、可解释、可回滚的 Draft 整合快照”。

它当前不作为生产发布 PR，也不建议直接合入生产稳定线。

推荐定位：

- 用作 upstream/main 重建整合线的远端锚点。
- 用作 Photo Studio、宿主基础能力、legacy 迁移、文档与插件层差异的审计快照。
- 后续可选择继续保留大 Draft PR，或从该快照拆出更小 PR。

## 当前状态

- PR 状态：Draft / Open
- base：`custom`
- head：`integration/upstream-main-vcp-20260425`
- mergeable：最近一次复核为 `MERGEABLE`
- status checks：空
- 工作区：干净
- 未触碰生产稳定线：`A:\VCP\VCPToolBox-prod-stable`

## 当前差异体量

对比基线：`origin/custom...HEAD`

```text
271 files changed, 34878 insertions(+), 11145 deletions(-)
```

说明：

- 体量较大，GitHub diff API 曾因超过 20000 行返回 HTTP 406。
- 当前 PR 更适合作为整合快照，不适合当作普通单功能 PR 轻审。
- 后续若进入 Ready Review，应先确认接受大 PR 审计成本，或拆成小 PR。

## 已完成的关键收口

### 0. Codex TODO / Plan 面板

PR12 收口后追加了一个轻量通用渲染能力：

- 支持将 `## Plan`、`## TODO`、`## 计划`、`## 待办` 后紧跟的 Markdown 任务列表渲染为 Codex TODO 面板。
- 支持显式块：

```text
<<<[CODEX_TODO]>>>
title: 下一步
- [x] 已完成项
- [-] 进行中项
- [ ] 待处理项
<<<[END_CODEX_TODO]>>>
```

- 渲染层只做展示转换，不写外部系统，不改变任务数据源。
- 已通过转换测试、语法检查和 Photo Studio smoke。

### 1. Photo Studio 主链路

已完成并验证：

- 首页 dashboard 读取
- 项目创建
- 非法状态推进明确失败
- 项目状态推进
- 项目抽屉读取
- 客户创建
- 线索创建
- 报价创建
- 沟通草稿生成
- 跟进提醒
- 本地预约创建、改期、开始、完成
- 交付任务补齐
- 交付包创建
- 交付包推进到已发送、已确认
- 外部同步影子记录
- 交付审计读取
- 五页面刷新：首页、项目指挥台、跟进与报价、日程排期、交付与素材

### 2. PR 可解释性

已补充审计文档：

- `docs/vcpchat_upstream_main_integration_closeout_20260426.md`
- `docs/vcpchat_upstream_integration_pr_readiness_20260426.md`
- `docs/vcpchat_pr12_post_create_audit_20260426.md`
- `docs/vcpchat_pr12_diff_scope_audit_20260426.md`
- `docs/vcpchat_pr12_env_tracking_audit_20260426.md`
- `docs/vcpchat_pr12_draft_snapshot_closeout_20260426.md`

### 3. 敏感配置风险处理

已处理：

- `VCPDistributedServer/Plugin/DistImageServer/config.env` 已从 Git 跟踪中移除。
- 本地真实 `config.env` 文件保留，并被 `.gitignore` 忽略。
- 新增安全模板：`VCPDistributedServer/Plugin/DistImageServer/config.env.example`。
- 没有读取、打印或复制真实 `config.env` 内容。

仍需注意：

- 仓库基线中还有其他已跟踪 `.env` / `config.env`，它们不是 PR12 新增风险。
- 不建议在 PR12 中一把梭处理全部基线配置文件。
- 若要继续配置卫生，应另开独立任务逐插件处理。

### 4. `.vcp_ready` 定位

`.vcp_ready` 内容：

```text
V1 native host line: ready-for-review-closeout
```

当前定位：

- 这是 V1 native host 线的 readiness artifact。
- 不是运行时代码。
- 不包含配置、密钥或本地环境值。
- 若保留 PR12 为大整合快照，可保留。
- 若后续拆 PR，更适合归入 native host / 宿主收口 PR。

## 本轮最终验证

执行时间：2026-04-26

语法检查通过：

- `node --check main.js`
- `node --check preload.js`
- `node --check preloads/desktop.js`
- `node --check modules/ipc/desktopHandlers.js`
- `node --check modules/ipc/desktopRemoteHandlers.js`
- `node --check Desktopmodules/photoStudio/photoStudio.js`
- `node --check Desktopmodules/photoStudio/services/photoStudioState.js`
- `node --check Desktopmodules/photoStudio/services/photoStudioEvents.js`
- `node --check modules/services/photoStudio/PhotoStudioOrchestrator.js`
- `node --check modules/services/photoStudio/actionCatalog.js`
- `node --check modules/services/photoStudio/uiHints.js`
- `node --check modules/renderer/contentPipeline.js`
- `node --check modules/messageRenderer.js`
- `node --check modules/renderer/streamManager.js`

空白检查通过：

- `git diff --check`

Photo Studio 收口 smoke 通过：

```powershell
npm run test:photo-studio
```

结果：

```text
Photo Studio closeout smoke: 25/25 passed
```

Codex TODO 面板转换验证通过：

```text
codex todo panel transform: ok
```

桌面端视觉验收：

- 用户已确认 Codex TODO / Plan 面板桌面端视觉验收完成。
- 当前记录只确认视觉验收结果，不代表生产发布或生产合并。

DesktopRemote live smoke 追加验证通过：

```text
[smoke] CreateWidget PASS: desktopremote-http-smoke
[smoke] QueryDesktop PASS
[smoke] ViewWidgetSource PASS
[smoke] DesktopRemote HTTP smoke test passed.
[smoke] DeleteWidget cleanup PASS
```

## 未验证 / 未执行

本轮没有执行：

- `npm run pack`
- `npm run dist`
- 生产稳定线预检
- 生产合并 / 部署 / 发布

原因：

- 当前目标是 Draft 整合快照收口，不是生产发布。
- `pack/dist` 可能生成产物并引入额外变量，暂不纳入本次快照收口。
- 生产线 `A:\VCP\VCPToolBox-prod-stable` 需要单独预检和明确授权。

## 回滚与恢复口径

PR12 是独立候选分支：

- 当前分支：`integration/upstream-main-vcp-20260425`
- 远端分支：`origin/integration/upstream-main-vcp-20260425`
- PR 类型：Draft

安全回滚方式：

- 不合并 PR12，即不会影响 `custom` 或生产稳定线。
- 如需撤销远端协作，只需关闭 Draft PR。
- 如需回到本地旧状态，可继续保留当前 worktree 或切换回原工作区。

禁止直接做的事：

- 不要直接把 PR12 合入生产稳定线。
- 不要把 PR12 视为生产发布凭证。
- 不要在未做生产预检前推广到 `A:\VCP\VCPToolBox-prod-stable`。

## 推荐下一步

建议先停止往 PR12 增加大功能。

后续有三条安全路线：

1. 保持 PR12 为 Draft 整合快照
   - 用作远端锚点和审计基线。

2. 从 PR12 拆小 PR
   - 宿主基础能力 PR
   - Photo Studio 工作台 PR
   - legacy 迁移 PR
   - 文档 PR
   - 插件 / 工具链 PR

3. 单独开生产预检任务
   - 以 `A:\VCP\VCPToolBox-prod-stable` 为生产稳定线对照。
   - 明确合并策略、验证范围和回滚路径。

当前推荐：先保留 PR12 Draft，不切 Ready，不合并。

## Plan

- [ ] 拆分正式审查 PR：从 PR12 拆出宿主基础能力、Photo Studio、legacy 迁移、文档、插件 / 工具链几个小 PR。
- [ ] 配置卫生治理：逐插件补齐 `.example` 模板，移出基线中仍被 Git 跟踪的真实 `.env` / `config.env`。
- [x] DesktopRemote live smoke：在独立验证步骤中跑真实 DesktopRemote HTTP smoke。
- [ ] 打包验证：按需执行 `npm run pack` 和 `npm run dist`，确认构建产物和打包白名单。
- [ ] CI / 自动检查：为 PR 或后续拆分 PR 补 GitHub checks 或等价自动验证。
- [ ] 生产预检：如需推广到 `A:\VCP\VCPToolBox-prod-stable`，单独做生产线预检、合并策略和回滚方案。

说明：

- 上面 6 项不是 PR12 Draft 快照收口的阻塞项。
- 这些任务属于正式审查、配置治理、构建验证或生产推广阶段。
- 当前 PR12 仍建议保持 Draft，不切 Ready，不直接合并。
