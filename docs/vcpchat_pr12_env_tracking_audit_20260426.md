# VCPChat PR12 env / config 跟踪审计

日期：2026-04-26

工作区：`A:\VCP\VCPChat_integration_upstream_vcp_20260425`

分支：`integration/upstream-main-vcp-20260425`

PR：`https://github.com/JENN2046/VCPChat/pull/12`

## 审计原则

本审计只记录路径、Git 状态和处置建议。

本审计没有读取、打印或复制任何真实 `.env` / `config.env` 内容。

## PR12 中涉及 env / config 的路径

对比基线：`origin/custom...HEAD`

命令：

```powershell
git diff --name-status origin/custom...HEAD
```

筛选结果：

| 状态 | 路径 | 判断 |
| --- | --- | --- |
| M | `VCPDistributedServer/Plugin/DeepMemo/config.env.example` | 示例配置，可保留，但 Ready 前仍建议抽查是否只有占位值 |
| D | `VCPDistributedServer/Plugin/DistImageServer/config.env` | 已从 Git 跟踪移除，本地文件保留并被 ignore |
| A | `VCPDistributedServer/Plugin/DistImageServer/config.env.example` | 新增安全模板，可保留 |
| M | `VCPDistributedServer/Plugin/FileOperator/.env.example` | 示例配置，可保留，但 Ready 前仍建议抽查是否只有占位值 |
| A | `docs/vcpchat_env_risk_review_20260421.md` | 风险说明文档，可保留 |
| A | `docs/vcpchat_local_env_final_boundary_20260421.md` | 边界说明文档，可保留 |

## 已完成处理

`VCPDistributedServer/Plugin/DistImageServer/config.env` 已完成处理：

- 不读取真实内容。
- 使用 `git rm --cached -- VCPDistributedServer/Plugin/DistImageServer/config.env` 从 Git 索引移除。
- 保留本地文件。
- 确认 `.gitignore` 命中。
- 新增 `VCPDistributedServer/Plugin/DistImageServer/config.env.example` 安全模板。

## 仓库基线中仍被 Git 跟踪的真实 env / config 路径

命令：

```powershell
git ls-files | Where-Object { $_ -match '(^|/)(\.env|config\.env)$' }
```

结果路径：

- `VCPDistributedServer/Plugin/ChatRoomViewer/config.env`
- `VCPDistributedServer/Plugin/CodeSearcher/config.env`
- `VCPDistributedServer/Plugin/DeepMemo/config.env`
- `VCPDistributedServer/Plugin/FileOperator/.env`
- `VCPDistributedServer/Plugin/MediaShot/config.env`
- `VCPDistributedServer/Plugin/PTYShellExecutor/config.env`
- `VCPDistributedServer/Plugin/PowerShellExecutor/config.env`
- `VCPDistributedServer/Plugin/ScreenPilot/config.env`
- `VCPDistributedServer/Plugin/VCPEverything/.env`
- `VCPDistributedServer/Plugin/WaitingForUrReply/config.env`
- `VCPDistributedServer/config.env`
- `audio_engine/.env`

## 判断

这些基线 env / config 文件不是本次 PR12 新增的风险，但它们是仓库级配置卫生风险。

不建议在 PR12 当前收口阶段一把梭删除全部已跟踪 env / config 文件，原因：

- 影响面跨多个插件和运行时。
- 可能改变现有 `custom` 基线的启动行为。
- 每个插件可能需要配套 `.example` 模板。
- 删除前应确认是否包含默认占位值、真实本地配置或运行必需配置。

## 建议路线

### PR12 当前阶段

- 保持 `DistImageServer/config.env` 已移出 Git 的处理。
- 保留 `DistImageServer/config.env.example`。
- 不继续扩大范围删除其他基线 env / config 文件。

### 后续单独配置卫生阶段

建议另开小范围配置治理任务：

1. 逐个插件读取代码和 manifest，推导所需配置字段。
2. 为每个插件补齐 `.example` 模板。
3. 对真实 `.env` / `config.env` 执行 `git rm --cached`。
4. 确认 `.gitignore` 覆盖。
5. 跑插件级或宿主级 smoke。
6. 单独提交，不混入 Photo Studio 业务 PR。

## 下一步建议

PR12 下一步更适合继续处理“可审性”：

1. 复核 `.vcp_ready` 的 PR 说明是否足够清楚。
2. 决定 PR12 是否保持大整合快照，还是拆成小 PR。
3. 若要继续配置卫生，先明确进入独立配置治理任务。
