const fs = require('fs');
const path = require('path');
const actionCatalog = require('./actionCatalog');
const { getAllowedTransitions } = require('./projectStateMachine');
const { analyzeProjectRisk } = require('./riskAnalyzer');
const { createUiHints, hintsForProject } = require('./uiHints');
const { analyzeShadowData } = require('./shadowDataHygiene');

const DEFAULT_TOOLBOX_ROOT = 'A:\\VCP\\VCPToolBox-photo-studio-next';
const DEFAULT_VCPCHAT_ROOT = 'A:\\VCP\\VCPChat';
const REGISTRY_RELATIVE_PATH = path.join('plugins', 'registry.json');
const STORE_RELATIVE_PATH = path.join('plugins', 'custom', 'shared', 'photo_studio_data', 'PhotoStudioDataStore.js');
const TOOLBOX_DATA_RELATIVE_PATH = path.join('plugins', 'custom', 'shared', 'photo_studio_data');
const LEADS_FILENAME = 'leads.json';
const QUOTES_FILENAME = 'quotes.json';
const DELIVERY_PACKAGES_FILENAME = 'delivery_packages.json';
const SHADOW_OBJECT_FILES = [LEADS_FILENAME, QUOTES_FILENAME, DELIVERY_PACKAGES_FILENAME];
const DELIVERY_PACKAGE_TRANSITIONS = Object.freeze({
    ready: ['sent'],
    sent: ['acknowledged'],
    acknowledged: [],
});

