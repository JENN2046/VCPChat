function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

const SCENE_ALIASES = Object.freeze({
    dashboard: 'home',
    projects: 'project_command',
    project_board: 'project_command',
    inquiry: 'client_leads',
    delivery: 'delivery_assets',
    delivery_panel: 'delivery_assets',
});

const HIGH_RISK_ACTION_CONFIRMATIONS = Object.freeze({
    archive_project: '归档项目素材属于高风险动作，请确认后再执行。',
    archive_project_assets: '归档项目素材属于高风险动作，请确认后再执行。',
    sync_external: '外部同步属于高风险动作，请确认目标和范围后再执行。',
});

const PROJECT_LANES = Object.freeze([
    {
        key: 'lead_quote',
        title: '项目类型 / 报价',
        hint: '客户进入、需求确认、报价推进',
        statuses: ['lead', 'quoted'],
    },
    {
        key: 'prepare_shoot',
        title: '筹备 / 拍摄',
        hint: '档期、人员、拍摄执行',
        statuses: ['confirmed', 'preparing', 'shot'],
    },
    {
        key: 'selection_retouch',
        title: '选片 / 后期',
        hint: '选片确认、修图生产',
        statuses: ['selection_pending', 'retouching'],
    },
    {
        key: 'delivery_archive',
        title: '交付 / 归档',
        hint: '交付准备、客户确认、归档',
        statuses: ['delivering', 'completed', 'archived'],
    },
    {
        key: 'exception',
        title: '异常 / 已取消',
        hint: '取消、阻塞或需要人工处理',
        statuses: ['cancelled'],
    },
]);

function normalizeScene(scene) {
    return SCENE_ALIASES[scene] || scene || 'home';
}

function getState() {
    return window.PhotoStudioState;
}

function isCurrentScene(...scenes) {
    const currentScene = normalizeScene(getState().currentScene);
    return scenes.map(normalizeScene).includes(currentScene);
}

function setStatusChip(message) {
    const chip = document.getElementById('status-chip');
    if (chip) {
        chip.textContent = message;
    }
}

function showToast(message) {
    const root = document.getElementById('toast-root');
    if (!root || !message) {
        return;
    }

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    root.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 2400);
}

function getErrorMessage(error) {
    if (!error) {
        return '未知错误';
    }
    if (error.error?.message) {
        return error.error.message;
    }
    if (error.message) {
        return error.message;
    }
    return String(error);
}

function renderSceneError(scene, error) {
    const root = document.getElementById('scene-root');
    if (!root) {
        return;
    }

    root.innerHTML = `
        <section class="scene-panel">
            <article class="error-panel">
                <p class="eyebrow">场景 / ${escapeHtml(getSceneLabel(scene))}</p>
                <h2>这个场景暂时没加载成功</h2>
                <p>${escapeHtml(getErrorMessage(error))}</p>
                <div class="card-actions">
                    <button class="primary-btn" type="button" data-retry-scene="${escapeHtml(scene)}">重试</button>
                </div>
            </article>
        </section>
    `;

    root.querySelector('[data-retry-scene]')?.addEventListener('click', (event) => {
        void renderSceneByName(event.currentTarget.dataset.retryScene);
    });
}

function setButtonBusy(button, busy, busyText = '执行中...') {
    if (!button) {
        return false;
    }

    if (busy) {
        if (button.dataset.busy === 'true') {
            return false;
        }
        button.dataset.busy = 'true';
        button.dataset.originalText = button.textContent;
        button.textContent = busyText;
        button.disabled = true;
        button.classList.add('is-busy');
        return true;
    }

    button.dataset.busy = 'false';
    if (button.dataset.originalText) {
        button.textContent = button.dataset.originalText;
        delete button.dataset.originalText;
    }
    button.disabled = false;
    button.classList.remove('is-busy');
    return true;
}

function setFormBusy(form, busy) {
    if (!form) {
        return;
    }

    form.querySelectorAll('input, select, textarea, button').forEach((control) => {
        if (busy) {
            control.dataset.wasDisabled = control.disabled ? 'true' : 'false';
            control.disabled = true;
            if (control.tagName === 'BUTTON') {
                setButtonBusy(control, true);
            }
            return;
        }

        if (control.tagName === 'BUTTON') {
            setButtonBusy(control, false);
        }
        control.disabled = control.dataset.wasDisabled === 'true';
        delete control.dataset.wasDisabled;
    });
}

function toProjectId(value) {
    return String(value || '').trim();
}

function getSelectedProjectId() {
    return getState().selectedProjectId || '';
}

function getProjectCollection() {
    return getState().projects?.data || [];
}

function getProjectById(projectId) {
    return getProjectCollection().find((item) => item.project_id === projectId) || null;
}

function formatDate(value) {
    if (!value) {
        return '未设置';
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return String(value);
    }
    return date.toLocaleDateString('zh-CN');
}

function createTag(content, extraClass = '') {
    return `<span class="pill ${extraClass}">${escapeHtml(content)}</span>`;
}

function getPhotoStudioLabel(value) {
    const normalized = String(value || '').trim();
    const labelMap = {
        local_shadow: '本地影子',
        no_live_write: '无外部写入',
        sync_external: '外部同步',
        pending: '待处理',
        new: '新建',
        contacted: '已联系',
        draft: '草稿',
        sent: '已发送',
        accepted: '已接受',
        lead: '新线索',
        quoted: '已报价',
        confirmed: '已确认',
        preparing: '筹备中',
        shot: '已拍摄',
        selection_pending: '待选片',
        retouching: '后期中',
        delivering: '交付中',
        completed: '已完成',
        archived: '已归档',
        cancelled: '已取消',
        scheduled: '已排期',
        in_progress: '进行中',
        quotation: '报价',
        delivery: '交付',
        selection: '选片',
        general: '通用',
        booking: '预约',
        consultation: '商谈',
        shoot: '拍摄',
        social_media: '社媒来源',
        referral: '转介绍',
        walk_in: '到店接待',
        manual: '手动录入',
        returning: '复购客户',
        other: '其他',
        individual: '个人客户',
        company: '企业客户',
        brand: '品牌客户',
        agency: '代理机构',
        organization: '组织客户',
        portrait: '人像',
        wedding: '婚礼',
        commercial: '商业',
        family: '家庭',
        standard: '标准报价',
        premium: '高级报价',
        custom: '定制报价',
        client_delivery: '客户交付',
        selection_notice: '选片通知',
        delivery_tasks: '交付任务',
        warm: '温和',
        concise: '简洁',
        professional: '专业',
        low: '低',
        medium: '中',
        high: '高',
        unknown: '未知',
    };
    return labelMap[normalized] || normalized || '-';
}

function renderStatusTag(value, extraClass = '') {
    return createTag(getPhotoStudioLabel(value), extraClass);
}

function getSceneLabel(scene) {
    const labelMap = {
        home: '首页',
        dashboard: '首页',
        project_command: '项目指挥台',
        project_board: '项目指挥台',
        projects: '项目指挥台',
        client_leads: '客户与线索',
        inquiry: '客户与线索',
        schedule_board: '日程排期',
        delivery_assets: '交付与素材',
        delivery: '交付与素材',
        delivery_panel: '交付与素材',
        project_drawer: '项目抽屉',
    };
    return labelMap[normalizeScene(scene)] || scene || '-';
}

function getActionLabel(action) {
    const labelMap = {
        create_project: '创建项目',
        advance_status: '推进项目状态',
        advance_project_status: '推进项目状态',
        get_project: '读取项目',
        check_missing_project_fields: '检查缺失字段',
        create_tasks: '补建任务',
        create_project_tasks: '补建任务',
        archive_project: '归档项目',
        generate_draft: '生成回复草稿',
        generate_client_reply_draft: '生成回复草稿',
        create_customer: '创建客户',
        create_customer_record: '创建客户',
        create_lead: '创建线索',
        convert_lead_to_project: '线索转项目',
        list_leads: '读取线索',
        create_quote: '创建报价',
        list_quotes: '读取报价',
        create_followup_reminder: '创建跟进提醒',
        list_bookings: '读取预约',
        create_booking: '创建预约',
        update_booking_time: '改期预约',
        start_booking: '开始预约',
        complete_booking: '完成预约',
        create_selection_notice: '创建选片通知',
        create_delivery_tasks: '创建交付任务',
        list_delivery_packages: '读取交付包',
        get_delivery_package: '读取交付包',
        create_delivery_package: '创建交付包',
        update_delivery_package_status: '推进交付包状态',
        sync_external: '外部同步',
        prioritize_pending_delivery_actions: '生成优先队列',
        generate_delivery_queue_schedule: '生成同步排程',
        inspect_delivery_audit_trail: '查看审计轨迹',
        inspect_shadow_data_hygiene: '刷新影子卫生',
    };
    return labelMap[action] || action || '-';
}

function canCreateDeliveryTasks(project) {
    return ['retouching', 'delivering', 'completed'].includes(project?.status);
}

function canCreateSelectionNotice(project) {
    return ['shot', 'selection_pending'].includes(project?.status);
}

function getDeliveryStatusHint(project) {
    if (canCreateSelectionNotice(project)) {
        return '当前状态可以发送选片通知。';
    }
    if (canCreateDeliveryTasks(project)) {
        return '当前状态可以生成交付任务。';
    }
    return `当前状态是 ${project?.status || 'unknown'}，需要继续推进后才能进入交付动作。`;
}

function getRiskTone(level) {
    if (level === 'high') {
        return 'risk-high';
    }
    if (level === 'medium') {
        return 'risk-medium';
    }
    return '';
}

