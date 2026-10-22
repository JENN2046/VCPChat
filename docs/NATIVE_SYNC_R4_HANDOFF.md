# Native Sync R4 真实主机传输验收

结果：`R4_REAL_HOST_TRANSPORT_PASS`，2026-10-22。Windows 完整 VCPChat A/B 使用独立数据根，经现有可信 `wp08` SSH 连接访问 Ubuntu 的 HTTP/SQLite 同步中心。A/B 是同一 Windows 上顺序启动的两个隔离客户端；同步中心及存储位于另一台真实 Linux 主机。本轮未声称真实双机客户端或 VCPToolBox Service Plugin 集成完成。

## 提交与源码

实施 R4 前，已将原有 R2/R3 的 40 个源码、测试及交接文件保存为本地提交 `bdb5fcc2634da6d498cddf90a51b5f47908ac442`，父提交为固定上游基线 `e8c038398fde3723d656326af20903b83b226134`。仓库缺少 Git 作者配置，本次使用命令级 `Nobao <nobao@local.invalid>`，没有修改全局 Git 配置。

R4 没有修改同步模块或应用业务源码。新增 `scripts/native-sync-r4-host.cjs`（远端实验入口）、`scripts/native-sync-r4-transport.cjs`（精确源码传输、SSH 隧道及进程生命周期）、`scripts/test-native-sync-r4.cjs`（复用 R3 入口）和 `tests/native-sync-r4-lifecycle.test.cjs`；扩展 R3 测试驱动和隔离保护脚本，使同一正式应用路径可使用远端中心，并新增 `test:native-sync-r4` 命令。

远端仅复制 6 个文件：实验入口、原有 `httpService.js`、`centralStore.js`、`protocol.js`、原有 MobileSync 纯 `canonical.js` 与 `core/hash.js`。每个文件的字节数及 SHA256 均在启动前核对。远端没有安装依赖，没有复制完整 VCPChat、VCPToolBox、配置、聊天数据或插件运行环境。清单记录的 `sourceCommit` 是 R3 基线提交；新增实验入口由逐文件 SHA256 明确标识。

## 运行命令与边界

在 `P:\VCPKF\vcp\versions\vcpchat-native-sync-r1` 执行：

```powershell
npm run test:native-sync-r4
npm run test:native-sync-r3
npm run test:native-sync-r2
node --test tests/native-sync-r4-lifecycle.test.cjs
```

首条命令自动使用现有 `wp08` SSH 别名，在远端新建独占 `run-<timestamp>`，传输白名单源码、启动服务、建立本地回环隧道、执行完整应用验收并关闭本轮所有服务和隧道。需要现有 SSH 权限、本地 R3 的隔离依赖/Electron 44 及远端 `/usr/bin/node`（本机验证为 Ubuntu 22.04、Node 24.14.1，内置 `node:sqlite`）。不读取 SSH 密钥或修改可信连接配置。

实际成功运行目录：

- Windows：`P:\VCPKF\vcp\artifacts\native-sync-r4\run-1792656651655`；其下 `Windows-A`、`Windows-B`、`Sync-Off` 为独立 AppData，OS profile/cache/temp 也隔离。
- Ubuntu：`/home/admin/VCPKF/vcp/artifacts/native-sync-r4/run-1792656651655`；`source/` 为限定源码，`data/central.sqlite` 为合成数据库。目录权限 0700，文件受 umask 0077 保护。
- 服务实际启动命令为 `/usr/bin/node --no-warnings <remote-run>/source/scripts/native-sync-r4-host.cjs <remote-run>`，经 SSH 前台运行。只监听 `127.0.0.1`，不创建 systemd/cron，不改变防火墙或代理。
- 第三次服务进程实际监听 `127.0.0.1:37997`，对应隧道 `ssh -N -o ExitOnForwardFailure=yes -L 127.0.0.1:63109:127.0.0.1:37997 wp08`。具体完整参数在回执中；端口会随复现变化。
- VCPChat 仍使用现有 `--native-sync-poc --native-sync-url=http://127.0.0.1:63109` 入口，仅启用合成 `R3Agent/r3-topic` 和 `R3Group/r3-group-topic`。本轮保留 R3 夹具命名，数据全部重新生成。

