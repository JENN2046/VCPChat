# R6 完整 VCPToolBox 隔离启动验收

结果：`R6_FULL_TOOLBOX_ISOLATED_BOOT_PASS`，2026-10-22。

## 真实入口与源码边界

完整 Windows VCPChat → 既有 wp08 SSH 隧道 → Ubuntu **完整 server.js** → 共用鉴权 → NativeSync Plugin → 独立 SQLite → B 原生 Queue/通知 → 正式消息界面。

- R5 两笔已验证提交 `33e685b`（VCPChat）及 `a73d00d`（ToolBox）保留在原工作树。本轮独立工作树分别为 `P:\VCPKF\vcp\versions\vcpchat-native-sync-r6` 与 `P:\VCPKF\vcp\versions\vcptoolbox-native-sync-r6`，分支均为 `codex/*-native-sync-r6`。
- 完整目标源码来自既有 wp08 开发快照，未读取生产目录；新增 1,580 个未修改的源码/文档/示例文件在单独提交 `751886d` 中，与行为修复分开。核对清单 `P:\VCPKF\vcp\artifacts\native-sync-r6\FULL_SOURCE_COMPARISON.json` 记录原始 SHA256。与 R5 重叠源码一致，保留其 README、测试命令、鉴权抽取差异；不声称源快照有已验证的作者上游 SHA。
- 唯一产品行为修复：`server.js` 增加 `SERVER_BIND_HOST` 显式监听地址，未设置时行为不变。R6 固定回环地址。NativeSync、协议、中央日志、Rust 源码和 VCPChat 业务代码均未改动。
- 新增实验预加载、完整源码传输/配置驱动与锁文件 crate 获取脚本。预加载脚本观测真实启动和退出，限制文件及网络 I/O、屏蔽合成 Key；没有替换模块、原生依赖、初始化函数或请求处理器。R6 未调用 R5 的 service-only 宿主。

## 实际启动配置与依赖

成功运行根：Windows `P:\VCPKF\vcp\artifacts\native-sync-r6\run-1792659305061`；Ubuntu `/home/admin/VCPKF/vcp/artifacts/native-sync-r6/run-1792659305061`。该运行副本包含 1,617 个逐项校验的源码文件及已校验的自建原生二进制。

真实进程命令形态如下，完整参数在回执 `remote.servers[].command`：

```sh
cd <run>/source
env -i PATH=/usr/bin:/bin HOME=<run> NODE_PATH=<r6>/deps/node_modules \
  VCP_R6_RUN_ROOT=<run> NativeSyncEnabled=true NativeSyncDataDir=<run>/data/native-sync \
  /usr/bin/node --no-warnings --require ./scripts/native-sync-r6-preload.cjs server.js
```

`config.env` 为新生成的合成实验配置，`.env` 为空的合成哨兵，避免祖先配置搜索；没有复制真实配置。`PORT=0`、`SERVER_BIND_HOST=127.0.0.1`，回执记录实际分配端口。旧日志显示配置值端口 0、未使用的上游合成 URL `http://127.0.0.1:9`，它们不代表同步中心的实际监听地址。

80 份其他插件 manifest 在运行副本中采用现有 `.json.block` 禁用机制。TDB、WebSocket 心跳、分布式音乐同步关闭。空 Agent/TVS、知识库 root/store 均显式定向到实验目录，知识库维度 32、启动扫描关闭。JEV 的强制读取配置与提示文件采用新生成的空类别/合成内容，未读取真实配置。

完整入口强制加载 Rust Vexus，没有现成总开关；本轮实际构建并初始化原生引擎及空知识库，未用 mock 绕过。Ubuntu 原工具链 1.75 不满足仓库指定的 1.89，已从官方发行包通过 Windows 下载、SHA256 校验后安装到实验 `tools/rust`，系统工具链未改动。远端不能访问 crates.io 索引，使用 `scripts/native-sync-r6-vendor.py` 取得 Cargo.lock 指定的 243 个官方 crate，逐包校验后离线执行原 `napi build --platform`，构建退出码 0；原生二进制 SHA256 为 `7fd669021545688bbbc5552381743bbbfb8753c7c37b57d7000956da0b5af117`。

声明的 Node 依赖通过锁文件在 `<r6>/deps` 安装，初次安装禁用生命周期脚本；仅为必要的 better-sqlite3 使用官方校验过的 Node 24.14.1 headers 定向构建。构建日志及工具缓存位于远端 R6 artifacts；没有使用生产依赖或二进制。没有改动 Rust CDS 或 Vexus 源码。