function pickActionSummary(result) {
    if (!result.success) {
        return {
            title: '最近一次动作失败',
            description: result.error?.message || '动作没有完成。',
            rows: [
                ['错误码', result.error?.code || '-'],
                ['字段', result.error?.field || '-'],
            ],
            tone: 'error',
        };
    }

    const data = result.data || {};
    const action = result.action_context?.action || '';

    if (action === 'create_project_draft' || action === 'create_project_with_tasks' || action === 'convert_lead_to_project') {
        return {
            title: action === 'convert_lead_to_project' ? '线索已转为项目' : '项目已创建',
            description: action === 'convert_lead_to_project' ? '线索信息已经转成项目与任务，并写入工作台。' : '客户、项目和任务已经写入工作台。',
            rows: [
                ['客户', data.customer?.customer_name || data.customer?.customer_id || '-'],
                ['项目', data.project?.project_name || data.project?.project_id || '-'],
                ['任务数', Array.isArray(data.tasks) ? data.tasks.length : (data.tasks?.tasks?.length || '-')],
            ],
            tone: 'success',
        };
    }

    if (action === 'create_customer') {
        return {
            title: '客户已创建',
            description: '客户信息已经写入工作台。',
            rows: [
                ['客户', data.customer_name || data.customer_id || '-'],
                ['来源', getPhotoStudioLabel(data.source || '-')],
            ],
            tone: 'success',
        };
    }

    if (action === 'create_followup_reminder') {
        return {
            title: data.is_new === false ? '跟进提醒已存在' : '跟进提醒已创建',
            description: data.is_new === false ? '系统已找到同项目同类型的待处理提醒。' : '跟进提醒已经写入本地影子提醒记录。',
            rows: [
                ['项目', data.project_id || '-'],
                ['类型', getPhotoStudioLabel(data.reminder_type || '-')],
                ['日期', data.due_date || '-'],
            ],
            tone: 'success',
        };
    }

    if (action === 'create_lead') {
        return {
            title: data.is_new === false ? '本地线索已更新' : '本地线索已创建',
            description: '线索已经写入本地影子记录，没有同步外部 CRM 或表格。',
            rows: [
                ['客户', data.customer_name || '-'],
                ['来源', getPhotoStudioLabel(data.source_channel || '-')],
                ['项目类型 / 意向分类', getPhotoStudioLabel(data.intent_type || '-')],
                ['状态', getPhotoStudioLabel(data.status || '-')],
            ],
            tone: 'success',
        };
    }

    if (action === 'create_quote') {
        return {
            title: data.is_new === false ? '本地报价已更新' : '本地报价已创建',
            description: '报价已经写入本地影子记录，没有发送给客户或写入外部系统。',
            rows: [
                ['项目', data.project_name || data.project_id || '-'],
                ['金额', `${data.currency || 'CNY'} ${data.amount || 0}`],
                ['状态', getPhotoStudioLabel(data.status || '-')],
                ['有效期', data.valid_until || '-'],
            ],
            tone: 'success',
        };
    }

    if (action === 'generate_draft' || action === 'generate_client_reply_draft' || data.draft_text || data.reply_draft || data.message) {
        return {
            title: '回复草稿已生成',
            description: data.draft_text || data.reply_draft || data.message,
            rows: [
                ['项目', data.project_id || '-'],
                ['语气', getPhotoStudioLabel(data.tone || '-')],
            ],
            tone: 'success',
        };
    }

    if (action === 'create_tasks' || action === 'create_project_tasks' || action === 'create_delivery_tasks' || data.task_count || data.created_tasks || data.tasks) {
        return {
            title: '任务已更新',
            description: '项目任务已经生成或补齐。',
            rows: [
                ['项目', data.project_id || '-'],
                ['任务数', data.task_count || data.created_tasks?.length || data.tasks?.length || '-'],
            ],
            tone: 'success',
        };
    }

    if (action === 'create_selection_notice' || data.notice_text || data.selection_notice) {
        return {
            title: '选片通知已生成',
            description: data.notice_text || data.selection_notice,
            rows: [['项目', data.project_id || '-']],
            tone: 'success',
        };
    }

    if (action === 'check_missing_project_fields') {
        return {
            title: '缺失字段检查完成',
            description: data.audit_text || '字段检查已经完成。',
            rows: [
                ['检查项目数', data.summary?.total_projects_checked || '-'],
                ['有问题项目', data.summary?.projects_with_issues || '-'],
            ],
            tone: data.summary?.projects_with_issues ? 'error' : 'success',
        };
    }

    if (action === 'check_schedule_conflicts') {
        return {
            title: '排期冲突检查完成',
            description: data.audit_text || '排期检查已经完成。',
            rows: [
                ['检查项目数', data.summary?.total_projects_checked || '-'],
                ['同日冲突', data.summary?.same_day_conflict_count || 0],
                ['缺日期', data.summary?.missing_date_count || 0],
                ['过期未闭环', data.summary?.overdue_count || 0],
            ],
            tone: data.summary?.same_day_conflict_count || data.summary?.missing_date_count || data.summary?.overdue_count ? 'error' : 'success',
        };
    }

    if (action === 'inspect_shadow_data_hygiene') {
        return {
            title: '影子数据卫生已刷新',
            description: '已重新扫描本地 shadow 数据中的冒烟测试和旧演示候选记录。',
            rows: [
                ['冒烟项目', data.closeout?.summary?.projects || 0],
                ['冒烟客户', data.closeout?.summary?.customers || 0],
                ['冒烟线索', data.closeout?.summary?.leads || 0],
                ['旧演示项目', data.legacy?.summary?.projects || 0],
            ],
            tone: (data.closeout?.summary?.total || 0) || (data.legacy?.summary?.total || 0) ? 'error' : 'success',
        };
    }

    if (action === 'list_bookings') {
        return {
            title: '排期记录读取完成',
            description: data.audit_text || '本地排期影子记录已经读取完成。',
            rows: [
                ['检查项目数', data.summary?.total_projects_checked || '-'],
                ['排期记录', data.summary?.total_bookings || 0],
                ['本地影子', data.summary?.local_shadow_count || 0],
                ['来源面板', data.summary?.surface_count || 0],
            ],
            tone: 'success',
        };
    }

    if (action === 'create_booking') {
        return {
            title: data.is_new === false ? '本地预约已更新' : '本地预约已创建',
            description: '预约已经写入本地 calendar_events 影子记录，没有同步外部日历。',
            rows: [
                ['项目', data.project_name || data.project_id || '-'],
                ['类型', getPhotoStudioLabel(data.event_type || '-')],
                ['日期', data.event_date || '-'],
                ['时间', data.start_time || '全天'],
            ],
            tone: 'success',
        };
    }

    if (action === 'start_booking' || action === 'complete_booking') {
        return {
            title: action === 'complete_booking' ? '本地预约已完成' : '本地预约已开始',
            description: '预约状态已经更新到本地影子记录，没有同步外部日历。',
            rows: [
                ['预约', data.calendar_event_id || '-'],
                ['项目', data.project_id || '-'],
                ['状态', getPhotoStudioLabel(data.status || '-')],
                ['日期', data.event_date || '-'],
            ],
            tone: 'success',
        };
    }

    if (action === 'update_booking_time') {
        return {
            title: '本地预约已改期',
            description: '预约时间已经更新到本地影子记录，没有同步外部日历。',
            rows: [
                ['预约', data.calendar_event_id || '-'],
                ['项目', data.project_id || '-'],
                ['日期', data.event_date || '-'],
                ['时间', data.start_time || '全天'],
            ],
            tone: 'success',
        };
    }

    if (action === 'sync_external') {
        return {
            title: '外部同步记录已生成',
            description: data.export_text || '同步记录已经写入本地影子队列。',
            rows: [
                ['目标', data.target_name || '-'],
                ['范围', data.export_scope || '-'],
                ['项目数', data.export_row_count || '-'],
            ],
            tone: 'success',
        };
    }

    if (action === 'list_delivery_packages') {
        return {
            title: '交付包读取完成',
            description: data.audit_text || '本地交付包影子记录已经读取完成。',
            rows: [
                ['交付包', data.summary?.total_packages || 0],
                ['本地影子', data.summary?.local_shadow_count || 0],
                ['可交付', data.summary?.ready_count || 0],
                ['已发送', data.summary?.sent_count || 0],
            ],
            tone: 'success',
        };
    }

    if (action === 'create_delivery_package') {
        return {
            title: data.is_new === false ? '本地交付包已更新' : '本地交付包已创建',
            description: '交付包已经写入本地影子记录，没有同步外部网盘或客户系统。',
            rows: [
                ['项目', data.project_name || data.project_id || '-'],
                ['类型', getPhotoStudioLabel(data.package_type || '-')],
                ['状态', getPhotoStudioLabel(data.status || '-')],
                ['渠道', getPhotoStudioLabel(data.delivery_channel || '-')],
            ],
            tone: 'success',
        };
    }

    if (action === 'update_delivery_package_status') {
        return {
            title: '本地交付包状态已推进',
            description: '交付包状态只在本地影子记录中更新，没有真实发送客户链接。',
            rows: [
                ['交付包', data.package_label || data.delivery_package_id || '-'],
                ['原状态', getPhotoStudioLabel(data.previous_status || '-')],
                ['新状态', getPhotoStudioLabel(data.new_status || data.status || '-')],
                ['项目', data.project_name || data.project_id || '-'],
            ],
            tone: 'success',
        };
    }

    if (action === 'prioritize_pending_delivery_actions') {
        return {
            title: '交付优先队列已生成',
            description: data.priority_text || '已读取本地外部同步影子记录并生成优先级队列。',
            rows: [
                ['记录数', data.summary?.total_records || 0],
                ['优先事项', data.summary?.priority_items || 0],
                ['高优先级', data.summary?.high_count || 0],
                ['可发布', data.summary?.ready_to_publish_count || 0],
            ],
            tone: data.summary?.critical_count || data.summary?.failed_count ? 'error' : 'success',
        };
    }

    if (action === 'generate_delivery_queue_schedule') {
        return {
            title: '交付排程已生成',
            description: data.schedule_text || '已生成本地交付同步队列排程。',
            rows: [
                ['记录数', data.summary?.total_records || 0],
                ['可处理', data.summary?.actionable_records || 0],
                ['立即动作', data.summary?.immediate_actions_count || 0],
                ['失败', data.summary?.failed_count || 0],
            ],
            tone: data.summary?.failed_count ? 'error' : 'success',
        };
    }

    if (action === 'inspect_delivery_audit_trail') {
        return {
            title: '交付审计轨迹已读取',
            description: data.audit_text || '已读取本地外部同步影子记录的审计轨迹。',
            rows: [
                ['记录数', data.audit_summary?.total_records || 0],
                ['事件数', data.audit_summary?.total_events || 0],
                ['创建事件', data.audit_summary?.record_created_count || 0],
                ['错误事件', data.audit_summary?.error_count || 0],
            ],
            tone: data.audit_summary?.error_count ? 'error' : 'success',
        };
    }

    if (action === 'advance_status' || action === 'advance_project_status') {
        return {
            title: '项目状态已推进',
            description: '项目已经进入新的业务状态。',
            rows: [
                ['项目', data.project_id || '-'],
                ['新状态', getPhotoStudioLabel(data.new_status || data.status || '-')],
            ],
            tone: 'success',
        };
    }

    if (action === 'archive_project' || action === 'archive_project_assets') {
        return {
            title: '项目已归档',
            description: '项目归档动作已经完成。',
            rows: [
                ['项目', data.project_id || '-'],
                ['模式', data.archive_mode || '-'],
            ],
            tone: 'success',
        };
    }

    if (data.project || data.customer) {
        return {
            title: '资料已更新',
            description: '工作台资料已经写入。',
            rows: [
                ['客户', data.customer?.customer_name || data.customer?.customer_id || '-'],
                ['项目', data.project?.project_name || data.project?.project_id || '-'],
            ],
            tone: 'success',
        };
    }

    return {
        title: '动作已完成',
        description: '后端已返回成功结果。',
        rows: Object.entries(data).slice(0, 4).map(([key, value]) => [
            key,
            typeof value === 'object' ? JSON.stringify(value) : value,
        ]),
        tone: 'success',
    };
}

function renderLastActionResult() {
    const result = getState().lastActionResult;
    if (!result) {
        return '';
    }

    const summary = pickActionSummary(result);
    return `
        <article class="result-card result-${escapeHtml(summary.tone)}">
            <p class="eyebrow">${escapeHtml(summary.title)}</p>
            <p class="result-description">${escapeHtml(summary.description)}</p>
            <div class="result-rows">
                ${summary.rows.map(([label, value]) => `
                    <div><strong>${escapeHtml(label)}</strong><span>${escapeHtml(value || '-')}</span></div>
                `).join('')}
            </div>
            <details>
                <summary>查看原始返回</summary>
                <pre>${escapeHtml(JSON.stringify(result.success ? result.data : result.error, null, 2))}</pre>
            </details>
        </article>
    `;

}

function renderDrawerActionResult(projectId) {
    const result = getState().lastActionResult;
    if (!result || result.action_context?.scene !== 'project_drawer') {
        return '';
    }

    const dataProjectId = result.data?.project_id || result.data?.checked_project_id || '';
    if (dataProjectId && dataProjectId !== projectId) {
        return '';
    }

    const summary = pickActionSummary(result);
    return `
        <div class="result-card result-${escapeHtml(summary.tone)}">
            <p class="drawer-label">${escapeHtml(summary.title)}</p>
            <p class="result-description">${escapeHtml(summary.description)}</p>
            <div class="result-rows">
                ${summary.rows.map(([label, value]) => `
                    <div><strong>${escapeHtml(label)}</strong><span>${escapeHtml(value || '-')}</span></div>
                `).join('')}
            </div>
        </div>
    `;
}

function renderDrawer(result) {
    const root = document.getElementById('drawer-root');
    if (!root) {
        return;
    }

    const project = result?.data?.project;
    const tasks = result?.data?.tasks || [];
    const logs = result?.data?.logs || [];

    if (!project) {
        root.innerHTML = `
            <div class="drawer-card">
                <p class="drawer-label">项目上下文</p>
                <h2>等待选择项目</h2>
                <p class="muted">点击项目卡片后，这里会展示项目详情、任务、状态日志和可执行动作。</p>
            </div>
        `;
        return;
    }

    const allowedTransitions = project.allowed_transitions || [];
    const nextStatus = allowedTransitions[0] || '';
    const riskMissing = project.risk?.missing || [];
    const taskItems = tasks.map((task) => `<li>${escapeHtml(task.name)} · ${escapeHtml(getPhotoStudioLabel(task.status))}</li>`).join('');
    const logItems = logs.map((item) => `<li>${escapeHtml(item.at)} · ${escapeHtml(item.message)}</li>`).join('');

    root.innerHTML = `
        <div class="drawer-card">
            <p class="drawer-label">项目上下文</p>
            <h2>${escapeHtml(project.project_name)}</h2>
            <div class="drawer-kv">
                <div><strong>客户</strong><span>${escapeHtml(project.customer_name || '-')}</span></div>
                <div><strong>状态</strong><span>${escapeHtml(getPhotoStudioLabel(project.status))}</span></div>
                <div><strong>交付日期</strong><span>${escapeHtml(formatDate(project.delivery_deadline))}</span></div>
            </div>
            <div class="inline-tags">
                ${renderStatusTag(project.project_type || 'unknown')}
                ${createTag(`风险 ${getPhotoStudioLabel(project.risk?.level || 'unknown')}`, getRiskTone(project.risk?.level))}
                ${riskMissing.length ? createTag(`缺字段 ${riskMissing.join(', ')}`) : ''}
            </div>
            <p class="muted">允许推进: ${escapeHtml(allowedTransitions.map(getPhotoStudioLabel).join(' / ') || '无')}</p>
            <div class="drawer-actions">
                <button class="ghost-btn" type="button" data-drawer-action="generate_draft" data-project-id="${escapeHtml(project.project_id)}">生成回复草稿</button>
                <button class="ghost-btn" type="button" data-drawer-action="check_missing_project_fields" data-project-id="${escapeHtml(project.project_id)}">检查缺失字段</button>
                <button class="ghost-btn" type="button" data-drawer-action="create_tasks" data-project-id="${escapeHtml(project.project_id)}">补建任务</button>
                <button class="primary-btn" type="button" data-drawer-action="advance_status" data-project-id="${escapeHtml(project.project_id)}" data-next-status="${escapeHtml(nextStatus)}" ${nextStatus ? '' : 'disabled'}>推进到下一状态</button>
                <button class="ghost-btn danger-btn" type="button" data-drawer-action="archive_project" data-project-id="${escapeHtml(project.project_id)}">归档项目</button>
            </div>
            ${renderDrawerActionResult(project.project_id)}
            <p class="drawer-label">任务</p>
            <ul class="drawer-list">${taskItems || '<li>暂无任务</li>'}</ul>
            <p class="drawer-label">日志</p>
            <ul class="drawer-list">${logItems || '<li>暂无日志</li>'}</ul>
        </div>
    `;
}