function createRequestId() {
    return `req_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

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
            all_projects: projectCards,
            projects: projectCards.slice(0, 8),
            reporting: {
                weekly_digest: await this.#pluginData('generate_weekly_project_digest', {}),
                prioritize_pending: await this.#pluginData('prioritize_pending_delivery_actions', {}),
                delivery_schedule: await this.#pluginData('generate_delivery_queue_schedule', {}),
                shadow_hygiene: this.#buildShadowDataHygieneReport(),
            },
        }, createUiHints({ refresh: ['dashboard'] }));
    }

    async listProjects() {
        const projects = this.store.listProjects().map((project) => this.#toProjectCard(project));
        return this.#success(projects, createUiHints({ refresh: ['project_board'] }));
    }

    async #updateProject(payload) {
        const projectId = String(payload.project_id || payload.projectId || '').trim();
        if (!projectId) {
            return this.#failure('MISSING_REQUIRED_FIELD', '缺少项目编号', 'project_id');
        }

        const currentProject = this.store.getProject(projectId);
        if (!currentProject) {
            return this.#failure('NOT_FOUND', '未找到对应项目', 'project_id', { project_id: projectId });
        }

        const nextProjectName = String(payload.project_name || payload.projectName || currentProject.project_name || '').trim();
        if (!nextProjectName) {
            return this.#failure('MISSING_REQUIRED_FIELD', 'project_name is required', 'project_name');
        }

        const nextProjectType = String(payload.project_type || payload.projectType || currentProject.project_type || 'portrait').trim();
        const nextDeliveryDeadline = String((payload.delivery_deadline ?? payload.due_date ?? currentProject.delivery_deadline) || '').trim();
        const nextShootDate = String((payload.shoot_date ?? currentProject.shoot_date) || '').trim();
        const nextLocation = String((payload.location ?? currentProject.location) || '').trim();
        const nextNotes = String((payload.project_notes ?? payload.notes ?? payload.remark ?? currentProject.notes ?? currentProject.remark) || '').trim();

        const updatedProject = this.store.updateProject(projectId, {
            project_name: nextProjectName,
            project_type: nextProjectType,
            shoot_date: nextShootDate,
            delivery_deadline: nextDeliveryDeadline,
            due_date: nextDeliveryDeadline,
            location: nextLocation,
            notes: nextNotes,
            remark: nextNotes,
        });

        if (!updatedProject) {
            return this.#failure('NOT_FOUND', '未找到对应项目', 'project_id', { project_id: projectId });
        }

        this.store.appendStatusLog({
            project_id: projectId,
            old_status: currentProject.status,
            new_status: currentProject.status,
            reason: '项目基础信息已更新',
            changed_by: 'photo_studio',
        });

        const refreshed = await this.getProject(projectId);
        if (!refreshed.success) {
            return refreshed;
        }

        return this.#success({
            project_id: projectId,
            ...refreshed.data,
        }, hintsForProject(projectId, ['project_command', 'project_drawer'], '项目已更新'));
    }

    async getProject(projectId) {
        const project = this.store.getProject(projectId);
        if (!project) {
            return this.#failure('NOT_FOUND', '未找到对应项目', 'projectId', { projectId });
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
        if ((scene === 'schedule_board' || scene === 'schedule') && action === 'create_booking') {
            return this.#createBooking(payload);
        }
        if ((scene === 'schedule_board' || scene === 'schedule') && action === 'update_booking_time') {
            return this.#updateBookingTime(payload);
        }
        if ((scene === 'schedule_board' || scene === 'schedule') && action === 'start_booking') {
            return this.#updateBookingStatus(payload, 'in_progress');
        }
        if ((scene === 'schedule_board' || scene === 'schedule') && action === 'complete_booking') {
            return this.#updateBookingStatus(payload, 'completed');
        }

        const sceneConfig = actionCatalog.actions[scene];
        if (!sceneConfig || !sceneConfig[action]) {
            return this.#failure('INVALID_ACTION', '当前动作暂不支持', 'action', { scene, action });
        }

        const definition = sceneConfig[action];
        if (definition.type === 'plugin') {
            return this.#runPluginAction(definition.plugin, payload, { scene, action, definition });
        }

        if (definition.type === 'selector') {
            return this.#runSelectorAction(definition.method, payload);
        }

        if (definition.type === 'composite' && definition.flow === 'createProjectWithTasks') {
            return this.#createProjectWithTasks(payload);
        }

        if (definition.type === 'todo') {
            return this.#failure('TODO_ACTION', definition.reason || 'planned but not implemented', 'action', { scene, action });
        }

        return this.#failure('INVALID_ACTION', 'unhandled action flow', 'action', { scene, action });
    }

    async refreshScene(scene, payload = {}) {
        if (scene === 'dashboard' || scene === 'home') {
            return this.getDashboard();
        }
        if (scene === 'project_board' || scene === 'projects' || scene === 'project_command') {
            return this.listProjects();
        }
        if (scene === 'inquiry' || scene === 'client_leads') {
            return this.#success({
                projects: (await this.listProjects()).data,
                leads: (await this.#listLeads()).data,
                quotes: (await this.#listQuotes()).data,
            }, createUiHints({ refresh: ['client_leads'] }));
        }
        if (scene === 'schedule' || scene === 'schedule_board') {
            return this.#listBookings();
        }
        if (scene === 'project_drawer') {
            return this.getProject(payload.project_id || payload.projectId);
        }
        if (scene === 'delivery' || scene === 'delivery_assets' || scene === 'delivery_panel') {
            return this.#success({
                delivery_packages: (await this.#listDeliveryPackages()).data,
                priority_queue: await this.#pluginData('prioritize_pending_delivery_actions', {}),
                delivery_schedule: await this.#pluginData('generate_delivery_queue_schedule', {}),
                audit_trail: await this.#pluginData('inspect_delivery_audit_trail', {}),
            }, createUiHints({ refresh: ['delivery_assets'] }));
        }
        return this.#failure('INVALID_SCENE', 'unsupported scene', 'scene', { scene });
    }

    async #runSelectorAction(method, payload = {}) {
        if (method === 'getDashboard') {
            return this.getDashboard();
        }
        if (method === 'listProjects') {
            return this.listProjects(payload);
        }
        if (method === 'getProject') {
            return this.getProject(payload.project_id || payload.projectId);
        }
        if (method === 'updateProject') {
            return this.#updateProject(payload);
        }
        if (method === 'listBookings') {
            return this.#listBookings();
        }
        if (method === 'createBooking') {
            return this.#createBooking(payload);
        }
        if (method === 'updateBookingTime') {
            return this.#updateBookingTime(payload);
        }
        if (method === 'startBooking') {
            return this.#updateBookingStatus(payload, 'in_progress');
        }
        if (method === 'completeBooking') {
            return this.#updateBookingStatus(payload, 'completed');
        }
        if (method === 'checkScheduleConflicts') {
            return this.#checkScheduleConflicts();
        }
        if (method === 'listLeads') {
            return this.#listLeads(payload);
        }
        if (method === 'createLead') {
            return this.#createLead(payload);
        }
        if (method === 'listQuotes') {
            return this.#listQuotes(payload);
        }
        if (method === 'createQuote') {
            return this.#createQuote(payload);
        }
        if (method === 'inspectShadowDataHygiene') {
            return this.inspectShadowDataHygiene(payload);
        }
        if (method === 'listDeliveryPackages') {
            return this.#listDeliveryPackages(payload);
        }
        if (method === 'getDeliveryPackage') {
            return this.#getDeliveryPackage(payload);
        }
        if (method === 'createDeliveryPackage') {
            return this.#createDeliveryPackage(payload);
        }
        if (method === 'updateDeliveryPackageStatus') {
            return this.#updateDeliveryPackageStatus(payload);
        }
        return this.#failure('INVALID_ACTION', 'unsupported selector', 'action', { method });
    }

    async #listLeads(payload = {}) {
        const projectId = String(payload.project_id || payload.projectId || '').trim();
        const leads = Object.values(this.#readShadowObjectFile(LEADS_FILENAME))
            .filter((lead) => !projectId || lead.project_id === projectId)
            .map((lead) => this.#toLeadCard(lead))
            .sort((left, right) => String(right.updated_at || '').localeCompare(String(left.updated_at || '')));

        return this.#success({
            summary: {
                total_leads: leads.length,
                new_count: leads.filter((lead) => lead.status === 'new').length,
                contacted_count: leads.filter((lead) => lead.status === 'contacted').length,
                quoted_count: leads.filter((lead) => lead.status === 'quoted').length,
            },
            leads: leads.slice(0, 30),
            audit_text: leads.length ? `读取到 ${leads.length} 条本地线索记录。` : '当前没有读取到本地线索记录。',
        }, createUiHints({ refresh: ['client_leads'], toast: '线索读取完成' }));
    }

    async #createLead(payload = {}) {
        const projectId = String(payload.project_id || payload.projectId || '').trim();
        const project = projectId ? this.store.getProject(projectId) : null;
        if (projectId && !project) {
            return this.#failure('NOT_FOUND', '未找到对应项目', 'project_id', { project_id: projectId });
        }

        const customerId = String(payload.customer_id || payload.customerId || project?.customer_id || '').trim();
        const customer = customerId ? this.store.getCustomer(customerId) : null;
        const customerName = String(payload.customer_name || customer?.customer_name || project?.project_name || '').trim();
        if (!customerName && !projectId) {
            return this.#failure('MISSING_REQUIRED_FIELD', '客户名或项目编号至少要提供一个', 'customer_name');
        }

        const sourceChannel = String(payload.source_channel || payload.source || 'manual').trim();
        const intentType = String(payload.intent_type || payload.project_type || project?.project_type || 'general').trim();
        const leadKey = String(payload.lead_key || `lead:${projectId || customerName.toLowerCase()}:${sourceChannel}:${intentType}`).trim();
        const leads = this.#readShadowObjectFile(LEADS_FILENAME);
        const existing = Object.values(leads).find((lead) => lead.lead_key === leadKey) || null;
        const now = new Date().toISOString();
        const leadId = existing?.lead_id || this.store.generateId('lead');
        const record = {
            lead_id: leadId,
            lead_key: leadKey,
            project_id: projectId,
            customer_id: customerId,
            customer_name: customerName,
            source_channel: sourceChannel,
            intent_type: intentType,
            budget_range: payload.budget_range || existing?.budget_range || '',
            status: payload.status || existing?.status || 'new',
            priority: payload.priority || existing?.priority || 'medium',
            note: payload.note || payload.notes || existing?.note || '',
            sync_state: 'local_shadow',
            created_at: existing?.created_at || now,
            updated_at: now,
        };

        leads[leadId] = record;
        this.#writeShadowObjectFile(LEADS_FILENAME, leads);

        return this.#success({
            ...this.#toLeadCard(record),
            is_new: !existing,
        }, createUiHints({
            refresh: ['client_leads', 'home'],
            open_drawer_id: projectId || null,
            toast: existing ? '本地线索已更新' : '本地线索已创建',
        }));
    }

    async #listQuotes(payload = {}) {
        const projectId = String(payload.project_id || payload.projectId || '').trim();
        const quotes = Object.values(this.#readShadowObjectFile(QUOTES_FILENAME))
            .filter((quote) => !projectId || quote.project_id === projectId)
            .map((quote) => this.#toQuoteCard(quote))
            .sort((left, right) => String(right.updated_at || '').localeCompare(String(left.updated_at || '')));

        return this.#success({
            summary: {
                total_quotes: quotes.length,
                draft_count: quotes.filter((quote) => quote.status === 'draft').length,
                sent_count: quotes.filter((quote) => quote.status === 'sent').length,
                accepted_count: quotes.filter((quote) => quote.status === 'accepted').length,
            },
            quotes: quotes.slice(0, 30),
            audit_text: quotes.length ? `读取到 ${quotes.length} 条本地报价记录。` : '当前没有读取到本地报价记录。',
        }, createUiHints({ refresh: ['client_leads'], toast: '报价读取完成' }));
    }

    async #createQuote(payload = {}) {
        const projectId = String(payload.project_id || payload.projectId || '').trim();
        if (!projectId) {
            return this.#failure('MISSING_REQUIRED_FIELD', '缺少项目编号', 'project_id');
        }

        const project = this.store.getProject(projectId);
        if (!project) {
            return this.#failure('NOT_FOUND', '未找到对应项目', 'project_id', { project_id: projectId });
        }

        const quoteType = String(payload.quote_type || 'standard').trim();
        const quoteKey = String(payload.quote_key || `quote:${projectId}:${quoteType}`).trim();
        const quotes = this.#readShadowObjectFile(QUOTES_FILENAME);
        const existing = Object.values(quotes).find((quote) => quote.quote_key === quoteKey) || null;
        const now = new Date().toISOString();
        const quoteId = existing?.quote_id || this.store.generateId('quote');
        const amount = Number(payload.amount || existing?.amount || 0);
        const record = {
            quote_id: quoteId,
            quote_key: quoteKey,
            project_id: projectId,
            customer_id: project.customer_id || '',
            quote_type: quoteType,
            amount,
            currency: payload.currency || existing?.currency || 'CNY',
            status: payload.status || existing?.status || 'draft',
            valid_until: payload.valid_until || existing?.valid_until || '',
            note: payload.note || payload.notes || existing?.note || '',
            sync_state: 'local_shadow',
            created_at: existing?.created_at || now,
            updated_at: now,
        };

        quotes[quoteId] = record;
        this.#writeShadowObjectFile(QUOTES_FILENAME, quotes);

        return this.#success({
            ...this.#toQuoteCard(record),
            is_new: !existing,
        }, createUiHints({
            refresh: ['client_leads', 'project_drawer'],
            open_drawer_id: projectId,
            toast: existing ? '本地报价已更新' : '本地报价已创建',
        }));
    }

    async inspectShadowDataHygiene(_payload = {}) {
        return this.#success(this.#buildShadowDataHygieneReport(), createUiHints({ refresh: ['home'] }));
    }

    async #listDeliveryPackages(payload = {}) {
        const projectId = String(payload.project_id || payload.projectId || '').trim();
        const packages = Object.values(this.#readDeliveryPackages())
            .filter((deliveryPackage) => !projectId || deliveryPackage.project_id === projectId)
            .map((deliveryPackage) => this.#toDeliveryPackageCard(deliveryPackage))
            .sort((left, right) => String(right.updated_at || '').localeCompare(String(left.updated_at || '')));

        const byStatus = packages.reduce((summary, deliveryPackage) => {
            summary[deliveryPackage.status] = (summary[deliveryPackage.status] || 0) + 1;
            return summary;
        }, {});

        return this.#success({
            summary: {
                total_packages: packages.length,
                local_shadow_count: packages.filter((deliveryPackage) => deliveryPackage.sync_state === 'local_shadow').length,
                ready_count: packages.filter((deliveryPackage) => deliveryPackage.status === 'ready').length,
                sent_count: packages.filter((deliveryPackage) => deliveryPackage.status === 'sent').length,
                acknowledged_count: packages.filter((deliveryPackage) => deliveryPackage.status === 'acknowledged').length,
            },
            packages: packages.slice(0, 30),
            by_status: byStatus,
            audit_text: packages.length
            ? `读取到 ${packages.length} 个本地交付包记录。`
            : '当前没有读取到本地交付包记录。',
        }, createUiHints({
            refresh: ['delivery_assets'],
            toast: '交付包读取完成',
        }));
    }

    async #getDeliveryPackage(payload = {}) {
        const deliveryPackageId = String(payload.delivery_package_id || payload.deliveryPackageId || '').trim();
        if (!deliveryPackageId) {
            return this.#failure('MISSING_REQUIRED_FIELD', '缺少交付包编号', 'delivery_package_id');
        }

        const deliveryPackage = this.#readDeliveryPackages()[deliveryPackageId];
        if (!deliveryPackage) {
            return this.#failure('NOT_FOUND', '未找到对应交付包', 'delivery_package_id', { delivery_package_id: deliveryPackageId });
        }

        return this.#success(this.#toDeliveryPackageCard(deliveryPackage), createUiHints({
            refresh: ['delivery_assets'],
            open_drawer_id: deliveryPackage.project_id,
            toast: '交付包读取完成',
        }));
    }

    async #createDeliveryPackage(payload = {}) {
        const projectId = String(payload.project_id || payload.projectId || '').trim();
        if (!projectId) {
            return this.#failure('MISSING_REQUIRED_FIELD', '缺少项目编号', 'project_id');
        }

        const project = this.store.getProject(projectId);
        if (!project) {
            return this.#failure('NOT_FOUND', '未找到对应项目', 'project_id', { project_id: projectId });
        }

        const packageType = String(payload.package_type || 'client_delivery').trim();
        const packageKey = String(payload.package_key || `delivery_package:${projectId}:${packageType}`).trim();
        const deliveryPackages = this.#readDeliveryPackages();
        const existing = Object.values(deliveryPackages).find((item) => item.package_key === packageKey) || null;
        const now = new Date().toISOString();
        const deliveryPackageId = existing?.delivery_package_id || this.store.generateId('delpkg');
        const record = {
            delivery_package_id: deliveryPackageId,
            package_key: packageKey,
            project_id: projectId,
            customer_id: project.customer_id || '',
            package_type: packageType,
            package_label: payload.package_label || project.project_name || projectId,
            status: payload.status || existing?.status || 'ready',
            delivery_channel: payload.delivery_channel || existing?.delivery_channel || 'local_shadow',
            selection_notice_ready: Boolean(payload.selection_notice_ready ?? true),
            delivery_tasks_ready: Boolean(payload.delivery_tasks_ready ?? true),
            asset_count: Number(payload.asset_count || existing?.asset_count || 0),
            note: payload.note || existing?.note || '',
            sync_state: 'local_shadow',
            created_at: existing?.created_at || now,
            updated_at: now,
        };

        deliveryPackages[deliveryPackageId] = record;
        this.#writeDeliveryPackages(deliveryPackages);

        return this.#success({
            ...this.#toDeliveryPackageCard(record),
            is_new: !existing,
        }, createUiHints({
            refresh: ['delivery_assets', 'project_drawer'],
            open_drawer_id: projectId,
            toast: existing ? '本地交付包已更新' : '本地交付包已创建',
        }));
    }

    async #updateDeliveryPackageStatus(payload = {}) {
        const deliveryPackageId = String(payload.delivery_package_id || payload.deliveryPackageId || '').trim();
        const projectId = String(payload.project_id || payload.projectId || '').trim();
        const deliveryPackages = this.#readDeliveryPackages();
        const deliveryPackage = deliveryPackageId
            ? deliveryPackages[deliveryPackageId]
            : Object.values(deliveryPackages).find((item) => item.project_id === projectId);

        if (!deliveryPackage) {
            return this.#failure('NOT_FOUND', '未找到对应交付包', deliveryPackageId ? 'delivery_package_id' : 'project_id', {
                delivery_package_id: deliveryPackageId,
                project_id: projectId,
            });
        }

        const currentStatus = deliveryPackage.status || 'ready';
        const nextStatus = String(payload.status || payload.next_status || DELIVERY_PACKAGE_TRANSITIONS[currentStatus]?.[0] || '').trim();
        if (!nextStatus) {
            return this.#failure('INVALID_TRANSITION', '当前交付包没有可推进的下一个状态', 'status', {
                current_status: currentStatus,
                allowed_transitions: DELIVERY_PACKAGE_TRANSITIONS[currentStatus] || [],
            });
        }

        const allowedTransitions = DELIVERY_PACKAGE_TRANSITIONS[currentStatus] || [];
        if (!allowedTransitions.includes(nextStatus)) {
            return this.#failure('INVALID_TRANSITION', `交付包状态不能从 ${currentStatus} 推进到 ${nextStatus}`, 'status', {
                current_status: currentStatus,
                requested_status: nextStatus,
                allowed_transitions: allowedTransitions,
            });
        }

        const now = new Date().toISOString();
        const updated = {
            ...deliveryPackage,
            status: nextStatus,
            status_note: payload.note || deliveryPackage.status_note || '',
            sent_at: nextStatus === 'sent' ? now : deliveryPackage.sent_at || '',
            acknowledged_at: nextStatus === 'acknowledged' ? now : deliveryPackage.acknowledged_at || '',
            sync_state: 'local_shadow',
            updated_at: now,
        };

        deliveryPackages[updated.delivery_package_id] = updated;
        this.#writeDeliveryPackages(deliveryPackages);

        return this.#success({
            ...this.#toDeliveryPackageCard(updated),
            previous_status: currentStatus,
            new_status: nextStatus,
        }, createUiHints({
            refresh: ['delivery_assets', 'project_drawer'],
            open_drawer_id: updated.project_id,
            toast: nextStatus === 'acknowledged' ? '本地交付包已确认' : '本地交付包已标记发送',
        }));
    }

    async #listBookings() {
        const projectCards = this.store.listProjects().map((project) => this.#toProjectCard(project));
        const bookings = projectCards.flatMap((project) => {
            const events = this.store.getCalendarEventsByProject(project.project_id) || [];
            return events.map((event) => ({
                ...event,
                project_id: project.project_id,
                project_name: project.project_name,
                customer_name: project.customer_name,
                project_status: project.status,
            }));
        }).sort((left, right) => String(left.start_at || left.event_date || left.date || '').localeCompare(String(right.start_at || right.event_date || right.date || '')));

        const bySurface = bookings.reduce((summary, booking) => {
            const surface = booking.calendar_surface || booking.surface || 'unknown';
            summary[surface] = (summary[surface] || 0) + 1;
            return summary;
        }, {});

        return this.#success({
            summary: {
                total_projects_checked: projectCards.length,
                total_bookings: bookings.length,
                local_shadow_count: bookings.filter((booking) => booking.sync_state === 'local_shadow').length,
                surface_count: Object.keys(bySurface).length,
            },
            bookings: bookings.slice(0, 20),
            by_surface: bySurface,
            audit_text: bookings.length
            ? `读取到 ${bookings.length} 条本地排期记录。`
            : '当前没有读取到本地排期记录。',
        }, createUiHints({
            refresh: ['schedule_board'],
            toast: '排期记录读取完成',
        }));
    }

    async #createBooking(payload = {}) {
        const projectId = String(payload.project_id || payload.projectId || '').trim();
        if (!projectId) {
            return this.#failure('MISSING_REQUIRED_FIELD', '缺少项目编号', 'project_id');
        }

        const project = this.store.getProject(projectId);
        if (!project) {
            return this.#failure('NOT_FOUND', '未找到对应项目', 'project_id', { project_id: projectId });
        }

        const bookingType = String(payload.booking_type || 'shoot').trim();
        const bookingDate = String(payload.booking_date || payload.event_date || '').trim();
        if (!bookingDate) {
            return this.#failure('MISSING_REQUIRED_FIELD', 'booking_date is required', 'booking_date');
        }

        const startTime = String(payload.start_time || '').trim();
        const eventKey = [
            'booking',
            projectId,
            bookingType,
            bookingDate,
            startTime || 'all_day',
        ].join(':');

        const { record, existing } = this.store.upsertCalendarEvent({
            project_id: projectId,
            calendar_surface: 'photo_studio_schedule',
            event_key: eventKey,
            event_type: bookingType,
            event_date: bookingDate,
            start_time: startTime,
            duration_minutes: Number(payload.duration_minutes || 120),
            location: payload.location || project.location || '',
            note: payload.note || '',
            status: payload.status || 'scheduled',
            sync_state: 'local_shadow',
        });

        return this.#success({
            ...record,
            project_name: project.project_name,
            customer_id: project.customer_id,
            is_new: !existing,
        }, createUiHints({
            refresh: ['schedule_board'],
            open_drawer_id: projectId,
            toast: existing ? '本地预约已更新' : '本地预约已创建',
        }));
    }

    async #updateBookingTime(payload = {}) {
        const projectId = String(payload.project_id || payload.projectId || '').trim();
        const eventKey = String(payload.event_key || '').trim();
        if (!projectId) {
            return this.#failure('MISSING_REQUIRED_FIELD', '缺少项目编号', 'project_id');
        }
        if (!eventKey) {
            return this.#failure('MISSING_REQUIRED_FIELD', 'event_key is required', 'event_key');
        }

        const booking = (this.store.getCalendarEventsByProject(projectId) || [])
            .find((event) => event.event_key === eventKey);
        if (!booking) {
            return this.#failure('NOT_FOUND', 'booking not found', 'event_key', { project_id: projectId, event_key: eventKey });
        }

        const bookingDate = String(payload.booking_date || payload.event_date || booking.event_date || '').trim();
        if (!bookingDate) {
            return this.#failure('MISSING_REQUIRED_FIELD', 'booking_date is required', 'booking_date');
        }

        const { record } = this.store.upsertCalendarEvent({
            ...booking,
            event_key: eventKey,
            event_date: bookingDate,
            start_time: String(payload.start_time ?? booking.start_time ?? '').trim(),
            duration_minutes: Number(payload.duration_minutes || booking.duration_minutes || 120),
            location: payload.location ?? booking.location ?? '',
            note: payload.note ?? booking.note ?? '',
            status: booking.status || 'scheduled',
            sync_state: 'local_shadow',
        });

        return this.#success({
            ...record,
            is_new: false,
        }, createUiHints({
            refresh: ['schedule_board'],
            open_drawer_id: projectId,
            toast: '本地预约已改期',
        }));
    }

    async #updateBookingStatus(payload = {}, nextStatus = 'scheduled') {
        const projectId = String(payload.project_id || payload.projectId || '').trim();
        const eventKey = String(payload.event_key || '').trim();
        if (!projectId) {
            return this.#failure('MISSING_REQUIRED_FIELD', '缺少项目编号', 'project_id');
        }
        if (!eventKey) {
            return this.#failure('MISSING_REQUIRED_FIELD', 'event_key is required', 'event_key');
        }

        const booking = (this.store.getCalendarEventsByProject(projectId) || [])
            .find((event) => event.event_key === eventKey);
        if (!booking) {
            return this.#failure('NOT_FOUND', 'booking not found', 'event_key', { project_id: projectId, event_key: eventKey });
        }

        const { record } = this.store.upsertCalendarEvent({
            ...booking,
            status: nextStatus,
            sync_state: 'local_shadow',
        });

        return this.#success({
            ...record,
            is_new: false,
        }, createUiHints({
            refresh: ['schedule_board'],
            open_drawer_id: projectId,
            toast: nextStatus === 'completed' ? '本地预约已完成' : '本地预约已开始',
        }));
    }

    async #checkScheduleConflicts() {
        const projectCards = this.store.listProjects().map((project) => this.#toProjectCard(project));
        const scheduled = [];
        const missingDate = [];
        const todayKey = new Date().toISOString().slice(0, 10);

        projectCards.forEach((project) => {
            const dateValue = project.delivery_deadline || project.due_date || '';
            if (!dateValue) {
                missingDate.push(project);
                return;
            }

            const parsedDate = new Date(dateValue);
            if (Number.isNaN(parsedDate.getTime())) {
                missingDate.push(project);
                return;
            }

            scheduled.push({
                project,
                date_key: parsedDate.toISOString().slice(0, 10),
            });
        });

        const buckets = scheduled.reduce((map, entry) => {
            if (!map.has(entry.date_key)) {
                map.set(entry.date_key, []);
            }
            map.get(entry.date_key).push(entry.project);
            return map;
        }, new Map());

        const sameDayConflicts = [...buckets.entries()]
            .filter(([, projects]) => projects.length > 1)
            .map(([date, projects]) => ({
                date,
                project_count: projects.length,
                projects: projects.map((project) => ({
                    project_id: project.project_id,
                    project_name: project.project_name,
                    status: project.status,
                    customer_name: project.customer_name,
                })),
            }));

        const overdue = scheduled
            .filter((entry) => entry.date_key < todayKey && !['completed', 'archived', 'cancelled'].includes(entry.project.status))
            .map((entry) => ({
                project_id: entry.project.project_id,
                project_name: entry.project.project_name,
                status: entry.project.status,
                delivery_deadline: entry.project.delivery_deadline,
            }));

        return this.#success({
            summary: {
                total_projects_checked: projectCards.length,
                scheduled_projects: scheduled.length,
                missing_date_count: missingDate.length,
                same_day_conflict_count: sameDayConflicts.length,
                overdue_count: overdue.length,
            },
            same_day_conflicts: sameDayConflicts,
            missing_date_projects: missingDate.map((project) => ({
                project_id: project.project_id,
                project_name: project.project_name,
                status: project.status,
            })),
            overdue_projects: overdue,
            audit_text: sameDayConflicts.length || missingDate.length || overdue.length
                ? '排期检查完成，发现需要处理的风险项。'
                : '排期检查完成，当前没有发现同日冲突、缺日期或过期未闭环项目。',
        }, createUiHints({
            refresh: ['schedule_board'],
            toast: '排期冲突检查完成',
        }));
    }

    async #createProjectWithTasks(payload) {
        const customerName = payload.customer_name || payload.customerName || '到店客户';
        const projectName = payload.project_name || payload.projectName || `新项目 ${new Date().toISOString().slice(0, 16)}`;
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
        }, hintsForProject(projectId, ['home', 'project_command', 'project_drawer'], '项目与任务已创建'));
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

        if (pluginName === 'check_missing_project_fields') {
            return {
                project_id: payload.project_id || payload.projectId,
                include_recommended_fields: payload.include_recommended_fields !== false,
            };
        }

        if (pluginName === 'sync_to_external_sheet_or_notion') {
            return {
                project_id: payload.project_id || payload.projectId || '',
                target_type: payload.target_type || 'sheet',
                target_provider: payload.target_provider || 'dingtalk_ai_table',
                target_name: payload.target_name || 'photo_studio_project_inventory',
                include_closed_projects: payload.include_closed_projects !== false,
                note: payload.note || '',
            };
        }

        return payload;
    }

    #fromPluginResult(result, pluginName = '', pluginPayload = {}) {
        if (!result || typeof result !== 'object') {
            return this.#failure('PLUGIN_ERROR', '插件返回结果无效');
        }

        if (!result.success) {
            const localizedError = this.#normalizePluginErrorForUi(pluginName, result.error || {});
            return this.#failure(
                localizedError.code || 'PLUGIN_ERROR',
                localizedError.message || '插件执行失败',
                localizedError.field || null,
                localizedError.details || {}
            );
        }

        const localizedData = this.#normalizeDraftDataForUi(
            pluginName,
            this.#normalizeProjectAuditDataForUi(
                pluginName,
                this.#localizeDeliveryReportData(pluginName, result.data)
            )
        );
        const projectId = localizedData?.project_id || pluginPayload.project_id || null;
        let toast = '操作已完成';
        let refresh = ['home'];

        if (pluginName === 'update_project_status') {
            toast = '项目状态已更新';
            refresh = ['project_command', 'project_drawer'];
        } else if (pluginName === 'generate_client_reply_draft') {
            toast = '客户回复草稿已生成';
            refresh = ['project_drawer'];
        } else if (pluginName === 'create_project_tasks') {
            toast = '项目任务已生成';
            refresh = ['project_command', 'project_drawer'];
        } else if (pluginName === 'check_missing_project_fields') {
            toast = '缺失字段检查完成';
            refresh = ['project_drawer'];
        } else if (pluginName === 'archive_project_assets') {
            toast = '项目已归档';
            refresh = ['home', 'project_command', 'project_drawer', 'delivery_assets'];
        } else if (pluginName === 'create_selection_notice') {
            toast = '选片通知草稿已生成';
            refresh = ['delivery_assets', 'project_drawer'];
        } else if (pluginName === 'create_delivery_tasks') {
            toast = '交付任务已生成';
            refresh = ['delivery_assets', 'project_drawer'];
        } else if (pluginName === 'sync_to_external_sheet_or_notion') {
            toast = '外部同步记录已生成';
            refresh = ['delivery_assets', 'project_drawer'];
        } else if (pluginName === 'create_customer_record') {
            toast = '客户已创建';
            refresh = ['client_leads', 'home'];
        } else if (pluginName === 'create_followup_reminder') {
            toast = '跟进提醒已创建';
            refresh = ['client_leads', 'home', 'project_drawer'];
        } else if (pluginName === 'generate_delivery_queue_schedule'
            || pluginName === 'prioritize_pending_delivery_actions'
            || pluginName === 'inspect_delivery_audit_trail') {
            refresh = ['delivery_assets'];
        }

        const uiHints = hintsForProject(projectId, refresh, toast);
        if (pluginName === 'update_project_status') {
            uiHints.focus_scene = 'project_command';
        }
        if (pluginName === 'create_project_tasks') {
            uiHints.focus_scene = 'project_command';
        }

        return this.#success(localizedData, uiHints);
    }

    async #invokePlugin(pluginName, payload) {
        const pluginModule = await this.#loadPlugin(pluginName);
        return pluginModule.processToolCall(payload, {});
    }

    async #pluginData(pluginName, payload) {
        const result = await this.#invokePlugin(pluginName, payload);
        return result && result.success
            ? this.#normalizeDraftDataForUi(
                pluginName,
                this.#normalizeProjectAuditDataForUi(
                    pluginName,
                    this.#localizeDeliveryReportData(pluginName, result.data)
                )
            )
            : {};
    }

    async #loadPlugin(pluginName) {
        if (this.pluginCache.has(pluginName)) {
            return this.pluginCache.get(pluginName);
        }

        const pluginEntry = this.registry.plugins.find((entry) => entry.name === pluginName);
        if (!pluginEntry) {
            throw new Error(`影像工作台插件“${pluginName}”尚未注册。`);
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

        SHADOW_OBJECT_FILES.forEach((fileName) => {
            const filePath = path.join(this.dataRoot, fileName);
            if (!fs.existsSync(filePath)) {
                fs.writeFileSync(filePath, JSON.stringify({}, null, 2), 'utf8');
            }
        });
    }

    #readShadowObjectFile(fileName) {
        const filePath = path.join(this.dataRoot, fileName);
        try {
            return JSON.parse(fs.readFileSync(filePath, 'utf8'));
        } catch (_error) {
            return {};
        }
    }

    #writeShadowObjectFile(fileName, records) {
        const filePath = path.join(this.dataRoot, fileName);
        const tmpPath = `${filePath}.tmp`;
        fs.writeFileSync(tmpPath, JSON.stringify(records, null, 2), 'utf8');
        fs.renameSync(tmpPath, filePath);
    }

    #readDeliveryPackages() {
        return this.#readShadowObjectFile(DELIVERY_PACKAGES_FILENAME);
    }

    #writeDeliveryPackages(deliveryPackages) {
        this.#writeShadowObjectFile(DELIVERY_PACKAGES_FILENAME, deliveryPackages);
    }

    #buildShadowDataHygieneReport() {
        return analyzeShadowData(this.dataRoot);
    }

    #localizeSystemGeneratedText(value) {
        const text = String(value || '');
        return text
            .replace(/Walk-in Customer/g, '到店客户')
            .replace(/PR4 Smoke Customer/g, 'PR4 冒烟客户')
            .replace(/PR4 Delivery Customer/g, 'PR4 交付客户')
            .replace(/PR5 Inquiry Customer/g, 'PR5 跟进客户')
            .replace(/PR5 Delivery Customer/g, 'PR5 交付客户')
            .replace(/PR5 Delivery Flow Customer/g, 'PR5 交付流程客户')
            .replace(/PR4 Smoke Project/g, 'PR4 冒烟项目')
            .replace(/PR4 Delivery Project/g, 'PR4 交付项目')
            .replace(/PR5 Delivery Project/g, 'PR5 交付项目')
            .replace(/PR5 Delivery Flow Project/g, 'PR5 交付流程项目')
            .replace(/New Project/g, '新项目');
    }

    #localizeDeliveryToken(value) {
        const token = String(value || '').trim();
        const tokenMap = {
            ready_to_publish: '待发布',
            mark_queued: '标记入队',
            immediate: '立即处理',
            future: '后续处理',
            priority_queue: '优先队列',
            current_state_snapshot: '当前状态快照',
            record_created: '记录创建',
            missing_due_date: '缺少交付日期',
        };
        return tokenMap[token] || token;
    }

    #localizeDeliveryText(value) {
        return this.#localizeSystemGeneratedText(String(value || ''))
            .replace(/Photo Studio delivery queue schedule/g, '影像工作台交付排程预览')
            .replace(/Photo Studio delivery audit trail/g, '影像工作台交付日志')
            .replace(/Reference date:/g, '参考日期：')
            .replace(/Total records:/g, '记录总数：')
            .replace(/Actionable records:/g, '可处理记录：')
            .replace(/Immediate actions:/g, '立即处理：')
            .replace(/Future actions:/g, '后续处理：')
            .replace(/Failed:/g, '失败：')
            .replace(/Retry due:/g, '待重试：')
            .replace(/Ready to publish:/g, '待发布：')
            .replace(/Queued:/g, '已入队：')
            .replace(/Schedule windows:/g, '排程窗口：')
            .replace(/Scope: all exports/g, '范围：全部导出记录')
            .replace(/Records:/g, '记录数：')
            .replace(/Events:/g, '事件数：')
            .replace(/Timeline:/g, '时间线：')
            .replace(/Record is ready to be queued\./g, '该记录已满足入队条件。')
            .replace(/Current state is ready_to_publish\./g, '当前状态为待发布。')
            .replace(/Local shadow export record created\./g, '已创建本地同步记录。')
            .replace(/\bmark_queued\b/g, '标记入队')
            .replace(/\bready_to_publish\b/g, '待发布')
            .replace(/\bcurrent_state_snapshot\b/g, '当前状态快照')
            .replace(/\brecord_created\b/g, '记录创建')
            .replace(/\bimmediate\b/g, '立即处理')
            .replace(/\bfuture\b/g, '后续处理')
            .replace(/\bpriority_queue\b/g, '优先队列')
            .replace(/item\(s\)/g, '项');
    }

    #localizeDeliveryReportData(pluginName, data) {
        if (!data || typeof data !== 'object') {
            return data;
        }

        const normalizeRow = (row) => ({
            ...row,
            display_name: this.#localizeSystemGeneratedText(row.display_name || ''),
            project_name: this.#localizeSystemGeneratedText(row.project_name || ''),
            customer_name: this.#localizeSystemGeneratedText(row.customer_name || ''),
            package_label: this.#localizeSystemGeneratedText(row.package_label || ''),
            delivery_state: this.#localizeDeliveryToken(row.delivery_state || ''),
            recommended_action: this.#localizeDeliveryToken(row.recommended_action || ''),
            schedule_bucket: this.#localizeDeliveryToken(row.schedule_bucket || ''),
            window_label: this.#localizeDeliveryToken(row.window_label || ''),
            event_type: this.#localizeDeliveryToken(row.event_type || ''),
            attention_state: this.#localizeDeliveryToken(row.attention_state || ''),
            schedule_reason: this.#localizeDeliveryText(row.schedule_reason || ''),
            details: this.#localizeDeliveryText(row.details || ''),
        });

        if (pluginName === 'prioritize_pending_delivery_actions') {
            return {
                ...data,
                priority_queue: Array.isArray(data.priority_queue) ? data.priority_queue.map(normalizeRow) : [],
                priority_text: this.#localizeDeliveryText(data.priority_text || ''),
            };
        }

        if (pluginName === 'generate_delivery_queue_schedule') {
            return {
                ...data,
                schedule_rows: Array.isArray(data.schedule_rows) ? data.schedule_rows.map(normalizeRow) : [],
                schedule_windows: Array.isArray(data.schedule_windows)
                    ? data.schedule_windows.map((window) => ({
                        ...window,
                        window_label: this.#localizeDeliveryToken(window.window_label || ''),
                        items: Array.isArray(window.items) ? window.items.map(normalizeRow) : [],
                    }))
                    : [],
                schedule_text: this.#localizeDeliveryText(data.schedule_text || ''),
            };
        }

        if (pluginName === 'inspect_delivery_audit_trail') {
            return {
                ...data,
                audit_rows: Array.isArray(data.audit_rows) ? data.audit_rows.map(normalizeRow) : [],
                audit_text: this.#localizeDeliveryText(data.audit_text || ''),
            };
        }

        if (pluginName === 'sync_to_external_sheet_or_notion') {
            return {
                ...data,
                export_text: this.#localizeDeliveryText(data.export_text || ''),
                note: this.#localizeDeliveryText(data.note || ''),
                export_rows: Array.isArray(data.export_rows) ? data.export_rows.map(normalizeRow) : data.export_rows,
            };
        }

        return data;
    }

    #normalizeProjectAuditDataForUi(pluginName, data) {
        if (!data || typeof data !== 'object' || pluginName !== 'check_missing_project_fields') {
            return data;
        }

        const fieldLabel = (field) => {
            if (field === 'delivery_deadline' || field === 'due_date') return '\u4ea4\u4ed8\u65e5\u671f';
            if (field === 'shoot_date') return '\u62cd\u6444\u65e5\u671f';
            if (field === 'project_name') return '\u9879\u76ee\u540d\u79f0';
            if (field === 'project_type') return '\u9879\u76ee\u7c7b\u578b';
            if (field === 'customer_name') return '\u5ba2\u6237\u540d\u79f0';
            return field;
        };

        const projectRows = Array.isArray(data.project_rows) ? data.project_rows.map((row) => ({
            ...row,
            project_name: this.#localizeSystemGeneratedText(row.project_name || ''),
            missing_required_fields: Array.isArray(row.missing_required_fields) ? row.missing_required_fields : [],
            missing_recommended_fields: Array.isArray(row.missing_recommended_fields) ? row.missing_recommended_fields : [],
        })) : [];

        const lines = [
            '\u5f71\u50cf\u5de5\u4f5c\u53f0\u9879\u76ee\u5b57\u6bb5\u68c0\u67e5',
            `\u6a21\u5f0f\uff1a${data.audit_mode === 'single_project' ? '\u5355\u9879\u76ee' : (data.audit_mode || '\u672a\u6307\u5b9a')}`,
            `\u9879\u76ee\u7f16\u53f7\uff1a${data.checked_project_id || '-'}`,
            `\u68c0\u67e5\u9879\u76ee\u6570\uff1a${data.summary?.total_projects_checked ?? 0}`,
            `\u6709\u95ee\u9898\u9879\u76ee\uff1a${data.summary?.projects_with_issues ?? 0}`,
            `\u5fc5\u586b\u7f3a\u5931\uff1a${data.summary?.required_field_gap_count ?? 0}`,
            `\u5efa\u8bae\u8865\u9f50\uff1a${data.summary?.recommended_field_gap_count ?? 0}`,
            `\u5ba2\u6237\u5f15\u7528\u5f02\u5e38\uff1a${data.summary?.invalid_customer_reference_count ?? 0}`,
        ];

        if (projectRows.length) {
            lines.push('', '\u95ee\u9898\u9879\u76ee\uff1a');
            projectRows.forEach((row) => {
                const pieces = [];
                if (row.missing_required_fields.length) {
                    pieces.push(`\u5fc5\u586b\u7f3a\u5931\uff1a${row.missing_required_fields.map(fieldLabel).join('\u3001')}`);
                }
                if (row.missing_recommended_fields.length) {
                    pieces.push(`\u5efa\u8bae\u8865\u9f50\uff1a${row.missing_recommended_fields.map(fieldLabel).join('\u3001')}`);
                }
                lines.push(`- ${row.project_name}\uff08${row.project_id}\uff09${pieces.length ? `\uff1a${pieces.join('\uff1b')}` : ''}`);
            });
        }

        return {
            ...data,
            project_rows: projectRows,
            audit_text: lines.join('\n'),
        };
    }

    #normalizeDraftDataForUi(pluginName, data) {
        if (!data || typeof data !== 'object' || pluginName !== 'generate_client_reply_draft') {
            return data;
        }

        const draftText = data.draft_text || data.reply_draft || data.draft_content || data.draft_body || data.message || '';
        return {
            ...data,
            customer_name: this.#localizeSystemGeneratedText(data.customer_name || ''),
            project_name: this.#localizeSystemGeneratedText(data.project_name || ''),
            draft_title: this.#localizeSystemGeneratedText(data.draft_title || ''),
            draft_body: this.#localizeSystemGeneratedText(data.draft_body || draftText),
            draft_content: this.#localizeSystemGeneratedText(data.draft_content || draftText),
            subject: this.#localizeSystemGeneratedText(data.subject || data.draft_title || ''),
            draft_text: this.#localizeSystemGeneratedText(draftText),
        };
    }

    #normalizePluginErrorForUi(pluginName, error) {
        if (!error || typeof error !== 'object') {
            return error;
        }

        if (pluginName === 'archive_project_assets'
            && error.code === 'CONFLICT'
            && Array.isArray(error.details?.allowed_statuses)) {
            const statusLabels = {
                completed: '已完成',
                archived: '已归档',
                shot: '已拍摄',
            };
            const allowed = error.details.allowed_statuses.map((status) => statusLabels[status] || status).join(' 或 ');
            const received = statusLabels[error.details.project_status] || error.details.project_status || '未知状态';
            return {
                ...error,
                message: `归档项目仅支持 ${allowed} 状态，当前项目状态是 ${received}。请先继续推进项目状态后再归档。`,
            };
        }

        return error;
    }

    #toLeadCard(lead) {
        const project = lead.project_id ? this.store.getProject(lead.project_id) : null;
        const projectCard = project ? this.#toProjectCard(project) : null;
        return {
            ...lead,
            project_name: projectCard?.project_name || '',
            project_status: projectCard?.status || '',
            customer_name: this.#localizeSystemGeneratedText(lead.customer_name || projectCard?.customer_name || ''),
        };
    }

    #toQuoteCard(quote) {
        const project = quote.project_id ? this.store.getProject(quote.project_id) : null;
        const projectCard = project ? this.#toProjectCard(project) : null;
        return {
            ...quote,
            project_name: this.#localizeSystemGeneratedText(projectCard?.project_name || quote.project_id || ''),
            customer_name: this.#localizeSystemGeneratedText(projectCard?.customer_name || ''),
            project_status: projectCard?.status || '',
        };
    }

    #toDeliveryPackageCard(deliveryPackage) {
        const project = deliveryPackage.project_id ? this.store.getProject(deliveryPackage.project_id) : null;
        const projectCard = project ? this.#toProjectCard(project) : null;
        return {
            ...deliveryPackage,
            project_name: this.#localizeSystemGeneratedText(projectCard?.project_name || deliveryPackage.project_id || ''),
            customer_name: this.#localizeSystemGeneratedText(projectCard?.customer_name || ''),
            package_label: this.#localizeSystemGeneratedText(deliveryPackage.package_label || projectCard?.project_name || ''),
            project_status: projectCard?.status || '',
            delivery_deadline: projectCard?.delivery_deadline || '',
            allowed_transitions: DELIVERY_PACKAGE_TRANSITIONS[deliveryPackage.status || 'ready'] || [],
        };
    }

    #toProjectCard(project) {
        const customer = project.customer_id ? this.store.getCustomer(project.customer_id) : null;
        const risk = analyzeProjectRisk(project);
        return {
            project_id: project.project_id,
            customer_id: project.customer_id,
            customer_name: this.#localizeSystemGeneratedText(customer?.customer_name || ''),
            project_name: this.#localizeSystemGeneratedText(project.project_name),
            project_type: project.project_type,
            shoot_date: project.shoot_date || project.start_date || '',
            location: project.location || '',
            status: project.status,
            delivery_deadline: project.delivery_deadline || project.due_date || '',
            progress: project.progress || 0,
            risk_level: project.risk_level || risk.level,
            risk_score: project.risk_score || null,
            thumbnail_url: project.thumbnail_url || '',
            notes: project.notes || project.remark || '',
            allowed_transitions: getAllowedTransitions(project.status),
            risk,
        };
    }

    #success(data, uiHints, meta = {}) {
        return {
            success: true,
            data,
            error: null,
            meta: {
                request_id: createRequestId(),
                timestamp: new Date().toISOString(),
                source: 'photo_studio_orchestrator',
                ...meta,
            },
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
            meta: {
                request_id: createRequestId(),
                timestamp: new Date().toISOString(),
                source: 'photo_studio_orchestrator',
            },
            ui_hints: createUiHints({ toast: '操作失败' }),
        };
    }
}

module.exports = PhotoStudioOrchestrator;
