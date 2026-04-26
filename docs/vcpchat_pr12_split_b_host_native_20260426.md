# PR-B1 DesktopRemote / Codex Router Host 拆分说明

日期：2026-04-26

分支：`codex/pr12-host-native`

基线：`origin/custom`

来源：PR12 Draft 整合快照 `integration/upstream-main-vcp-20260425`

## 结论

本批次不再按“大宿主 PR”整包拆出，而是收窄为可独立审查、可独立回滚的 DesktopRemote / Codex Router Host 基础能力。

原因：

- PR12 中的宿主层文件已经和 Photo Studio、AI 生图入口、legacy 目录迁移混在一起。
- 如果直接整文件复制 `desktopHandlers.js`、`main.js`、`main.html` 等文件，会把业务入口和目录迁移一起带入。
- 这些混入内容应该分别进入 Photo Studio、AI image 实验线和 legacy 迁移批次，而不是放进宿主基础能力 PR。

## 本批次包含

- `modules/ipc/desktopRemoteHandlers.js`
- `modules/services/codexRouterDirectives.js`
- `modules/services/codexRouterHost.js`
- `modules/utils/vcpPathRoots.js`
- `preloads/chat.js`
- `preloads/desktop.js`
- `scripts/desktopremote-http-smoke.js`

## 本批次刻意不包含

- Photo Studio 入口、窗口、preload API、IPC handler 和 orchestrator。
- AI 生图入口、窗口、widget 和实验线文件。
- legacy 目录迁移。
- `main.js` / `main.html` 中的大范围路径迁移。
- Electron 打包变更。
- 生产线改动。

## 验证

已执行：

```text
node --check modules/ipc/desktopRemoteHandlers.js
node --check modules/services/codexRouterDirectives.js
node --check modules/services/codexRouterHost.js
node --check modules/utils/vcpPathRoots.js
node --check scripts/desktopremote-http-smoke.js
node --check preloads/chat.js
node --check preloads/desktop.js
git diff --check
```

结果：

- 语法检查通过。
- 空白检查通过。

未执行：

- DesktopRemote live HTTP smoke。
- Electron 手工拉起。
- Electron 打包。

未执行原因：

- 本批次先完成代码边界拆分和语法级验证。
- live smoke 需要桌面主进程与 DesktopRemote 端口处于运行状态，应作为推送前或 PR 检查后的单独验证步骤执行。

## 风险

- `modules/services/codexRouterHost.js` 是较大的新增服务文件，需要后续审查其运行边界和本地路径假设。
- 本批次仅暴露 preload 控制入口，不代表外部系统写入能力已经启用。
- 生产推广仍需单独预检。

## 下一步

- 本地提交后，先保持不推送。
- 如需创建 Draft PR，应明确 base 为 `custom`，并在 PR body 中说明本批次是 PR-B1，不是完整宿主迁移。
