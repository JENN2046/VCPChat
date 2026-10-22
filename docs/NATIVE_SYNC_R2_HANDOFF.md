# Native Sync R2 — 实施交接

固定起点：`e8c038398fde3723d656326af20903b83b226134`；任务分支：`codex/vcpchat-native-sync-r1`。

## 实际调用链

`ChatRepository → chat-role preload → Agent/Group 保存 IPC → HistoryMutationQueue → 提交快照观察器 → 持久 Outbox → HTTP push → SQLite journal → cursor pull → Queue.mutate → 持久应用记录/cursor → history-file-updated → NativeHistoryRefresh → ChatManager.syncHistoryFromFile → Repository → MainChatStateAuthority + 正式 MessageRenderer DOM`。

同步默认关闭。仅显式的隔离 POC 参数启用指定话题；网络只允许 `http://127.0.0.1`。普通未启用话题保留旧保存路径和数组语义，不加载整个 VCPMobileSync 插件。

| 改动范围 | 作用 |
| --- | --- |
| `modules/services/historyMutationQueue.js` | 可选提交观察器；快照隔离；同步退化结果；启用话题的全量版本检查及可靠落盘。 |
| `modules/services/nativeSync/` | 原型 HTTP/SQLite 适配、正式 canonicalization/hash、Outbox、Owner 路径绑定、冲突/墓碑、两阶段远端应用与重启补扫。网络与队列/状态锁分离。 |
| `modules/ipc/nativeHistoryHandlers.js`、原有 Agent/Group handler、preload、ChatRepository | 原生版本快照、终态事务、状态查询及保存结果接线。 |
| `chatHistoryPersistence.js`、`chatHistoryMutationAuthority.js` | 启用同步的单聊终态在主进程 Queue 内合并，保留非目标的新数据和目标本地元数据；全量保存携带版本。 |
| `Groupmodules/groupchat.js` | 收口本轮自动正常/错误/中断终态与 redo；保留原有业务编排。 |
| `nativeHistoryRefresh.js`、StreamConsumer/Surface/Composition、`renderer.js`、`chatManager.js` | 完整会话身份校验、显式通知、saving 屏障、读盘中途失效后的补刷、正式消息 DOM 更新和排序。 |
| `main.js`、POC server/test scripts | 默认关闭的隔离 POC 生命周期；可重复测试入口。 |
| 测试与夹具 | 真保存 handler、真实 Electron preload/IPC/正式消息渲染、恢复负路径；修复原有 message-edit 夹具缺失的纯 ESM 依赖注入，未改其产品代码。 |

## 运行与证据

在工作树运行 `npm run test:native-sync-r2`。依赖已隔离放在 `P:\VCPKF\vcp\artifacts\native-sync-r2`，代码树中仅建立被 Git 忽略的包链接，未安装整套应用或执行其生命周期脚本。需要 Node >=22.13 和 Electron 44；本轮 Node 为 24.21.0，Electron 内 Node 为 24.18.1。

复现依赖：`deps/` 使用 fs-extra 11.3.2、jsdom 27.0.1、electron 44.0.0、better-sqlite3 13.0.3（仅供回归导入，不运行其数据库）、diff-match-patch 1.0.5、ignore 7.0.5、smol-toml 1.9.0、@babel/parser 7.29.9；`ui-deps/` 使用 marked 12.0.0、morphdom 2.7.7、css-tree 3.2.1。安装使用 `--ignore-scripts --no-save --package-lock=false`；只单独执行已审阅的 Electron install.js 下载官方运行时，缓存也在本区。顶层链接需使 ESM 的 jsdom、@babel/parser、marked、morphdom、css-tree 可解析。

- 汇总：`P:\VCPKF\vcp\artifacts\native-sync-r2\R2_TEST_RECEIPT.json`，记录实际命令、退出码、计数和最后 UI 回执路径。
- 已通过：19 项新增同步/刷新检查，37 项 Queue/订阅/preload/群聊/canonical 回归，320 项 Chat Kernel 回归，原型原有 13 项测试；所有分组退出码 0。
- 真实 Electron：7 项检查；Windows A/B 为两份独立隔离数据根。使用原始 chat-role preload、真实保存 handler、Queue、Repository、ChatManager、MainChatStateAuthority、正式 `createMessageRenderer`/Marked/morphdom；消息在真实 Chromium 窗口内显示，并保存 Agent/Group 截图。
- 群聊 AI 响应仅使用合成 provider transport；同步 HTTP 和 SQLite 实际运行。UI 测试页是隔离壳，未启动完整生产 `main.js`，也未声称全应用冷启动已验证。
- SQLite、临时文件、浏览器测试 profile、截图和测试依赖都在上述 artifacts 内，不进入源码交付。

独立实验服务入口：`node scripts/native-sync-poc-server.cjs`，只写 `artifacts/native-sync-r2/server/` 并输出随机回环 URL。主程序接线仅接受 `--native-sync-poc`、`--native-sync-url=...`、`--native-sync-device=...`、`--native-sync-topics=<JSON descriptor 数组>` 且要求显式隔离 `VCPCHAT_APP_DATA_DIR`；这是测试接线说明，本轮没有启动完整主程序。

## 限制与交接

- `NATIVE_SYNC_WIRING_POC_PASS` 只覆盖本次隔离原生闭环；不等于发布、生产就绪或真实双机联调通过。
- 独立运行的 CDS/MobileSync 写入权威未修改，也未测试与它们并行写同一历史；本轮不可声称跨进程同步保证。
- 群聊创建/替换话题时的空历史初始化、未注入 Queue 时的旧 helper/redo fallback、话题/Owner 整体删除，以及其他未触达的插件直接文件写入不在保证内；不把启动补扫当作这些路径的即时提交保证。
- 仅同步显式绑定的话题；新增 Owner/Topic 的发现、配置/媒体同步、手机端及公网鉴权均未实施。非法 canonical 数据进入可诊断的退化状态，不能默默丢弃后报告成功。
- `check:chat-contracts` 仍被原仓库既有陈旧事件图和动态站点登记问题阻塞。固定 HEAD 与本轮重建图各有 13 个未登记动态站点，本轮新增 0；对比证据为 `artifacts/native-sync-r2/CONTRACT_BASELINE_COMPARISON.json`。未绕过门禁，也未扩大范围修复无关站点；不能据本 POC 声称全仓库检查通过。
- 未访问生产服务器、真实聊天或真实运行配置；未改 Rust CDS，未 Push/Merge。下一步是在同一隔离环境决定是否扩大到完整应用壳的冷启动验证；更大范围联调另定边界。
