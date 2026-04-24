function escapeHtml(value) {
    return String(value || '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function getState() {
    return window.PhotoStudioState;
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
                <p class="eyebrow">Scene / ${escapeHtml(scene)}</p>
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
    if (data.project || data.customer || data.tasks) {
        return {
            title: '项目已创建',
            description: '客户、项目和任务已经写入工作台。',
            rows: [
                ['客户', data.customer?.customer_name || data.customer?.customer_id || '-'],
                ['项目', data.project?.project_name || data.project?.project_id || '-'],
                ['任务数', Array.isArray(data.tasks) ? data.tasks.length : (data.tasks?.tasks?.length || '-')],
            ],
            tone: 'success',
        };
    }

    if (data.draft_text || data.reply_draft || data.message) {
        return {
            title: '回复草稿已生成',
            description: data.draft_text || data.reply_draft || data.message,
            rows: [
                ['项目', data.project_id || '-'],
                ['语气', data.tone || '-'],
            ],
            tone: 'success',
        };
    }

    if (data.task_count || data.created_tasks || data.tasks) {
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

    if (data.notice_text || data.selection_notice) {
        return {
            title: '选片通知已生成',
            description: data.notice_text || data.selection_notice,
            rows: [['项目', data.project_id || '-']],
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
                <p class="drawer-label">Project Context</p>
                <h2>等待选择项目</h2>
                <p class="muted">点击项目卡片后，这里会展示项目详情、任务、状态日志和可执行动作。</p>
            </div>
        `;
        return;
    }

    const allowedTransitions = project.allowed_transitions || [];
    const nextStatus = allowedTransitions[0] || '';
    const riskMissing = project.risk?.missing || [];
    const taskItems = tasks.map((task) => `<li>${escapeHtml(task.name)} · ${escapeHtml(task.status)}</li>`).join('');
    const logItems = logs.map((item) => `<li>${escapeHtml(item.at)} · ${escapeHtml(item.message)}</li>`).join('');

    root.innerHTML = `
        <div class="drawer-card">
            <p class="drawer-label">Project Context</p>
            <h2>${escapeHtml(project.project_name)}</h2>
            <div class="drawer-kv">
                <div><strong>客户</strong><span>${escapeHtml(project.customer_name || '-')}</span></div>
                <div><strong>状态</strong><span>${escapeHtml(project.status)}</span></div>
                <div><strong>交付日期</strong><span>${escapeHtml(formatDate(project.delivery_deadline))}</span></div>
            </div>
            <div class="inline-tags">
                ${createTag(project.project_type || 'unknown')}
                ${createTag(`风险 ${project.risk?.level || 'unknown'}`, getRiskTone(project.risk?.level))}
                ${riskMissing.length ? createTag(`缺字段 ${riskMissing.join(', ')}`) : ''}
            </div>
            <p class="muted">允许推进: ${escapeHtml(allowedTransitions.join(' / ') || '无')}</p>
            <div class="drawer-actions">
                <button class="ghost-btn" type="button" data-drawer-action="generate_draft" data-project-id="${escapeHtml(project.project_id)}">生成回复草稿</button>
                <button class="ghost-btn" type="button" data-drawer-action="create_tasks" data-project-id="${escapeHtml(project.project_id)}">补建任务</button>
                <button class="primary-btn" type="button" data-drawer-action="advance_status" data-project-id="${escapeHtml(project.project_id)}" data-next-status="${escapeHtml(nextStatus)}" ${nextStatus ? '' : 'disabled'}>推进到下一状态</button>
                <button class="ghost-btn danger-btn" type="button" data-drawer-action="archive_project" data-project-id="${escapeHtml(project.project_id)}">归档项目</button>
            </div>
            <p class="drawer-label">Tasks</p>
            <ul class="drawer-list">${taskItems || '<li>暂无任务</li>'}</ul>
            <p class="drawer-label">Logs</p>
            <ul class="drawer-list">${logItems || '<li>暂无日志</li>'}</ul>
        </div>
    `;
}

function createProjectCard(project) {
    const riskLevel = project.risk?.level || 'low';
    const missing = project.risk?.missing || [];
    return `
        <article class="project-card">
            <div class="card-header">
                <div>
                    <h3>${escapeHtml(project.project_name)}</h3>
                    <p class="muted">${escapeHtml(project.customer_name || '未关联客户')}</p>
                </div>
                ${createTag(project.status)}
            </div>
            <div class="project-meta">
                ${createTag(`风险 ${riskLevel}`, getRiskTone(riskLevel))}
                ${createTag(project.project_type || 'unknown')}
                ${missing.length ? createTag(`缺 ${missing.join(', ')}`) : ''}
            </div>
            <p class="muted">交付日期: ${escapeHtml(formatDate(project.delivery_deadline))}</p>
            <div class="card-actions">
                <button class="ghost-btn" type="button" data-open-project="${escapeHtml(project.project_id)}">查看详情</button>
                <button class="primary-btn" type="button" data-advance-project="${escapeHtml(project.project_id)}">推进状态</button>
            </div>
        </article>
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
                ${createTag(project.status)}
            </div>
            <div class="project-meta">
                ${createTag(project.project_type || 'unknown')}
                ${createTag(formatDate(project.delivery_deadline))}
            </div>
            <p class="muted">${escapeHtml(getDeliveryStatusHint(project))}</p>
            <div class="card-actions">
                <button class="ghost-btn" type="button" data-open-project="${escapeHtml(project.project_id)}">打开抽屉</button>
                <button class="ghost-btn" type="button" data-delivery-action="create_selection_notice" data-project-id="${escapeHtml(project.project_id)}" ${canSelect ? '' : 'disabled'}>生成选片通知</button>
                <button class="primary-btn" type="button" data-delivery-action="create_delivery_tasks" data-project-id="${escapeHtml(project.project_id)}" ${canDeliver ? '' : 'disabled'}>生成交付任务</button>
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
                        <p class="muted">${escapeHtml(item.customer_name || '未关联客户')} · ${escapeHtml(item.status)}</p>
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
                        <span>${escapeHtml(`${item.old_status} -> ${item.new_status}`)}</span>
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
                const nextStatus = project?.allowed_transitions?.[0] || 'preparing';
                await runActionAndSync('project_board', 'advance_status', {
                    project_id: projectId,
                    new_status: nextStatus,
                });
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

                await runActionAndSync('project_drawer', action, payload);
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
                });
            } finally {
                setButtonBusy(button, false);
            }
        });
    });
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
}

