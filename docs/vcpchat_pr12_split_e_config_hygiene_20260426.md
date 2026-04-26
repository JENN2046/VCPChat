# PR-E 配置卫生拆分说明

日期：2026-04-26

分支：`codex/pr12-config-hygiene`

目标基线：`custom`

## 目标

本批次只处理 VCPChat 仓库内的本地运行配置卫生：

- 将真实 `config.env` / `.env` 从 Git 追踪内容中移除。
- 为仍需要本地配置的模块补齐 `.example` 模板。
- 清理模板中的个人路径、疑似账号样例和假 API key。
- 不修改真实本地密钥，不写外部服务，不触碰 VCPToolBox 后端生产线。

## 本批次做了什么

- `.gitignore` 统一忽略 `**/.env` 与 `**/config.env`。
- 保留并允许追踪 `**/.env.example` 与 `**/config.env.example`。
- 移除仓库内已追踪的本地配置文件。
- 新增缺失模板：
  - `VCPDistributedServer/config.env.example`
  - `VCPDistributedServer/Plugin/CodeSearcher/config.env.example`
  - `VCPDistributedServer/Plugin/DistImageServer/config.env.example`
  - `VCPDistributedServer/Plugin/MediaShot/config.env.example`
  - `VCPDistributedServer/Plugin/PTYShellExecutor/config.env.example`
  - `VCPDistributedServer/Plugin/PowerShellExecutor/config.env.example`
  - `VCPDistributedServer/Plugin/ScreenPilot/config.env.example`
  - `VCPDistributedServer/Plugin/VCPEverything/.env.example`
  - `VCPDistributedServer/Plugin/WaitingForUrReply/config.env.example`
  - `audio_engine/.env.example`

## 使用方式

需要本地运行对应模块时，从模板复制一份本地配置：

```powershell
Copy-Item config.env.example config.env
Copy-Item .env.example .env
```

复制后的 `config.env` / `.env` 是本地文件，不应提交到 Git。

## 未做事项

- 未迁移真实密钥。
- 未打印真实配置值。
- 未改插件运行逻辑。
- 未合并生产线。
- 未触碰 `A:\VCP\VCPToolBox-prod-stable`。

## 验证建议

- `git diff --check`
- 确认 `git status --short` 中真实 `config.env` / `.env` 只表现为删除，不再新增未追踪副本。
- 如需运行某个插件，先手动复制对应 `.example` 到本地配置文件。