function createProjectCard(project) {
    const riskLevel = project.risk?.level || 'low';
    const missing = project.risk?.missing || [];
    const nextStatus = project.allowed_transitions?.[0] || '';
    return `
        <article class="project-card">
            <div class="card-header">
                <div>
                    <h3>${escapeHtml(project.project_name)}</h3>
                    <p class="muted">${escapeHtml(project.customer_name || '未关联客户')}</p>
                </div>
                ${renderStatusTag(project.status)}
            </div>
            <div class="project-meta">
                ${createTag(`风险 ${getPhotoStudioLabel(riskLevel)}`, getRiskTone(riskLevel))}
                ${renderStatusTag(project.project_type || 'unknown')}
                ${missing.length ? createTag(`缺 ${missing.join(', ')}`) : ''}
            </div>
            <p class="muted">交付日期: ${escapeHtml(formatDate(project.delivery_deadline))}</p>
            <div class="card-actions">
                <button class="ghost-btn" type="button" data-open-project="${escapeHtml(project.project_id)}">查看详情</button>
                <button class="primary-btn" type="button" data-advance-project="${escapeHtml(project.project_id)}" data-next-status="${escapeHtml(nextStatus)}" ${nextStatus ? '' : 'disabled'}>推进状态</button>
            </div>
        </article>
    `;
}

function groupProjectsByLane(projects) {
    const lanes = PROJECT_LANES.map((lane) => ({
        ...lane,
        projects: [],
    }));
    const laneByStatus = new Map();

    lanes.forEach((lane) => {
        lane.statuses.forEach((status) => {
            laneByStatus.set(status, lane);
        });
    });

    projects.forEach((project) => {
        const targetLane = laneByStatus.get(project.status) || lanes[lanes.length - 1];
        targetLane.projects.push(project);
    });

    return lanes;
}

function renderProjectBoard(projects) {
    if (!projects.length) {
        return '<div class="empty-state">当前还没有项目，先创建一个试试。</div>';
    }

    return `
        <section class="project-board" aria-label="项目状态看板">
            ${groupProjectsByLane(projects).map((lane) => `
                <article class="project-lane">
                    <div class="project-lane-header">
                        <div>
                            <p class="eyebrow">项目阶段</p>
                            <h3>${escapeHtml(lane.title)}</h3>
                            <p class="muted">${escapeHtml(lane.hint)}</p>
                        </div>
                        <span class="summary-chip">${escapeHtml(lane.projects.length)} 项</span>
                    </div>
                    <div class="project-lane-body">
                        ${lane.projects.length
                            ? lane.projects.map(createProjectCard).join('')
                            : '<div class="empty-state">暂无项目落在这个阶段。</div>'}
                    </div>
                </article>
            `).join('')}
        </section>
    `;
}

function createDeliveryCard(project) {
    const canDeliver = canCreateDeliveryTasks(project);
    const canSelect = canCreateSelectionNotice(project);
    return `
        <article class="project-card">
            <div class="card-header">
                <div>
                    <h3>${escapeHtml(project.project_name)}</h3>
                    <p class="muted">${escapeHtml(project.customer_name || '未关联客户')}</p>
                </div>
                ${renderStatusTag(project.status)}
            </div>
            <div class="project-meta">
                ${renderStatusTag(project.project_type || 'unknown')}
                ${createTag(formatDate(project.delivery_deadline))}
            </div>
            <p class="muted">${escapeHtml(getDeliveryStatusHint(project))}</p>
            <div class="card-actions">
                <button class="ghost-btn" type="button" data-open-project="${escapeHtml(project.project_id)}">打开抽屉</button>
                <button class="ghost-btn" type="button" data-delivery-action="create_selection_notice" data-project-id="${escapeHtml(project.project_id)}" ${canSelect ? '' : 'disabled'}>生成选片通知</button>
                <button class="primary-btn" type="button" data-delivery-action="create_delivery_tasks" data-project-id="${escapeHtml(project.project_id)}" ${canDeliver ? '' : 'disabled'}>生成交付任务</button>
                <button class="ghost-btn" type="button" data-delivery-action="create_delivery_package" data-project-id="${escapeHtml(project.project_id)}" ${canDeliver || canSelect ? '' : 'disabled'}>创建交付包</button>
                <button class="ghost-btn danger-btn" type="button" data-delivery-action="sync_external" data-project-id="${escapeHtml(project.project_id)}">外部同步</button>
                <button class="ghost-btn danger-btn" type="button" data-delivery-action="archive_project" data-project-id="${escapeHtml(project.project_id)}">归档</button>
            </div>
        </article>
    `;
}

function renderMetricCard(label, value, hint) {
    return `
        <article class="metric-card">
            <div class="metric-label">${escapeHtml(label)}</div>
            <div class="metric-value">${escapeHtml(value)}</div>
            <p class="metric-hint">${escapeHtml(hint || '')}</p>
        </article>
    `;
}

function renderDataQualityList(items) {
    if (!items.length) {
        return '<div class="empty-state">当前没有字段缺失项。</div>';
    }

    return `
        <div class="compact-list">
            ${items.map((item) => `
                <article class="compact-row">
                    <div>
                        <strong>${escapeHtml(item.project_name)}</strong>
                        <p class="muted">缺失字段: ${escapeHtml((item.missing || []).join(', '))}</p>
                    </div>
                    <button class="ghost-btn" type="button" data-open-project="${escapeHtml(item.project_id)}">查看</button>
                </article>
            `).join('')}
        </div>
    `;
}

function renderUpcomingList(items) {
    if (!items.length) {
        return '<div class="empty-state">当前没有临近交付项目。</div>';
    }

    return `
        <div class="compact-list">
            ${items.map((item) => `
                <article class="compact-row">
                    <div>
                        <strong>${escapeHtml(item.project_name)}</strong>
                        <p class="muted">${escapeHtml(item.customer_name || '未关联客户')} · ${escapeHtml(getPhotoStudioLabel(item.status))}</p>
                    </div>
                    <div class="compact-side">
                        <span>${escapeHtml(formatDate(item.delivery_deadline))}</span>
                        <button class="ghost-btn" type="button" data-open-project="${escapeHtml(item.project_id)}">打开</button>
                    </div>
                </article>
            `).join('')}
        </div>
    `;
}

function renderTransitionsList(items) {
    if (!items.length) {
        return '<div class="empty-state">当前没有最近状态变更。</div>';
    }

    return `
        <div class="compact-list">
            ${items.map((item) => `
                <article class="compact-row">
                    <div>
                        <strong>${escapeHtml(item.project_name)}</strong>
                        <p class="muted">${escapeHtml(item.customer_name || '未关联客户')}</p>
                    </div>
                    <div class="compact-side">
                        <span>${escapeHtml(`${getPhotoStudioLabel(item.old_status)} -> ${getPhotoStudioLabel(item.new_status)}`)}</span>
                        <span class="muted">${escapeHtml(formatDate(item.changed_at))}</span>
                    </div>
                </article>
            `).join('')}
        </div>
    `;
}

function groupDeliveryProjects(projects) {
    return {
        readyForSelection: projects.filter((project) => canCreateSelectionNotice(project)),
        readyForDelivery: projects.filter((project) => canCreateDeliveryTasks(project)),
        blocked: projects.filter((project) => !canCreateSelectionNotice(project) && !canCreateDeliveryTasks(project)),
    };
}

function getDeliveryMetrics(projects, grouped) {
    return {
        total: projects.length,
        readyForSelection: grouped.readyForSelection.length,
        readyForDelivery: grouped.readyForDelivery.length,
        blocked: grouped.blocked.length,
        archived: projects.filter((project) => project.status === 'archived').length,
        highRisk: projects.filter((project) => project.risk?.level === 'high').length,
    };
}

function renderDeliveryMetricGrid(metrics) {
    return `
        <section class="card-grid">
            ${renderMetricCard('交付相关项目', metrics.total, '当前进入交付视角的全部项目')}
            ${renderMetricCard('选片就绪', metrics.readyForSelection, '可生成选片通知的项目')}
            ${renderMetricCard('交付就绪', metrics.readyForDelivery, '可创建交付任务的项目')}
            ${renderMetricCard('待推进', metrics.blocked, '仍需项目状态推进')}
            ${renderMetricCard('已归档', metrics.archived, '完成后可沉淀复盘')}
            ${renderMetricCard('高风险', metrics.highRisk, '建议先打开抽屉检查')}
        </section>
    `;
}

function renderDeliveryOpsPanel(metrics) {
    return `
        <section class="report-grid">
            <article class="hero-card">
                <p class="eyebrow">外部同步</p>
                <h2>外部同步控制区</h2>
                <p>每张项目卡都可以生成本地外部同步记录。这个动作会先确认，再写入本地影子队列，避免误同步真实外部系统。</p>
                <div class="inline-tags">
                    ${renderStatusTag('sync_external')}
                    ${renderStatusTag('local_shadow')}
                    ${createTag(`${metrics.total} 个候选项目`)}
                </div>
                <div class="card-actions">
                    <button class="ghost-btn" type="button" data-delivery-action="prioritize_pending_delivery_actions">生成优先队列</button>
                    <button class="ghost-btn" type="button" data-delivery-action="generate_delivery_queue_schedule">生成同步排程</button>
                    <button class="primary-btn" type="button" data-delivery-action="inspect_delivery_audit_trail">查看审计轨迹</button>
                </div>
            </article>
            <article class="hero-card">
                <p class="eyebrow">归档护栏</p>
                <h2>归档高风险区</h2>
                <p>归档会改变项目与素材状态，当前已加入确认弹窗。建议先检查缺失字段、交付任务和同步记录，再执行归档。</p>
                <div class="inline-tags">
                    ${createTag('archive_project_assets', 'risk-medium')}
                    ${createTag('需要确认', 'risk-high')}
                </div>
            </article>
        </section>
    `;
}

function getDeliveryReportData(reports, action) {
    const result = reports?.[action];
    return result?.success ? result.data || {} : {};
}

function renderDeliveryReportFailure(reports, action) {
    const result = reports?.[action];
    if (!result || result.success) {
        return '';
    }
    const message = result.error?.message || '读取失败';
    return `<p class="muted risk-high">读取失败：${escapeHtml(message)}</p>`;
}

function renderDeliveryReportRows(items, options = {}) {
    if (!items.length) {
        return '<div class="empty-state">当前没有本地影子记录。</div>';
    }

    return `
        <div class="compact-list">
            ${items.slice(0, 4).map((item) => `
                <article class="compact-row">
                    <div>
                        <strong>${escapeHtml(item.display_name || item.project_name || item.project_id || '未命名项目')}</strong>
                        <p class="muted">${escapeHtml(item.target_name || getPhotoStudioLabel(item.event_type || item.delivery_state || '-'))}</p>
                    </div>
                    <div class="compact-side">
                        <span>${escapeHtml(item.schedule_date || formatDate(item.timestamp) || '-')}</span>
                        ${item.project_id ? `<button class="ghost-btn" type="button" data-open-project="${escapeHtml(item.project_id)}">${escapeHtml(options.openLabel || '打开')}</button>` : ''}
                    </div>
                </article>
            `).join('')}
        </div>
    `;
}

