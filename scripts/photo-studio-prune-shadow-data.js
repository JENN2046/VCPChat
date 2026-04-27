#!/usr/bin/env node
'use strict';

const path = require('path');
const { analyzeShadowData, pruneShadowData } = require('../modules/services/photoStudio/shadowDataHygiene');

const DATA_ROOT = path.join(__dirname, '..', 'AppData', 'PhotoStudioShadowData');
const applyChanges = process.argv.includes('--apply');
const includeLegacyDemo = process.argv.includes('--include-legacy-demo');

function summarizeRemoved(label, count, ids) {
    const preview = (ids || []).slice(0, 5).join(', ');
    console.log(`${label}: ${count}${preview ? ` (${preview}${count > 5 ? ', ...' : ''})` : ''}`);
}

function printReport(report) {
    console.log(`Photo Studio shadow prune mode: ${applyChanges ? 'APPLY' : 'DRY-RUN'}`);
    console.log(`Data root: ${report.dataRoot}`);
    console.log(`Include legacy demo: ${includeLegacyDemo ? 'yes' : 'no'}`);

    const active = report.closeout;
    summarizeRemoved('projects', active.summary.projects, active.samples.projects);
    summarizeRemoved('customers', active.summary.customers, active.samples.customers);
    summarizeRemoved('tasks(project buckets)', active.summary.tasks, active.samples.projects);
    summarizeRemoved('status_log rows', active.summary.statusLog, []);
    summarizeRemoved('reminders', active.summary.reminders, active.samples.reminders);
    summarizeRemoved('calendar_events', active.summary.calendarEvents, active.samples.calendarEvents);
    summarizeRemoved('archive_assets', active.summary.archiveAssets, []);
    summarizeRemoved('external_exports', active.summary.externalExports, active.samples.externalExports);
    summarizeRemoved('leads', active.summary.leads, active.samples.leads);
    summarizeRemoved('quotes', active.summary.quotes, active.samples.quotes);
    summarizeRemoved('delivery_packages', active.summary.deliveryPackages, []);

    if (includeLegacyDemo) {
        summarizeRemoved('legacy projects', report.legacy.summary.projects, report.legacy.samples.projects);
        summarizeRemoved('legacy customers', report.legacy.summary.customers, report.legacy.samples.customers);
        summarizeRemoved('legacy external_exports', report.legacy.summary.externalExports, report.legacy.samples.externalExports);
    }
}

function main() {
    const report = applyChanges
        ? pruneShadowData(DATA_ROOT, { includeLegacyDemo })
        : analyzeShadowData(DATA_ROOT);

    printReport(report);

    if (!applyChanges) {
        console.log('No files were modified. Re-run with --apply to write changes.');
        return;
    }

    console.log('Shadow data cleanup applied.');
}

main();
