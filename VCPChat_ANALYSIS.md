# VCPChat 深度探索文档 (Living Document)

本文件用于记录对 VCPChat 前端引擎的分析过程、认知演进和技术细节。VCPChat 不仅仅是一个聊天客户端，而是一个打通 AI-UI-App 边界的分布式全栈底层引擎。

## 1. 核心架构全景 (Architectural Overview)

### 1.1 进程模型
VCPChat 采用了典型的 Electron 三层架构，但通过高度的虚拟化封装实现了能力解耦：
- **主进程 (`main.js`)**: 系统调度中心。负责生命周期管理、原生资源调用（如 Rust 音频引擎）、分布式节点通信以及复杂的 IPC 路由分发。
- **预加载层 (`preloads/utility.js`)**: 权限隔离桥梁。通过 `contextBridge` 将主进程的能力封装为语义化的 `utilityAPI`，并实现了一套基于白名单的权限隔离机制 (`ALLOWED_KEYS`)。
- **渲染进程 (`renderer.js`)**: UI 编排中心。采用模块化初始化流，将功能拆分为 `chatManager`, `messageRenderer`, `itemListManager` 等独立模块。

### 1.2 通信协议 (The API Virtualization)
VCPChat 将所有的 IPC 通信标准化为三种原语，彻底消除了前端对具体频道名称的依赖：
- **`command`**: 触发操作 $\rightarrow$ 无需返回值 $\rightarrow$ `ipcRenderer.send`
- **`query`**: 请求数据 $\rightarrow$ 等待 Promise $\rightarrow$ `ipcRenderer.invoke`
- **`subscription`**: 事件驱动 $\rightarrow$ 回调响应 $\rightarrow$ `ipcRenderer.on`

---

## 2. 流式渲染引擎 (Streaming Rendering Engine)

这是 VCPChat 最核心的技术竞争力，实现了在超长对话下的极致流畅度。

### 2.1 性能优化三层架构
1. **视图签名 (View Signature)**: 通过 `agentId-topicId` 快速判定消息是否在当前可见区域。非可见区域的消息仅在内存累积，完全不触发 DOM 操作。
2. **全局渲染循环 (Global Render Loop)**: 采用 `requestAnimationFrame` 实现统一的 30FPS 渲染帧率，避免了由于 AI token 高频输出导致的浏览器重绘风暴。
3. **智能分块 (Intelligent Chunking)**: 将字符流转化为语义块（词/短语），在保证视觉流畅的同时降低渲染频率。

### 2.2 差分更新机制 (The MorphDOM Pipeline)
采用 $\text{Stable} \rightarrow \text{Tail}$ 的分层渲染结构：
- **稳定区 (`vcp-stream-stable-root`)**: 存放已闭合的结构（如完整代码块、工具请求块）。一旦确定为稳定，则锁定不再更新。
- **尾端区 (`vcp-stream-tail-root`)**: 使用 `morphdom` 进行外科手术式的局部更新。
- **状态保留钩子**: 在 `onBeforeElUpdated` 中实现了极其精细的控制：
    - **媒体锁定**: 正在播放的 `<video>`/`<audio>` 被禁止更新，防止播放中断。
    - **动画继承**: 强制保留 `fade-in` 等类名，确保流式生成时的视觉连续性。
    - **内容脉冲**: 当块级元素内容增长超过阈值时，触发 `vcp-stream-content-pulse` 动画，模拟“生长感”。

---

## 3. Canvas 协同工作区 (Collaborative Workspace)

Canvas 将聊天体验升级为协同创作，实现了 AI 与用户在同一文档中的无缝协作。

### 3.1 同步与冲突解决
- **弱一致性同步**: 采用 $\text{本地编辑} \rightarrow \text{防抖保存 (2000ms)} \rightarrow \text{后端同步} \rightarrow \text{前端监听更新}$ 的闭环。
- **冲突检测机制**: 当 AI 修改文件时，触发 `onExternalFileChanged`。系统通过 `externalChangeBar` 通知用户，并将 AI 内容暂存于 `externalFileContent`，避免直接覆盖用户编辑。
- **Diff 视图**: 采用 `CodeMirror.MergeView` 实现。用户通过 `Accept` (执行 `setValue`) 或 `Reject` (执行 `saveCanvasFile` 强制覆盖回后端) 来决定最终版本。

### 3.2 版本回溯系统
- **内存快照**: 在本地维护 `filesHistory` 映射表 (`{ [path]: Array<{content, timestamp}> }`)。每次保存或初始化加载时记录快照。
- **可视化时间轴**: 用户点击历史条目 $\rightarrow$ `editor.setValue` $\rightarrow$ 触发自动保存 $\rightarrow$ 生成新版本，实现无缝回溯。

