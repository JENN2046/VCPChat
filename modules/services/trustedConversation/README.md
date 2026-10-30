# Generic native conversation binding

本地配置驱动候选已经接线：VCPChat 原生输入捕获 → 主进程 IPC → ToolBox 原有认证后的本机 HTTP 入口 → 原生 stdio 插件 → JSO HTTP/SQLite → 原有 VChart。普通明确指令直办；提案在普通消息展示后一次自然确认。保留原文绑定、持久 opID、CAS、同 ID 异内容拒绝、取消和原 ID 回执恢复。没有专用 JSO 登录条、Owner 窗口或新身份注册服务。

ToolBox 必须有最小宿主修改：server.js 路由注册、Plugin.js 每调用 stdio 上下文和新 nativeConversationTransport.js。宿主保留既有凭据，子进程只拿短期本机调用 capability；没有改变外部插件环境过滤、vcp_chat.c2 或 external-direct/hybrid 准入策略。测试用临时 core 插件注册，不能据此声称外部管理目录已获准生产启用。

可信终端是假设：既有 JSO 认证会话、可信主进程及本机输入采集共同关联原文；role:user、human=true、窗口焦点或 schema 本身不证明本人或自然语言语义。模型仅可读取/预览，不能自行授权写入。现有凭据从明确的环境变量引用传入宿主，不创建或迁移真实凭据。

配置默认只读；完整本地链要求显式 native-direct-and-confirm、资源/分钟范围、私有 journal 路径、已有 assistant subject 与默认资源，以及客户端通用 binding。进程异常遗留 journal 锁会拒绝继续写入，需操作者核查无活动进程后恢复；不自动破锁。未知提交仅查原 opID，不重复提交。

通过 VCPCHAT_NATIVE_TOOL_BINDING_FILE 选择 docs/native-conversation-binding.example.json 格式。applicationAuthorizationEnv 引用既有 Bearer 会话字符串，transportTokenEnv 引用既有 ToolBox 凭据。未配置时普通聊天保持原流程；配置后会话校验失败返回聊天错误，不回落模型执行。提案以普通文本展示并由主进程核对展示原文。

本轮修复：已配置链的传输异常留在本地；默认只读策略允许普通聊天，认证失败仍拒绝。已提交业务的图表投影失败由现有30秒恢复计时器重试，按图表和版本去重，不重新提交业务写。待投影队列仅在当前主进程内存中，进程退出后不承诺自动恢复。

先前人工直办及受控提案确认（JSO/回执/VChart rev8/11）属于先前提交的验收，不是本修复提交的新人工或模型验收。本轮只有合成回归，没有新增模型请求。

WS候选：使用 docs/native-conversation-websocket.example.json 的transport选择既有分布式连接；不修改模型/API/WS设置，分布式连接须已启用且为可信WSS（或本机隔离测试WS）。clientInstanceId是安装时为每个独立profile生成的非秘密UUID，仅定位回执journal，不是凭据；示例值仅供合成测试，不能多设备共用。主进程重启可按同一namespace读回执，旧连接的方案和输入资格不恢复。断线旧方案须重新提议与展示，网络不会重发execute。本人授权仍引用现有JSO身份，不能由模型/插件字段创建。

当前合并基线保留 #59 的冷启动输入消费、持久失效队列和窗口重建重试。WS 连接变化额外清除主进程待处理输入/方案及物理输入缓存，并拒绝跨连接晚到的 prepare/propose/presented 结果；HTTP 绑定不受无关 WS 重连影响。WS 失败不会自动改走 HTTP。

可选的本机核验记录由 `VCPCHAT_NATIVE_SESSION_STATUS_FILE`（既有目录内的绝对 JSON 路径）与
`VCPCHAT_NATIVE_SESSION_OPERATION_ID`（本次启动的非秘密 UUID）开启。只有 `status` / `recover`
响应会更新记录；它仅包含固定协议名、启动操作与客户端 UUID、主进程 PID、通道类型、检查时间、
请求类型及核验结果，不保存凭据、服务端原始响应或业务内容。网络和协议错误记为不可用，且不改变原错误对象或重试语义。
记录表示该主进程最近一次收到成功的 Owner 会话核验结果，不表示此刻仍在线、客户端已获生产准入、
本人已确认任何业务动作或写入已启用。不能用该文件授权、恢复旧确认资格或替代原操作回执。

启动时，main.js 在导入其他服务前将所配置的 Bearer 引用收入进程内存，并移除可继承的 Owner 环境变量。
托管启动器向环境诊断/版本探测子进程传递去除 Owner 凭据后的环境副本，真正的 Electron 主进程仍接收一次性引用。
凭据不写入绑定 JSON、状态记录或持久系统环境；退出后的下一次受控启动须重新提供既有 Owner 会话。