## 验收证据

| 验证 | 实际结果 |
| --- | --- |
| 原生单聊保存 → SSH → Ubuntu SQLite → B Queue → 正式界面 | 用户消息和合成流式助手终态均显示；真实 `main.js/preload/main.html/renderer.js`，没有测试 HTML 替换 |
| pending/cursor 故障窗口 | B 已保存远端历史但 finalize 写入被可控故障拦截；重启后恢复并显示，无重复；故障注入 3 次 |
| 真实隧道中断 | 只终止本轮 SSH 隧道，Ubuntu 服务继续运行且 journal 保持 2；B 原生保存成功，Outbox 持久保存 2 项 |
| 客户端和远端服务重启 | B 关闭后启动同一 SQLite 的新服务进程，再启动 B；Outbox 自动发送。随后再次重启服务，已有计数保持 4 |
| 重复提交与增量拉取 | 服务再次重启后重放原 Outbox opId，返回原 seq=3，journal/appliedOps 均不增加；分页 after_seq=2、3 分别返回 3、4，after_seq=4 为空 |
| 群聊与话题切换 | 正常自动终态保存并在 B 正式群聊显示；切换其他话题后返回，无历史串入 |
| 最终一致性 | A/B canonical 历史相等，各单聊 4 条、群聊 2 条，ID 无重复；6 个消息哈希逐项匹配 Ubuntu SQLite 索引；cursor 均为 6，Outbox=0，pending 为空 |
| 同步关闭对照 | 完整应用本地保存 2 条，无同步状态文件，远端 journal 不增加 |
| 远端磁盘独立复核 | 所有服务关闭后，通过独立 SSH/Python 只读连接数据库，`PRAGMA integrity_check=ok`，journal/head/appliedOps 均为 6，哈希索引及数据库 SHA256 与停服回执相符 |
| 退出 | R4 的 7 次完整应用启动全部退出码 0；Ubuntu 服务 3 个进程全部正常退出码 0；3 条隧道均为主动 SIGTERM 退出，非 exitCode=0，不将其计为失败或伪报正常退出 |

主回执：`P:\VCPKF\vcp\artifacts\native-sync-r4\LATEST_R4_RECEIPT.json`，成功运行根下保留同一份 `R4_APP_RECEIPT.json`、`REMOTE_STORAGE_VERIFICATION.json`、源码清单和 5 张正式界面截图。远端保留源码、合成数据库及各次 `host-start-<pid>.json` / `host-stop-<pid>.json` 供复核，服务与隧道不常驻。

## 回归、修复与限制

R3 本地完整应用对照复跑结果 `FULL_APP_COLD_START_PASS`（`native-sync-r3/run-1792656695697`，7 次完整应用均退出码 0）；R2 回归再次通过 389 项 Node 测试（含原型原有 13 项）及 7 项原生 Electron 检查。另有 2 项 R4 生命周期负路径测试通过。

首轮测试发现驱动把主动 SIGTERM 的 `exitCode=null` 错判为隧道仍存活；已修复退出状态判断，并确保本地隧道清理失败时仍尝试停止远端实验服务。这属于测试驱动修复，没有改动产品同步行为。失败运行 `run-1792656585657` 保留供追溯，不作为成功证据，其实验服务已退出。

没有读取真实配置或聊天数据，没有真实 provider 调用，没有修改 `/app/VCPToolBox`、Rust CDS、单实例策略、生产服务或公网端点；没有 Push/Merge、正式安装或迁移整个 MobileSync。模型仍为 Windows 本地合成 SSE。群聊错误/redo 和精确终态竞态沿用本次复跑的 R2 定向原生回归，不新增完整应用 UI 声明。既有全仓合同门禁问题不在本轮修复范围。
