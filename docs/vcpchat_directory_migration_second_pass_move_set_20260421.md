# VCPChat Directory Migration Second-Pass Move Set

> Date: 2026-04-21
> Scope: `VCPChat directory migration`
> Stage: second-pass candidate
> Status: Draft

## 目标

在第一批验证成功后，第二批继续把 `Themesmodules`、`Translatormodules` 移入 legacy 归集目录：

- `Themesmodules` -> `Desktopmodules/legacy/Themesmodules`
- `Translatormodules` -> `Desktopmodules/legacy/Translatormodules`

迁移目标仍保持“仅改目录归属，不改业务逻辑”。

## 受限原则

- 仅移动上述两个目录和必需的路径引用更新。
- 不迁移 `Promptmodules`、`Groupmodules`、`Musicmodules`、`Voicechatmodules`。
- 不动 AppData 运行时文件与 `.env` / `config.env` 本地边界。

## 预计收益

- 为主题与翻译窗口提供统一的 legacy 托管位置，减少根目录污染。
- 在不扩大面向外的改动前提下，继续验证目录归集能力。

## 迁移边界

- 迁移集：`Themesmodules`，`Translatormodules`
- 伴随更新：仅 runtime loader 中对上述路径的引用（见参考表面文档）
- 禁止项：无关文档清理、功能重构、环境文件提交