function renderDeliveryReportDashboard(reports = {}) {
    const priority = getDeliveryReportData(reports, 'prioritize_pending_delivery_actions');
    const schedule = getDeliveryReportData(reports, 'generate_delivery_queue_schedule');
    const audit = getDeliveryReportData(reports, 'inspect_delivery_audit_trail');
    const prioritySummary = priority.summary || {};
    const scheduleSummary = schedule.summary || {};
    const auditSummary = audit.audit_summary || {};

    return `
        <section class="hero-card hero-card-wide">
            <div class="hero-grid">
                <div>
                    <p class="eyebrow">交付脉搏</p>
                    <h2>外部同步脉搏</h2>
                    <p>进入交付页时自动读取本地外部同步影子队列，显示优先级、排程和审计轨迹。这里仍然只是本地可视化，不会写入真实外部系统。</p>
                </div>
                <div class="hero-summary">
                    <div class="summary-chip">优先事项 ${escapeHtml(prioritySummary.priority_items || 0)}</div>
                    <div class="summary-chip">立即动作 ${escapeHtml(scheduleSummary.immediate_actions_count || 0)}</div>
                    <div class="summary-chip">审计事件 ${escapeHtml(auditSummary.total_events || 0)}</div>
                </div>
            </div>
        </section>
        <section class="report-grid delivery-grid">
            <article class="hero-card">
                <p class="eyebrow">优先队列</p>
                <h2>优先队列</h2>
                <div class="inline-tags">
                    ${createTag(`${prioritySummary.total_records || 0} 条记录`)}
                    ${createTag(`${prioritySummary.high_count || 0} 个高优先级`, prioritySummary.high_count ? 'risk-medium' : '')}
                    ${createTag(`${prioritySummary.failed_count || 0} 个失败`, prioritySummary.failed_count ? 'risk-high' : '')}
                </div>
                ${renderDeliveryReportFailure(reports, 'prioritize_pending_delivery_actions')}
                ${renderDeliveryReportRows(priority.priority_queue || [])}
            </article>
            <article class="hero-card">
                <p class="eyebrow">同步排程</p>
                <h2>同步排程</h2>
                <div class="inline-tags">
                    ${createTag(`${scheduleSummary.actionable_records || 0} 个可处理`)}
                    ${createTag(`${scheduleSummary.ready_to_publish_count || 0} 个待发布`)}
                    ${createTag(`${scheduleSummary.queued_count || 0} 个已排队`)}
                </div>
                ${renderDeliveryReportFailure(reports, 'generate_delivery_queue_schedule')}
                ${renderDeliveryReportRows(schedule.schedule_rows || [])}
            </article>
            <article class="hero-card">
                <p class="eyebrow">审计轨迹</p>
                <h2>审计轨迹</h2>
                <div class="inline-tags">
                    ${createTag(`${auditSummary.total_records || 0} 条记录`)}
                    ${createTag(`${auditSummary.total_events || 0} 个事件`)}
                    ${createTag(`${auditSummary.failed_records || 0} 个失败`, auditSummary.failed_records ? 'risk-high' : '')}
                </div>
                ${renderDeliveryReportFailure(reports, 'inspect_delivery_audit_trail')}
                ${renderDeliveryReportRows(audit.audit_rows || [], { openLabel: '定位' })}
            </article>
        </section>
    `;
}

function renderDeliveryPackageList(packages) {
    if (!packages.length) {
        return '<div class="empty-state">当前没有本地交付包。可以在下方项目卡上点击“创建交付包”。</div>';
    }

    return `
        <div class="compact-list">
            ${packages.slice(0, 6).map((deliveryPackage) => `
                <article class="compact-row">
                    <div>
                        <strong>${escapeHtml(deliveryPackage.package_label || deliveryPackage.project_name || deliveryPackage.delivery_package_id)}</strong>
                        <p class="muted">${escapeHtml(deliveryPackage.project_name || deliveryPackage.project_id)} · ${escapeHtml(getPhotoStudioLabel(deliveryPackage.package_type || '-'))}</p>
                    </div>
                    <div class="compact-side">
                        <div class="inline-tags">
                            ${createTag(getDeliveryPackageStatusLabel(deliveryPackage.status))}
                            ${renderStatusTag(deliveryPackage.sync_state || 'local_shadow')}
                        </div>
                        <span class="muted">${escapeHtml(formatDate(deliveryPackage.updated_at))}</span>
                        <div class="card-actions">
                            ${(deliveryPackage.allowed_transitions || []).map((nextStatus) => `
                                <button class="ghost-btn" type="button" data-delivery-action="update_delivery_package_status" data-delivery-package-id="${escapeHtml(deliveryPackage.delivery_package_id)}" data-project-id="${escapeHtml(deliveryPackage.project_id)}" data-next-status="${escapeHtml(nextStatus)}">
                                    ${nextStatus === 'sent' ? '标记发送' : '标记确认'}
                                </button>
                            `).join('')}
                            ${deliveryPackage.status === 'acknowledged' ? '<button class="ghost-btn" type="button" disabled>已确认</button>' : ''}
                        </div>
                        <button class="ghost-btn" type="button" data-open-project="${escapeHtml(deliveryPackage.project_id)}">打开</button>
                    </div>
                </article>
            `).join('')}
        </div>
    `;
}

function getDeliveryPackageStatusLabel(status) {
    if (status === 'ready') {
        return '待发送';
    }
    if (status === 'sent') {
        return '已发送，待确认';
    }
    if (status === 'acknowledged') {
        return '已确认';
    }
    return status || '-';
}

function renderDeliveryPackagePanel(reports = {}) {
    const packageResult = reports.list_delivery_packages;
    const packageData = packageResult?.success ? packageResult.data || {} : {};
    const summary = packageData.summary || {};
    return `
        <article class="hero-card hero-card-wide">
            <div class="hero-grid">
                <div>
                    <p class="eyebrow">交付包</p>
                    <h2>本地交付包</h2>
                    <p>交付包是项目进入客户交付前的本地影子记录，用来承接选片通知、交付任务和外部同步前的核对清单。</p>
                    <div class="inline-tags">
                        ${createTag(`${summary.total_packages || 0} 个交付包`)}
                        ${createTag(`${summary.ready_count || 0} 个可交付`)}
                        ${createTag(`${summary.sent_count || 0} 个已发送`)}
                        ${createTag(`${summary.acknowledged_count || 0} 个已确认`)}
                        ${renderStatusTag('local_shadow')}
                    </div>
                </div>
                <div class="card-actions">
                    <button class="ghost-btn" type="button" data-delivery-action="list_delivery_packages">刷新交付包</button>
                </div>
            </div>
            ${renderDeliveryReportFailure(reports, 'list_delivery_packages')}
            ${renderDeliveryPackageList(packageData.packages || [])}
        </article>
    `;
}

function renderDeliveryGroup(title, eyebrow, projects) {
    return `
        <article class="hero-card">
            <p class="eyebrow">${escapeHtml(eyebrow)}</p>
            <h2>${escapeHtml(title)}</h2>
            <div class="project-list">
                ${projects.length ? projects.map(createDeliveryCard).join('') : '<div class="empty-state">当前没有项目落在这个分区。</div>'}
            </div>
        </article>
    `;
}

function getClientLeadMetrics(projects) {
    const uniqueCustomers = new Set(projects.map((project) => project.customer_id).filter(Boolean));
    const projectsWithMissingFields = projects.filter((project) => project.risk?.missing?.length > 0);
    const quotedProjects = projects.filter((project) => project.status === 'quoted');
    return {
        customers: uniqueCustomers.size,
        leads: projects.filter((project) => project.status === 'lead').length,
        quoted: quotedProjects.length,
        booked: projects.filter((project) => ['confirmed', 'preparing', 'shot'].includes(project.status)).length,
        highIntent: projects.filter((project) => ['quoted', 'confirmed'].includes(project.status)).length,
        followups: new Set([...projectsWithMissingFields, ...quotedProjects].map((project) => project.project_id)).size,
    };
}

function renderClientLeadMetricGrid(metrics) {
    return `
        <section class="card-grid">
            ${renderMetricCard('客户数', metrics.customers, '来自当前项目关联客户')}
            ${renderMetricCard('新线索', metrics.leads, '项目处于初步跟进阶段')}
            ${renderMetricCard('已报价', metrics.quoted, '需要继续跟进')}
            ${renderMetricCard('已预约', metrics.booked, '已确认或进入筹备拍摄')}
            ${renderMetricCard('高优先线索', metrics.highIntent, '报价或已确认项目')}
            ${renderMetricCard('待跟进', metrics.followups, '存在缺字段或信息不完整')}
        </section>
    `;
}

function renderLeadPipeline(metrics) {
    const stages = [
        ['新线索', metrics.leads, '接住来源、补全需求'],
        ['沟通中', metrics.followups, '需要跟进或补字段'],
        ['已报价', metrics.quoted, '等待客户确认'],
        ['已预约', metrics.booked, '进入项目执行'],
        ['高优先线索', metrics.highIntent, '优先推进成交'],
    ];

    return `
        <article class="hero-card">
            <p class="eyebrow">项目跟进管道</p>
            <h2>项目跟进总览</h2>
            <div class="pipeline-list">
                ${stages.map(([label, count, hint]) => `
                    <div class="pipeline-stage">
                        <strong>${escapeHtml(label)}</strong>
                        <span>${escapeHtml(count)}</span>
                        <p class="muted">${escapeHtml(hint)}</p>
                    </div>
                `).join('')}
            </div>
        </article>
    `;
}

function renderProjectSelectOptions(projects, selectedProjectId) {
    if (!projects.length) {
        return '<option value="">暂无项目</option>';
    }

    return projects.map((project) => `
        <option value="${escapeHtml(project.project_id)}" ${project.project_id === selectedProjectId ? 'selected' : ''}>
            ${escapeHtml(project.project_name || project.project_id)} · ${escapeHtml(project.status || 'unknown')}
        </option>
    `).join('');
}

function renderFollowupPanel(metrics, projects, selectedProjectId) {
    const hasProjects = projects.length > 0;
    return `
        <article class="hero-card">
            <p class="eyebrow">跟进提醒</p>
            <h2>跟进提醒</h2>
            <p>先接入本地影子提醒：报价后跟进、交付后跟进、回访提醒都可以在这里创建，不会写入外部系统。</p>
            <div class="inline-tags">
                ${createTag(`${metrics.followups} 条待补信息`)}
                ${createTag(`${metrics.quoted} 个报价跟进`)}
                ${createTag(getActionLabel('create_followup_reminder'))}
            </div>
            <form class="form-grid followup-form" id="followup-reminder-form">
                <label class="form-field">
                    <span>项目</span>
                    <select name="project_id" required ${hasProjects ? '' : 'disabled'}>
                        ${renderProjectSelectOptions(projects, selectedProjectId)}
                    </select>
                </label>
                <label class="form-field">
                    <span>提醒类型</span>
                    <select name="reminder_type">
                        <option value="quotation_followup">报价跟进</option>
                        <option value="delivery_followup">交付跟进</option>
                        <option value="revisit">回访提醒</option>
                    </select>
                </label>
                <label class="form-field">
                    <span>提醒日期</span>
                    <input name="due_date" type="date">
                </label>
                <label class="form-field form-field-wide">
                    <span>备注</span>
                    <textarea name="note" rows="3" placeholder="例如：明天上午确认报价、交付后 3 天回访体验"></textarea>
                </label>
                <div class="form-actions form-field-wide">
                    <button class="primary-btn" type="submit" ${hasProjects ? '' : 'disabled'}>创建提醒</button>
                </div>
            </form>
        </article>
    `;
}

function renderClientLeadShadowList(items, emptyText, options = {}) {
    if (!items.length) {
        return `<div class="empty-state">${escapeHtml(emptyText)}</div>`;
    }

    return `
        <div class="compact-list">
            ${items.slice(0, 5).map((item) => `
                <article class="compact-row">
                    <div>
                        <strong>${escapeHtml(item.customer_name || item.project_name || item.lead_id || item.quote_id)}</strong>
                        <p class="muted">${escapeHtml(item.project_name || getPhotoStudioLabel(item.source_channel || item.quote_type || '-'))}</p>
                    </div>
                    <div class="compact-side">
                        <span>${escapeHtml(getPhotoStudioLabel(item.status || '-'))}</span>
                        ${options.enableLeadConversion && item.lead_id ? `
                            <button
                                class="ghost-btn"
                                type="button"
                                data-lead-action="convert"
                                data-lead-id="${escapeHtml(item.lead_id)}"
                                data-customer-name="${escapeHtml(item.customer_name || '')}"
                                data-source-channel="${escapeHtml(item.source_channel || 'manual')}"
                                data-intent-type="${escapeHtml(item.intent_type || 'general')}"
                                data-note="${escapeHtml(item.note || '')}"
                            >转项目</button>
                        ` : ''}
                        ${item.project_id ? `<button class="ghost-btn" type="button" data-open-project="${escapeHtml(item.project_id)}">打开</button>` : ''}
                    </div>
                </article>
            `).join('')}
        </div>
    `;
}

function renderClientLeadShadowPanel(reports = {}) {
    const leadData = reports.list_leads?.success ? reports.list_leads.data || {} : {};
    const quoteData = reports.list_quotes?.success ? reports.list_quotes.data || {} : {};
    const leadSummary = leadData.summary || {};
    const quoteSummary = quoteData.summary || {};

    return `
        <section class="report-grid">
            <article class="hero-card">
                <p class="eyebrow">本地线索</p>
                <h2>本地线索</h2>
                <div class="inline-tags">
                    ${createTag(`${leadSummary.total_leads || 0} 条线索`)}
                    ${createTag(`${leadSummary.new_count || 0} 条新线索`)}
                    ${renderStatusTag('local_shadow')}
                </div>
                ${renderDeliveryReportFailure(reports, 'list_leads')}
                ${renderClientLeadShadowList(leadData.leads || [], '当前没有本地线索影子记录。', { enableLeadConversion: true })}
            </article>
            <article class="hero-card">
                <p class="eyebrow">本地报价</p>
                <h2>本地报价</h2>
                <div class="inline-tags">
                    ${createTag(`${quoteSummary.total_quotes || 0} 条报价`)}
                    ${createTag(`${quoteSummary.draft_count || 0} 条草稿`)}
                    ${createTag(`${quoteSummary.accepted_count || 0} 条接受`)}
                </div>
                ${renderDeliveryReportFailure(reports, 'list_quotes')}
                ${renderClientLeadShadowList(quoteData.quotes || [], '当前没有本地报价影子记录。')}
            </article>
        </section>
    `;
}

