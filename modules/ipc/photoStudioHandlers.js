const { ipcMain } = require('electron');
const windowService = require('../services/windowService');
const WINDOW_APP_IDS = require('../services/windowAppIds');
const { CHANNELS } = require('./ipcContracts');

const PROJECTS = [
    {
        project_id: 'proj_autumn_portrait',
        project_name: 'Autumn Portrait',
        customer_name: 'Lin Yu',
        project_type: 'portrait',
        status: 'confirmed',
        allowed_transitions: ['preparing', 'cancelled'],
        risk: {
            level: 'medium',
            reasons: ['missing:delivery_deadline'],
            missing: ['delivery_deadline'],
        },
        delivery_deadline: '',
        tasks: [
            { task_id: 'task_1', name: 'Confirm shot list', status: 'pending' },
            { task_id: 'task_2', name: 'Prepare wardrobe', status: 'pending' },
        ],
        logs: [
            { at: '2026-04-24 13:20', message: 'Project created' },
            { at: '2026-04-24 13:40', message: 'Customer confirmed date' },
        ],
    },
    {
        project_id: 'proj_family_session',
        project_name: 'Family Session',
        customer_name: 'Wang Chen',
        project_type: 'family',
        status: 'selection_pending',
        allowed_transitions: ['retouching', 'cancelled'],
        risk: {
            level: 'low',
            reasons: [],
            missing: [],
        },
        delivery_deadline: '2026-04-29',
        tasks: [
            { task_id: 'task_3', name: 'Selection notice', status: 'ready' },
            { task_id: 'task_4', name: 'Retouch shortlist', status: 'pending' },
        ],
        logs: [
            { at: '2026-04-23 10:10', message: 'Shoot completed' },
            { at: '2026-04-24 09:00', message: 'Waiting for selection' },
        ],
    },
    {
        project_id: 'proj_brand_launch',
        project_name: 'Brand Launch KV',
        customer_name: 'Studio North',
        project_type: 'commercial',
        status: 'delivering',
        allowed_transitions: ['completed'],
        risk: {
            level: 'high',
            reasons: ['delivery:external_sync_pending'],
            missing: [],
        },
        delivery_deadline: '2026-04-26',
        tasks: [
            { task_id: 'task_5', name: 'Export final assets', status: 'done' },
            { task_id: 'task_6', name: 'Sync external tracker', status: 'pending' },
        ],
        logs: [
            { at: '2026-04-22 18:00', message: 'Retouching approved' },
            { at: '2026-04-24 08:30', message: 'Delivery queue generated' },
        ],
    },
];

function createUiHints(overrides = {}) {
    return {
        refresh: [],
        toast: '',
        open_drawer_project_id: null,
        ...overrides,
    };
}

function success(data, uiHints = {}) {
    return {
        success: true,
        data,
        error: null,
        ui_hints: createUiHints(uiHints),
    };
}

function failure(code, message, field = null, details = {}) {
    return {
        success: false,
        data: null,
        error: {
            code,
            message,
            field,
            details,
        },
        ui_hints: createUiHints({ toast: '操作失败' }),
    };
}

function toProjectCard(project) {
    return {
        project_id: project.project_id,
        project_name: project.project_name,
        customer_name: project.customer_name,
        project_type: project.project_type,
        status: project.status,
        delivery_deadline: project.delivery_deadline,
        allowed_transitions: project.allowed_transitions,
        risk: project.risk,
    };
}

function buildDashboardPayload() {
    const riskProjects = PROJECTS.filter((project) => project.risk.level !== 'low').map(toProjectCard);
    const upcomingDelivery = PROJECTS.filter((project) => !!project.delivery_deadline).map(toProjectCard);

    return {
        metrics: {
            total_projects: PROJECTS.length,
            risk_projects_count: riskProjects.length,
            missing_fields_count: PROJECTS.filter((project) => project.risk.missing.length > 0).length,
            upcoming_delivery_count: upcomingDelivery.length,
        },
        risk_projects: riskProjects,
        missing_fields: PROJECTS
            .filter((project) => project.risk.missing.length > 0)
            .map((project) => ({
                project_id: project.project_id,
                project_name: project.project_name,
                missing: project.risk.missing,
            })),
        upcoming_delivery: upcomingDelivery,
        projects: PROJECTS.map(toProjectCard),
        reporting: {
            weekly_digest: {
                summary: '3 个样例项目已装入工作台骨架，等待 Orchestrator 接管真实数据。',
            },
            prioritize_pending: {
                items: [
                    '确认 Autumn Portrait 交付日期',
                    '推进 Family Session 选片结果',
                    '完成 Brand Launch 外部同步',
                ],
            },
            delivery_schedule: {
                next_due: upcomingDelivery.map((project) => ({
                    project_id: project.project_id,
                    project_name: project.project_name,
                    delivery_deadline: project.delivery_deadline,
                })),
            },
        },
    };
}

