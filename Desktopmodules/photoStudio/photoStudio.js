function escapeHtml(value) {
    return String(value || '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
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
                <p class="muted">点击项目卡片后，这里会显示项目详情、任务和日志。</p>
            </div>
        `;
        return;
    }

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
            <p class="muted">允许推进：${escapeHtml((project.allowed_transitions || []).join(', ') || '-')}</p>
            <p class="muted">风险：${escapeHtml(project.risk?.level || 'unknown')}</p>
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
            <p class="muted">交付日期：${escapeHtml(project.delivery_deadline || '-')}</p>
            <div class="card-actions">
                <button class="ghost-btn" type="button" data-open-project="${escapeHtml(project.project_id)}">查看详情</button>
                <button class="primary-btn" type="button" data-advance-project="${escapeHtml(project.project_id)}">推进状态</button>
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
            const result = await window.PhotoStudioApi.runAction('project_board', 'advance_status', {
                project_id: button.dataset.advanceProject,
                new_status: 'preparing',
            });
            window.PhotoStudioEvents.applyUiHints(result.ui_hints);
        });
    });
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
                <p>这一页现在已经通过 <code>photo-studio-get-dashboard</code> 拉数据，后面可以平滑替换成真实 Orchestrator。</p>
            </article>
            <section class="card-grid">
                <article class="metric-card"><div class="metric-label">项目总数</div><div class="metric-value">${metrics.total_projects ?? 0}</div></article>
                <article class="metric-card"><div class="metric-label">风险项目</div><div class="metric-value">${metrics.risk_projects_count ?? 0}</div></article>
                <article class="metric-card"><div class="metric-label">即将交付</div><div class="metric-value">${metrics.upcoming_delivery_count ?? 0}</div></article>
            </section>
            <article class="hero-card">
                <p class="eyebrow">Prioritized</p>
                <ul class="scene-list">${(reporting.prioritize_pending?.items || []).map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
            </article>
            <article class="hero-card">
                <p class="eyebrow">Risk Projects</p>
                <div class="project-list">
                    ${riskProjects.length ? riskProjects.map(createProjectCard).join('') : '<div class="empty-state">当前没有风险项目</div>'}
                </div>
            </article>
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
                <p>这一页已经接到 <code>photo-studio-list-projects</code>，现在先用占位数据验证前端 contract、抽屉联动和 ui_hints。</p>
            </article>
            <div class="project-list">
                ${projects.map(createProjectCard).join('')}
            </div>
        </section>
    `;
    bindProjectActions();
}

function renderPlaceholder(scene, title, description, bullets) {
    document.getElementById('scene-root').innerHTML = `
        <section class="scene-panel">
            <article class="hero-card">
                <p class="eyebrow">Scene / ${escapeHtml(scene)}</p>
                <h2>${escapeHtml(title)}</h2>
                <p>${escapeHtml(description)}</p>
            </article>
            <article class="hero-card">
                <p class="eyebrow">Planned Actions</p>
                <ul class="scene-list">${bullets.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
            </article>
        </section>
    `;
}

async function loadProjectIntoDrawer(projectId) {
    window.PhotoStudioState.selectedProjectId = projectId;
    const result = await window.PhotoStudioApi.getProject(projectId);
    window.PhotoStudioState.setProjectDetail(result);
    renderDrawer(result);
    setStatusChip(`Drawer: ${projectId}`);
}

async function renderSceneByName(scene) {
    setStatusChip(`Loading ${scene}...`);

    if (scene === 'dashboard') {
        const result = await window.PhotoStudioApi.getDashboard();
        window.PhotoStudioState.setDashboard(result);
        renderDashboard(result);
        setStatusChip('Dashboard synced');
        return;
    }

    if (scene === 'projects') {
        const result = await window.PhotoStudioApi.listProjects({});
        window.PhotoStudioState.setProjects(result);
        renderProjects(result);
        setStatusChip('Projects synced');
        return;
    }

    if (scene === 'inquiry') {
        renderPlaceholder('inquiry', '询单收口区', '当前场景先用静态内容占位，等 PR3 接真实业务动作。', [
            'Create Customer',
            'Generate Client Reply Draft',
            'Create Follow-up Reminder',
        ]);
        setStatusChip('Inquiry shell');
        return;
    }

    if (scene === 'delivery') {
        renderPlaceholder('delivery', '交付闭环区', '当前场景保留 contract 刷新入口，后续会接 delivery / sync / reporting。', [
            'Create Selection Notice',
            'Create Delivery Tasks',
            'Sync To External Sheet Or Notion',
        ]);
        setStatusChip('Delivery shell');
    }
}

async function switchScene(sceneName) {
    window.PhotoStudioState.currentScene = sceneName;
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

    if (scene === 'project_drawer' && window.PhotoStudioState.selectedProjectId) {
        await loadProjectIntoDrawer(window.PhotoStudioState.selectedProjectId);
        return;
    }

    if (scene === 'dashboard' || scene === 'delivery') {
        await renderSceneByName(scene);
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    document.querySelectorAll('.nav-item').forEach((button) => {
        button.addEventListener('click', () => {
            void switchScene(button.dataset.scene);
        });
    });

    document.getElementById('btn-refresh')?.addEventListener('click', () => {
        void refreshScene(window.PhotoStudioState.currentScene);
    });

    document.getElementById('btn-new-project')?.addEventListener('click', async () => {
        const result = await window.PhotoStudioApi.runAction('project_board', 'create_project_draft', {});
        window.PhotoStudioEvents.applyUiHints(result.ui_hints);
        await switchScene('projects');
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
