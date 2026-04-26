'use strict';

const fs = require('fs');
const path = require('path');

const CLOSEOUT_MARKER = 'Photo Studio closeout smoke';
const CLOSEOUT_STAMP_PATTERN = /\bmod[a-z0-9]{4,}\b/i;
const LEGACY_DEMO_PATTERN = /^PR\d+\b/i;

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

function readJson(dataRoot, filename, fallback) {
    const filePath = path.join(dataRoot, filename);
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (_error) {
        return fallback;
    }
}

function writeJsonAtomic(dataRoot, filename, data) {
    const filePath = path.join(dataRoot, filename);
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

function buildDataSnapshot(dataRoot) {
    return {
        customers: readJson(dataRoot, FILES.customers, {}),
        projects: readJson(dataRoot, FILES.projects, {}),
        tasks: readJson(dataRoot, FILES.tasks, {}),
        statusLog: readJson(dataRoot, FILES.statusLog, []),
        reminders: readJson(dataRoot, FILES.reminders, {}),
        calendarEvents: readJson(dataRoot, FILES.calendarEvents, {}),
        archiveAssets: readJson(dataRoot, FILES.archiveAssets, {}),
        externalExports: readJson(dataRoot, FILES.externalExports, {}),
        leads: readJson(dataRoot, FILES.leads, {}),
        quotes: readJson(dataRoot, FILES.quotes, {}),
        deliveryPackages: readJson(dataRoot, FILES.deliveryPackages, {}),
    };
}

function buildTargetSets(data) {
    const closeoutProjectIds = new Set(
        Object.values(data.projects)
            .filter((record) => isCloseoutProject(record))
            .map((record) => record.project_id)
            .filter(Boolean)
    );

    const legacyProjectIds = new Set(
        Object.values(data.projects)
            .filter((record) => isLegacyProject(record))
            .map((record) => record.project_id)
            .filter(Boolean)
    );

    const closeoutCustomerIds = new Set(
        Object.values(data.customers)
            .filter((record) => isCloseoutCustomer(record))
            .map((record) => record.customer_id)
            .filter(Boolean)
    );

    const legacyCustomerIds = new Set(
        Object.values(data.customers)
            .filter((record) => isLegacyCustomer(record))
            .map((record) => record.customer_id)
            .filter(Boolean)
    );

    const customerProjectStats = new Map();
    Object.values(data.projects).forEach((project) => {
        if (!project.customer_id) {
            return;
        }
        const stats = customerProjectStats.get(project.customer_id) || {
            total: 0,
            closeout: 0,
            legacy: 0,
        };
        stats.total += 1;
        if (closeoutProjectIds.has(project.project_id)) {
            stats.closeout += 1;
        }
        if (legacyProjectIds.has(project.project_id)) {
            stats.legacy += 1;
        }
        customerProjectStats.set(project.customer_id, stats);
    });

    customerProjectStats.forEach((stats, customerId) => {
        if (stats.total > 0 && stats.total === stats.closeout) {
            closeoutCustomerIds.add(customerId);
        }
        if (stats.total > 0 && stats.total === stats.legacy) {
            legacyCustomerIds.add(customerId);
        }
    });

    return {
        closeoutProjectIds,
        legacyProjectIds,
        closeoutCustomerIds,
        legacyCustomerIds,
    };
}

function makeObjectAnalyzer(records, predicate) {
    const ids = [];
    for (const [key, value] of Object.entries(records || {})) {
        if (predicate(value, key)) {
            ids.push(key);
        }
    }
    return ids;
}

function makeArrayAnalyzer(records, predicate, idSelector) {
    const ids = [];
    for (const value of records || []) {
        if (predicate(value)) {
            ids.push(idSelector(value));
        }
    }
    return ids;
}

function buildAnalysis(dataRoot) {
    const data = buildDataSnapshot(dataRoot);
    const {
        closeoutProjectIds,
        legacyProjectIds,
        closeoutCustomerIds,
        legacyCustomerIds,
    } = buildTargetSets(data);

    const closeoutProjectIdSet = new Set(closeoutProjectIds);
    const legacyProjectIdSet = new Set(legacyProjectIds);
    const closeoutCustomerIdSet = new Set(closeoutCustomerIds);
    const legacyCustomerIdSet = new Set(legacyCustomerIds);

    const customersByProject = new Map();
    Object.values(data.projects).forEach((project) => {
        if (project.customer_id) {
            customersByProject.set(project.project_id, project.customer_id);
        }
    });

    const closeout = {
        projects: [...closeoutProjectIds],
        customers: [...closeoutCustomerIds],
        tasks: makeObjectAnalyzer(data.tasks, (_record, projectId) => closeoutProjectIdSet.has(projectId)),
        statusLog: makeArrayAnalyzer(data.statusLog, (record) => closeoutProjectIdSet.has(record.project_id), (record) => record.log_id || record.project_id || 'row'),
        reminders: makeObjectAnalyzer(data.reminders, (record) => (
            isCloseoutReminder(record)
            || closeoutProjectIdSet.has(record.project_id)
            || closeoutCustomerIdSet.has(record.customer_id)
        )),
        calendarEvents: makeObjectAnalyzer(data.calendarEvents, (record) => (
            isCloseoutCalendarEvent(record)
            || closeoutProjectIdSet.has(record.project_id)
        )),
        archiveAssets: makeObjectAnalyzer(data.archiveAssets, (record) => (
            closeoutProjectIdSet.has(record.project_id)
            || closeoutCustomerIdSet.has(customersByProject.get(record.project_id))
        )),
        externalExports: makeObjectAnalyzer(data.externalExports, (record) => (
            isCloseoutExternalExport(record)
            || closeoutProjectIdSet.has(record.project_id)
        )),
        leads: makeObjectAnalyzer(data.leads, (record) => (
            isCloseoutLead(record)
            || closeoutProjectIdSet.has(record.project_id)
            || closeoutCustomerIdSet.has(record.customer_id)
        )),
        quotes: makeObjectAnalyzer(data.quotes, (record) => (
            isCloseoutQuote(record)
            || closeoutProjectIdSet.has(record.project_id)
            || closeoutCustomerIdSet.has(record.customer_id)
        )),
        deliveryPackages: makeObjectAnalyzer(data.deliveryPackages, (record) => (
            isCloseoutDeliveryPackage(record)
            || closeoutProjectIdSet.has(record.project_id)
        )),
    };

    const legacy = {
        projects: [...legacyProjectIds],
        customers: [...legacyCustomerIds],
        tasks: makeObjectAnalyzer(data.tasks, (_record, projectId) => legacyProjectIdSet.has(projectId)),
        statusLog: makeArrayAnalyzer(data.statusLog, (record) => legacyProjectIdSet.has(record.project_id), (record) => record.log_id || record.project_id || 'row'),
        reminders: makeObjectAnalyzer(data.reminders, (record) => (
            hasLegacyDemoName(record.project_name)
            || hasLegacyDemoName(record.customer_name)
            || legacyProjectIdSet.has(record.project_id)
            || legacyCustomerIdSet.has(record.customer_id)
        )),
        calendarEvents: makeObjectAnalyzer(data.calendarEvents, (record) => legacyProjectIdSet.has(record.project_id)),
        archiveAssets: makeObjectAnalyzer(data.archiveAssets, (record) => (
            legacyProjectIdSet.has(record.project_id)
            || legacyCustomerIdSet.has(customersByProject.get(record.project_id))
        )),
        externalExports: makeObjectAnalyzer(data.externalExports, (record) => (
            hasLegacyDemoName(record.project_name)
            || hasLegacyDemoName(record.customer_name)
            || legacyProjectIdSet.has(record.project_id)
        )),
        leads: makeObjectAnalyzer(data.leads, (record) => (
            hasLegacyDemoName(record.project_name)
            || hasLegacyDemoName(record.customer_name)
            || legacyProjectIdSet.has(record.project_id)
            || legacyCustomerIdSet.has(record.customer_id)
        )),
        quotes: makeObjectAnalyzer(data.quotes, (record) => (
            hasLegacyDemoName(record.project_name)
            || hasLegacyDemoName(record.customer_name)
            || legacyProjectIdSet.has(record.project_id)
            || legacyCustomerIdSet.has(record.customer_id)
        )),
        deliveryPackages: makeObjectAnalyzer(data.deliveryPackages, (record) => (
            hasLegacyDemoName(record.project_name)
            || legacyProjectIdSet.has(record.project_id)
        )),
    };

    return { data, closeout, legacy };
}

function getCategorySummary(report) {
    const counts = Object.fromEntries(
        Object.entries(report).map(([key, ids]) => [key, ids.length])
    );
    counts.total = Object.values(counts).reduce((sum, count) => sum + Number(count || 0), 0);
    return counts;
}

function pruneObjectMap(records, shouldRemove) {
    const next = {};
    for (const [key, value] of Object.entries(records || {})) {
        if (!shouldRemove(value, key)) {
            next[key] = value;
        }
    }
    return next;
}

function pruneArray(records, shouldRemove) {
    return (records || []).filter((value) => !shouldRemove(value));
}

function analyzeShadowData(dataRoot) {
    const analysis = buildAnalysis(dataRoot);
    return {
        dataRoot,
        closeout: {
            summary: getCategorySummary(analysis.closeout),
            samples: {
                projects: analysis.closeout.projects.slice(0, 5),
                customers: analysis.closeout.customers.slice(0, 5),
                leads: analysis.closeout.leads.slice(0, 5),
                quotes: analysis.closeout.quotes.slice(0, 5),
                reminders: analysis.closeout.reminders.slice(0, 5),
                calendarEvents: analysis.closeout.calendarEvents.slice(0, 5),
                externalExports: analysis.closeout.externalExports.slice(0, 5),
            },
        },
        legacy: {
            summary: getCategorySummary(analysis.legacy),
            samples: {
                projects: analysis.legacy.projects.slice(0, 5),
                customers: analysis.legacy.customers.slice(0, 5),
                externalExports: analysis.legacy.externalExports.slice(0, 5),
            },
        },
    };
}

function pruneShadowData(dataRoot, options = {}) {
    const includeLegacyDemo = Boolean(options.includeLegacyDemo);
    const analysis = buildAnalysis(dataRoot);
    const projectIds = new Set(analysis.closeout.projects);
    const customerIds = new Set(analysis.closeout.customers);
    const taskIds = new Set(analysis.closeout.tasks);
    const statusLogIds = new Set(analysis.closeout.statusLog);
    const reminderIds = new Set(analysis.closeout.reminders);
    const calendarEventIds = new Set(analysis.closeout.calendarEvents);
    const archiveAssetIds = new Set(analysis.closeout.archiveAssets);
    const externalExportIds = new Set(analysis.closeout.externalExports);
    const leadIds = new Set(analysis.closeout.leads);
    const quoteIds = new Set(analysis.closeout.quotes);
    const deliveryPackageIds = new Set(analysis.closeout.deliveryPackages);

    if (includeLegacyDemo) {
        analysis.legacy.projects.forEach((id) => projectIds.add(id));
        analysis.legacy.customers.forEach((id) => customerIds.add(id));
        analysis.legacy.tasks.forEach((id) => taskIds.add(id));
        analysis.legacy.statusLog.forEach((id) => statusLogIds.add(id));
        analysis.legacy.reminders.forEach((id) => reminderIds.add(id));
        analysis.legacy.calendarEvents.forEach((id) => calendarEventIds.add(id));
        analysis.legacy.archiveAssets.forEach((id) => archiveAssetIds.add(id));
        analysis.legacy.externalExports.forEach((id) => externalExportIds.add(id));
        analysis.legacy.leads.forEach((id) => leadIds.add(id));
        analysis.legacy.quotes.forEach((id) => quoteIds.add(id));
        analysis.legacy.deliveryPackages.forEach((id) => deliveryPackageIds.add(id));
    }

    const customersByProject = new Map();
    Object.values(analysis.data.projects).forEach((project) => {
        if (project.customer_id) {
            customersByProject.set(project.project_id, project.customer_id);
        }
    });

    const next = {
        customers: pruneObjectMap(analysis.data.customers, (record) => customerIds.has(record.customer_id)),
        projects: pruneObjectMap(analysis.data.projects, (record) => projectIds.has(record.project_id)),
        tasks: pruneObjectMap(analysis.data.tasks, (_record, projectId) => taskIds.has(projectId)),
        statusLog: pruneArray(analysis.data.statusLog, (record) => (
            projectIds.has(record.project_id)
            || statusLogIds.has(record.log_id || record.project_id || 'row')
        )),
        reminders: pruneObjectMap(analysis.data.reminders, (record, reminderId) => (
            reminderIds.has(reminderId)
            || projectIds.has(record.project_id)
            || customerIds.has(record.customer_id)
        )),
        calendarEvents: pruneObjectMap(analysis.data.calendarEvents, (record, eventId) => (
            calendarEventIds.has(eventId)
            || projectIds.has(record.project_id)
        )),
        archiveAssets: pruneObjectMap(analysis.data.archiveAssets, (record, assetId) => (
            archiveAssetIds.has(assetId)
            || projectIds.has(record.project_id)
            || customerIds.has(customersByProject.get(record.project_id))
        )),
        externalExports: pruneObjectMap(analysis.data.externalExports, (record, exportId) => (
            externalExportIds.has(exportId)
            || projectIds.has(record.project_id)
        )),
        leads: pruneObjectMap(analysis.data.leads, (record, leadId) => (
            leadIds.has(leadId)
            || projectIds.has(record.project_id)
            || customerIds.has(record.customer_id)
        )),
        quotes: pruneObjectMap(analysis.data.quotes, (record, quoteId) => (
            quoteIds.has(quoteId)
            || projectIds.has(record.project_id)
            || customerIds.has(record.customer_id)
        )),
        deliveryPackages: pruneObjectMap(analysis.data.deliveryPackages, (record, packageId) => (
            deliveryPackageIds.has(packageId)
            || projectIds.has(record.project_id)
        )),
    };

    writeJsonAtomic(dataRoot, FILES.customers, next.customers);
    writeJsonAtomic(dataRoot, FILES.projects, next.projects);
    writeJsonAtomic(dataRoot, FILES.tasks, next.tasks);
    writeJsonAtomic(dataRoot, FILES.statusLog, next.statusLog);
    writeJsonAtomic(dataRoot, FILES.reminders, next.reminders);
    writeJsonAtomic(dataRoot, FILES.calendarEvents, next.calendarEvents);
    writeJsonAtomic(dataRoot, FILES.archiveAssets, next.archiveAssets);
    writeJsonAtomic(dataRoot, FILES.externalExports, next.externalExports);
    writeJsonAtomic(dataRoot, FILES.leads, next.leads);
    writeJsonAtomic(dataRoot, FILES.quotes, next.quotes);
    writeJsonAtomic(dataRoot, FILES.deliveryPackages, next.deliveryPackages);

    return analyzeShadowData(dataRoot);
}

module.exports = Object.freeze({
    FILES,
    analyzeShadowData,
    pruneShadowData,
});
