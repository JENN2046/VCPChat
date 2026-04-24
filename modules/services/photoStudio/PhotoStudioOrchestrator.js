const fs = require('fs');
const path = require('path');
const actionCatalog = require('./actionCatalog');
const { getAllowedTransitions } = require('./projectStateMachine');
const { analyzeProjectRisk } = require('./riskAnalyzer');
const { createUiHints, hintsForProject } = require('./uiHints');

const DEFAULT_TOOLBOX_ROOT = 'A:\\VCP\\VCPToolBox-photo-studio-next';
const DEFAULT_VCPCHAT_ROOT = 'A:\\VCP\\VCPChat';
const REGISTRY_RELATIVE_PATH = path.join('plugins', 'registry.json');
const STORE_RELATIVE_PATH = path.join('plugins', 'custom', 'shared', 'photo_studio_data', 'PhotoStudioDataStore.js');
const TOOLBOX_DATA_RELATIVE_PATH = path.join('plugins', 'custom', 'shared', 'photo_studio_data');

class PhotoStudioOrchestrator {
    constructor(options = {}) {
        this.toolboxRoot = options.toolboxRoot || DEFAULT_TOOLBOX_ROOT;
        this.vcpChatRoot = options.vcpChatRoot || DEFAULT_VCPCHAT_ROOT;
        this.dataRoot = path.join(this.vcpChatRoot, 'AppData', 'PhotoStudioShadowData');
        this.registry = this.#readRegistry();
        this.#ensureShadowDataRoot();
        this.pluginCache = new Map();
        this.store = this.#loadStore();
    }

