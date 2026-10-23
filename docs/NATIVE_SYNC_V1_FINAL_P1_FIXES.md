# V1 Final Review：三项新增 P1 修复

范围：独立 `codex/r10-v1-final-p1` 工作树。Chat基线 `1ef8574`
（产品代码3fd74d8），ToolBox基线 `48a3344`（产品代码fcf9f53）。
只用隔离数据、合成模型和回环服务；没有修改生产、真实历史或日用启动器，
没有Push/Merge。此结果是隔离整改通过，不是部署或V1正式发布裁决。

## 最小产品改动

- `modules/ipc/chatHandlers.js`：删除共享Topic前复用既有物理写入边界。
- `modules/ipc/agentHandlers.js` / `main.js`：把同一Queue注入Agent删除入口，
  含共享Topic的Agent在任何配置或目录变化前拒绝删除。
  统一返回 `SYNC_WRITER_EXCLUDED`；非共享及同步关闭行为保持。
- `nativeSync/desktopCredential.js` / `dailyConnection.js`：先本地解密同一设备
  凭据，将SSH注册交给后台准备阶段；加密文件格式不变。
- `nativeSync/runtime.js`：已有state时先安装Queue策略、恢复本地Outbox，后台
  注册及目录发布成功后同步。失败保留退化状态和共享写入保护，不以关闭同步
  绕过错误。首次导入仍要求原有在线历史比对。
- `nativeSync/sshTransport.js`：已有state允许后台建隧道；实际发送设备token前
  仍验证TLS主机和R10服务身份，SSH退出后重新验证。
- `scripts/launch-r10-client.cjs`：把原日用artifact启动器纳入源码，取消模型SSH
  就绪前阻塞Electron启动；源目录从脚本位置解析，数据根必须显式传入。
  沿用既有SSH/依赖路径，没有安装器或新配置框架。
- ToolBox `mobile/execution.js`：在原接受时刻快照中补入同Topic前序已完成任务
  的最新回复；通过Map放回相应用户消息之后，当前用户消息位于末尾。
  后续任务输入及其他Topic不进入上下文；尊重回复修改/墓碑。

未改SQLite Schema、canonical/hash、Outbox或pending格式、持久化节奏、Rust CDS、
模型/工具接口或原P1并发调度器。

## 验证

- 修复前后相同9项检查：旧版7失败/2通过，修复版9通过；最终新增的TLS身份
  回归也通过。旧版失败涉及共享删除、离线runtime/凭据/启动器和排队上下文。
- Linux最终87项Node通过：新增10项，原77项受影响回归通过。
- `scripts/test-native-sync-final-p1.cjs`：真实main.js/preload/正式Renderer，
  两次离线冷启动、真实删除IPC门禁、离线本地聊天落盘、Outbox重启保留、
  重连及丢ACK防重复通过；2次正常退出0。传输/注册为隔离适配，绝不连接wp08
  生产服务；模型是回环合成模型，生成1次，最终3条/cursor3/Outbox0/pending空。
- 原完整R3冷启动回归通过，7次退出0；原R8原版CDS/MobileSync共存、群聊
  正常/错误终态、redo、pending恢复与Sync-Off通过，6次应用/CDS退出0。
  独立只读核对17条中央日志、两客户端9条有效消息和索引/哈希一致。
- 完整应用guard无越界读写/网络、无fatal。未进行真实模型、手机或生产联调。

证据根：`P:/VCPKF/vcp/artifacts/native-sync-r10-v1-final-p1/run-20261023T120431`。
离线完整应用：`native-sync-r3/run-final-p1-1792729057314`；
原R3：`native-sync-r3/run-1792729098790`；
原R8：`native-sync-r8/run-1792729138194`。

复跑：Linux按 `FINAL_REPORT.json` 中的Node命令和隔离依赖运行；Windows执行
`node scripts/test-native-sync-final-p1.cjs`。原R3/R8命令在package.json中。
保留上游CRLF；Git空白检查使用 `-c core.whitespace=cr-at-eol`。

## 待批准部署

生产仍为fcf9f53。本轮仅准备补丁及启动器薄包装，不替换运行实例。
部署需另行确认：仅停止/Drain原R10，备份当前最新状态后更新执行器，
把Windows日用启动器接到本工作树新脚本并正常重开客户端；保留现有AppData、
SQLite、设备身份、HTTPS Origin及6005。不得重导入历史或恢复旧快照覆盖新消息。
首次同步需在线、不确定工具副作用需人工复核等既有边界保持。
审查中的P2运维/规模/响应头问题不在本次修复范围内。