function renderDashboard(result) {
    const data = result?.data || {};
    const metrics = data.metrics || {};
    const reporting = data.reporting || {};
    const weeklyDigest = reporting.weekly_digest || {};
    const summary = weeklyDigest.summary || {};
    const recentTransitions = weeklyDigest.recent_transitions || [];

    document.getElementById('scene-root').innerHTML = `
        <section class="scene-panel">
            <article class="hero-card hero-card-wide">
                <div class="hero-grid">
                    <div>
                        <p class="eyebrow">Scene / dashboard</p>
                        <h2>本周工作台总览</h2>
                        <p>把项目风险、即将交付、最近状态流转和数据质量放在同一屏，方便你先看清楚今天该处理什么。</p>
                    </div>
                    <div class="hero-summary">
                        <div class="summary-chip">活跃项目 ${escapeHtml(summary.active_projects ?? metrics.total_projects ?? 0)}</div>
                        <div class="summary-chip">最近流转 ${escapeHtml(summary.recent_transition_count ?? 0)}</div>
                        <div class="summary-chip">临近交付 ${escapeHtml(summary.due_soon_projects ?? metrics.upcoming_delivery_count ?? 0)}</div>
                    </div>
                </div>
            </article>

            <section class="card-grid">
                ${renderMetricCard('项目总数', metrics.total_projects ?? 0, '所有已落入工作台的项目')}
                ${renderMetricCard('风险项目', metrics.risk_projects_count ?? 0, '存在缺字段或交付风险')}
                ${renderMetricCard('临近交付', metrics.upcoming_delivery_count ?? 0, '需要优先关注交期')}
            </section>

            <section class="report-grid">
                <article class="hero-card">
                    <p class="eyebrow">Reporting / Weekly Digest</p>
                    <h2>本周摘要</h2>
                    <div class="mini-metrics">
                        <div><strong>${escapeHtml(summary.active_projects ?? 0)}</strong><span>活跃项目</span></div>
                        <div><strong>${escapeHtml(summary.closed_projects ?? 0)}</strong><span>已关闭</span></div>
                        <div><strong>${escapeHtml(summary.overdue_projects ?? 0)}</strong><span>已逾期</span></div>
                        <div><strong>${escapeHtml(summary.due_soon_projects ?? 0)}</strong><span>即将到期</span></div>
                    </div>
                </article>

                <article class="hero-card">
                    <p class="eyebrow">Data Quality</p>
                    <h2>字段缺失</h2>
                    ${renderDataQualityList(data.missing_fields || [])}
                </article>
            </section>

            <section class="report-grid">
                <article class="hero-card">
                    <p class="eyebrow">Upcoming Delivery</p>
                    <h2>即将交付</h2>
                    ${renderUpcomingList(data.upcoming_delivery || [])}
                </article>

                <article class="hero-card">
                    <p class="eyebrow">Recent Transitions</p>
                    <h2>最近状态流转</h2>
                    ${renderTransitionsList(recentTransitions)}
                </article>
            </section>

            <article class="hero-card">
                <p class="eyebrow">Risk Projects</p>
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
}

function renderProjects(result) {
    const projects = result?.data || [];
    document.getElementById('scene-root').innerHTML = `
        <section class="scene-panel">
            <article class="hero-card">
                <p class="eyebrow">Scene / projects</p>
                <h2>项目看板</h2>
                <p>这里保留“快速建项目 + 项目卡片 + 右抽屉”的主链，适合处理创建、推进状态和补齐信息这三类工作。</p>
            </article>
            <article class="hero-card">
                <p class="eyebrow">Quick Create</p>
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
                            <option value="portrait">portrait</option>
                            <option value="wedding">wedding</option>
                            <option value="family">family</option>
                            <option value="commercial">commercial</option>
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
            <div class="project-list">
                ${projects.length ? projects.map(createProjectCard).join('') : '<div class="empty-state">当前还没有项目，先创建一个试试。</div>'}
            </div>
            ${renderLastActionResult()}
        </section>
    `;
    bindProjectCreateForm();
    bindProjectActions();
}

function renderInquiry() {
    const selectedProjectId = getSelectedProjectId();
    document.getElementById('scene-root').innerHTML = `
        <section class="scene-panel">
            <article class="hero-card">
                <p class="eyebrow">Scene / inquiry</p>
                <h2>询单收口区</h2>
                <p>这里适合先落客户、再生成沟通草稿。草稿支持直接填项目 ID，也支持沿用当前抽屉选中的项目。</p>
            </article>
            <section class="split-grid">
                <article class="hero-card">
                    <p class="eyebrow">Create Customer</p>
                    <form class="form-grid" id="inquiry-customer-form">
                        <label class="form-field">
                            <span>客户名</span>
                            <input name="customer_name" type="text" placeholder="例如 李先生" required>
                        </label>
                        <label class="form-field">
                            <span>客户类型</span>
                            <select name="customer_type">
                                <option value="individual">individual</option>
                                <option value="business">business</option>
                            </select>
                        </label>
                        <label class="form-field">
                            <span>来源</span>
                            <select name="source">
                                <option value="social_media">social_media</option>
                                <option value="referral">referral</option>
                                <option value="returning">returning</option>
                                <option value="walk_in">walk_in</option>
                                <option value="other">other</option>
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
                    <p class="eyebrow">Generate Reply Draft</p>
                    <form class="form-grid" id="inquiry-draft-form">
                        <label class="form-field">
                            <span>项目 ID</span>
                            <input name="project_id" type="text" value="${escapeHtml(selectedProjectId)}" placeholder="为空则使用当前抽屉项目">
                        </label>
                        <label class="form-field">
                            <span>场景</span>
                            <select name="context_type">
                                <option value="general">general</option>
                                <option value="pricing">pricing</option>
                                <option value="delivery">delivery</option>
                            </select>
                        </label>
                        <label class="form-field">
                            <span>语气</span>
                            <select name="tone">
                                <option value="warm">warm</option>
                                <option value="concise">concise</option>
                                <option value="professional">professional</option>
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

    bindInquiryForms();
}

