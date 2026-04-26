# VCPChat upstream/main 整合线收口记录

日期：2026-04-26

整合线：`integration/upstream-main-vcp-20260425`

当前头部提交：`8a778ad fix(photo-studio): constrain date input years`

底座：`upstream/main`，提交 `c329146`

稳定生产对照：`A:\VCP\VCPToolBox-prod-stable`

## 当前结论

这条整合线已经完成第一阶段主线重建：

- 以最新 `upstream/main` 作为干净底座。
- 已吸收 `origin/custom` 的稳定生产定制能力。
- 已吸收 VCPChat desktop/native host 基础能力。
- 已吸收 Photo Studio 工作台必要文件与宿主挂载点。
- 已补齐 Photo Studio 收尾修复，包括窗口尺寸、入口、IPC、preload API、中文文案、沟通草稿、日期输入年份限制。
- 已确认 Photo Studio 手工验收没有发现异常。

这条线仍然是候选整合线，不是生产线。当前不自动替换 `custom`、`main` 或 `A:\VCP\VCPToolBox-prod-stable`。

## 已完成批次

### 1. upstream/main 底座

- 起点为 `upstream/main` 的 `c329146`。
- 没有在原工作区直接操作。
- 使用独立 worktree：`A:\VCP\VCPChat_integration_upstream_vcp_20260425`。

### 2. 稳定生产线批次

- 已合入 `origin/custom`。
- 提交：`f4e03c0 merge: integrate custom stable baseline`
- 当前整合线相对 `origin/custom` 没有 branch-only 缺口。

### 3. 宿主基础能力批次

- 已合入桌面宿主基础能力。
- 提交：`5f38c0b feat(desktop): integrate host baseline for workbench apps`
- `origin/main` 的 DesktopRemote cleanup smoke 核心代码已等价吸收。
- `postmerge/vcpchat-native-host-regression` 的 DesktopRemote cleanup code path 已等价吸收。
- 已补回宿主回归验证记录。
- 提交：`7c7cccb chore: reconcile native host integration records`

### 4. Photo Studio 批次

- 没有整条 merge `codex-photo-studio-pr1-pr2-shell`。
- 已从 Photo Studio 收尾线提取必要文件和挂载点。
- 提交：
  - `d56a260 feat(photo-studio): integrate workbench on upstream baseline`
  - `f37a694 fix(photo-studio): restore desktop integration closeout`
  - `8a778ad fix(photo-studio): constrain date input years`

当前 Photo Studio 主线能力包括：

- 五个正式页面：`home`、`project_command`、`client_leads`、`schedule_board`、`delivery_assets`
- 旧别名兼容：`dashboard`、`projects`、`inquiry`、`delivery`、`delivery_panel`
- Photo Studio 桌面入口和托盘入口
- Photo Studio preload API
- Photo Studio IPC handlers
- 本地影子数据读写
- 项目创建、编辑、推进、抽屉详情
- 客户、线索、报价、跟进提醒、沟通草稿
- 本地预约创建、改期、开始、完成
- 交付任务、交付包创建、交付包状态推进、外部同步影子记录、审计读取
- 全局搜索
- 日期输入年份限制为 4 位

## 分支审计表

| 分支 | 当前判断 | 处理决定 |
| --- | --- | --- |
| `origin/custom` | 稳定生产定制能力已作为基线吸收。 | 不需要再次合并。 |
| `origin/main` | branch-only 历史提交为 `20a0ba5`，DesktopRemote cleanup smoke 代码已吸收；当前线额外保留了 postmerge 状态记录。 | 不直接 merge。 |
| `feature/vcpchat-v1-native-host` | branch-only 为 0，内容已被当前整合线覆盖。 | 不需要合并。 |
| `postmerge/vcpchat-native-host-regression` | branch-only 为 3，代码文件已等价吸收；文档状态已补回。 | 不直接 merge。 |
| `feature/vcpchat-source-runtime-cleanup` | branch-only 为 4，但对应 `.gitignore` 和 3 份治理文档与当前线已直接对齐。 | 不需要合并。 |
| `feature/vcpchat-ai-image-split` | branch-only 为 0，没有当前主线必须吸收的新提交。 | 实验线延后。 |
| `rebuild/vcpchat-ai-image-split-clean` | branch-only 为 0，没有当前主线必须吸收的新提交。 | 实验线延后。 |
| `codex-photo-studio-pr1-pr2-shell` | 仍有大量历史提交差异，但 Photo Studio 必要文件已经提取；当前线包含后续修复，直接 merge 会引入旧结构/历史宿主改动。 | 禁止整条 merge。 |
| `backup/photo-studio-closeout-20260425` | 与 Photo Studio 历史收尾线同类，当前线已经提取必要内容且有后续修复。 | 仅作备份参考。 |

## 已验证

自动验证：

- `node --check Desktopmodules\photoStudio\photoStudio.js`
- `node --check modules\services\photoStudio\PhotoStudioOrchestrator.js`
- `node --check preloads\desktop.js`
- `node --check modules\ipc\desktopHandlers.js`
- `node --check Desktopmodules\api\ipcBridge.js`
- `node --check modules\ipc\desktopRemoteHandlers.js`
- `node --check VCPDistributedServer\Plugin\DesktopRemote\desktop-remote.js`
- `node --check scripts\desktopremote-http-smoke.js`
- `git diff --check`
- `npm run test:photo-studio`

最近一次 Photo Studio smoke：

- 结果：`25/25 passed`
- 覆盖：dashboard、项目创建、非法状态推进、项目推进、抽屉读取、客户创建、线索创建、报价创建、沟通草稿、跟进提醒、本地预约、交付包、外部同步影子记录、交付审计、五页面刷新。

手工验收：

- Photo Studio 已从整合线桌面端拉起。
- 用户反馈：Photo Studio 没发现异常。
- 日期输入年份限制已由用户确认 OK。

## 未验证

- 没有把整合线 push 到远端。
- 没有创建 PR。
- 没有合入生产线。
- 没有触碰 `A:\VCP\VCPToolBox-prod-stable`。
- 没有执行真实生产发布。
- 没有执行 live DesktopRemote HTTP smoke，因为需要当前 DesktopRemote 服务和桌面环境配合。
- 没有处理 `.vcp_ready` 删除状态。

## 剩余风险

- 当前 worktree 仍显示 `.vcp_ready` 被删除。该项按约定暂不处理，避免混入用户/环境侧变更。
- Photo Studio 已通过本地 smoke 和手工验收，但仍不是生产发布验证。
- `codex-photo-studio-pr1-pr2-shell` 是历史开发线，不应再作为直接 merge 来源；后续如要追溯，只能按文件/功能点 cherry-pick。
- 实验线 `feature/vcpchat-ai-image-split` 和 `rebuild/vcpchat-ai-image-split-clean` 没有进入第一阶段主线，需要另开二阶段审计。

## 建议下一步

1. 明确 `.vcp_ready` 是恢复、忽略，还是继续保持不处理。
2. 如果要做宿主更完整验收，单独运行 DesktopRemote live smoke。
3. 如果整合线准备进入远端协作，再执行 push / PR 前检查。
4. 生产推广必须另开步骤，从 `A:\VCP\VCPToolBox-prod-stable` 做生产级预检，不能从当前整合线直接替换。
