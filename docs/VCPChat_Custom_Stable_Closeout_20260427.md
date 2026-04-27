# VCPChat 稳定收口说明（2026-04-27）

## 一、收口目标
- 将 VCPChat `custom` 线统一到“可审收口”状态，完成此前分段 PR 的收拢并确认核心动作闭环。
- 保留 `VCPToolBox` 与 VCPChat 生产线口径分离，不在本轮改动中触达 VCPToolBox 后端生产线。
- 保持最小化补丁：功能补齐优先、语义统一清洗、环境模板/安全口径增强。

## 二、已完成（状态：已合并）
1. [#13] docs: split PR12 docs and CI review batch
2. [#14] feat: split DesktopRemote Codex Router host batch
3. [#15] feat: split Photo Studio workbench batch
4. [#16] feat: split Codex TODO plan panel batch
5. [#17] chore: split config env hygiene
6. [#18] refactor: move legacy desktop modules
7. [#19] fix(audio): harden rust migration and refresh host binary
8. [#20] fix(host): restore legacy groupchat module paths
9. [#21] fix(host): restore voicechat asset paths
10. [#22] fix(config): align plugin template defaults
11. [#23] ci: extend VCPChat smoke guardrails
12. [#24] fix(desktop): close out DesktopRemote app drawer fixes
13. [#25] chore(custom): harden env templates and runtime safeguards

## 三、技术验收结果
- 语法检查
  - `main.js` 通过 `node --check`
  - `preload.js` 通过 `node --check`
  - `modules/ipc/desktopHandlers.js` 通过 `node --check`
  - `Desktopmodules/api/ipcBridge.js` 通过 `node --check`
  - `VCPDistributedServer/Plugin/FileOperator/FileOperator.js` 通过 `node --check`
  - `VCPDistributedServer/Plugin/PTYShellExecutor/PTYShellExecutor.impl.js` 通过 `node --check`
  - `VCPDistributedServer/Plugin/PowerShellExecutor/PowerShellExecutor.js` 通过 `node --check`
- Photo Studio 冒烟
  - `npm run test:photo-studio` 结果：`Photo Studio closeout smoke: 25/25 passed`
  - 覆盖项：项目创建/推进、非法跳转防护、客户/线索/报价、跟进草稿、预约、交付包状态链路、外部同步影子记录、各页刷新
- 关键功能已收口
  - `project_command` 推进动作和 `DeleteWidget` 桥接已修复
  - `chatRoom`/`prompt sponsor` 等关键插件 `DEBUG_MODE` 默认为安全默认值
  - `FileOperator` 目录权限链路收紧到运行时安全边界

## 四、语义与中文化核验
- 主要用户可见文案以中文展示为主
- 遗留英文多为状态键名或字段名（例如 `quoted`、`confirmed`、`shoot_date`、`delivery_deadline`），属于内部契约/数据键，不影响用户展示主链
- 关键展示层文案已完成替换（例如 `Walk-in Customer`、`PR4 Smoke Customer`、`PR5 Delivery Customer`、`Record is ready to be queued.`）

## 五、风险与说明
- 当前可观察到的环境告警偏向配置层（VCP 服务端配置未齐时），属于运行时告警，不等同代码阻塞：
  - `VCP Server URL / vcpApiKey` 未配置提示
  - 插件 `settings.json` 未就绪提示
  - `DistImageServer` 配置键未配置提示
- 以上不影响本地闭环功能可见性，但应在后续发布环境中补齐真实运行时配置。

## 六、任务面板收束（当前结论）
- [x] PR13–25 收口：已完成并全部合并
- [x] 代码语法与冒烟：已完成
- [x] 语义/中文一致性：已完成
- [x] 运行时告警复核：已完成（归类为环境配置项）
- [x] 样式残留（`styles/themes.css`）：已本地隔离，不进入提交范围
- [ ] 交付面板：不新增功能；若未来要做正式视觉统一，可新开专门收口 PR
- [ ] 生产发布窗口前演练：建议保留在发布前的单独验收工单

## 七、后续建议（按优先级）
1. 先安排一轮完整桌面端手工验收录像（Home / 项目指挥台 / 跟进与报价 / 日程排期 / 交付与素材）
2. 在发布前补齐 VCP 服务端与 `settings.json` 配置样板，清除环境告警
3. 保留该收口文档与 PR 历史，作为可回滚交接凭证