## 已通过的验收

| 验证 | 证据 |
| --- | --- |
| 完整宿主启动 | 4 次进程实际入口均为 server.js，原生知识库 initialized=true；PluginManager 发现 NativeSync，初始化和两种路由注册通过 |
| 共用鉴权 | 未携带或携带错误合成凭据的 Push/Pull 被 401 拒绝；未增加中央日志 |
| 完整客户端和正式 UI | A/B 顺序启动，单聊流式终态、群聊正常终态、话题切换、接收并显示均通过，未改单实例策略 |
| 真实网络及恢复 | 断 SSH 隧道期间持久 Outbox=2；两次完整宿主重启后接续；相同 opId 重放不增加日志；分页增量拉取通过 |
| pending/cursor | 注入远端历史已提交、cursor finalize 尚未持久化的故障窗口；B 重启恢复，无重复 |
| 一致性 | A/B canonical 历史相等，单聊各 4、群聊各 2；6 个消息哈希匹配 SQLite，cursor=6、Outbox=0、pending 为空 |
| 同步关闭 | 完整客户端单机保存 2 条，不创建同步状态、中央日志不增加 |
| 插件关闭 | 第四次完整 server.js 使用 NativeSyncEnabled=false 和新的专用数据路径；两种写路由返回 503，同步目录未创建；第八次完整客户端正常单机保存 2 条且无同步状态 |
| 完整宿主退出 | 4 次退出码均为 0；各日志均有 Phase 0–10、原生 watcher joined、日志流关闭及最终 process.exit(0)；8 次完整客户端退出码均为 0 |
| 独立磁盘/关闭复核 | SQLite integrity_check=ok，journal/head/appliedOps 均为 6；哈希索引及停服文件 SHA256 匹配；KB files/chunks/tags 均为 0，与同步数据库物理分离；4 个端口已关闭，宿主 PID 无残留，实验 PM2 daemon 不存活 |

所有监听均为 127.0.0.1，无越界读写/网络违规；完整宿主只有实验 HOME 下的 PM2 本地 IPC 探测，没有 TCP provider 请求。完整隔离启动/退出日志保留所有 stdout/stderr，生成时屏蔽已知合成 Key，没有使用可能含真实数据的历史原始日志。

## 命令与交付证据

当前依赖和构建缓存已就绪，可在 VCPChat R6 工作树直接复现：

```powershell
npm run test:native-sync-r6
npm run test:native-sync-r5
npm run test:native-sync-r2
node --test tests/native-sync-r4-lifecycle.test.cjs
```

在 ToolBox R6 工作树设置原 R3/R2 sidecar 的 `NODE_PATH` 后运行 `npm run test:native-sync`。初次原生构建使用官方 Rust 1.89、Node 24.14.1 headers、锁定 crate 缓存；源传输首次命令为 VCPChat 的 `node scripts/native-sync-r6-transport.cjs --prepare-build`，只接受不存在的新 build-source 目录，不覆盖已有证据。之后从远端 `build-source/source/rust-vexus-lite` 运行已安装的 `napi build --platform`，设置实验 `CARGO_HOME`、`CARGO_TARGET_DIR`、Rust PATH 和离线模式；未来重建应限制 `CARGO_BUILD_JOBS`。

本轮复跑：R5 完整插件链 `R5_TOOLBOX_SERVICE_INTEGRATION_PASS`（`native-sync-r5/run-1792659462086`）；R2 389 项 Node（含原型 13 项）及 7 项原生 Electron 检查；5 项插件测试和 2 项传输生命周期测试全部通过。

主回执为 `P:\VCPKF\vcp\artifacts\native-sync-r6\LATEST_R6_RECEIPT.json`。成功运行根下有同份 `R6_APP_RECEIPT.json`、4 份 `full-toolbox-<ssh-pid>.log`、`FULL_STARTUP_SHUTDOWN_LOG_INDEX.json`、`REMOTE_STORAGE_SHUTDOWN_VERIFICATION.json` 及正式 UI 截图。日志索引含文件 SHA256，回执包含运行参数、真实 PID、状态及最终交付提交号。

没有生产修改/重启、真实配置或聊天读取、真实 provider、Rust CDS 改动、完整 MobileSync 迁移、手机端、公网监听、Push/Merge 或正式安装。历史首次启动缺失 JEV 合成配置和远端构建网络失败均已修复为隔离配置/依赖准备，不将早期失败探针当作通过证据；既有全仓技术债不在本轮修复范围。