function renderDelivery(result) {
    const projects = result?.data || getProjectCollection();
    const grouped = groupDeliveryProjects(projects);

    document.getElementById('scene-root').innerHTML = `
        <section class="scene-panel">
            <article class="hero-card hero-card-wide">
                <div class="hero-grid">
                    <div>
                        <p class="eyebrow">Scene / delivery</p>
                        <h2>交付工作台</h2>
                        <p>把“可以发选片通知”“可以建交付任务”“仍需继续推进”的项目拆开，减少误点和来回筛选。</p>
                    </div>
                    <div class="hero-summary">
                        <div class="summary-chip">选片就绪 ${escapeHtml(grouped.readyForSelection.length)}</div>
                        <div class="summary-chip">交付就绪 ${escapeHtml(grouped.readyForDelivery.length)}</div>
                        <div class="summary-chip">待推进 ${escapeHtml(grouped.blocked.length)}</div>
                    </div>
                </div>
            </article>
            <section class="report-grid delivery-grid">
                ${renderDeliveryGroup('可发选片通知', 'Delivery / Selection Notice', grouped.readyForSelection)}
                ${renderDeliveryGroup('可建交付任务', 'Delivery / Delivery Tasks', grouped.readyForDelivery)}
            </section>
            ${renderDeliveryGroup('还需继续推进', 'Delivery / Needs Progress', grouped.blocked)}
            ${renderLastActionResult()}
        </section>
    `;

    bindProjectActions();
    bindDeliveryActions();
}

