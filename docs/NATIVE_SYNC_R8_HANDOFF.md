# R8：CDS / MobileSync / NativeSync 受控共存

结果：`R8_SYNC_COEXISTENCE_PASS`。**共享话题的消息写入权威为 NativeSync/Queue，VCPMobileSync CDS 模式可读，修改/删除明确拒绝。非共享话题允许原 MobileSync/CDS 写入。NativeSync 活动时拒绝 Legacy 后端。** 没有宣称同一话题任意双写兼容。

## 基线与源码

独立工作树 `P:\VCPKF\vcp\versions\vcpchat-sync-coexist-r8` 基于 R7 `6ce7eecd3be0e2d7516928003f5f7efbe34365ff`；`vcptoolbox-sync-coexist-r8` 基于 R7 `8838bb70859ea2e6f263c2b84d75dc6eef3fe518`。ToolBox 没有新增业务差异，保留原 PWA/持久执行/中央日志。

- `modules/services/syncWriterBoundary.js`：按实际 Queue 的 NativeSync 话题和物理路径执行写入排他；包含 Owner 配置、类型别名、Windows 大小写和目录链接检查。拒绝返回稳定错误及不可自动重试语义。
- `VCPDistributedServer/Plugin/VCPMobileSync/index.js`、`sync/central.js`、`transport/routes.js`：在消息流、墓碑、WS 删除和实体修改进入原写入者前检查边界；CDS 和非共享写入仍走原实现。AppData 使用宿主明确根，避免插件读写另一个目录；NativeSync 活动时在启动前拒绝 Legacy。
- `main.js`、`VCPDistributedServer/VCPDistributedServer.js`：把现有 Queue 和 AppData 根传递至普通插件宿主。新增默认不运行的 `--native-sync-coexistence-poc` 隔离测试入口；完整 main.js / preload / main.html / Renderer 保持真实运行。
- `transport/websocket.js`、manifest：允许显式回环绑定和随机测试端口；默认绑定行为不改。HTTP/WS 连接日志不再输出认证值或带 Token 的 URL。
- `modules/modelUsageTracker.js`：一行隔离修复，模型计数跟随 `VCPCHAT_APP_DATA_DIR`，消除长时验收中对源码树 AppData 的写入尝试；正常默认路径不改。
- `scripts/native-sync-r8-{service,scenario,pwa-cds}.cjs`、R3/R7 驱动：真实同进程插件、并发场景及增强 PWA 验收；测试服务仅挂必要原 MobileSync 路由，不是全部 VCPDistributedServer 插件启动验收。`verify-native-sync-r8-storage.py` 在停服后只读核对 SQLite、历史、索引、PID 和端口。
- `tests/sync-writer-boundary.test.cjs`：4 个边界/别名/Legacy 负路径；原流式测试显式绑定回环。

Rust CDS 源码、生命周期/客户端门面、`HistoryMutationQueue`、NativeSync 协议/适配器/中央日志全部未改。使用仓库自带的 15,199,232-byte Windows CDS 二进制，protocol/schema=3；Git blob `9a4fb142eb6008d77bac8088ebb05ba2210809e0`，SHA256 `3fee3dc5ed38e582ab36b1490e15b27a78b4e9e926c5a2a82256370c82b1d61c`。没有重编译或重跑 Rust 单元测试。

## 实际验收

R8 成功根：`P:\VCPKF\vcp\artifacts\native-sync-r8\run-1792665341427`。

