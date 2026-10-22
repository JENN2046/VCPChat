# R7 VCP Mobile PWA 最小闭环交接

结果：`R7_MOBILE_PWA_CORE_PASS`。**桌面 Chrome 390×844 移动视口已验收；真实 Android HTTPS / 安装 / 后台行为为 NOT RUN。**

## 源码与真实链路

独立工作树为 `P:\VCPKF\vcp\versions\vcptoolbox-mobile-pwa-r7` 和 `vcpchat-mobile-pwa-r7`，分别基于 R6 `3354317` 与 `7269eac`；R6 原工作树保持不动。

真实 Vue 3 + Vite PWA → 本次证书限定的 HTTPS 同源入口 → 既有 wp08 SSH → 完整 ToolBox server.js → NativeSync 移动会话门禁 → 原中央 SQLite → 持久执行器 → 宿主原 `/v1/chat/completions` / AgentManager / ChatCompletionHandler → Ubuntu 回环合成模型 → 原 `CentralStore.apply` → Windows 原生 Queue/游标 → 正式 Renderer。没有用静态 UI、接口 mock 或直接数据库写消息代替链路；仅 provider 使用合成 HTTP 服务。

最小产品差异：

- `apps/mobile/`：Vue SFC、文本历史/目录/输入/状态/取消/重试，manifest 和仅缓存公共 shell 的 Service Worker；没有硬编码会话或全局 Key。
- `Plugin/NativeSync/mobile/portal.js`：只读目录/消息查询、一次性配对、受限会话、Origin/HTTPS/代理边界、文本提交与取消。权限只覆盖明确配置的合成 R3Agent/r3-topic；无 Agent 配置 CRUD。
- `mobile/execution.js`：同一 SQLite 内的执行元数据及可重放意图，202 持久接受、独立执行、重启恢复、取消和最终回复发布。原 centralStore/protocol/canonical 字节未改，没有第二个会话历史数据库。
- `server.js`：在全局 Key 门禁之前，仅将 `/mobile` 命名空间交给插件自己的受限认证；其他 API 仍走原鉴权。监听后注入仅服务端持有的内部执行目标；完整宿主 drain 时暂停/中止后台任务。
- NativeSync 生命周期与 manifest 增加默认关闭的移动配置。VCPChat 只增加验收驱动/隔离配置，客户端业务代码和 Rust CDS 未改。

## 认证与 HTTPS

配对签发 API 继续使用宿主全局 Bearer，但只有服务端测试/运维调用；浏览器从不接收它。配对码 192-bit、一次性、3 分钟；会话 Cookie 不透明、8 小时，HttpOnly/Secure/SameSite=Strict/Path=/mobile，服务端只存哈希。移动写操作检查精确 Origin；请求体 32 KiB，文本至多 12,000 字符，权限及话题由服务器决定，不能传入 model/role/owner 等字段。全局 Key API 对移动 Cookie 仍返回 401。

