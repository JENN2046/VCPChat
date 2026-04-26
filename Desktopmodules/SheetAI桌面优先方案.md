# SheetAI 桌面优先方案

## 背景

`SheetAI` 不是单独的办公插件，而是个人工作系统的一部分。

因此第一优先级不是做成传统菜单式表格软件，而是先适配 `VCPdesktop` 的使用方式：

- 可从 Dock 直接启动
- 可作为桌面工作流的一环被 AI 调起
- 后续可扩展为桌面挂件或工作台

## 产品定位

`SheetAI` 在桌面侧承担三类任务：

1. 个人数据工作台
2. AI 辅助表格编辑器
3. 与笔记、记忆、RAG、任务流联动的数据中间层

## 桌面优先原则

### 1. 先接入 VCPdesktop 启动体系

优先接入：

- `Desktopmodules/builtinWidgets/vchatApps.js`
- `modules/ipc/desktopHandlers.js`
- `desktop-launch-vchat-app`

目标是让 `SheetAI` 和笔记、Canvas、翻译、音乐一样，成为 VCP 官方桌面应用。

### 2. 先做“桌面工作流入口”，再做“完整表格器”

第一阶段更重要的是：

- 快速打开工作簿
- 从桌面启动日常数据任务
- 接 AI 做公式、汇总、分类

而不是先追求 Excel 全功能。

### 3. 优先服务个人工作系统

典型桌面场景：

- 收支/项目/任务台账
- 阅读记录和资料清单
- AI 生成日结、周结
- 从笔记提取结构化表格
- 从表格回写结论到笔记

## 推荐演进路径

### Phase 1

- Dock 启动 `SheetAI`
- 独立窗口工作台
- Workbook CRUD
- CSV/XLSX 导入导出
- AI 公式生成
- AI 总结

### Phase 2

- 桌面小挂件
- 最近工作簿卡片
- 待办/台账/日报面板
- 与 `Memo` / `Notes` / `RAG` 联动

### Phase 3

- `DESKTOP_PUSH` 直接生成表格型挂件
- 桌面端 `Sheet` 视图快照
- AI 自动刷新个人仪表盘

## 当前代码落点

已建立：

- `Sheetmodules/` 独立窗口壳
- `modules/ipc/sheetHandlers.js`
- `VCPToolBox` 侧 `/admin_api/sheetai/*` 骨架

已补齐桌面入口：

- `vchatApps.js` 中注册 `SheetAI`
- `desktopHandlers.js` 支持 `open-sheet-window`

下一步建议：

1. 让 `SheetAI` 窗口读取 `/admin_api/sheetai/workbooks`
2. 做最近工作簿列表
3. 做桌面侧 “SheetAI 启动卡片” 挂件
