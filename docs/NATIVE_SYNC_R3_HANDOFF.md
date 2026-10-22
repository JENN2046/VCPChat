# Native Sync R3 完整应用冷启动验收

结果：`FULL_APP_COLD_START_PASS`。2026-10-22，在 R2 原工作树上完成；HEAD 仍为 `e8c038398fde3723d656326af20903b83b226134`，R2/R3 变更均保留为未提交修改，没有 Push、Merge 或正式安装。

## 实际运行与证据

- 入口是 `electron . → main.js → preload → main.html → renderer.js`，使用正式 Agent/Topic 列表、输入框、发送按钮及聊天界面。没有替换应用模块或加载测试 HTML。
- A/B 顺序启动，保留产品单实例策略；共 7 次完整应用启动，Renderer 均 ready，全部正常退出，退出码 0。
- 运行根：`P:\VCPKF\vcp\artifacts\native-sync-r3\run-1792652843674`。A/B 分别使用其下 `Windows-A`、`Windows-B`；单机对照使用 `Sync-Off`。
- 回执：运行根下 `R3_APP_RECEIPT.json`；索引副本：`P:\VCPKF\vcp\artifacts\native-sync-r3\LATEST_R3_RECEIPT.json`。
- 正式 UI 截图：`A-stream-and-sync.png`、`B-resumed-A.png`、`A-group.png`、`B-group.png`、`sync-off-single-machine.png`，均在运行根。

## 已通过路径

1. 完整应用冷启动，加载合成 Agent，选择话题，正式输入框发送，主聊天流式终态原生保存并提交同步。
2. B 在远端历史已保存、cursor 尚未确认时注入同步状态 finalize 写入故障；保存 pending 后关闭。重新启动后恢复 pending/cursor，正式界面显示 A 的用户消息和助手终态。
3. 回环同步服务停止时，B 正常保存，持久 Outbox 至少包含两项；关闭应用并重启同一 SQLite 服务后，B 冷启动继续提交 Outbox。
4. A 重启接续 B，消息 ID 无重复；切换其他话题再返回，无历史串入。
5. 正式群聊发送及自动回复终态保存，B 重启后在正式群聊界面显示用户消息和助手回复。
6. 最终 A/B 单聊各 4 条、群聊各 2 条，经既有 MobileSync canonicalization 比较内容一致；cursor 均为 6，Outbox 均为 0，pending 均为空。原生本地投影元数据仍按既有 wire 边界保留在各端。
7. 关闭同步标志的完整应用仍完成单机流式保存；产生 2 条原生历史，不创建同步状态，服务端 journal 不增加。

## 最小源码修复

- `main.js`：设置隔离 AppData 时，将启动 ready 标记写入该数据根，避免开发源码目录写入。
- `modules/ipc/assistantHandlers.js`：Rust Assistant 配置路径遵循显式 `VCPCHAT_APP_DATA_DIR`，避免隔离启动读取源码目录的配置。
- `modules/SovitsTTS.js`：TTS 缓存及模型列表遵循同一隔离数据根。未设置环境变量时保留原路径行为。
- `scripts/test-native-sync-r3.cjs`、`scripts/native-sync-r3-guard.cjs`：新增完整应用驱动、回环合成 SSE、隔离读写/网络检查及可控故障注入；`package.json` 只新增测试命令。未重写 R2 同步模块。

## 复现与回归

在本工作树执行 `npm run test:native-sync-r3`。需要 Node 24 和 Electron 44；本机使用 R2 sidecar Electron，补齐的应用依赖及锁文件在 `P:\VCPKF\vcp\artifacts\native-sync-r3\deps`，源码中的忽略依赖链接指向已确认实验区。依赖准备使用 npm 且禁用生命周期脚本；应用验收运行仅使用回环服务。

每次运行自动创建新的 `run-<timestamp>`。只启用 `R3Agent/r3-topic` 与 `R3Group/r3-group-topic` 两个合成同步话题；`r3-other` 用于切换对照。进程仅注入最小系统环境及本次测试环境，OS profile/cache/temp 也定向至运行根。`VCPCHAT_E2E_TEST=1` 使用上游音频预热跳过入口；合成配置关闭分布式服务、CDS、Assistant，模型仅为本地 SSE。保护脚本记录零被拦截网络请求、零越界读写；不是通用 OS 沙箱证明。

修复后复跑 `npm run test:native-sync-r2`：389 项 Node 测试全部通过（19 原生同步/刷新、37 原生回归、320 Chat Kernel、原型原有 13 项），7 项真实 Electron 检查通过。回执为 `P:\VCPKF\vcp\artifacts\native-sync-r2\R2_TEST_RECEIPT.json`。该套件回执中的 full application NOT RUN 仅描述 R2 套件自身；完整应用证据以本 R3 回执为准。

## 验收边界

没有连接 wp08/Ubuntu 生产、真实 provider、真实聊天数据、真实双机或公网应用端点；没有修改 Rust CDS 权威、产品单实例策略或迁移整个插件。本轮完整应用群聊覆盖正常自动终态，redo/错误终态及精确终态竞态仍由已复跑的 R2 定向回归覆盖；未声称这些路径新增了完整应用 UI 验证。音频、工具和可选原生服务不在本轮验收范围。

全仓合同门禁的既有基线问题保持原样，参见 R2 交接及 `CONTRACT_BASELINE_COMPARISON.json`。本结果不表示全仓发布就绪；当前没有阻碍本轮目标的遗留问题。
