# Native Sync R5 Service Plugin 验收交接

结果：`R5_TOOLBOX_SERVICE_INTEGRATION_PASS`，2026-10-22。VCPChat 基线为 `be828e4429639539773629c3a6568d7275cf7e9f`，保留现有原生客户端、同步协议及 SQLite 中央日志。

## 实际链路与源码

完整 VCPChat `main.js/preload/main.html/renderer.js` → 原生 Queue/Outbox → SSH → Ubuntu Express 的 VCPToolBox 共用 Bearer 鉴权 → 真实 `Plugin.js` 注册的 NativeSync Service Plugin → 独立 SQLite → B Queue/显式通知 → 正式消息界面。

隔离 ToolBox 源码工作区为 `P:\VCPKF\vcp\versions\vcptoolbox-native-sync-r5`，来自 wp08 开发源码快照的 13 文件 PluginManager 依赖闭包及必要源码/文档；初始本地提交 `1d0f87b`。原快照无 Git 元数据，来源逐文件哈希见 `artifacts/native-sync-r5/TOOLBOX_SOURCE_PROVENANCE.json`，不是另一个 VCPChat 仓库，也不是作者上游 Git 克隆。

实际生命周期依据为原 `Plugin.js`：`loadPlugins` 发现 manifest/direct 模块，约 1001–1022 行注入配置并 await `initialize`；1935 行起的 `initializeServices` 调用命名空间与兼容路由合同；726 行起的 `shutdownAllPlugins` await 服务 `shutdown`。本轮 `Plugin.js` 字节未改动。

验收使用 ToolBox 的 **service-only 隔离宿主**，实际调用上述 PluginManager、配置解析、依赖注入、路由及退出；只装载 NativeSync。完整 `server.js` 的知识库、provider、管理面板及其他业务启动未运行，不把本结果当作全量 ToolBox 启动或生产就绪。

最小差异：

- ToolBox `Plugin/NativeSync/`：service/direct manifest、生命周期模块、R4 `centralStore/protocol` 与纯 canonical/hash、HTTP 路由适配、来源清单。
- ToolBox `modules/apiBearerAuth.js`：将 `server.js` 原有通用 Bearer 中间件抽成共用函数；`server.js` 原中间件替换为一次调用，跳过路径和认证结果保持原行为，定向测试逐项与快照原函数比较。
- ToolBox `native-sync-service-host.cjs`：隔离验收入口，使用真实 PluginManager，不启动其他插件或业务数据库；`tests/native-sync-plugin.test.cjs` 验证鉴权、路径拒绝、关闭/重初始化、排空、规则保留。
- VCPChat 仅修改/新增实验驱动、SSH 传输 profile、隔离保护范围及测试命令。客户端业务源码和 `modules/services/nativeSync` 未修改。

## 路由、数据与运行命令

插件同时提供 `/api/plugins/NativeSync/sync/{push,pull,status}` 和由既有 `registerRoutes` 合同挂载的 `/api/v1/sync/{push,pull,status}`。两个入口都经过宿主共用 Bearer 鉴权；兼容入口保持 R4 客户端 URL 和 wire 合同。插件没有额外 HTTP listener 或第二套凭据。

成功运行 Windows 根：`P:\VCPKF\vcp\artifacts\native-sync-r5\run-1792657453938`。远端根：`/home/admin/VCPKF/vcp/artifacts/native-sync-r5/run-1792657453938`。远端 24 个白名单源文件启动前逐项校验；独立数据库为 `data/native-sync/central.sqlite`，未共用 KB、CDS、工具记录或业务数据库。

远端依赖为 `artifacts/native-sync-r5/deps` 的 8 项最小运行时依赖及其传递依赖，npm 使用 `--ignore-scripts --no-audit --no-fund`、独立缓存。better-sqlite3 仅被原 PluginManager 依赖模块加载，没有初始化其业务数据库；NativeSync 使用 Node 24 内置 SQLite。服务子进程使用清空后的环境，仅注入本次合成 Key、专用路径与实验依赖路径，不读取真实配置。

在 VCPChat 工作树运行：

```powershell
npm run test:native-sync-r5
npm run test:native-sync-r4
npm run test:native-sync-r2
node --test tests/native-sync-r4-lifecycle.test.cjs
```

ToolBox 定向检查：设置 `NODE_PATH=P:\VCPKF\vcp\artifacts\native-sync-r3\deps\node_modules;P:\VCPKF\vcp\artifacts\native-sync-r2\deps\node_modules`，在 ToolBox 工作树执行 `npm run test:native-sync`。复现首条完整验收命令会新建独占运行目录，通过既有 wp08 SSH 启动隔离宿主、转发回环端口、测试并退出。本轮不创建 systemd/cron、公网服务或正式安装。

## 实际结果

- 真实 manifest 发现、初始化、命名空间/兼容路由挂载均通过；没有凭据或使用错误凭据时两类路由均拒绝请求，journal 保持 0。
- A/B 正式 UI 单聊和群聊显示通过。断开真实 SSH 隧道期间 B 原生保存成功，持久 Outbox=2；宿主两次重启后恢复发送，重放相同 opId 不增加 journal，分页增量拉取正确。
- 远端历史已写、cursor finalize 被注入故障的窗口，B 保留 pending，重启后恢复，无重复。最终 A/B 单聊各 4 条、群聊各 2 条，canonical 历史相同；6 条哈希与插件 SQLite 逐项匹配，cursor=6、Outbox=0、pending 为空。
- 同步关闭的完整应用本地保存 2 条，不创建同步状态，插件 journal 不增加。
- 7 次完整应用退出码均为 0；3 个插件宿主进程退出码均为 0，每次回执均确认初始化/两类路由注册各 1 次、shutdown 1 次，退出后 ready=false；隧道主动 SIGTERM 退出。
- 停服后独立 SSH/Python 只读复核 SQLite：`integrity_check=ok`，head/journal/appliedOps 均为 6，索引与停服回执相同，数据库 SHA256 匹配，无本轮远端宿主残留。
- R4 关键完整链路复跑 `R4_REAL_HOST_TRANSPORT_PASS`（`native-sync-r4/run-1792657540774`）；R2 389 项 Node（含原型 13 项）及 7 项原生 Electron 回归通过；2 项传输生命周期、5 项插件定向测试通过。

主回执：`P:\VCPKF\vcp\artifacts\native-sync-r5\LATEST_R5_RECEIPT.json`；同一运行根下为 `R5_APP_RECEIPT.json`、`REMOTE_STORAGE_VERIFICATION.json`、源文件清单及 5 张正式 UI 截图。源工作区 Git 提交与回归索引写入最终回执。

没有修改生产 `/app/VCPToolBox`、Rust CDS 或原生客户端业务，没有真实聊天数据/provider、手机端、额外配置同步、完整 MobileSync 迁移或 Push/Merge。群聊错误/redo 及精确终态竞态沿用本次复跑的 R2 定向证据；既有全仓合同门禁问题保持原样。