function getProjectPayload(projectId) {
    const project = PROJECTS.find((item) => item.project_id === projectId);
    if (!project) {
        return null;
    }

    return {
        project: toProjectCard(project),
        tasks: project.tasks,
        logs: project.logs,
    };
}

function runStubAction(scene, action, payload = {}) {
    if (action === 'create_project_draft') {
        const targetProject = PROJECTS[0];
        return success(
            {
                scene,
                action,
                payload,
                status: 'accepted',
            },
            {
                refresh: ['dashboard', 'project_board', 'project_drawer'],
                toast: '已创建占位项目草稿',
                open_drawer_project_id: targetProject.project_id,
            }
        );
    }

    if (action === 'advance_status') {
        const targetProject = PROJECTS.find((item) => item.project_id === payload.project_id) || PROJECTS[0];
        return success(
            {
                project_id: targetProject.project_id,
                status: payload.new_status || 'preparing',
            },
            {
                refresh: ['dashboard', 'project_board', 'project_drawer'],
                toast: '项目状态已更新',
                open_drawer_project_id: targetProject.project_id,
            }
        );
    }

    return success(
        {
            scene,
            action,
            payload,
            status: 'stubbed',
        },
        {
            refresh: ['dashboard'],
            toast: `已执行占位动作: ${action}`,
            open_drawer_project_id: payload.project_id || null,
        }
    );
}

function initialize() {
    ipcMain.handle(CHANNELS.PHOTO_STUDIO_OPEN, async () => {
        await windowService.open(WINDOW_APP_IDS.PHOTO_STUDIO);
        return {
            success: true,
            appId: WINDOW_APP_IDS.PHOTO_STUDIO,
        };
    });

    ipcMain.handle(CHANNELS.PHOTO_STUDIO_GET_DASHBOARD, async () => {
        return success(buildDashboardPayload(), {
            refresh: ['dashboard'],
        });
    });

    ipcMain.handle(CHANNELS.PHOTO_STUDIO_LIST_PROJECTS, async (_event, filters = {}) => {
        return success(PROJECTS.map(toProjectCard), {
            refresh: ['project_board'],
            filters,
        });
    });

    ipcMain.handle(CHANNELS.PHOTO_STUDIO_GET_PROJECT, async (_event, projectId) => {
        if (!projectId) {
            return failure('INVALID_INPUT', 'projectId is required', 'projectId');
        }

        const payload = getProjectPayload(projectId);
        if (!payload) {
            return failure('NOT_FOUND', 'project not found', 'projectId', { projectId });
        }

        return success(payload, {
            refresh: ['project_drawer'],
            open_drawer_project_id: projectId,
        });
    });

    ipcMain.handle(CHANNELS.PHOTO_STUDIO_RUN_ACTION, async (_event, request = {}) => {
        if (!request.scene || !request.action) {
            return failure('INVALID_INPUT', 'scene and action are required');
        }
        return runStubAction(request.scene, request.action, request.payload || {});
    });

    ipcMain.handle(CHANNELS.PHOTO_STUDIO_REFRESH_SCENE, async (_event, request = {}) => {
        const scene = request.scene || 'dashboard';

        if (scene === 'dashboard') {
            return success(buildDashboardPayload(), { refresh: ['dashboard'] });
        }

        if (scene === 'project_board' || scene === 'projects') {
            return success(PROJECTS.map(toProjectCard), { refresh: ['project_board'] });
        }

        if (scene === 'project_drawer') {
            const projectId = request.payload?.projectId || PROJECTS[0].project_id;
            const payload = getProjectPayload(projectId);
            if (!payload) {
                return failure('NOT_FOUND', 'project not found', 'projectId', { projectId });
            }
            return success(payload, {
                refresh: ['project_drawer'],
                open_drawer_project_id: projectId,
            });
        }

        if (scene === 'delivery') {
            return success(
                {
                    summary: 'delivery scene placeholder',
                },
                { refresh: ['delivery'] }
            );
        }

        return failure('INVALID_SCENE', 'unsupported scene', 'scene', { scene });
    });
}

module.exports = {
    initialize,
};
