# VCPChat PR12 创建后审计补充

日期：2026-04-26

工作区：`A:\VCP\VCPChat_integration_upstream_vcp_20260425`

分支：`integration/upstream-main-vcp-20260425`

PR：`https://github.com/JENN2046/VCPChat/pull/12`

## 结论

PR12 当前适合作为“候选整合线 Draft PR”，不适合直接作为生产合并 PR。

原因：

- PR 状态正常：Draft / Open / mergeable。
- PR 基线正确：base 为 `custom`，head 为 `integration/upstream-main-vcp-20260425`。
- 当前没有 CI 检查结果，不能把“可合并”理解为“已验证可发布”。
- GitHub CLI 拉取 PR diff 时返回 HTTP 406，原因是 diff 超过 20000 行。
- 本地对比 `origin/custom...HEAD` 显示体量为 `267 files changed, 34305 insertions(+), 11139 deletions(-)`。

## 已复核的远端状态

`gh pr view 12` 返回：

- PR 编号：`12`
- 标题：`Draft: upstream main integration candidate`
- 状态：`OPEN`
- Draft：`true`
- base：`custom`
- head：`integration/upstream-main-vcp-20260425`
- mergeable：`MERGEABLE`
- status checks：空

## 追加验证记录

2026-04-26 追加执行了一轮目标验证。

语法检查通过：

- `node --check main.js`
- `node --check preload.js`
- `node --check preloads\desktop.js`
- `node --check modules\ipc\desktopHandlers.js`
- `node --check modules\ipc\desktopRemoteHandlers.js`
- `node --check Desktopmodules\photoStudio\photoStudio.js`
- `node --check Desktopmodules\photoStudio\services\photoStudioState.js`
- `node --check Desktopmodules\photoStudio\services\photoStudioEvents.js`
- `node --check modules\services\photoStudio\PhotoStudioOrchestrator.js`
- `node --check modules\services\photoStudio\actionCatalog.js`
- `node --check modules\services\photoStudio\uiHints.js`

空白检查通过：

- `git diff --check`

Photo Studio 收口冒烟通过：

```powershell
npm run test:photo-studio
```

结果：

```text
Photo Studio closeout smoke: 25/25 passed
```

覆盖动作：

- dashboard 读取
- 项目创建
- 非法状态推进明确失败
- 项目推进到报价状态
- 项目抽屉读取
- 客户创建
- 线索创建
- 报价创建
- 沟通草稿生成
- 跟进提醒创建
- 本地预约创建、改期、开始、完成
- 交付任务补齐
- 交付包创建
- 交付包推进到已发送、已确认
- 外部同步影子记录
- 交付审计读取
- 首页、项目指挥台、跟进与报价、日程排期、交付与素材五页刷新

## 已复核的本地差异

本地命令：

```powershell
git diff --shortstat origin/custom...HEAD
```

结果：

```text
267 files changed, 34305 insertions(+), 11139 deletions(-)
```

本地文件列表前段显示，PR 涉及范围包括：

- `.gitignore`
- `.vcp_ready`
- `Desktopmodules/**`
- `Desktopmodules/legacy/**`
- `Desktopmodules/photoStudio/**`
- `modules/services/photoStudio/**`
- `modules/ipc/**`
- `VCPDistributedServer/Plugin/DesktopRemote/**`
- `scripts/**`
- `docs/**`

这说明 PR12 不只是 Photo Studio 单功能变更，而是一次上游底座、宿主能力、桌面模块迁移、Photo Studio 工作台和文档收口的组合整合。

## 风险判断

### 主要风险

- 评审成本高：GitHub diff API 已因体量过大失败，网页端评审也可能很难完整展开。
- 无 CI：当前 PR 没有自动检查结果，必须依赖本地验证记录和手工验收。
- 范围混合：同时包含底座合并、宿主能力、Photo Studio、legacy 目录迁移、文档记录。
- `.vcp_ready` 出现在 diff 中，虽然已经按用户确认恢复，但评审时需要明确它是 readiness artifact，不是误删误改。

### 已缓解风险

- 当前 PR 是 Draft，不会误认为 ready to merge。
- 当前目标分支是 `custom`，不是生产稳定线。
- 当前没有触碰 `A:\VCP\VCPToolBox-prod-stable`。
- Photo Studio 关键语法检查和 `npm run test:photo-studio` 已通过。
- 用户已手工确认 Photo Studio 主体没有发现异常。

## 建议策略

### 短期

保持 PR12 为 Draft，不直接合并。

把 PR12 当成“整合候选线快照”，用于：

- 固定当前整合成果。
- 让后续审计有远端锚点。
- 后续需要时拆出更小的可审 PR。

### 进入 Ready For Review 前

建议至少补齐：

- 用户手工确认首页计划任务面板视觉和按钮行为。
- 再跑一次 `npm run test:photo-studio`。
- 再跑一次核心语法检查。
- 决定是否需要 DesktopRemote live smoke。
- 明确是否接受大 PR 评审，还是从 PR12 拆出更小 PR。

### 不建议

- 不建议直接把 PR12 合进生产稳定线。
- 不建议把 PR12 从 Draft 改为 Ready，除非已经接受大 PR 审计成本。
- 不建议在当前 PR 内继续加入新的大功能。

## 当前推荐下一步

下一步优先做“减风险收尾”，而不是继续加功能：

1. 给 PR12 补一段中文说明或评论，提醒它是候选整合线，不是生产发布。
2. 本地再跑一轮目标验证。
3. 用户确认后，再决定：
   - 继续保留一个大 Draft PR；
   - 或从该整合线拆出 Photo Studio / 宿主 / 文档几个小 PR。
