# VCPChat Directory Migration Fifth Batch PR Plan

> Date: 2026-04-21  
> Branch: `feature/vcpchat-ai-image-split`  
> Scope: `VCPChat directory migration`  
> Stage: fifth-batch PR packaging

## 1) 目标

把已完成的第 1~4 批目录迁移收拢成一条可审阅、可回滚的 PR 说明与提交范围。  
本批次不再新增目录移动，只做交付收口与 PR 包装。

## 2) 冻结范围

- 包含提交：
  - `chore(vcpchat): migrate first-pass legacy modules`
  - `chore(vcpchat): migrate second-pass legacy modules`
  - `chore(vcpchat): migrate third-pass directory modules to legacy`
  - `chore(vcpchat): close out fourth-pass directory migration`
- 包含文档：
  - `docs/vcpchat_directory_migration_fourth_pass_move_set_20260421.md`
  - `docs/vcpchat_directory_migration_fourth_pass_reference_surface_20260421.md`
  - `docs/vcpchat_directory_migration_fourth_pass_closeout_summary_20260421.md`
  - `docs/vcpchat_directory_migration_fifth_batch_pr_body_20260421.md`
- 排除项：
  - `VCPDistributedServer/Plugin/DeepMemo/config.env`
  - `VCPDistributedServer/Plugin/FileOperator/.env`
  - 与迁移无关的功能开发 / 发布动作

## 3) PR 包装要求

- PR 标题：`chore(vcpchat): finalize directory migration sweep`
- 基线：`main`（或当前协作主干）
- 提交区间：`293eb2b..eb1361b`
- 回滚锚点：回退到 `eb1361b` 前一提交，或按需 `git revert` 回退这 4 个迁移提交。
- 不引入运行时行为变更，仅结构与引用收口。

## 4) Review Checklist

1. 明确迁移模块：`Promptmodules`、`Groupmodules`、`Musicmodules`、`Voicechatmodules`
2. 明确更新文件：`main.html`, `main.js`, `modules/ipc/*`, `renderer.js`, `modules/speechRecognizer.js`, `modules/utils/appSettingsManager.js`, `modules/renderer/domBuilder.js`
3. 明确 live env 边界：两份本地文件不入库
4. 明确回滚路径与边界
5. 明确下一阶段 scope：剩余目录的下一次迁移另起批次

## 5) 产出

- 第一屏（5 行）与完整 PR 正文已经生成在：
  - [A:/VCP/VCPChat/docs/vcpchat_directory_migration_fifth_batch_pr_body_20260421.md](/A:/VCP/VCPChat/docs/vcpchat_directory_migration_fifth_batch_pr_body_20260421.md)
- PR 发起前快速自检：
  - `git status --short`（确认 env 未入提交）
  - `git diff --stat`（确认仅迁移路径与引用更新）
  - 工作树历史与提交链可逆