function renderLeadQuoteForms(projects, selectedProjectId) {
    const hasProjects = projects.length > 0;
    return `
        <section class="split-grid">
            <article class="hero-card">
                <p class="eyebrow">创建线索</p>
                <form class="form-grid" id="lead-create-form">
                    <label class="form-field">
                        <span>关联项目</span>
                        <select name="project_id">
                            <option value="">不关联项目</option>
                            ${renderProjectSelectOptions(projects, selectedProjectId)}
                        </select>
                    </label>
                    <label class="form-field">
                        <span>客户名</span>
                        <input name="customer_name" type="text" placeholder="例如 王小姐">
                    </label>
                    <label class="form-field">
                        <span>来源</span>
                        <select name="source_channel">
                            <option value="social_media">社媒来源</option>
                            <option value="referral">转介绍</option>
                            <option value="walk_in">到店接待</option>
                            <option value="manual">手动录入</option>
                        </select>
                    </label>
                    <label class="form-field">
                        <span>项目类型 / 意向分类</span>
                        <select name="intent_type">
                            <option value="portrait">人像</option>
                            <option value="wedding">婚礼</option>
                            <option value="commercial">商业</option>
                            <option value="family">家庭</option>
                            <option value="general">通用</option>
                        </select>
                    </label>
                    <label class="form-field">
                        <span>预算</span>
                        <input name="budget_range" type="text" placeholder="例如 3000-5000">
                    </label>
                    <label class="form-field form-field-wide">
                        <span>备注</span>
                        <textarea name="note" rows="3" placeholder="记录来源、需求、偏好、下一步"></textarea>
                    </label>
                    <div class="form-actions form-field-wide">
                        <button class="primary-btn" type="submit">创建线索</button>
                    </div>
                </form>
            </article>
            <article class="hero-card">
                <p class="eyebrow">创建报价</p>
                <form class="form-grid" id="quote-create-form">
                    <label class="form-field">
                        <span>项目</span>
                        <select name="project_id" required ${hasProjects ? '' : 'disabled'}>
                            ${renderProjectSelectOptions(projects, selectedProjectId)}
                        </select>
                    </label>
                    <label class="form-field">
                        <span>报价类型</span>
                        <select name="quote_type">
                            <option value="standard">标准报价</option>
                            <option value="premium">高级报价</option>
                            <option value="custom">定制报价</option>
                        </select>
                    </label>
                    <label class="form-field">
                        <span>金额</span>
                        <input name="amount" type="number" min="0" step="1" placeholder="例如 3999">
                    </label>
                    <label class="form-field">
                        <span>有效期</span>
                        <input name="valid_until" type="date">
                    </label>
                    <label class="form-field form-field-wide">
                        <span>备注</span>
                        <textarea name="note" rows="3" placeholder="记录报价包含项、优惠、限制"></textarea>
                    </label>
                    <div class="form-actions form-field-wide">
                        <button class="primary-btn" type="submit" ${hasProjects ? '' : 'disabled'}>创建报价</button>
                    </div>
                </form>
            </article>
        </section>
    `;
}

function getScheduleDate(project) {
    const dateValue = project.delivery_deadline || project.due_date || '';
    if (!dateValue) {
        return null;
    }

    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) {
        return null;
    }

    return date;
}

function getDateKey(date) {
    return date.toISOString().slice(0, 10);
}

function getScheduleEntries(projects) {
    return projects
        .map((project) => {
            const date = getScheduleDate(project);
            if (!date) {
                return null;
            }
            return {
                project,
                date,
                dateKey: getDateKey(date),
            };
        })
        .filter(Boolean)
        .sort((left, right) => left.date.getTime() - right.date.getTime());
}

function getScheduleMetrics(projects, entries) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dateBuckets = entries.reduce((bucket, entry) => {
        bucket.set(entry.dateKey, (bucket.get(entry.dateKey) || 0) + 1);
        return bucket;
    }, new Map());

    return {
        scheduled: entries.length,
        unscheduled: projects.length - entries.length,
        thisWeek: entries.filter((entry) => {
            const diffDays = Math.ceil((entry.date.getTime() - today.getTime()) / 86400000);
            return diffDays >= 0 && diffDays <= 7;
        }).length,
        overdue: entries.filter((entry) => entry.date.getTime() < today.getTime()).length,
        conflicts: [...dateBuckets.values()].filter((count) => count > 1).length,
        inProduction: projects.filter((project) => ['confirmed', 'preparing', 'shot'].includes(project.status)).length,
    };
}

function getScheduleTone(entry, dateBuckets) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if ((dateBuckets.get(entry.dateKey) || 0) > 1) {
        return ['同日冲突', 'risk-high'];
    }
    if (entry.date.getTime() < today.getTime()) {
        return ['已过期', 'risk-high'];
    }
    const diffDays = Math.ceil((entry.date.getTime() - today.getTime()) / 86400000);
    if (diffDays <= 3) {
        return ['临近', 'risk-medium'];
    }
    return ['正常', ''];
}

function renderScheduleMetricGrid(metrics) {
    return `
        <section class="card-grid">
            ${renderMetricCard('已排期项目', metrics.scheduled, '以交付日期作为临时排期代理')}
            ${renderMetricCard('本周窗口', metrics.thisWeek, '未来 7 天内需要关注')}
            ${renderMetricCard('同日冲突', metrics.conflicts, '同一天存在多个项目')}
            ${renderMetricCard('未设日期', metrics.unscheduled, '建议先补齐交付日期')}
            ${renderMetricCard('执行中', metrics.inProduction, '确认、筹备或拍摄阶段')}
            ${renderMetricCard('已过期', metrics.overdue, '需要复核状态或交付日期')}
        </section>
    `;
}

function renderScheduleTimeline(entries) {
    if (!entries.length) {
        return '<div class="empty-state">暂无可推导的排期数据。先在项目里补齐交付日期，这里就会出现时间线。</div>';
    }

    const dateBuckets = entries.reduce((bucket, entry) => {
        bucket.set(entry.dateKey, (bucket.get(entry.dateKey) || 0) + 1);
        return bucket;
    }, new Map());

    return `
        <div class="compact-list schedule-timeline">
            ${entries.slice(0, 8).map((entry) => {
                const [toneLabel, toneClass] = getScheduleTone(entry, dateBuckets);
                return `
                    <article class="compact-row schedule-row">
                        <div>
                            <strong>${escapeHtml(formatDate(entry.project.delivery_deadline || entry.project.due_date))}</strong>
                            <p class="muted">${escapeHtml(entry.project.project_name)} · ${escapeHtml(entry.project.customer_name || '未关联客户')}</p>
                        </div>
                        <div class="compact-side">
                        <div class="inline-tags">
                            ${renderStatusTag(entry.project.status || 'unknown')}
                            ${createTag(toneLabel, toneClass)}
                        </div>
                            <button class="ghost-btn" type="button" data-open-project="${escapeHtml(entry.project.project_id)}">打开</button>
                        </div>
                    </article>
                `;
            }).join('')}
        </div>
    `;
}

function renderLocalBookingList(bookings) {
    if (!bookings.length) {
        return '<div class="empty-state">当前没有本地预约影子记录。创建本地预约后会显示在这里。</div>';
    }

    return `
        <div class="compact-list schedule-booking-list">
            ${bookings.map((booking) => `
                <article class="compact-row schedule-row">
                    <div>
                        <strong>${escapeHtml(formatDate(booking.event_date || booking.booking_date || booking.date))} ${escapeHtml(booking.start_time || '全天')}</strong>
                        <p class="muted">${escapeHtml(booking.project_name || booking.project_id || '未知项目')} · ${escapeHtml(booking.customer_name || '未关联客户')}</p>
                        <form class="booking-reschedule-form" data-booking-reschedule-form data-project-id="${escapeHtml(booking.project_id)}" data-event-key="${escapeHtml(booking.event_key)}">
                            <input name="booking_date" type="date" value="${escapeHtml(booking.event_date || '')}" aria-label="预约日期">
                            <input name="start_time" type="time" value="${escapeHtml(booking.start_time || '')}" aria-label="开始时间">
                            <select name="duration_minutes" aria-label="时长">
                                <option value="60" ${Number(booking.duration_minutes) === 60 ? 'selected' : ''}>1 小时</option>
                                <option value="120" ${Number(booking.duration_minutes || 120) === 120 ? 'selected' : ''}>2 小时</option>
                                <option value="180" ${Number(booking.duration_minutes) === 180 ? 'selected' : ''}>3 小时</option>
                                <option value="240" ${Number(booking.duration_minutes) === 240 ? 'selected' : ''}>4 小时</option>
                            </select>
                            <input name="location" type="text" value="${escapeHtml(booking.location || '')}" placeholder="地点" aria-label="地点">
                            <button class="ghost-btn" type="submit">改期</button>
                        </form>
                    </div>
                    <div class="compact-side">
                        <div class="inline-tags">
                            ${renderStatusTag(booking.event_type || 'booking')}
                            ${renderStatusTag(booking.status || 'scheduled')}
                            ${renderStatusTag(booking.sync_state || 'local_shadow')}
                        </div>
                        <div class="card-actions">
                            <button class="ghost-btn" type="button" data-booking-action="start_booking" data-project-id="${escapeHtml(booking.project_id)}" data-event-key="${escapeHtml(booking.event_key)}" ${booking.status === 'completed' ? 'disabled' : ''}>开始</button>
                            <button class="primary-btn" type="button" data-booking-action="complete_booking" data-project-id="${escapeHtml(booking.project_id)}" data-event-key="${escapeHtml(booking.event_key)}" ${booking.status === 'completed' ? 'disabled' : ''}>完成</button>
                        </div>
                        <button class="ghost-btn" type="button" data-open-project="${escapeHtml(booking.project_id)}">打开</button>
                    </div>
                </article>
            `).join('')}
        </div>
    `;
}

function renderResourceReadiness(projects) {
    const preparation = projects.filter((project) => ['confirmed', 'preparing'].includes(project.status)).length;
    const shooting = projects.filter((project) => project.status === 'shot').length;
    const postProduction = projects.filter((project) => ['selection_pending', 'retouching'].includes(project.status)).length;
    const delivery = projects.filter((project) => ['delivering', 'completed'].includes(project.status)).length;

    return `
        <article class="hero-card">
            <p class="eyebrow">资源准备</p>
            <h2>资源准备度</h2>
            <div class="mini-metrics">
                <div><strong>${escapeHtml(preparation)}</strong><span>筹备资源</span></div>
                <div><strong>${escapeHtml(shooting)}</strong><span>拍摄后待转选片</span></div>
                <div><strong>${escapeHtml(postProduction)}</strong><span>后期资源</span></div>
                <div><strong>${escapeHtml(delivery)}</strong><span>交付资源</span></div>
            </div>
        </article>
    `;
}

function renderScheduleGuardrail(metrics) {
    return `
        <article class="hero-card">
            <p class="eyebrow">冲突护栏</p>
            <h2>冲突护栏</h2>
            <p>当前只做只读风险提示，不自动创建、调整或取消预约。真实 Booking 接入后，创建预约和改期会进入确认流程。</p>
            <div class="inline-tags">
                ${createTag(`${metrics.conflicts} 个同日冲突`, metrics.conflicts ? 'risk-high' : '')}
                ${createTag(`${metrics.unscheduled} 个未设日期`, metrics.unscheduled ? 'risk-medium' : '')}
                ${createTag('check_schedule_conflicts')}
            </div>
            <div class="card-actions">
                <button class="primary-btn" type="button" data-schedule-action="check_schedule_conflicts">检查冲突</button>
            </div>
        </article>
    `;
}

function renderCreateBookingPanel(projects, selectedProjectId) {
    const hasProjects = projects.length > 0;
    return `
        <article class="hero-card">
            <p class="eyebrow">创建预约</p>
            <h2>创建本地预约</h2>
            <p>先写入本地影子排期记录，不会同步外部日历。相同项目、类型、日期和时间会更新同一条记录。</p>
            <form class="form-grid followup-form" id="schedule-booking-form">
                <label class="form-field">
                    <span>项目</span>
                    <select name="project_id" required ${hasProjects ? '' : 'disabled'}>
                        ${renderProjectSelectOptions(projects, selectedProjectId)}
                    </select>
                </label>
                <label class="form-field">
                    <span>预约类型</span>
                    <select name="booking_type">
                        <option value="shoot">拍摄</option>
                        <option value="consultation">商谈</option>
                        <option value="selection">选片</option>
                        <option value="delivery">交付</option>
                    </select>
                </label>
                <label class="form-field">
                    <span>日期</span>
                    <input name="booking_date" type="date" required>
                </label>
                <label class="form-field">
                    <span>开始时间</span>
                    <input name="start_time" type="time">
                </label>
                <label class="form-field">
                    <span>时长</span>
                    <select name="duration_minutes">
                        <option value="60">1 小时</option>
                        <option value="120" selected>2 小时</option>
                        <option value="180">3 小时</option>
                        <option value="240">4 小时</option>
                    </select>
                </label>
                <label class="form-field">
                    <span>地点</span>
                    <input name="location" type="text" placeholder="影棚 / 外景 / 线上">
                </label>
                <label class="form-field form-field-wide">
                    <span>备注</span>
                    <textarea name="note" rows="3" placeholder="记录人员、设备、注意事项"></textarea>
                </label>
                <div class="form-actions form-field-wide">
                    <button class="primary-btn" type="submit" ${hasProjects ? '' : 'disabled'}>创建本地预约</button>
                </div>
            </form>
        </article>
    `;
}

