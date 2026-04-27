# PR-C Photo Studio 工作台拆分说明

日期：2026-04-26

分支：`codex/pr12-photo-studio`

基线：`origin/custom`

来源：PR12 Draft 整合快照 `integration/upstream-main-vcp-20260425`

## 结论

本批次将 Photo Studio 工作台从 PR12 Draft 中单独拆出，形成可审查、可回滚的业务功能 PR。

本 PR 只包含：

- Photo Studio 前端工作台文件。
- Photo Studio 本地编排器和动作目录。
- Photo Studio smoke / 数据卫生脚本。
- 必要的宿主挂载点、preload API、窗口 app id、VChat app 入口。
- 打包白名单中对 `Desktopmodules/**/*` 的必要补充。

## 本批次包含

- `Desktopmodules/photoStudio/**`
- `modules/services/photoStudio/**`
- `scripts/photo-studio-closeout-smoke.js`
- `scripts/photo-studio-prune-shadow-data.js`
- `modules/ipc/desktopHandlers.js`
- `preloads/desktop.js`
- `modules/services/windowAppIds.js`
- `Desktopmodules/builtinWidgets/vchatApps.js`
- `package.json`

## 本批次刻意不包含

- AI 生图入口、窗口、widget 和实验线文件。
- Codex Router Host / DesktopRemote PR-B1 的服务文件。
- legacy 目录迁移。
- `main.js` / `main.html` 中的大范围路径迁移。
- `start:utf8` / `start:desktop:utf8` 等启动脚本补充。
- `Sheetmodules/**/*` 打包白名单变化。
- 真实外部系统写入。
- 生产线改动。

## 验证

已执行：

```text
node --check modules/ipc/desktopHandlers.js
node --check preloads/desktop.js
node --check Desktopmodules/photoStudio/photoStudio.js
node --check Desktopmodules/photoStudio/services/photoStudioEvents.js
node --check Desktopmodules/photoStudio/services/photoStudioState.js
node --check modules/services/photoStudio/PhotoStudioOrchestrator.js
node --check modules/services/photoStudio/actionCatalog.js
node --check modules/services/photoStudio/projectStateMachine.js
node --check modules/services/photoStudio/riskAnalyzer.js
node --check modules/services/photoStudio/shadowDataHygiene.js
node --check modules/services/photoStudio/uiHints.js
node --check scripts/photo-studio-closeout-smoke.js
node --check scripts/photo-studio-prune-shadow-data.js
npm run test:photo-studio
```

结果：

- 语法检查通过。
- Photo Studio closeout smoke 通过：`25/25 passed`。

未执行：

- Electron 手工拉起。
- Electron 打包。
- 生产线预检或合并。

## 边界说明

Photo Studio 当前仍是本地影子数据工作台：

- 新增实体写入本地 `AppData/PhotoStudioShadowData`。
- 不写 Notion、钉钉、网盘、日历等真实外部系统。
- 外部同步和归档仍保留安全边界。

## 风险

- `Desktopmodules/photoStudio/photoStudio.js` 文件较大，建议重点审查 UI 状态流和按钮动作映射。
- `modules/services/photoStudio/PhotoStudioOrchestrator.js` 是业务主编排器，建议重点审查状态流、影子数据写入边界和错误返回。
- 本 PR 不包含最终视觉大改，只是当前可验收工作台版本。

## 下一步

- 本地提交后，先保持不推送。
- 如需创建 Draft PR，应明确 base 为 `custom`。
- 后续视觉大改、外部系统真实写入、生产推广都应单独开批次。
