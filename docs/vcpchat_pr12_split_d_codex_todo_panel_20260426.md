# PR-D Codex TODO / Plan 面板拆分说明

日期：2026-04-26

分支：`codex/pr12-codex-todo-panel`

基线：`origin/custom`

来源：PR12 Draft 整合快照 `integration/upstream-main-vcp-20260425`

## 结论

本批次只拆出 Codex TODO / Plan 面板渲染能力。

PR12 中同一组渲染文件还包含“工具结果渲染架构修复”，但该改动风险更高、审查维度不同，因此本批次刻意不包含。

## 本批次包含

- `modules/renderer/contentPipeline.js`
- `styles/messageRenderer.css`

## 本批次刻意不包含

- `modules/messageRenderer.js`
- VCP Tool Result 独立渲染架构修复。
- 新增专用 smoke 脚本或长期测试工具。
- Photo Studio 功能代码。
- DesktopRemote / Codex Router Host。
- legacy 目录迁移。
- 生产线改动。

## 功能说明

新增两种 TODO 面板输入形式：

```text
<<<[CODEX_TODO]>>>
title: 下一步
- [x] 已完成项
- [-] 进行中项
- [ ] 待处理项
<<<[END_CODEX_TODO]>>>
```

也支持 Markdown 标题后的任务列表：

```markdown
## Plan
- [x] 已完成项
- [-] 进行中项
- [ ] 待处理项
```

渲染后会生成 `.vcp-codex-todo-panel` 卡片，并显示已完成、进行中、待处理计数。

## 验证

已执行：

```text
node --check modules/renderer/contentPipeline.js
git diff --check
```

结果：

```text
语法检查和 diff 检查通过。
```

## 风险

- 该能力位于消息内容预处理流水线，会影响匹配到 `## Plan`、`## TODO`、`## 计划`、`## 待办` 后紧跟任务列表的消息。
- 本批次不改变普通 Markdown 列表；只有标题命中且后续确实存在列表项时才转换。
- 本批次不改工具结果渲染，避免扩大审查范围。
- 本批次不新增长期 smoke 脚本，避免为拆分工作重复造测试工具；桌面视觉验收留到 PR 检查阶段执行。

## 下一步

- 本地提交后，先保持不推送。
- 如需创建 Draft PR，应明确 base 为 `custom`。
- 工具结果渲染架构修复应单独开后续 PR。