function bindProjectActions() {
    document.querySelectorAll('[data-open-project]').forEach((button) => {
        button.addEventListener('click', async () => {
            if (!setButtonBusy(button, true, '打开中...')) {
                return;
            }
            try {
                await loadProjectIntoDrawer(button.dataset.openProject);
            } finally {
                setButtonBusy(button, false);
            }
        });
    });

    document.querySelectorAll('[data-advance-project]').forEach((button) => {
        button.addEventListener('click', async () => {
            if (!setButtonBusy(button, true, '推进中...')) {
                return;
            }
            try {
                const projectId = button.dataset.advanceProject;
                const project = getProjectById(projectId);
                const nextStatus = button.dataset.nextStatus || project?.allowed_transitions?.[0] || '';
                if (!nextStatus) {
                    showToast('当前项目没有可推进的下一状态。');
                    setStatusChip('当前项目不可推进');
                    return;
                }
                const result = await runActionAndSync('project_board', 'advance_status', {
                    project_id: projectId,
                    new_status: nextStatus,
                });
                if (result.success) {
                    await switchScene('project_command');
                    await loadProjectIntoDrawer(projectId);
                }
            } finally {
                setButtonBusy(button, false);
            }
        });
    });
}

function bindDrawerActions() {
    document.querySelectorAll('[data-drawer-action]').forEach((button) => {
        button.addEventListener('click', async () => {
            if (!setButtonBusy(button, true)) {
                return;
            }
            try {
                const action = button.dataset.drawerAction;
                const projectId = button.dataset.projectId;
                const payload = { project_id: projectId };

                if (action === 'advance_status') {
                    payload.new_status = button.dataset.nextStatus;
                }

                const result = await runActionAndSync('project_drawer', action, payload);
                if (action === 'advance_status' && result.success) {
                    await switchScene('project_command');
                    await loadProjectIntoDrawer(projectId);
                }
            } finally {
                setButtonBusy(button, false);
            }
        });
    });
}

function bindDeliveryActions() {
    document.querySelectorAll('[data-delivery-action]').forEach((button) => {
        button.addEventListener('click', async () => {
            if (!setButtonBusy(button, true)) {
                return;
            }
            try {
                await runActionAndSync('delivery_panel', button.dataset.deliveryAction, {
                    project_id: button.dataset.projectId,
                    delivery_package_id: button.dataset.deliveryPackageId,
                    status: button.dataset.nextStatus,
                });
            } finally {
                setButtonBusy(button, false);
            }
        });
    });
}

function bindClientLeadActions() {
    document.querySelectorAll('[data-lead-action="convert"]').forEach((button) => {
        button.addEventListener('click', async () => {
            if (!setButtonBusy(button, true, '转换中...')) {
                return;
            }
            try {
                const customerName = button.dataset.customerName || 'Walk-in Customer';
                const intentType = button.dataset.intentType || 'general';
                const sourceChannel = button.dataset.sourceChannel || 'manual';
                const note = button.dataset.note || '';
                const leadId = button.dataset.leadId || '';
                const projectName = `${customerName} ${getPhotoStudioLabel(intentType)}项目`;
                const result = await runActionAndSync('client_leads', 'convert_lead_to_project', {
                    customer_name: customerName,
                    project_name: projectName,
                    project_type: intentType,
                    source: sourceChannel,
                    source_channel: sourceChannel,
                    project_notes: [note, leadId ? `来源线索: ${leadId}` : ''].filter(Boolean).join('\n'),
                });
                if (result.success) {
                    const projectId = result.data?.project?.project_id;
                    await switchScene('project_command');
                    if (projectId) {
                        await loadProjectIntoDrawer(projectId);
                    }
                }
            } finally {
                setButtonBusy(button, false);
            }
        });
    });
}

function bindHomeActions() {
    document.querySelectorAll('[data-home-action]').forEach((button) => {
        button.addEventListener('click', async () => {
            if (!setButtonBusy(button, true, '体检中...')) {
                return;
            }
            try {
                await runActionAndSync('home', button.dataset.homeAction, {});
            } finally {
                setButtonBusy(button, false);
            }
        });
    });
}

function bindScheduleActions() {
    document.querySelectorAll('[data-schedule-action]').forEach((button) => {
        button.addEventListener('click', async () => {
            if (!setButtonBusy(button, true, '检查中...')) {
                return;
            }
            try {
                await runActionAndSync('schedule_board', button.dataset.scheduleAction, {});
            } finally {
                setButtonBusy(button, false);
            }
        });
    });

    document.querySelectorAll('[data-booking-action]').forEach((button) => {
        button.addEventListener('click', async () => {
            if (!setButtonBusy(button, true)) {
                return;
            }
            try {
                await runActionAndSync('schedule_board', button.dataset.bookingAction, {
                    project_id: button.dataset.projectId,
                    event_key: button.dataset.eventKey,
                });
            } finally {
                setButtonBusy(button, false);
            }
        });
    });

    document.querySelectorAll('[data-booking-reschedule-form]').forEach((form) => {
        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            if (form.dataset.busy === 'true') {
                return;
            }

            const formData = new FormData(form);
            form.dataset.busy = 'true';
            setFormBusy(form, true);
            try {
                await runActionAndSync('schedule_board', 'update_booking_time', {
                    project_id: form.dataset.projectId,
                    event_key: form.dataset.eventKey,
                    booking_date: formData.get('booking_date'),
                    start_time: formData.get('start_time'),
                    duration_minutes: formData.get('duration_minutes'),
                    location: formData.get('location'),
                });
            } finally {
                form.dataset.busy = 'false';
                setFormBusy(form, false);
            }
        });
    });

    const bookingForm = document.getElementById('schedule-booking-form');
    if (bookingForm) {
        bookingForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            if (bookingForm.dataset.busy === 'true') {
                return;
            }

            const formData = new FormData(bookingForm);
            const projectId = toProjectId(formData.get('project_id')) || getSelectedProjectId();
            if (!projectId) {
                showToast('请先选择项目。');
                return;
            }

            bookingForm.dataset.busy = 'true';
            setFormBusy(bookingForm, true);
            try {
                const result = await runActionAndSync('schedule_board', 'create_booking', {
                    project_id: projectId,
                    booking_type: formData.get('booking_type'),
                    booking_date: formData.get('booking_date'),
                    start_time: formData.get('start_time'),
                    duration_minutes: formData.get('duration_minutes'),
                    location: formData.get('location'),
                    note: formData.get('note'),
                });
                if (result.success) {
                    bookingForm.reset();
                }
            } finally {
                bookingForm.dataset.busy = 'false';
                setFormBusy(bookingForm, false);
            }
        });
    }
}

function bindProjectCreateForm() {
    const form = document.getElementById('project-create-form');
    if (!form) {
        return;
    }

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (form.dataset.busy === 'true') {
            return;
        }
        const formData = new FormData(form);
        form.dataset.busy = 'true';
        setFormBusy(form, true);
        try {
            const result = await runActionAndSync('project_board', 'create_project_draft', {
                customer_name: formData.get('customer_name'),
                project_name: formData.get('project_name'),
                project_type: formData.get('project_type'),
                delivery_deadline: formData.get('delivery_deadline'),
                location: formData.get('location'),
                project_notes: formData.get('project_notes'),
            });
            if (result.success) {
                form.reset();
            }
        } finally {
            form.dataset.busy = 'false';
            setFormBusy(form, false);
        }
    });
}

function bindInquiryForms() {
    const createCustomerForm = document.getElementById('inquiry-customer-form');
    if (createCustomerForm) {
        createCustomerForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            if (createCustomerForm.dataset.busy === 'true') {
                return;
            }
            const formData = new FormData(createCustomerForm);
            createCustomerForm.dataset.busy = 'true';
            setFormBusy(createCustomerForm, true);
            try {
                const result = await runActionAndSync('inquiry', 'create_customer', {
                    customer_name: formData.get('customer_name'),
                    customer_type: formData.get('customer_type'),
                    source: formData.get('source'),
                    contact_phone: formData.get('contact_phone'),
                    contact_wechat: formData.get('contact_wechat'),
                    notes: formData.get('notes'),
                });
                if (result.success) {
                    createCustomerForm.reset();
                }
            } finally {
                createCustomerForm.dataset.busy = 'false';
                setFormBusy(createCustomerForm, false);
            }
        });
    }

    const draftForm = document.getElementById('inquiry-draft-form');
    if (draftForm) {
        draftForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            if (draftForm.dataset.busy === 'true') {
                return;
            }
            const formData = new FormData(draftForm);
            draftForm.dataset.busy = 'true';
            setFormBusy(draftForm, true);
            try {
                await runActionAndSync('inquiry', 'generate_draft', {
                    project_id: toProjectId(formData.get('project_id')) || getSelectedProjectId(),
                    context_type: formData.get('context_type'),
                    tone: formData.get('tone'),
                    key_points: formData.get('key_points'),
                });
            } finally {
                draftForm.dataset.busy = 'false';
                setFormBusy(draftForm, false);
            }
        });
    }

    const followupForm = document.getElementById('followup-reminder-form');
    if (followupForm) {
        followupForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            if (followupForm.dataset.busy === 'true') {
                return;
            }
            const formData = new FormData(followupForm);
            const projectId = toProjectId(formData.get('project_id')) || getSelectedProjectId();
            if (!projectId) {
                showToast('请先选择项目。');
                return;
            }

            followupForm.dataset.busy = 'true';
            setFormBusy(followupForm, true);
            try {
                const result = await runActionAndSync('inquiry', 'create_followup_reminder', {
                    project_id: projectId,
                    reminder_type: formData.get('reminder_type'),
                    due_date: formData.get('due_date'),
                    note: formData.get('note'),
                });
                if (result.success) {
                    followupForm.reset();
                }
            } finally {
                followupForm.dataset.busy = 'false';
                setFormBusy(followupForm, false);
            }
        });
    }

    const leadForm = document.getElementById('lead-create-form');
    if (leadForm) {
        leadForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            if (leadForm.dataset.busy === 'true') {
                return;
            }
            const formData = new FormData(leadForm);
            leadForm.dataset.busy = 'true';
            setFormBusy(leadForm, true);
            try {
                const result = await runActionAndSync('client_leads', 'create_lead', {
                    project_id: toProjectId(formData.get('project_id')),
                    customer_name: formData.get('customer_name'),
                    source_channel: formData.get('source_channel'),
                    intent_type: formData.get('intent_type'),
                    budget_range: formData.get('budget_range'),
                    note: formData.get('note'),
                });
                if (result.success) {
                    leadForm.reset();
                }
            } finally {
                leadForm.dataset.busy = 'false';
                setFormBusy(leadForm, false);
            }
        });
    }

    const quoteForm = document.getElementById('quote-create-form');
    if (quoteForm) {
        quoteForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            if (quoteForm.dataset.busy === 'true') {
                return;
            }
            const formData = new FormData(quoteForm);
            const projectId = toProjectId(formData.get('project_id')) || getSelectedProjectId();
            if (!projectId) {
                showToast('请先选择项目。');
                return;
            }

            quoteForm.dataset.busy = 'true';
            setFormBusy(quoteForm, true);
            try {
                const result = await runActionAndSync('client_leads', 'create_quote', {
                    project_id: projectId,
                    quote_type: formData.get('quote_type'),
                    amount: formData.get('amount'),
                    valid_until: formData.get('valid_until'),
                    note: formData.get('note'),
                });
                if (result.success) {
                    quoteForm.reset();
                }
            } finally {
                quoteForm.dataset.busy = 'false';
                setFormBusy(quoteForm, false);
            }
        });
    }
}

function renderHomeMetricGrid(metrics, reporting) {
    const prioritySummary = reporting.prioritize_pending?.summary || {};
    const scheduleSummary = reporting.delivery_schedule?.summary || {};

    return `
        <section class="card-grid">
            ${renderMetricCard('项目总数', metrics.total_projects ?? 0, '所有已落入工作台的项目')}
            ${renderMetricCard('风险项目', metrics.risk_projects_count ?? 0, '存在缺字段或交付风险')}
            ${renderMetricCard('缺字段项目', metrics.missing_fields_count ?? 0, '需要先补齐数据')}
            ${renderMetricCard('临近交付', metrics.upcoming_delivery_count ?? 0, '需要优先关注交期')}
            ${renderMetricCard('优先事项', prioritySummary.priority_items ?? 0, '外部同步或待处理队列')}
            ${renderMetricCard('立即动作', scheduleSummary.immediate_actions_count ?? 0, '今天应处理的队列项')}
        </section>
    `;
}