    async getDashboard() {
        const projects = this.store.listProjects();
        const projectCards = projects.map((project) => this.#toProjectCard(project));
        const riskProjects = projectCards.filter((project) => project.risk.level !== 'low');
        const missingFields = projectCards
            .filter((project) => project.risk.missing.length > 0)
            .map((project) => ({
                project_id: project.project_id,
                project_name: project.project_name,
                missing: project.risk.missing,
            }));
        const upcomingDelivery = projectCards
            .filter((project) => !!project.delivery_deadline)
            .sort((left, right) => String(left.delivery_deadline).localeCompare(String(right.delivery_deadline)))
            .slice(0, 5);

        return this.#success({
            metrics: {
                total_projects: projectCards.length,
                risk_projects_count: riskProjects.length,
                missing_fields_count: missingFields.length,
                upcoming_delivery_count: upcomingDelivery.length,
            },
            risk_projects: riskProjects,
            missing_fields: missingFields,
            upcoming_delivery: upcomingDelivery,
            projects: projectCards.slice(0, 8),
            reporting: {
                weekly_digest: await this.#pluginData('generate_weekly_project_digest', {}),
                prioritize_pending: await this.#pluginData('prioritize_pending_delivery_actions', {}),
                delivery_schedule: await this.#pluginData('generate_delivery_queue_schedule', {}),
            },
        }, createUiHints({ refresh: ['dashboard'] }));
    }

    async listProjects() {
        const projects = this.store.listProjects().map((project) => this.#toProjectCard(project));
        return this.#success(projects, createUiHints({ refresh: ['project_board'] }));
    }

    async getProject(projectId) {
        const project = this.store.getProject(projectId);
        if (!project) {
            return this.#failure('NOT_FOUND', 'project not found', 'projectId', { projectId });
        }

        return this.#success({
            project: this.#toProjectCard(project),
            tasks: this.store.getTasksByProject(projectId),
            logs: this.store.getStatusLog(projectId),
        }, createUiHints({
            refresh: ['project_drawer'],
            open_drawer_project_id: projectId,
        }));
    }

    async runAction(scene, action, payload = {}) {
        const sceneConfig = actionCatalog.actions[scene];
        if (!sceneConfig || !sceneConfig[action]) {
            return this.#failure('INVALID_ACTION', 'unsupported action', 'action', { scene, action });
        }

        const definition = sceneConfig[action];
        if (definition.type === 'plugin') {
            return this.#runPluginAction(definition.plugin, payload, { scene, action });
        }

        if (definition.type === 'composite' && definition.flow === 'createProjectWithTasks') {
            return this.#createProjectWithTasks(payload);
        }

        return this.#failure('INVALID_ACTION', 'unhandled action flow', 'action', { scene, action });
    }

    async refreshScene(scene, payload = {}) {
        if (scene === 'dashboard') {
            return this.getDashboard();
        }
        if (scene === 'project_board' || scene === 'projects') {
            return this.listProjects();
        }
        if (scene === 'project_drawer') {
            return this.getProject(payload.projectId);
        }
        if (scene === 'delivery') {
            return this.#success({
                summary: this.#pluginData('prioritize_pending_delivery_actions', {}),
            }, createUiHints({ refresh: ['delivery'] }));
        }
        return this.#failure('INVALID_SCENE', 'unsupported scene', 'scene', { scene });
    }

    async #createProjectWithTasks(payload) {
        const customerName = payload.customer_name || payload.customerName || 'Walk-in Customer';
        const projectName = payload.project_name || payload.projectName || `New Project ${new Date().toISOString().slice(0, 16)}`;
        const projectType = payload.project_type || payload.projectType || 'portrait';

        const customerResult = await this.#invokePlugin('create_customer_record', {
            customer_name: customerName,
            customer_type: payload.customer_type || 'individual',
            source: payload.source || 'other',
            source_channel: payload.source_channel || payload.source || 'other',
            contact_phone: payload.contact_phone || '',
            contact_wechat: payload.contact_wechat || '',
            notes: payload.customer_notes || '',
        });

        if (!customerResult.success && customerResult.error?.code !== 'CONFLICT') {
            return this.#fromPluginResult(customerResult);
        }

        const customerId = customerResult.data?.customer_id;
        const projectResult = await this.#invokePlugin('create_project_record', {
            customer_id: customerId,
            project_name: projectName,
            project_type: projectType,
            shoot_date: payload.shoot_date || '',
            location: payload.location || '',
            delivery_deadline: payload.delivery_deadline || '',
            notes: payload.project_notes || '',
        });

        if (!projectResult.success) {
            return this.#fromPluginResult(projectResult);
        }

        const projectId = projectResult.data?.project_id;
        const tasksResult = await this.#invokePlugin('create_project_tasks', {
            project_id: projectId,
            override_existing: false,
        });

        if (!tasksResult.success) {
            return this.#fromPluginResult(tasksResult);
        }

        return this.#success({
            customer: customerResult.data,
            project: projectResult.data,
            tasks: tasksResult.data,
        }, hintsForProject(projectId, ['dashboard', 'project_board', 'project_drawer'], '项目与任务已创建'));
    }

    async #runPluginAction(pluginName, payload, context) {
        const pluginPayload = this.#normalizePluginPayload(pluginName, payload, context);
        const result = await this.#invokePlugin(pluginName, pluginPayload);
        return this.#fromPluginResult(result, pluginName, pluginPayload);
    }

    #normalizePluginPayload(pluginName, payload, context) {
        if (pluginName === 'update_project_status') {
            return {
                project_id: payload.project_id || payload.projectId,
                new_status: payload.new_status || payload.status || 'preparing',
                reason: payload.reason || '',
            };
        }

        if (pluginName === 'generate_client_reply_draft') {
            return {
                project_id: payload.project_id || payload.projectId,
                context_type: payload.context_type || 'general',
                tone: payload.tone || 'warm',
                key_points: payload.key_points || '',
            };
        }

        if (pluginName === 'create_project_tasks') {
            return {
                project_id: payload.project_id || payload.projectId,
                override_existing: payload.override_existing === true,
            };
        }

        if (pluginName === 'archive_project_assets') {
            return {
                project_id: payload.project_id || payload.projectId,
                archive_mode: payload.archive_mode || 'shadow',
                archive_label: payload.archive_label || '',
            };
        }

        if (pluginName === 'create_selection_notice') {
            return {
                project_id: payload.project_id || payload.projectId,
                tone: payload.tone || 'warm',
            };
        }

        if (pluginName === 'create_delivery_tasks') {
            return {
                project_id: payload.project_id || payload.projectId,
                delivery_mode: payload.delivery_mode || 'digital delivery',
                override_existing: payload.override_existing === true,
            };
        }

        return payload;
    }

    #fromPluginResult(result, pluginName = '', pluginPayload = {}) {
        if (!result || typeof result !== 'object') {
            return this.#failure('PLUGIN_ERROR', 'plugin returned invalid result');
        }

        if (!result.success) {
            return this.#failure(
                result.error?.code || 'PLUGIN_ERROR',
                result.error?.message || 'plugin execution failed',
                result.error?.field || null,
                result.error?.details || {}
            );
        }

        const projectId = result.data?.project_id || pluginPayload.project_id || null;
        let toast = '操作已完成';
        let refresh = ['dashboard'];

        if (pluginName === 'update_project_status') {
            toast = '项目状态已更新';
            refresh = ['dashboard', 'project_board', 'project_drawer'];
        } else if (pluginName === 'generate_client_reply_draft') {
            toast = '客户回复草稿已生成';
            refresh = ['project_drawer'];
        } else if (pluginName === 'create_project_tasks') {
            toast = '项目任务已生成';
            refresh = ['project_board', 'project_drawer'];
        } else if (pluginName === 'archive_project_assets') {
            toast = '项目已归档';
            refresh = ['dashboard', 'project_board', 'project_drawer', 'delivery'];
        } else if (pluginName === 'create_selection_notice') {
            toast = '选片通知草稿已生成';
            refresh = ['delivery', 'project_drawer'];
        } else if (pluginName === 'create_delivery_tasks') {
            toast = '交付任务已生成';
            refresh = ['delivery', 'project_drawer'];
        }

        return this.#success(result.data, hintsForProject(projectId, refresh, toast));
    }

    async #invokePlugin(pluginName, payload) {
        const pluginModule = await this.#loadPlugin(pluginName);
        return pluginModule.processToolCall(payload, {});
    }

    async #pluginData(pluginName, payload) {
        const result = await this.#invokePlugin(pluginName, payload);
        return result && result.success ? result.data : {};
    }

    async #loadPlugin(pluginName) {
        if (this.pluginCache.has(pluginName)) {
            return this.pluginCache.get(pluginName);
        }

        const pluginEntry = this.registry.plugins.find((entry) => entry.name === pluginName);
        if (!pluginEntry) {
            throw new Error(`Photo Studio plugin "${pluginName}" is not registered.`);
        }

        const pluginPath = path.join(this.toolboxRoot, 'plugins', pluginEntry.path, 'src', 'index.js');
        const pluginModule = require(pluginPath);
        if (typeof pluginModule.initialize === 'function') {
            await pluginModule.initialize({
                DebugMode: false,
                PhotoStudioDataPath: this.dataRoot,
            }, {});
        }
        this.pluginCache.set(pluginName, pluginModule);
        return pluginModule;
    }

    #loadStore() {
        const storePath = path.join(this.toolboxRoot, STORE_RELATIVE_PATH);
        const store = require(storePath);
        if (typeof store.configureDataRoot === 'function') {
            store.configureDataRoot(this.dataRoot);
        }
        return store;
    }

    #readRegistry() {
        const registryPath = path.join(this.toolboxRoot, REGISTRY_RELATIVE_PATH);
        return JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    }

    #ensureShadowDataRoot() {
        fs.mkdirSync(this.dataRoot, { recursive: true });
        const sourceDir = path.join(this.toolboxRoot, TOOLBOX_DATA_RELATIVE_PATH);
        const jsonFiles = fs.readdirSync(sourceDir).filter((fileName) => fileName.endsWith('.json'));

        for (const fileName of jsonFiles) {
            const sourcePath = path.join(sourceDir, fileName);
            const targetPath = path.join(this.dataRoot, fileName);
            if (!fs.existsSync(targetPath)) {
                fs.copyFileSync(sourcePath, targetPath);
            }
        }
    }

    #toProjectCard(project) {
        const customer = project.customer_id ? this.store.getCustomer(project.customer_id) : null;
        return {
            project_id: project.project_id,
            customer_id: project.customer_id,
            customer_name: customer?.customer_name || '',
            project_name: project.project_name,
            project_type: project.project_type,
            status: project.status,
            delivery_deadline: project.delivery_deadline || project.due_date || '',
            allowed_transitions: getAllowedTransitions(project.status),
            risk: analyzeProjectRisk(project),
        };
    }

    #success(data, uiHints) {
        return {
            success: true,
            data,
            error: null,
            ui_hints: uiHints || createUiHints(),
        };
    }

    #failure(code, message, field = null, details = {}) {
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
}

module.exports = PhotoStudioOrchestrator;
