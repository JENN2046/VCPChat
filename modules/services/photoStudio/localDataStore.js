'use strict';

const fs = require('fs');
const path = require('path');

let dataRoot = path.join(process.cwd(), 'AppData', 'PhotoStudioShadowData');

const FILES = Object.freeze({
    customers: 'customers.json',
    projects: 'projects.json',
    tasks: 'tasks.json',
    statusLog: 'status_log.json',
    reminders: 'reminders.json',
    calendarEvents: 'calendar_events.json',
    archiveAssets: 'archive_assets.json',
    externalExports: 'external_exports.json',
});

function ensureDataRoot() {
    fs.mkdirSync(dataRoot, { recursive: true });
    for (const [key, fileName] of Object.entries(FILES)) {
        const filePath = path.join(dataRoot, fileName);
        if (fs.existsSync(filePath)) {
            continue;
        }
        const emptyValue = key === 'statusLog' ? [] : {};
        fs.writeFileSync(filePath, JSON.stringify(emptyValue, null, 2), 'utf8');
    }
}

function readJson(fileName, fallback) {
    ensureDataRoot();
    try {
        return JSON.parse(fs.readFileSync(path.join(dataRoot, fileName), 'utf8'));
    } catch (_error) {
        return fallback;
    }
}

function writeJson(fileName, value) {
    ensureDataRoot();
    const filePath = path.join(dataRoot, fileName);
    const tmpPath = `${filePath}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(value, null, 2), 'utf8');
    fs.renameSync(tmpPath, filePath);
}

function nowIso() {
    return new Date().toISOString();
}

function generateId(prefix) {
    return `${prefix}_${Math.random().toString(16).slice(2, 10)}`;
}

function configureDataRoot(nextDataRoot) {
    dataRoot = nextDataRoot;
    ensureDataRoot();
}

function listProjects() {
    return Object.values(readJson(FILES.projects, {}))
        .sort((left, right) => String(right.updated_at || '').localeCompare(String(left.updated_at || '')));
}

function getProject(projectId) {
    return readJson(FILES.projects, {})[projectId] || null;
}

function getCustomer(customerId) {
    return readJson(FILES.customers, {})[customerId] || null;
}

function createCustomer(payload = {}) {
    const customers = readJson(FILES.customers, {});
    const now = nowIso();
    const customerId = payload.customer_id || generateId('cust');
    const record = {
        customer_id: customerId,
        customer_name: payload.customer_name || payload.customerName || 'Walk-in Customer',
        customer_type: payload.customer_type || 'individual',
        source: payload.source || payload.source_channel || 'other',
        source_channel: payload.source_channel || payload.source || 'other',
        contact_phone: payload.contact_phone || '',
        contact_wechat: payload.contact_wechat || '',
        notes: payload.notes || '',
        sync_state: 'local_shadow',
        created_at: customers[customerId]?.created_at || now,
        updated_at: now,
    };
    customers[customerId] = record;
    writeJson(FILES.customers, customers);
    return record;
}

function createProject(payload = {}) {
    const projects = readJson(FILES.projects, {});
    const now = nowIso();
    const projectId = payload.project_id || generateId('proj');
    const record = {
        project_id: projectId,
        customer_id: payload.customer_id || '',
        project_name: payload.project_name || payload.projectName || `New Project ${now.slice(0, 16)}`,
        project_type: payload.project_type || payload.projectType || 'portrait',
        status: payload.status || 'lead',
        shoot_date: payload.shoot_date || '',
        delivery_deadline: payload.delivery_deadline || '',
        due_date: payload.delivery_deadline || payload.due_date || '',
        location: payload.location || '',
        notes: payload.notes || payload.project_notes || '',
        remark: payload.notes || payload.project_notes || '',
        sync_state: 'local_shadow',
        created_at: projects[projectId]?.created_at || now,
        updated_at: now,
    };
    projects[projectId] = record;
    writeJson(FILES.projects, projects);
    return record;
}

function updateProject(projectId, patch = {}) {
    const projects = readJson(FILES.projects, {});
    if (!projects[projectId]) {
        return null;
    }
    projects[projectId] = {
        ...projects[projectId],
        ...patch,
        project_id: projectId,
        updated_at: nowIso(),
    };
    writeJson(FILES.projects, projects);
    return projects[projectId];
}

function getTasksByProject(projectId) {
    return readJson(FILES.tasks, {})[projectId] || [];
}

function createProjectTasks(projectId, overrideExisting = false) {
    const tasks = readJson(FILES.tasks, {});
    if (!overrideExisting && Array.isArray(tasks[projectId]) && tasks[projectId].length) {
        return tasks[projectId];
    }
    const now = nowIso();
    tasks[projectId] = [
        'confirm_requirements',
        'shoot_preparation',
        'shoot_execution',
        'post_production',
        'client_delivery',
    ].map((taskType, index) => ({
        task_id: `${projectId}:task:${index + 1}`,
        project_id: projectId,
        task_type: taskType,
        status: 'pending',
        sync_state: 'local_shadow',
        created_at: now,
        updated_at: now,
    }));
    writeJson(FILES.tasks, tasks);
    return tasks[projectId];
}

function appendStatusLog(entry = {}) {
    const logs = readJson(FILES.statusLog, []);
    const record = {
        log_id: entry.log_id || generateId('log'),
        created_at: entry.created_at || nowIso(),
        ...entry,
    };
    logs.push(record);
    writeJson(FILES.statusLog, logs);
    return record;
}

function getStatusLog(projectId) {
    return readJson(FILES.statusLog, [])
        .filter((entry) => !projectId || entry.project_id === projectId);
}

function getCalendarEventsByProject(projectId) {
    return Object.values(readJson(FILES.calendarEvents, {}))
        .filter((entry) => entry.project_id === projectId);
}

function upsertCalendarEvent(event = {}) {
    const events = readJson(FILES.calendarEvents, {});
    const eventKey = event.event_key || event.event_id || generateId('booking');
    const existing = events[eventKey] || null;
    const now = nowIso();
    const record = {
        ...existing,
        ...event,
        event_key: eventKey,
        event_id: existing?.event_id || event.event_id || eventKey,
        created_at: existing?.created_at || event.created_at || now,
        updated_at: now,
    };
    events[eventKey] = record;
    writeJson(FILES.calendarEvents, events);
    return { record, existing };
}

module.exports = {
    configureDataRoot,
    generateId,
    listProjects,
    getProject,
    getCustomer,
    createCustomer,
    createProject,
    updateProject,
    createProjectTasks,
    getTasksByProject,
    appendStatusLog,
    getStatusLog,
    getCalendarEventsByProject,
    upsertCalendarEvent,
};