async function loadProjectIntoDrawer(projectId) {
    try {
        getState().selectedProjectId = projectId;
        const result = await window.PhotoStudioApi.getProject(projectId);
        getState().setProjectDetail(result);
        renderDrawer(result);
        bindDrawerActions();
        setStatusChip(`Drawer: ${projectId}`);
    } catch (error) {
        showToast(`项目详情加载失败：${getErrorMessage(error)}`);
        setStatusChip('Drawer load failed');
    }
}

async function renderSceneByName(scene) {
    try {
        setStatusChip(`Loading ${scene}...`);

        if (scene === 'dashboard') {
            const result = await window.PhotoStudioApi.getDashboard();
            getState().setDashboard(result);
            renderDashboard(result);
            setStatusChip('Dashboard synced');
            return;
        }

        if (scene === 'projects') {
            const result = await window.PhotoStudioApi.listProjects({});
            getState().setProjects(result);
            renderProjects(result);
            setStatusChip('Projects synced');
            return;
        }

        if (scene === 'inquiry') {
            renderInquiry();
            setStatusChip('Inquiry ready');
            return;
        }

        if (scene === 'delivery') {
            if (!getState().projects) {
                getState().setProjects(await window.PhotoStudioApi.listProjects({}));
            }
            renderDelivery(getState().projects);
            setStatusChip('Delivery ready');
        }
    } catch (error) {
        renderSceneError(scene, error);
        showToast(`场景加载失败：${getErrorMessage(error)}`);
        setStatusChip(`${scene} failed`);
    }
}

async function switchScene(sceneName) {
    getState().currentScene = sceneName;
    document.querySelectorAll('.nav-item').forEach((button) => {
        button.classList.toggle('active', button.dataset.scene === sceneName);
    });
    await renderSceneByName(sceneName);
}

async function refreshScene(scene) {
    if (scene === 'project_board') {
        await renderSceneByName('projects');
        return;
    }

    if (scene === 'project_drawer' && getSelectedProjectId()) {
        await loadProjectIntoDrawer(getSelectedProjectId());
        return;
    }

    if (scene === 'delivery_panel') {
        await renderSceneByName('delivery');
        return;
    }

    if (scene === 'dashboard' || scene === 'delivery') {
        await renderSceneByName(scene);
    }
}

async function runActionAndSync(scene, action, payload) {
    try {
        setStatusChip(`Running ${action}...`);
        const result = await window.PhotoStudioApi.runAction(scene, action, payload);
        getState().setLastActionResult(result);

        if (!result.success && result.error?.message) {
            showToast(result.error.message);
            setStatusChip(`${action} failed`);
        } else {
            setStatusChip(`${action} done`);
        }

        window.PhotoStudioEvents.applyUiHints(result.ui_hints);

        if (scene === 'project_board' && getState().currentScene === 'projects') {
            await renderSceneByName('projects');
        }

        if (scene === 'inquiry' && getState().currentScene === 'inquiry') {
            renderInquiry();
        }

        if (scene === 'delivery_panel' && getState().currentScene === 'delivery') {
            await renderSceneByName('delivery');
        }

        return result;
    } catch (error) {
        const result = {
            success: false,
            data: null,
            error: {
                code: 'RENDERER_ACTION_ERROR',
                message: getErrorMessage(error),
            },
            ui_hints: {},
        };
        getState().setLastActionResult(result);
        showToast(`动作执行失败：${result.error.message}`);
        setStatusChip(`${action} failed`);
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
        await switchScene('projects');
        document.getElementById('project-create-form')?.querySelector('input[name="customer_name"]')?.focus();
    });

    window.PhotoStudioEvents.on('toast:show', (message) => {
        showToast(message);
    });

    window.PhotoStudioEvents.on('project:selected', (projectId) => {
        void loadProjectIntoDrawer(projectId);
    });

    window.PhotoStudioEvents.on('scene:refresh', (scene) => {
        void refreshScene(scene);
    });

    renderDrawer(null);

    if (window.desktopAPI?.windowReady) {
        window.desktopAPI.windowReady('photo-studio');
    }

    await switchScene('dashboard');
});