### 3.3 沙盒执行能力
- **Python 穿透**: 调用 `api.executePythonCode` $\rightarrow$ 主进程启动 Python 子进程 $\rightarrow$ 实时回传 `stdout/stderr` $\rightarrow$ 前端 `alert` 或日志显示。
- **多模态预览**: 针对 `.md` 和 `.html` 文件，调用 `api.openTextInNewWindow` 在独立渲染窗口中实现实时预览。

---

### 4.1 VCPDesktop 桌面操控链路
- **指令拦截**: `streamManager.js` 拦截 `<<<[DESKTOP_PUSH]>>>` $\rightarrow$ `<<<[DESKTOP_PUSH_END]>>>` 标记块。
- **双模工作流**:
    - **创建模式 (Create)**: 验证 HTML 前缀 $\rightarrow$ `electronAPI.desktopPush({action: 'create'})` $\rightarrow$ 每 100ms `append` 增量内容 $\rightarrow$ `finalize` 锁定。
    - **替换模式 (Replace)**: 解析 `target:「始」...「末」` 与 `replace:「始」...「末」` $\rightarrow$ 主进程向指定 Widget 窗口发送 DOM 修改指令 $\rightarrow$ 执行 `document.querySelector().innerHTML = content`。
- **鲁棒性设计**:
    - **反引号保护**: 忽略被 `` ` `` 包裹的标签，防止代码示例误触发。
    - **空闲超时**: 150s 无 token 自动 `finalize` 或丢弃，防止桌面残留半成品。

### 4.2 心流锁 (Flow Lock)
- **本质**: 一套 AI 自驱动的“引导 $\rightarrow$ 续写”闭环系统。
- **能力集**:
    - **状态控制**: `start`/`stop` 自动续写循环。
    - **提示词操控**: 通过 `promptee` (追加)、`edit` (diff修改)、`remove` (删除)、`clear` (清空) 精准操纵输入框内容，从而引导 AI 下一次的生成方向。
    - **感知能力**: `get` 获取当前输入框内容，`status` 获取心流锁运行状态。
- **视觉反馈**: 触发 UI 发光动画（正弦波动 + 心跳），标识当前处于 AI 自主创作模式。

---

## 6. 分布式能力与记忆增强 (Distributed & Memory)

### 6.1 VCPDistributedServer 分布式架构
- **混合通信链路**:
    - **WebSocket (主控)**: 负责 `execute_tool` 指令下发、本机 IP 报告及静态占位符实时同步。
    - **HTTP/Express (诊断)**: 实现 `/pw=<key>/desktop-remote-test` 路由，支持快速测试桌面控制链路。
- **注入式处理器 (Injected Handlers)**: 分布式服务器通过接收 `main.js` 注入的闭包函数（如 `handleDesktopRemoteControl`），实现了“分布触发 $\rightarrow$ 本地 UI 执行”的跨进程闭环。
- **静态占位符同步**: 每 30s 定期推送本地环境变量至主服务器，使 AI 能感知本地实时状态。

### 6.2 DeepMemo 记忆检索流水线
- **三级检索架构**:
    - **粗排 (Coarse)**: `node-jieba` 中文分词 $\rightarrow$ `flexsearch` 内存索引 $\rightarrow$ 快速定位潜在片段。
    - **上下文窗口 (Windowing)**: 提取命中点前后 $\pm N$ 行对话，确保语义完整。
    - **精排 (Rerank)**: 采用递归分批策略 $\rightarrow$ 外部 Rerank API 打分 $\rightarrow$ 锦标赛排序 (Tournament Sort) $\rightarrow$ 筛选 Top-N 最相关回忆。
- **鲁棒性设计**: 实现 `stripAnsi` 等清理函数，剔除终端控制符；支持 `BlockedKeywords` 屏蔽词过滤。

### 6.3 PTYShellExecutor 超级终端
- **终端仿真**: 引入 `xterm-headless` 在 Node.js 中模拟终端缓冲区，将复杂的 ANSI 序列转化为纯净文本。
- **异步任务管理**: 实现 `AsyncTaskManager`，支持并发控制、任务状态持久化及 `_finalized` 标志防止取消死锁。
- **环境硬化**: 强制禁用所有 Pager (如 `less`, `more`)，确保 shell 命令直接输出全量文本，避免 AI 陷入交互等待。

---

## 5. 探索日志 (Log)
- **2026-04-13**: 开始 VCPChat 探索，分析 `README.md` 确认系统定位。
- **2026-04-13**: 拆解 `main.js` $\rightarrow$ `preload.js` $\rightarrow$ `renderer.js` 启动链路，还原 API 虚拟化层。
- **2026-04-13**: 深度拆解 `streamManager.js`，还原 MorphDOM 差分渲染与 30FPS 全局循环机制。
- **2026-04-13**: 拆解 `Canvasmodules/canvas.js`，还原基于文件系统的协作同步与 Diff 冲突解决逻辑。