1. 6 次完整 VCPChat 启动同时带真实 CDS 与原 MobileSync CDS 后端，均退出 0；6 个 Rust CDS 均经原 shutdown 退出 0。MobileSync 原 HTTP/NDJSON 与 Wire 1.5 握手实际运行，所有本轮监听均为回环。
2. 原生流式保存/终态修改、NativeSync 远端新增/删除，经 Rust CDS 原消息拉取及真实 Tantivy 查询核对。共享 MobileSync upsert/墓碑/WS 删除、Owner 替换、Agent/Group 物理串写明确失败，历史不被覆盖。
3. Queue 终态与远端不同 ID 并发合入；同 ID 旧 hash 返回 409，旧全量 replace 返回 `HISTORY_REVISION_CONFLICT`。共享话题的 MobileSync 拒绝与这些原生修改并发执行；没有通过绕开 Queue 写消息制造成功。
4. 非共享话题通过原 MobileSync → Rust CDS 实际新增、修改、删除及重复提交；NativeSync 关闭时，原聊天保存和 MobileSync 对原共享话题的写入均正常，中央日志不变。
5. 群聊自动正常终态、合成 HTTP 500 错误终态、redo 与远端 NativeSync 增量交错通过；原 assistant 删除为墓碑，新回复和远端消息均保留。
6. 断线时 Outbox 持久保存；中心、应用和 CDS 重启后恢复。B 注入 ACK/cursor finalize 失败，保留 pending，再次启动恢复成功。空闲后日志不增长。
7. 最终 A/B 各 4 条单聊 + 5 条群聊，中央 17 条日志/17 个已应用操作、9 条有效消息；cursor=17、Outbox=0、pending 空。独立 Python `mode=ro` 核对两端物理历史、CDS 消息及中央 canonical 哈希相等，SQLite integrity_check 全部 ok，索引版本相等。6 个 CDS 正常退出、16 个已观测端口关闭、无本轮 PID 残留。

CDS 搜索原本按首次查询延迟建立。验收实际调用原搜索后比较 content/indexed revision，不把“尚未查询”冒充索引损坏，也没有修改 Rust 来满足检查。

主回执 `artifacts/native-sync-r8/LATEST_R8_RECEIPT.json`；运行根含 `COEXISTENCE_ACCEPTANCE.json`、`INDEPENDENT_STORAGE_INDEX_SHUTDOWN_PROOF.json` 与 `coexistence-group-redo.png`、`coexistence-recovered.png`、`coexistence-B-formal.png`、`coexistence-native-off-mobile-write.png`。每次 CDS 退出回执在对应隔离 AppData 中，认证值不进入回执。

## R7 与原回归

增强 R7 成功根：`P:\VCPKF\vcp\artifacts\native-sync-r7\run-1792665382264`。在 R8 完整桌面实例中同时启用 CDS/MobileSync，以真实 HTTPS/SSH 连接 wp08 完整 ToolBox server.js：PWA 断开继续生成、重连/宿主重启、取消/防重、Windows 正式界面及同步/插件关闭对照通过。A/B 均通过原 MobileSync 拉取到 PWA 的 7 条消息，哈希相等，真实 CDS 搜索成功、索引版本一致。5 次完整应用及5个 CDS 退出 0，3 次完整 ToolBox 和3次 Chrome 均正常退出。

- 原 MobileSync 套件：93/93。
- 原 R2：389 项 Node（含原型13项）+7项原生 Electron 通过。
- 新边界4项、原传输生命周期2项通过；ToolBox 插件/持久执行9项通过。
- JS 语法与 scoped diff check 通过；完整应用隔离守卫无越界读/写或非回环网络。

复现（依赖边界见 `artifacts/native-sync-r8/DEPENDENCY_LINKS.json`，仅复用已有实验依赖，不使用其他 VCPChat 仓库）：

```powershell
npm run test:native-sync-r8
npm run test:native-sync-r7 -- --r8-toolbox --coexist-services
npm run test:mobile-sync
npm run test:native-sync-r2
node --test tests/sync-writer-boundary.test.cjs tests/native-sync-r4-lifecycle.test.cjs
python scripts/verify-native-sync-r8-storage.py P:/VCPKF/vcp/artifacts/native-sync-r8/run-1792665341427
```

单元回归的 TEMP/TMP 与 `VCPCHAT_APP_DATA_DIR` 应显式放入 `artifacts/native-sync-r8/`；端到端驱动自行创建全新隔离根、生成合成配置并关闭进程。R7 命令自动构建 ToolBox R8 工作树的相同 PWA 源码，使用既有实验 SSH/依赖及回环 HTTPS，不常驻服务。

限制：这是有写入排他的 CDS 模式共存；Legacy+NativeSync 同时启动失败关闭。没有实际 Android/VCPMobile 客户端验收、全部分布式插件验收、真实数据/provider 或生产部署。没有修改 Rust CDS、重设计协议、Push/Merge。继续开发须保留这条排他边界，不能把当前 PASS 解读为共享话题双写授权。
