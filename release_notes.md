# Release Notes（极简）

## 版本
- Branch: `custom`
- 日期: 2026-04-27
- 关键提交: `7b7f9ae`（chore(custom): harden env templates and runtime safeguards）

## 本次上线范围
- PR #13-#25 已并入 `custom`（包含桌面端/Photo Studio/环境模板/兼容性修复/验证脚本收敛）

## 主要变更
- 修复并补齐 Photo Studio + 桌面端关键桥接（含 `DeleteWidget`、交互动作链）
- 完成 FileOperator / PTYShellExecutor / PowerShellExecutor / PromptSponsor 的配置模板与默认值收口
- 增强配置安全边界：优先使用本地安全目录与显式目录策略
- 合并一轮 Host 兼容修复（voicechat 与 legacy groupchat 路径）
- 提升本地 CI/冒烟覆盖：`photo studio` 冒烟闭环已通过

## 验收结果
- 语法检查通过（核心文件）
  - `main.js`, `preload.js`, `modules/ipc/desktopHandlers.js`
  - `Desktopmodules/api/ipcBridge.js`
  - `VCPDistributedServer/Plugin/FileOperator/FileOperator.js`
  - `VCPDistributedServer/Plugin/PTYShellExecutor/PTYShellExecutor.impl.js`
  - `VCPDistributedServer/Plugin/PowerShellExecutor/PowerShellExecutor.js`
- `npm run test:photo-studio`: `25/25 passed`（冒烟闭环）

## 已知告警（非功能阻塞）
- 部分运行时提示 `vcpServerUrl / vcpApiKey / settings.json / DistImageServer` 配置缺失
- 属于环境配置项，属于发布前部署配置要点，不影响本轮代码功能闭环

## 回滚
- 如需回滚本轮收口：`git revert 7b7f9ae`

## 结论
- 状态：可作为候选发布版本进入稳定发布准备。
