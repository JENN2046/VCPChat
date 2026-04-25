#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const DATA_ROOT = path.join(__dirname, '..', 'AppData', 'PhotoStudioShadowData');
const CLOSEOUT_MARKER = 'Photo Studio closeout smoke';
const CLOSEOUT_STAMP_PATTERN = /\bmod[a-z0-9]{4,}\b/i;
const LEGACY_DEMO_PATTERN = /^PR\d+\b/i;
const applyChanges = process.argv.includes('--apply');
const includeLegacyDemo = process.argv.includes('--include-legacy-demo');

const FILES = Object.freeze({
    customers: 'customers.json',
    projects: 'projects.json',
    tasks: 'tasks.json',
    statusLog: 'status_log.json',
    reminders: 'reminders.json',
    calendarEvents: 'calendar_events.json',
    archiveAssets: 'archive_assets.json',
    externalExports: 'external_exports.json',
    leads: 'leads.json',
    quotes: 'quotes.json',
    deliveryPackages: 'delivery_packages.json',
});

function readJson(filename, fallback) {
    const filePath = path.join(DATA_ROOT, filename);
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (_error) {
        return fallback;
    }
}

function writeJsonAtomic(filename, data) {
    const filePath = path.join(DATA_ROOT, filename);
    const tmpPath = `${filePath}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmpPath, filePath);
}

function stringifyRecord(record) {
    try {
        return JSON.stringify(record);
    } catch (_error) {
        return '';
    }
}

function hasCloseoutMarker(record) {
    return stringifyRecord(record).includes(CLOSEOUT_MARKER);
}

function hasCloseoutStamp(value) {
    return CLOSEOUT_STAMP_PATTERN.test(String(value || ''));
}

function hasLegacyDemoName(value) {
    return LEGACY_DEMO_PATTERN.test(String(value || '').trim());
}

function isCloseoutProject(record) {
    return hasCloseoutMarker(record)
        || hasCloseoutStamp(record.project_name)
        || hasCloseoutStamp(record.notes)
        || hasCloseoutStamp(record.remark);
}

function isCloseoutCustomer(record) {
    return hasCloseoutMarker(record)
        || hasCloseoutStamp(record.customer_name)
        || hasCloseoutStamp(record.contact_value)
        || hasCloseoutStamp(record.contact_phone);
}

function isCloseoutLead(record) {
    return hasCloseoutMarker(record)
        || hasCloseoutStamp(record.customer_name)
        || hasCloseoutStamp(record.lead_key);
}

function isCloseoutQuote(record) {
    return hasCloseoutMarker(record)
        || hasCloseoutStamp(record.quote_key)
        || hasCloseoutStamp(record.quote_type);
}

function isCloseoutReminder(record) {
    return hasCloseoutMarker(record);
}

function isCloseoutCalendarEvent(record) {
    return hasCloseoutMarker(record)
        || hasCloseoutStamp(record.event_key)
        || hasCloseoutStamp(record.event_type)
        || hasCloseoutStamp(record.booking_type);
}

function isCloseoutDeliveryPackage(record) {
    return hasCloseoutMarker(record)
        || hasCloseoutStamp(record.package_type)
        || hasCloseoutStamp(record.delivery_package_key);
}

function isCloseoutExternalExport(record) {
    return hasCloseoutMarker(record)
        || hasCloseoutStamp(record.export_key)
        || hasCloseoutStamp(record.note);
}

function isLegacyProject(record) {
    return hasLegacyDemoName(record.project_name);
}

function isLegacyCustomer(record) {
    return hasLegacyDemoName(record.customer_name);
}

function isLegacyRecord(record, kind) {
    if (!includeLegacyDemo) {
        return false;
    }

    if (kind === 'project') return isLegacyProject(record);
    if (kind === 'customer') return isLegacyCustomer(record);

    const projectName = record.project_name || '';
    const customerName = record.customer_name || '';
    return hasLegacyDemoName(projectName) || hasLegacyDemoName(customerName);
}

function pruneObjectMap(records, shouldRemove) {
    const next = {};
    const removed = [];
    for (const [key, value] of Object.entries(records || {})) {
        if (shouldRemove(value, key)) {
            removed.push(key);
            continue;
        }
        next[key] = value;
    }
    return { next, removed };
}

function pruneArray(records, shouldRemove) {
    const removed = [];
    const next = [];
    for (const value of records || []) {
        if (shouldRemove(value)) {
            removed.push(value);
            continue;
        }
        next.push(value);
    }
    return { next, removed };
}

function summarizeRemoved(label, removedKeys) {
    const preview = removedKeys.slice(0, 5).join(', ');
    console.log(`${label}: ${removedKeys.length}${preview ? ` (${preview}${removedKeys.length > 5 ? ', ...' : ''})` : ''}`);
}

function main() {
    const data = {
        customers: readJson(FILES.customers, {}),
        projects: readJson(FILES.projects, {}),
        tasks: readJson(FILES.tasks, {}),
        statusLog: readJson(FILES.statusLog, []),
        reminders: readJson(FILES.reminders, {}),
        calendarEvents: readJson(FILES.calendarEvents, {}),
        archiveAssets: readJson(FILES.archiveAssets, {}),
        externalExports: readJson(FILES.externalExports, {}),
        leads: readJson(FILES.leads, {}),
        quotes: readJson(FILES.quotes, {}),
        deliveryPackages: readJson(FILES.deliveryPackages, {}),
    };

    const targetProjectIds = new Set(
        Object.values(data.projects)
            .filter((record) => isCloseoutProject(record) || isLegacyRecord(record, 'project'))
            .map((record) => record.project_id)
            .filter(Boolean)
    );

    const targetCustomerIds = new Set(
        Object.values(data.customers)
            .filter((record) => isCloseoutCustomer(record) || isLegacyRecord(record, 'customer'))
            .map((record) => record.customer_id)
            .filter(Boolean)
    );

    const customersByProject = new Map();
    Object.values(data.projects).forEach((project) => {
        if (project.customer_id) {
            customersByProject.set(project.project_id, project.customer_id);
        }
    });

    const customerProjectStats = new Map();
    Object.values(data.projects).forEach((project) => {
        if (!project.customer_id) {
            return;
        }
        const stats = customerProjectStats.get(project.customer_id) || { total: 0, targeted: 0 };
        stats.total += 1;
        if (targetProjectIds.has(project.project_id)) {
            stats.targeted += 1;
        }
        customerProjectStats.set(project.customer_id, stats);
    });

    customerProjectStats.forEach((stats, customerId) => {
        if (stats.total > 0 && stats.total === stats.targeted) {
            targetCustomerIds.add(customerId);
        }
    });

    const prunedCustomers = pruneObjectMap(data.customers, (record) => targetCustomerIds.has(record.customer_id));
    const prunedProjects = pruneObjectMap(data.projects, (record) => targetProjectIds.has(record.project_id));
    const prunedTasks = pruneObjectMap(data.tasks, (_record, projectId) => targetProjectIds.has(projectId));
    const prunedStatusLog = pruneArray(data.statusLog, (record) => targetProjectIds.has(record.project_id));
    const prunedReminders = pruneObjectMap(data.reminders, (record) => (
        isCloseoutReminder(record)
        || isLegacyRecord(record, 'reminder')
        || targetProjectIds.has(record.project_id)
        || targetCustomerIds.has(record.customer_id)
    ));
    const prunedCalendarEvents = pruneObjectMap(data.calendarEvents, (record) => (
        isCloseoutCalendarEvent(record)
        || isLegacyRecord(record, 'calendar')
        || targetProjectIds.has(record.project_id)
    ));
    const prunedArchiveAssets = pruneObjectMap(data.archiveAssets, (record) => (
        targetProjectIds.has(record.project_id)
        || targetCustomerIds.has(customersByProject.get(record.project_id))
    ));
    const prunedExternalExports = pruneObjectMap(data.externalExports, (record) => (
        isCloseoutExternalExport(record)
        || isLegacyRecord(record, 'external')
        || targetProjectIds.has(record.project_id)
    ));
    const prunedLeads = pruneObjectMap(data.leads, (record) => (
        isCloseoutLead(record)
        || isLegacyRecord(record, 'lead')
        || targetProjectIds.has(record.project_id)
        || targetCustomerIds.has(record.customer_id)
    ));
    const prunedQuotes = pruneObjectMap(data.quotes, (record) => (
        isCloseoutQuote(record)
        || isLegacyRecord(record, 'quote')
        || targetProjectIds.has(record.project_id)
        || targetCustomerIds.has(record.customer_id)
    ));
    const prunedDeliveryPackages = pruneObjectMap(data.deliveryPackages, (record) => (
        isCloseoutDeliveryPackage(record)
        || isLegacyRecord(record, 'delivery_package')
        || targetProjectIds.has(record.project_id)
    ));

    console.log(`Photo Studio shadow prune mode: ${applyChanges ? 'APPLY' : 'DRY-RUN'}`);
    console.log(`Data root: ${DATA_ROOT}`);
    console.log(`Include legacy demo: ${includeLegacyDemo ? 'yes' : 'no'}`);
    summarizeRemoved('projects', prunedProjects.removed);
    summarizeRemoved('customers', prunedCustomers.removed);
    summarizeRemoved('tasks(project buckets)', prunedTasks.removed);
    summarizeRemoved('status_log rows', prunedStatusLog.removed.map((record) => record.log_id || record.project_id || 'row'));
    summarizeRemoved('reminders', prunedReminders.removed);
    summarizeRemoved('calendar_events', prunedCalendarEvents.removed);
    summarizeRemoved('archive_assets', prunedArchiveAssets.removed);
    summarizeRemoved('external_exports', prunedExternalExports.removed);
    summarizeRemoved('leads', prunedLeads.removed);
    summarizeRemoved('quotes', prunedQuotes.removed);
    summarizeRemoved('delivery_packages', prunedDeliveryPackages.removed);

    if (!applyChanges) {
        console.log('No files were modified. Re-run with --apply to write changes.');
        return;
    }

    writeJsonAtomic(FILES.customers, prunedCustomers.next);
    writeJsonAtomic(FILES.projects, prunedProjects.next);
    writeJsonAtomic(FILES.tasks, prunedTasks.next);
    writeJsonAtomic(FILES.statusLog, prunedStatusLog.next);
    writeJsonAtomic(FILES.reminders, prunedReminders.next);
    writeJsonAtomic(FILES.calendarEvents, prunedCalendarEvents.next);
    writeJsonAtomic(FILES.archiveAssets, prunedArchiveAssets.next);
    writeJsonAtomic(FILES.externalExports, prunedExternalExports.next);
    writeJsonAtomic(FILES.leads, prunedLeads.next);
    writeJsonAtomic(FILES.quotes, prunedQuotes.next);
    writeJsonAtomic(FILES.deliveryPackages, prunedDeliveryPackages.next);

    console.log('Shadow data cleanup applied.');
}

main();
