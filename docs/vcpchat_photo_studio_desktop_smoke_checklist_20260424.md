# VCPChat Photo Studio Desktop Smoke Checklist 2026-04-24

## Scope

This checklist is for the current `Photo Studio` draft PR on the VCPChat side.

Covered layers:
- desktop launcher entry
- managed window boot
- Photo Studio workbench shell
- VCPChat-side orchestrator adapter
- VCPToolBox plugin execution through `AppData/PhotoStudioShadowData`

Out of scope:
- moving shared orchestrator code back into VCPToolBox
- full visual polish for reporting cards
- exhaustive regression across unrelated desktop apps

## Preconditions

1. Start VCPChat desktop from the repository root:
   ```powershell
   npm run start:desktop
   ```
2. Confirm the app launches without an immediate main-process crash.
3. Use the current branch that contains PR #9 updates.

## Smoke Path A: Open Photo Studio Window

1. Open the desktop app launcher area that lists VChat apps.
2. Find `Photo Studio`.
3. Click it once.

Expected:
- a managed desktop window opens
- title area shows `Photo Studio`
- left navigation shows `Dashboard / Inquiry / Projects / Delivery`
- right drawer initially shows waiting-for-project copy

## Smoke Path B: Dashboard

1. Stay on `Dashboard`.
2. Confirm the top status chip changes away from the initial shell text.
3. Confirm metric cards render.
4. Confirm the risk-project area renders either cards or an empty state.

Expected:
- no blank white scene
- no visible renderer crash
- dashboard content comes from the real orchestrator adapter path

## Smoke Path C: Create Project From Projects Scene

1. Click `Projects`.
2. In `Quick Create`, enter:
   - customer name
   - project name
   - optional type / deadline / location
3. Click `创建项目与任务`.

Expected:
- toast appears or status changes
- project list refreshes
- new project card appears
- right drawer may auto-open through `ui_hints`
- latest action result block shows a successful payload

## Smoke Path D: Project Drawer Actions

1. Open any project card through `查看详情`.
2. In the right drawer, click:
   - `生成回复草稿`
   - `补建任务`
3. If `推进到下一状态` is enabled, click it once.

Expected:
- each action updates the latest action result block
- drawer refreshes after action
- status/log/task areas update without reopening the whole window

## Smoke Path E: Inquiry Scene

### Create Customer

1. Click `Inquiry`.
2. In `Create Customer`, fill:
   - customer name
   - source from the dropdown
3. Submit the form.

Expected:
- action succeeds
- no `source must be one of ...` error

### Generate Reply Draft

1. Keep a valid project selected in the drawer, or paste a valid project id.
2. Submit `Generate Reply Draft`.

Expected:
- action succeeds
- latest action result shows returned draft payload

## Smoke Path F: Delivery Scene

### Guardrails

1. Click `Delivery`.
2. Inspect at least two project cards in different statuses if available.

Expected:
- `生成选片通知` is enabled only for `shot / selection_pending`
- `生成交付任务` is enabled only for `retouching / delivering / completed`
- helper text explains why a disabled action is unavailable

### Happy Path

1. Pick a project already at `retouching` or later.
2. Click `生成交付任务`.

Expected:
- action succeeds
- latest action result updates
- no contract error toast

## Known Validation Facts From CLI

These have already been validated outside the GUI:

- `create_project_draft` succeeds
- project status can advance from `lead` to `retouching`
- `create_delivery_tasks` succeeds at `retouching`
- `create_selection_notice` requires `shot` or `selection_pending`
- `create_customer` succeeds when `source` uses the allowed enum

## Current Known Gaps

- Electron click-through validation is still manual
- delivery scene currently reuses the general project list instead of a dedicated filtered delivery board
- reporting visuals are functional but not yet product-polished

## Suggested Record After Manual Smoke

Capture:
- pass/fail for each smoke path
- screenshot if the window fails to render
- exact action and project status if any button produces an unexpected contract error