function renderPriorityQueue(priorityReport) {
    const queue = priorityReport?.priority_queue || [];
    if (!queue.length) {
        return '<div class="empty-state">当前没有需要立即处理的优先队列。</div>';
    }

    return `
        <div class="compact-list">
            ${queue.slice(0, 5).map((item) => `
                <article class="compact-row">
                    <div>
                        <strong>${escapeHtml(item.display_name || item.project_id || '未命名项目')}</strong>
                        <p class="muted">${escapeHtml(item.schedule_reason || item.recommended_action || '等待处理')}</p>
                    </div>
                    <div class="compact-side">
                        <div class="inline-tags">
                            ${renderStatusTag(item.delivery_state || 'pending')}
                            ${createTag(`P${item.priority_rank ?? '-'}`, item.priority_rank <= 2 ? 'risk-high' : 'risk-medium')}
                        </div>
                        ${item.project_id ? `<button class="ghost-btn" type="button" data-open-project="${escapeHtml(item.project_id)}">打开</button>` : ''}
                    </div>
                </article>
            `).join('')}
        </div>
    `;
}

function renderExternalPulse(deliverySchedule) {
    const summary = deliverySchedule?.summary || {};
    const rows = deliverySchedule?.schedule_rows || [];

    return `
        <article class="hero-card">
            <p class="eyebrow">外部同步脉搏</p>
            <h2>外部同步脉搏</h2>
            <div class="mini-metrics">
                <div><strong>${escapeHtml(summary.actionable_records ?? 0)}</strong><span>可处理记录</span></div>
                <div><strong>${escapeHtml(summary.ready_to_publish_count ?? 0)}</strong><span>可发布</span></div>
                <div><strong>${escapeHtml(summary.queued_count ?? 0)}</strong><span>已入队</span></div>
                <div><strong>${escapeHtml(summary.failed_count ?? 0)}</strong><span>失败</span></div>
            </div>
            <div class="inline-tags home-pulse-tags">
                ${createTag(`${rows.length} 条排程记录`)}
                ${renderStatusTag('local_shadow')}
                ${renderStatusTag('no_live_write')}
            </div>
        </article>
    `;
}

