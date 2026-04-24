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

function canCreateDeliveryTasks(project) {
    return ['retouching', 'delivering', 'completed'].includes(project?.status);
}

function canCreateSelectionNotice(project) {
    return ['shot', 'selection_pending'].includes(project?.status);
}

function getDeliveryStatusHint(project) {
    if (canCreateSelectionNotice(project)) {
        return '当前状态可生成选片通知。';
    }
    if (canCreateDeliveryTasks(project)) {
        return '当前状态可直接创建交付任务。';
    }
    return `当前状态是 ${project?.status || 'unknown'}，选片通知要求 shot / selection_pending，交付任务要求 retouching / delivering / completed。`;
}

function renderLastActionResult() {
    const result = getState().lastActionResult;
    if (!result) {
        return '';
    }

    const title = result.success ? 'Latest Action' : 'Latest Error';
    const body = result.success ? result.data : result.error;
    return `
        <article class="result-card">
            <p class="eyebrow">${escapeHtml(title)}</p>
            <pre>${escapeHtml(JSON.stringify(body, null, 2))}</pre>
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
    const taskItems = tasks.map((task) => `<li>${escapeHtml(task.name)} · ${escapeHtml(task.status)}</li>`).join('');
    const logItems = logs.map((item) => `<li>${escapeHtml(item.at)} · ${escapeHtml(item.message)}</li>`).join('');

    root.innerHTML = `
        <div class="drawer-card">
            <p class="drawer-label">Project Context</p>
            <h2>${escapeHtml(project.project_name)}</h2>
            <div class="drawer-kv">
                <div><strong>客户</strong><span>${escapeHtml(project.customer_name || '-')}</span></div>
                <div><strong>状态</strong><span>${escapeHtml(project.status)}</span></div>
                <div><strong>交付日期</strong><span>${escapeHtml(project.delivery_deadline || '-')}</span></div>
            </div>
            <p class="muted">允许推进: ${escapeHtml(allowedTransitions.join(', ') || '-')}</p>
            <p class="muted">风险等级: ${escapeHtml(project.risk?.level || 'unknown')}</p>
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
    return `
        <article class="project-card">
            <h3>${escapeHtml(project.project_name)}</h3>
            <p class="muted">${escapeHtml(project.customer_name || '')}</p>
            <div class="project-meta">
                <span class="pill">${escapeHtml(project.status)}</span>
                <span class="pill risk-${escapeHtml(riskLevel)}">risk: ${escapeHtml(riskLevel)}</span>
                <span class="pill">${escapeHtml(project.project_type || 'unknown')}</span>
            </div>
            <p class="muted">交付日期: ${escapeHtml(project.delivery_deadline || '-')}</p>
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
            <h3>${escapeHtml(project.project_name)}</h3>
            <p class="muted">${escapeHtml(project.customer_name || '')}</p>
            <div class="project-meta">
                <span class="pill">${escapeHtml(project.status)}</span>
                <span class="pill">${escapeHtml(project.delivery_deadline || '-')}</span>
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

function bindProjectActions() {
    document.querySelectorAll('[data-open-project]').forEach((button) => {
        button.addEventListener('click', () => {
            window.PhotoStudioEvents.emit('project:selected', button.dataset.openProject);
        });
    });

    document.querySelectorAll('[data-advance-project]').forEach((button) => {
        button.addEventListener('click', async () => {
            const projectId = button.dataset.advanceProject;
            const project = getProjectById(projectId);
            const nextStatus = project?.allowed_transitions?.[0] || 'preparing';
            await runActionAndSync('project_board', 'advance_status', {
                project_id: projectId,
                new_status: nextStatus,
            });
        });
    });
}

function bindDrawerActions() {
    document.querySelectorAll('[data-drawer-action]').forEach((button) => {
        button.addEventListener('click', async () => {
            const action = button.dataset.drawerAction;
            const projectId = button.dataset.projectId;
            const payload = { project_id: projectId };

            if (action === 'advance_status') {
                payload.new_status = button.dataset.nextStatus;
            }

            await runActionAndSync('project_drawer', action, payload);
        });
    });
}

function bindDeliveryActions() {
    document.querySelectorAll('[data-delivery-action]').forEach((button) => {
        button.addEventListener('click', async () => {
            await runActionAndSync('delivery_panel', button.dataset.deliveryAction, {
                project_id: button.dataset.projectId,
            });
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
        const formData = new FormData(form);
        await runActionAndSync('project_board', 'create_project_draft', {
            customer_name: formData.get('customer_name'),
            project_name: formData.get('project_name'),
            project_type: formData.get('project_type'),
            delivery_deadline: formData.get('delivery_deadline'),
            location: formData.get('location'),
            project_notes: formData.get('project_notes'),
        });
        form.reset();
    });
}

function bindInquiryForms() {
    const createCustomerForm = document.getElementById('inquiry-customer-form');
    if (createCustomerForm) {
        createCustomerForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const formData = new FormData(createCustomerForm);
            await runActionAndSync('inquiry', 'create_customer', {
                customer_name: formData.get('customer_name'),
                customer_type: formData.get('customer_type'),
                source: formData.get('source'),
                contact_phone: formData.get('contact_phone'),
                contact_wechat: formData.get('contact_wechat'),
                notes: formData.get('notes'),
            });
            createCustomerForm.reset();
        });
    }

    const draftForm = document.getElementById('inquiry-draft-form');
    if (draftForm) {
        draftForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const formData = new FormData(draftForm);
            await runActionAndSync('inquiry', 'generate_draft', {
                project_id: toProjectId(formData.get('project_id')) || getSelectedProjectId(),
                context_type: formData.get('context_type'),
                tone: formData.get('tone'),
                key_points: formData.get('key_points'),
            });
        });
    }
}

function renderDashboard(result) {
    const data = result?.data || {};
    const metrics = data.metrics || {};
    const riskProjects = data.risk_projects || [];
    const reporting = data.reporting || {};

    document.getElementById('scene-root').innerHTML = `
        <section class="scene-panel">
            <article class="hero-card">
                <p class="eyebrow">Scene / dashboard</p>
                <h2>Photo Studio 工作台已接入统一 contract</h2>
                <p>这块现在走真实 orchestrator adapter，Dashboard、项目列表、抽屉动作都能沿同一条业务链刷新。</p>
            </article>
            <section class="card-grid">
                <article class="metric-card"><div class="metric-label">项目总数</div><div class="metric-value">${metrics.total_projects ?? 0}</div></article>
                <article class="metric-card"><div class="metric-label">风险项目</div><div class="metric-value">${metrics.risk_projects_count ?? 0}</div></article>
                <article class="metric-card"><div class="metric-label">即将交付</div><div class="metric-value">${metrics.upcoming_delivery_count ?? 0}</div></article>
            </section>
            <article class="hero-card">
                <p class="eyebrow">Prioritized</p>
                <ul class="scene-list">${(reporting.prioritize_pending?.items || []).map((item) => `<li>${escapeHtml(item)}</li>`).join('') || '<li>当前没有待处理动作</li>'}</ul>
            </article>
            <article class="hero-card">
                <p class="eyebrow">Risk Projects</p>
                <div class="project-list">
                    ${riskProjects.length ? riskProjects.map(createProjectCard).join('') : '<div class="empty-state">当前没有风险项目</div>'}
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
                <p>这里已经连到 <code>photo-studio-list-projects</code> 和真实动作执行。首版先用“快速建项目 + 项目卡片 + 右抽屉”跑主链。</p>
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
                        <textarea name="project_notes" rows="3" placeholder="可选：记录客户诉求或交付要求"></textarea>
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
                <p>首版先把“创建客户”和“生成回复草稿”接进来。草稿支持直接填项目 ID，也支持沿用当前抽屉选中的项目。</p>
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
    document.getElementById('scene-root').innerHTML = `
        <section class="scene-panel">
            <article class="hero-card">
                <p class="eyebrow">Scene / delivery</p>
                <h2>交付闭环区</h2>
                <p>首版把选片通知、交付任务和归档接进来，后续再补同步外部表格与 reporting 细节。</p>
            </article>
            <article class="hero-card">
                <p class="eyebrow">Ready For Delivery</p>
                <div class="project-list">
                    ${projects.length ? projects.map(createDeliveryCard).join('') : '<div class="empty-state">先创建项目，交付动作才有对象可跑。</div>'}
                </div>
            </article>
            ${renderLastActionResult()}
        </section>
    `;

    bindProjectActions();
    bindDeliveryActions();
}

async function loadProjectIntoDrawer(projectId) {
    getState().selectedProjectId = projectId;
    const result = await window.PhotoStudioApi.getProject(projectId);
    getState().setProjectDetail(result);
    renderDrawer(result);
    bindDrawerActions();
    setStatusChip(`Drawer: ${projectId}`);
}

async function renderSceneByName(scene) {
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
    const result = await window.PhotoStudioApi.runAction(scene, action, payload);
    getState().setLastActionResult(result);

    if (!result.success && result.error?.message) {
        showToast(result.error.message);
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