实验 HTTPS 网关仅监听 Windows 127.0.0.1，前端及 API 同源，经 SSH 到 Ubuntu 回环完整服务。新生成的 TLS 私钥只由网关读取，不打印、不上传、不提交；独立 Chrome profile 仅信任本次证书的 SPKI，未修改系统或日常浏览器的证书/登录状态。该测试信任方式依照 [Chromium 的 SPKI 开关实现](https://chromium.googlesource.com/chromium/src/+/HEAD/services/network/ignore_errors_cert_verifier.h)。Cookie 属性与 [浏览器安全 Cookie 语义](https://developer.mozilla.org/en-US/docs/Web/Security/Practical_implementation_guides/Cookies) 一致；Service Worker 在实际 HTTPS 安全上下文中注册并控制页面，参见 [Service Worker 安全上下文要求](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorker)。

没有配置手机可达的正式受信 HTTPS 入口，未做 Android 实机验收。当前回环入口不对公网或 LAN 开放，也不将桌面模拟结果表述为实机通过。

## 实际验收与独立证据

成功运行：本地 `P:\VCPKF\vcp\artifacts\native-sync-r7\run-1792663319084`，远端 `/home/admin/VCPKF/vcp/artifacts/native-sync-r7/run-1792663319084`。

1. 正式 Windows A 原生保存两条消息，PWA 配对后从中央日志看到同一话题和完整消息。
2. PWA 正常输入/发送，服务器持久接受；整个 Chrome 进程退出后，独立服务端检查执行仍为 running。随后后台完成并保存回复，重开 Chrome 自动恢复已配对会话及消息/执行状态。
3. 561 字符多行中文文本原样保留，`<b>` 在 PWA 中按文本显示。相同 requestId 重试不增加消息、任务或模型执行；localStorage/sessionStorage 为 0，HttpOnly Cookie 不可被 document.cookie 读取，Service Worker API cache 项为 0。
4. 显式取消运行中的执行，原 ToolBox 模型请求被级联中止；没有发布助手回复。另一个 queued 请求跨完整宿主退出/重启继续完成；配对会话仍可恢复。取消不是随手机断开自动发生。
5. Windows B 通过原有 NativeSync 拉取手机发起的同一段会话，在正式界面显示服务器回复；A 再打开也一致。同步关闭及插件关闭对照均保持原生单机保存。
6. 独立只读 SQLite 检查：integrity_check=ok、messages/journal/appliedOps 均为 7，A/B canonical 哈希一致、cursor=7、Outbox=0、pending 为空。3 个任务为两完成、一取消，临时意图清空，只有一个认证会话；数据都在同一个 central.sqlite。
7. 独立合成模型审计：3 次真实 HTTP 请求、2 次完成、1 次中止，每次都看到原 AgentManager 提供的合成 Agent 提示，模型均为 r7-synthetic；请求正文哈希对应完整原始文本。没有真实 provider 调用。
8. 3 次完整 ToolBox、5 次正式 VCPChat、3 次 Chrome 均正常退出码 0；宿主完整 Phase 0–10 和日志关闭已保存，端口/PID 退出在独立证明中核对。

图片在成功运行根：`pwa-accepted-running.png`、`pwa-reconnected-after-restart.png`、`windows-B-mobile-conversation.png`、`sync-off-single-machine.png`、`plugin-disabled-single-machine.png`。前三份分别是实际桌面移动视口与正式 Windows Renderer，不是设计稿。

主回执 `artifacts/native-sync-r7/LATEST_R7_RECEIPT.json`；同一运行根含 `R7_APP_RECEIPT.json`、`MOBILE_ACCEPTANCE.json`、`INDEPENDENT_EXECUTION_STORAGE_PROOF.json`、`FULL_HOST_LOG_INDEX.json` 及完整宿主日志。`EXECUTED_SOURCE_VERIFICATION.json` 逐项核对 7 份产品/预加载源码及 6 份前端静态产物与实际运行副本哈希一致。凭据、配对码、Cookie 值和 TLS 私钥均不进入回执；浏览器 profile 为私有实验运行态，不读取或提交其内容。

## 复现与回归

首次准备前端依赖：把 `apps/mobile/package.json` 和 `package-lock.json` 放入 `P:\VCPKF\vcp\artifacts\native-sync-r7\frontend-deps`，在该 prefix 执行 `npm ci --ignore-scripts --no-audit --no-fund`。当前依赖已就绪；`node scripts/build-mobile-pwa.cjs` 在 ToolBox R7 工作树构建到新的 artifacts 子目录，每次检查静态产物无服务端凭据。完整验收命令会先自动构建，不读取陈旧 UI 产物。

在 VCPChat R7 工作树执行：

```powershell
npm run test:native-sync-r7
npm run test:native-sync-r6 -- --regress-current-toolbox
npm run test:native-sync-r2
node --test tests/native-sync-r4-lifecycle.test.cjs
```

ToolBox R7 定向检查：设置既有 R3/R2 sidecar `NODE_PATH`，执行 `node --test tests/mobile-execution.test.cjs tests/native-sync-plugin.test.cjs`。9 项通过，覆盖提交/结果持久化间隙恢复、显式取消传输、HTTPS/伪造代理/Origin/Scope/配对重用拒绝，以及原 5 项插件回归。

R6 完整回归使用 **本 R7 ToolBox 新代码、移动功能关闭配置**，通过 8 次完整应用、4 次完整宿主及原重启/Outbox/cursor/pending/群聊/关闭对照。R2 389 项 Node（含原型 13 项）与 7 项原生 Electron、2 项传输生命周期测试均通过。

边界：仅文本、显式测试话题、串行执行；单次执行上下文最多 200 条。异常中断的模型调用可重试，最终消息用稳定 opId 保证防重，不宣称真实工具副作用恰好一次。没有语音、图片、复杂离线编辑、完整 Agent 管理、配置同步、VCPMobile 迁移、生产部署、真实数据/provider、Rust CDS 修改或公网端口。Android 实机及正式 HTTPS 发布需另行验收。