function renderStatusMix(statusCounts) {
    const rows = Object.entries(statusCounts || {}).filter(([, count]) => Number(count) > 0);
    const total = rows.reduce((sum, [, count]) => sum + Number(count || 0), 0);

    if (!rows.length) {
        return '<div class="empty-state">当前没有状态分布数据。</div>';
    }

    return `
        <div class="status-mix-list">
            ${rows.map(([status, count]) => {
                const percent = total ? Math.round((Number(count) / total) * 100) : 0;
                return `
                    <div class="status-mix-row">
                        <div>
                            <strong>${escapeHtml(getPhotoStudioLabel(status))}</strong>
                            <span>${escapeHtml(count)} 项</span>
                        </div>
                        <div class="status-meter" aria-label="${escapeHtml(`${getPhotoStudioLabel(status)} ${percent}%`)}">
                            <span style="width: ${escapeHtml(percent)}%"></span>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

function renderDataQualityGuardrail(data, weeklyDigest) {
    const quality = weeklyDigest.data_quality || {};
    return `
        <article class="hero-card">
            <p class="eyebrow">数据质量护栏</p>
            <h2>数据质量护栏</h2>
            <div class="mini-metrics">
                <div><strong>${escapeHtml(quality.missing_due_date_count ?? 0)}</strong><span>缺日期</span></div>
                <div><strong>${escapeHtml(quality.missing_customer_count ?? 0)}</strong><span>缺客户</span></div>
                <div><strong>${escapeHtml(quality.missing_project_reference_count ?? 0)}</strong><span>缺项目引用</span></div>
                <div><strong>${escapeHtml((data.missing_fields || []).length)}</strong><span>字段缺失项</span></div>
            </div>
            ${renderDataQualityList(data.missing_fields || [])}
        </article>
    `;
}

function renderShadowHygienePanel(shadowHygiene) {
    const closeout = shadowHygiene?.closeout || {};
    const legacy = shadowHygiene?.legacy || {};
    const closeoutSummary = closeout.summary || {};
    const legacySummary = legacy.summary || {};
    const sampleProjectIds = [
        ...(closeout.samples?.projects || []),
        ...(legacy.samples?.projects || []),
    ]
        .filter(Boolean)
        .slice(0, 6);

    return `
        <article class="hero-card">
            <p class="eyebrow">影子卫生</p>
            <h2>影子数据卫生</h2>
            <p>只读体检，用来看冒烟测试或旧演示 shadow 记录是否还留在当前工作台里。这里不会自动清理数据。</p>
            <div class="mini-metrics">
                <div><strong>${escapeHtml(closeoutSummary.projects ?? 0)}</strong><span>冒烟项目</span></div>
                <div><strong>${escapeHtml(closeoutSummary.customers ?? 0)}</strong><span>冒烟客户</span></div>
                <div><strong>${escapeHtml(closeoutSummary.leads ?? 0)}</strong><span>冒烟线索</span></div>
                <div><strong>${escapeHtml(legacySummary.projects ?? 0)}</strong><span>旧演示项目</span></div>
            </div>
            <div class="inline-tags">
                ${createTag(`${closeoutSummary.total ?? 0} 条候选清理记录`)}
                ${createTag(`${legacySummary.total ?? 0} 条旧演示记录`, legacySummary.total ? 'risk-medium' : '')}
                ${renderStatusTag('local_shadow')}
            </div>
            <div class="card-actions">
                <button class="ghost-btn" type="button" data-home-action="inspect_shadow_data_hygiene">重新体检</button>
            </div>
            ${sampleProjectIds.length ? `
                <div class="compact-list">
                    ${sampleProjectIds.map((projectId) => `
                        <article class="compact-row">
                            <div>
                                <strong>${escapeHtml(projectId)}</strong>
                                <p class="muted">影子卫生样本</p>
                            </div>
                        </article>
                    `).join('')}
                </div>
            ` : '<div class="empty-state">当前没有识别到冒烟测试或旧演示 shadow 记录。</div>'}
        </article>
    `;
}

function renderDashboard(result) {
    const data = result?.data || {};
    const metrics = data.metrics || {};
    const reporting = data.reporting || {};
    const weeklyDigest = reporting.weekly_digest || {};
    const summary = weeklyDigest.summary || {};
    const recentTransitions = weeklyDigest.recent_transitions || [];
    const prioritySummary = reporting.prioritize_pending?.summary || {};

    document.getElementById('scene-root').innerHTML = `
        <section class="scene-panel">
            <article class="hero-card hero-card-wide">
                <div class="hero-grid">
                    <div>
                        <p class="eyebrow">首页</p>
                        <h2>今日驾驶舱</h2>
                        <p>把项目风险、即将交付、最近状态流转和数据质量放在同一屏，方便你先看清楚今天该处理什么。</p>
                    </div>
                    <div class="hero-summary">
                        <div class="summary-chip">活跃项目 ${escapeHtml(summary.active_projects ?? metrics.total_projects ?? 0)}</div>
                        <div class="summary-chip">优先事项 ${escapeHtml(prioritySummary.priority_items ?? 0)}</div>
                        <div class="summary-chip">临近交付 ${escapeHtml(summary.due_soon_projects ?? metrics.upcoming_delivery_count ?? 0)}</div>
                    </div>
                </div>
            </article>

            ${renderHomeMetricGrid(metrics, reporting)}

            <section class="report-grid">
                <article class="hero-card">
                    <p class="eyebrow">今日优先</p>
                    <h2>今天先处理</h2>
                    ${renderPriorityQueue(reporting.prioritize_pending)}
                </article>
                ${renderExternalPulse(reporting.delivery_schedule)}
            </section>

            <section class="report-grid">
                ${renderDataQualityGuardrail(data, weeklyDigest)}
                ${renderShadowHygienePanel(reporting.shadow_hygiene)}
                <article class="hero-card">
                    <p class="eyebrow">状态分布</p>
                    <h2>项目状态分布</h2>
                    ${renderStatusMix(weeklyDigest.status_counts)}
                </article>
            </section>

            <section class="report-grid">
                <article class="hero-card">
                    <p class="eyebrow">即将交付</p>
                    <h2>即将交付</h2>
                    ${renderUpcomingList(data.upcoming_delivery || [])}
                </article>

                <article class="hero-card">
                    <p class="eyebrow">最近流转</p>
                    <h2>最近状态流转</h2>
                    ${renderTransitionsList(recentTransitions)}
                </article>
            </section>

            <article class="hero-card">
                <p class="eyebrow">风险项目</p>
                <h2>优先关注项目</h2>
                <div class="project-list">
                    ${(data.risk_projects || []).length
                        ? data.risk_projects.map(createProjectCard).join('')
                        : '<div class="empty-state">当前没有高风险项目。</div>'}
                </div>
            </article>
            ${renderLastActionResult()}
        </section>
    `;

    bindProjectActions();
    bindHomeActions();
}

function renderProjects(result) {
    const projects = result?.data || [];
    document.getElementById('scene-root').innerHTML = `
        <section class="scene-panel">
            <article class="hero-card">
                <p class="eyebrow">项目指挥台</p>
                <h2>项目推进主战场</h2>
                <p>这里保留“快速建项目 + 项目卡片 + 右抽屉”的主链，适合处理创建、推进状态和补齐信息这三类工作。</p>
            </article>
            <article class="hero-card">
                <p class="eyebrow">快速创建项目</p>
                <form class="form-grid" id="project-create-form">
                    <label class="form-field">
                        <span>客户名</span>
                        <input name="customer_name" type="text" placeholder="例如 王女士" required>
                    </label>
                    <label class="form-field">
                        <span>项目名</span>
                        <input name="project_name" type="text" placeholder="例如 婚礼正片交付" required>
                    </label>
                    <label class="form-field">
                        <span>项目类型</span>
                        <select name="project_type">
                            <option value="portrait">人像</option>
                            <option value="wedding">婚礼</option>
                            <option value="family">家庭</option>
                            <option value="commercial">商业</option>
                        </select>
                    </label>
                    <label class="form-field">
                        <span>交付日期</span>
                        <input name="delivery_deadline" type="date">
                    </label>
                    <label class="form-field">
                        <span>拍摄地点</span>
                        <input name="location" type="text" placeholder="例如 徐汇棚拍">
                    </label>
                    <label class="form-field form-field-wide">
                        <span>备注</span>
                        <textarea name="project_notes" rows="3" placeholder="记录客户诉求、交付要求或档期信息"></textarea>
                    </label>
                    <div class="form-actions form-field-wide">
                        <button class="primary-btn" type="submit">创建项目与任务</button>
                    </div>
                </form>
            </article>
            ${renderProjectBoard(projects)}
            ${renderLastActionResult()}
        </section>
    `;
    bindProjectCreateForm();
    bindProjectActions();
}

function renderInquiry(reports = {}) {
    const selectedProjectId = getSelectedProjectId();
    const projects = getProjectCollection();
    const metrics = getClientLeadMetrics(projects);

    document.getElementById('scene-root').innerHTML = `
        <section class="scene-panel">
            <article class="hero-card hero-card-wide">
                <div class="hero-grid">
                    <div>
                        <p class="eyebrow">客户与线索</p>
                        <h2>成交推进器</h2>
                        <p>这里承接客户、线索、报价、跟进提醒和沟通草稿，所有新增线索与报价先落本地影子记录。</p>
                    </div>
                    <div class="hero-summary">
                        <div class="summary-chip">客户 ${escapeHtml(metrics.customers)}</div>
                        <div class="summary-chip">新线索 ${escapeHtml(metrics.leads)}</div>
                        <div class="summary-chip">待跟进 ${escapeHtml(metrics.followups)}</div>
                    </div>
                </div>
            </article>
            ${renderClientLeadMetricGrid(metrics)}
            <section class="report-grid">
                ${renderLeadPipeline(metrics)}
                ${renderFollowupPanel(metrics, projects, selectedProjectId)}
            </section>
            ${renderClientLeadShadowPanel(reports)}
            ${renderLeadQuoteForms(projects, selectedProjectId)}
            <section class="split-grid">
                <article class="hero-card">
                    <p class="eyebrow">创建客户</p>
                    <form class="form-grid" id="inquiry-customer-form">
                        <label class="form-field">
                            <span>客户名</span>
                            <input name="customer_name" type="text" placeholder="例如 李先生" required>
                        </label>
                        <label class="form-field">
                            <span>客户类型</span>
                            <select name="customer_type">
                                <option value="individual">个人客户</option>
                                <option value="company">企业客户</option>
                                <option value="brand">品牌客户</option>
                                <option value="agency">代理机构</option>
                                <option value="organization">组织客户</option>
                            </select>
                        </label>
                        <label class="form-field">
                            <span>来源</span>
                            <select name="source">
                                <option value="social_media">社媒来源</option>
                                <option value="referral">转介绍</option>
                                <option value="returning">复购客户</option>
                                <option value="walk_in">到店接待</option>
                                <option value="other">其他</option>
                            </select>
                        </label>
                        <label class="form-field">
                            <span>手机号</span>
                            <input name="contact_phone" type="text" placeholder="可选">
                        </label>
                        <label class="form-field">
                            <span>微信</span>
                            <input name="contact_wechat" type="text" placeholder="可选">
                        </label>
                        <label class="form-field form-field-wide">
                            <span>备注</span>
                            <textarea name="notes" rows="3" placeholder="记录偏好、预算、需求"></textarea>
                        </label>
                        <div class="form-actions form-field-wide">
                            <button class="primary-btn" type="submit">创建客户</button>
                        </div>
                    </form>
                </article>
                <article class="hero-card">
                    <p class="eyebrow">生成回复草稿</p>
                    <form class="form-grid" id="inquiry-draft-form">
                        <label class="form-field">
                            <span>项目 ID</span>
                            <input name="project_id" type="text" value="${escapeHtml(selectedProjectId)}" placeholder="为空则使用当前抽屉项目">
                        </label>
                        <label class="form-field">
                            <span>场景</span>
                            <select name="context_type">
                                <option value="general">通用</option>
                                <option value="quotation">报价</option>
                                <option value="delivery">交付</option>
                            </select>
                        </label>
                        <label class="form-field">
                            <span>语气</span>
                            <select name="tone">
                                <option value="warm">温和</option>
                                <option value="concise">简洁</option>
                                <option value="professional">专业</option>
                            </select>
                        </label>
                        <label class="form-field form-field-wide">
                            <span>关键点</span>
                            <textarea name="key_points" rows="4" placeholder="例如：档期可约、拍摄人数、报价区间、交付周期"></textarea>
                        </label>
                        <div class="form-actions form-field-wide">
                            <button class="primary-btn" type="submit">生成草稿</button>
                        </div>
                    </form>
                </article>
            </section>
            ${renderLastActionResult()}
        </section>
    `;

    bindProjectActions();
    bindClientLeadActions();
    bindInquiryForms();
}

function renderScheduleBoard(bookingsResult = null) {
    const projects = getProjectCollection();
    const entries = getScheduleEntries(projects);
    const metrics = getScheduleMetrics(projects, entries);
    const bookings = bookingsResult?.data?.bookings || [];

    document.getElementById('scene-root').innerHTML = `
        <section class="scene-panel">
            <article class="hero-card hero-card-wide">
                <div class="hero-grid">
                    <div>
                        <p class="eyebrow">日程排期</p>
                        <h2>资源与时间冲突中心</h2>
                        <p>先用项目交付日期形成只读排期视角，帮助判断本周窗口、同日冲突和资源压力。当前不会写入任何 Booking 数据。</p>
                    </div>
                    <div class="hero-summary">
                        <div class="summary-chip">已排期 ${escapeHtml(metrics.scheduled)}</div>
                        <div class="summary-chip">本周 ${escapeHtml(metrics.thisWeek)}</div>
                        <div class="summary-chip">本地预约 ${escapeHtml(bookings.length)}</div>
                        <div class="summary-chip">冲突 ${escapeHtml(metrics.conflicts)}</div>
                    </div>
                </div>
            </article>
            ${renderScheduleMetricGrid(metrics)}

            <section class="report-grid">
                <article class="hero-card">
                    <p class="eyebrow">近期时间线</p>
                    <h2>近期时间线</h2>
                    ${renderScheduleTimeline(entries)}
                </article>
                <article class="hero-card">
                    <p class="eyebrow">本地预约</p>
                    <h2>本地预约</h2>
                    ${renderLocalBookingList(bookings)}
                </article>
            </section>

            <section class="report-grid">
                ${renderResourceReadiness(projects)}
                ${renderScheduleGuardrail(metrics)}
            </section>

            <section class="report-grid">
                ${renderCreateBookingPanel(projects, getSelectedProjectId())}
                <article class="hero-card">
                        <p class="eyebrow">后续接线</p>
                        <h2>后续接线动作</h2>
                        <div class="inline-tags">
                            ${createTag('list_bookings')}
                            ${createTag('create_booking')}
                            ${createTag('update_booking_time')}
                            ${createTag('start_booking')}
                        </div>
                        <div class="card-actions">
                            <button class="ghost-btn" type="button" data-schedule-action="list_bookings">读取预约</button>
                        </div>
                </article>
            </section>
            ${renderLastActionResult()}
        </section>
    `;

    bindProjectActions();
    bindScheduleActions();
}

function renderDelivery(result, reports = {}) {
    const projects = result?.data || getProjectCollection();
    const grouped = groupDeliveryProjects(projects);
    const metrics = getDeliveryMetrics(projects, grouped);

    document.getElementById('scene-root').innerHTML = `
        <section class="scene-panel">
            <article class="hero-card hero-card-wide">
                <div class="hero-grid">
                    <div>
                        <p class="eyebrow">交付与素材</p>
                        <h2>客户体验门面</h2>
                        <p>把“可以发选片通知”“可以建交付任务”“仍需继续推进”的项目拆开，减少误点和来回筛选。</p>
                    </div>
                    <div class="hero-summary">
                        <div class="summary-chip">选片就绪 ${escapeHtml(metrics.readyForSelection)}</div>
                        <div class="summary-chip">交付就绪 ${escapeHtml(metrics.readyForDelivery)}</div>
                        <div class="summary-chip">待推进 ${escapeHtml(metrics.blocked)}</div>
                    </div>
                </div>
            </article>
            ${renderDeliveryMetricGrid(metrics)}
            ${renderDeliveryOpsPanel(metrics)}
            ${renderDeliveryReportDashboard(reports)}
            ${renderDeliveryPackagePanel(reports)}
            <section class="report-grid delivery-grid">
                ${renderDeliveryGroup('可发选片通知', '选片通知', grouped.readyForSelection)}
                ${renderDeliveryGroup('可建交付任务', '交付任务', grouped.readyForDelivery)}
            </section>
            ${renderDeliveryGroup('还需继续推进', '待推进', grouped.blocked)}
            ${renderLastActionResult()}
        </section>
    `;

    bindProjectActions();
    bindDeliveryActions();
}

async function loadDeliveryReports() {
    const actions = [
        'list_delivery_packages',
        'prioritize_pending_delivery_actions',
        'generate_delivery_queue_schedule',
        'inspect_delivery_audit_trail',
    ];
    const entries = await Promise.all(actions.map(async (action) => {
        try {
            const result = await window.PhotoStudioApi.runAction('delivery_assets', action, {});
            return [action, result];
        } catch (error) {
            return [action, {
                success: false,
                data: null,
                error: { message: getErrorMessage(error) },
            }];
        }
    }));
    return Object.fromEntries(entries);
}

async function loadClientLeadReports() {
    const actions = ['list_leads', 'list_quotes'];
    const entries = await Promise.all(actions.map(async (action) => {
        try {
            const result = await window.PhotoStudioApi.runAction('client_leads', action, {});
            return [action, result];
        } catch (error) {
            return [action, {
                success: false,
                data: null,
                error: { message: getErrorMessage(error) },
            }];
        }
    }));
    return Object.fromEntries(entries);
}

async function loadProjectIntoDrawer(projectId) {
    try {
        getState().selectedProjectId = projectId;
        const result = await window.PhotoStudioApi.getProject(projectId);
        getState().setProjectDetail(result);
        renderDrawer(result);
        bindDrawerActions();
        setStatusChip(`项目抽屉：${projectId}`);
    } catch (error) {
        showToast(`项目详情加载失败：${getErrorMessage(error)}`);
        setStatusChip('项目抽屉加载失败');
    }
}

async function renderSceneByName(scene) {
    const normalizedScene = normalizeScene(scene);
    try {
        setStatusChip(`正在加载：${getSceneLabel(normalizedScene)}`);

        if (normalizedScene === 'home') {
            const result = await window.PhotoStudioApi.getDashboard();
            getState().setDashboard(result);
            renderDashboard(result);
            setStatusChip('首页已同步');
            return;
        }

        if (normalizedScene === 'project_command') {
            const result = await window.PhotoStudioApi.listProjects({});
            getState().setProjects(result);
            renderProjects(result);
            setStatusChip('项目指挥台已同步');
            return;
        }

        if (normalizedScene === 'schedule_board') {
            if (!getState().projects) {
                getState().setProjects(await window.PhotoStudioApi.listProjects({}));
            }
            const bookingsResult = await window.PhotoStudioApi.runAction('schedule_board', 'list_bookings', {});
            renderScheduleBoard(bookingsResult);
            setStatusChip('日程排期已就绪');
            return;
        }

        if (normalizedScene === 'client_leads') {
            if (!getState().projects) {
                getState().setProjects(await window.PhotoStudioApi.listProjects({}));
            }
            const clientLeadReports = await loadClientLeadReports();
            renderInquiry(clientLeadReports);
            setStatusChip('客户与线索已就绪');
            return;
        }

        if (normalizedScene === 'delivery_assets') {
            if (!getState().projects) {
                getState().setProjects(await window.PhotoStudioApi.listProjects({}));
            }
            const deliveryReports = await loadDeliveryReports();
            renderDelivery(getState().projects, deliveryReports);
            setStatusChip('交付与素材已就绪');
            return;
        }

        renderSceneError(normalizedScene, new Error(`unsupported scene: ${normalizedScene}`));
        setStatusChip(`${getSceneLabel(normalizedScene)}加载失败`);
    } catch (error) {
        renderSceneError(normalizedScene, error);
        showToast(`场景加载失败：${getErrorMessage(error)}`);
        setStatusChip(`${getSceneLabel(normalizedScene)}加载失败`);
    }
}

async function switchScene(sceneName) {
    const normalizedScene = normalizeScene(sceneName);
    getState().currentScene = normalizedScene;
    document.querySelectorAll('.nav-item').forEach((button) => {
        button.classList.toggle('active', normalizeScene(button.dataset.scene) === normalizedScene);
    });
    await renderSceneByName(normalizedScene);
}

async function refreshScene(scene) {
    const normalizedScene = normalizeScene(scene);

    if (normalizedScene === 'project_drawer' && getSelectedProjectId()) {
        await loadProjectIntoDrawer(getSelectedProjectId());
        return;
    }

    if (normalizedScene === 'home'
        || normalizedScene === 'project_command'
        || normalizedScene === 'schedule_board'
        || normalizedScene === 'client_leads'
        || normalizedScene === 'delivery_assets') {
        await renderSceneByName(normalizedScene);
        return;
    }
}

async function runActionAndSync(scene, action, payload) {
    try {
        const confirmationMessage = HIGH_RISK_ACTION_CONFIRMATIONS[action];
        if (confirmationMessage && !window.confirm(confirmationMessage)) {
            showToast('已取消操作');
            setStatusChip(`${getActionLabel(action)}已取消`);
            return {
                success: false,
                data: null,
                error: {
                    code: 'USER_CANCELLED',
                    message: '用户已取消高风险动作。',
                },
                ui_hints: {},
                action_context: { scene, action },
            };
        }

        setStatusChip(`正在执行：${getActionLabel(action)}`);
        const result = await window.PhotoStudioApi.runAction(scene, action, payload);
        const actionResult = {
            ...result,
            action_context: { scene, action },
        };
        getState().setLastActionResult(actionResult);

        if (!result.success && result.error?.message) {
            showToast(result.error.message);
            setStatusChip(`${getActionLabel(action)}失败`);
        } else {
            setStatusChip(`${getActionLabel(action)}完成`);
        }

        window.PhotoStudioEvents.applyUiHints(result.ui_hints);

        if (normalizeScene(scene) === 'project_command' && isCurrentScene('project_command')) {
            await renderSceneByName('project_command');
        }

        if (normalizeScene(scene) === 'client_leads' && isCurrentScene('client_leads')) {
            await renderSceneByName('client_leads');
        }

        if (normalizeScene(scene) === 'delivery_assets' && isCurrentScene('delivery_assets')) {
            await renderSceneByName('delivery_assets');
        }

        return actionResult;
    } catch (error) {
        const result = {
            success: false,
            data: null,
            error: {
                code: 'RENDERER_ACTION_ERROR',
                message: getErrorMessage(error),
            },
            ui_hints: {},
            action_context: { scene, action },
        };
        getState().setLastActionResult(result);
        showToast(`动作执行失败：${result.error.message}`);
        setStatusChip(`${getActionLabel(action)}失败`);
        return result;
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    document.querySelectorAll('.nav-item').forEach((button) => {
        button.addEventListener('click', () => {
            void switchScene(button.dataset.scene);
        });
    });

    document.getElementById('btn-refresh')?.addEventListener('click', () => {
        void refreshScene(getState().currentScene);
    });

    document.getElementById('btn-new-project')?.addEventListener('click', async () => {
        await switchScene('project_command');
        document.getElementById('project-create-form')?.querySelector('input[name="customer_name"]')?.focus();
    });

    window.PhotoStudioEvents.on('toast:show', (message) => {
        showToast(message);
    });

    window.PhotoStudioEvents.on('project:selected', (projectId) => {
        void loadProjectIntoDrawer(projectId);
    });

    window.PhotoStudioEvents.on('scene:focus', (scene) => {
        void switchScene(scene);
    });

    window.PhotoStudioEvents.on('scene:refresh', (scene) => {
        void refreshScene(scene);
    });

    renderDrawer(null);

    if (window.desktopAPI?.windowReady) {
        window.desktopAPI.windowReady('photo-studio');
    }

    await switchScene('home');
});
