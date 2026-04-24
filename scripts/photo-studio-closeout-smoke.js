#!/usr/bin/env node
'use strict';

const PhotoStudioOrchestrator = require('../modules/services/photoStudio/PhotoStudioOrchestrator');

const orchestrator = new PhotoStudioOrchestrator();
const stamp = Date.now().toString(36);
const results = [];

function record(name, result, detail = '') {
    const success = Boolean(result?.success);
    results.push({ name, success, detail: success ? detail : `${result?.error?.code || ''} ${result?.error?.message || ''}`.trim() });
    const marker = success ? 'ok' : 'fail';
    console.log(`${name}: ${marker}${detail || !success ? ` - ${success ? detail : results[results.length - 1].detail}` : ''}`);
    return result;
}

function assertFailure(name, result, expectedCode) {
    const success = !result?.success && result?.error?.code === expectedCode;
    results.push({
        name,
        success,
        detail: success ? expectedCode : `expected ${expectedCode}, got ${result?.error?.code || 'success'}`,
    });
    console.log(`${name}: ${success ? 'ok' : 'fail'} - ${results[results.length - 1].detail}`);
    return result;
}

function firstDataId(result, ...keys) {
    for (const key of keys) {
        if (result?.data?.[key]) return result.data[key];
    }
    return '';
}

async function ensureDeliveryCandidate(fallbackProjectId) {
    const projects = await orchestrator.listProjects();
    const existing = (projects.data || []).find((project) => ['retouching', 'delivering', 'completed'].includes(project.status));
    if (existing) return existing.project_id;

    const steps = ['quoted', 'confirmed', 'preparing', 'shot', 'selection_pending', 'retouching'];
    let currentProjectId = fallbackProjectId;
    for (const nextStatus of steps) {
        const result = await orchestrator.runAction('project_command', 'advance_status', {
            project_id: currentProjectId,
            new_status: nextStatus,
            reason: 'photo studio closeout smoke delivery candidate',
        });
        record(`delivery_candidate_${nextStatus}`, result, result.data?.new_status || result.data?.status || '');
        if (!result.success) break;
    }
    return currentProjectId;
}

async function main() {
    const dashboard = await orchestrator.getDashboard();
    record('dashboard', dashboard, `projects=${dashboard.data?.metrics?.total_projects ?? 0}`);

    const projectCreate = await orchestrator.runAction('project_command', 'create_project_with_tasks', {
        customer_name: `收尾冒烟客户 ${stamp}`,
        customer_type: 'individual',
        source: 'social_media',
        project_name: `收尾冒烟项目 ${stamp}`,
        project_type: 'portrait',
        delivery_deadline: '2026-05-10',
        location: '本地影子影棚',
        project_notes: 'Photo Studio closeout smoke.',
    });
    const projectId = projectCreate.data?.project?.project_id || projectCreate.data?.project_id;
    record('project_create', projectCreate, projectId || '');

    const invalidAdvance = await orchestrator.runAction('project_command', 'advance_status', {
        project_id: projectId,
        new_status: 'preparing',
        reason: 'invalid smoke transition',
    });
    assertFailure('invalid_transition', invalidAdvance, 'INVALID_TRANSITION');

    const advance = await orchestrator.runAction('project_command', 'advance_status', {
        project_id: projectId,
        new_status: 'quoted',
        reason: 'legal smoke transition',
    });
    record('project_advance', advance, advance.data?.new_status || advance.data?.status || '');

    const drawer = await orchestrator.getProject(projectId);
    record('drawer_get', drawer, `tasks=${drawer.data?.tasks?.length ?? 0}`);

    const customer = await orchestrator.runAction('client_leads', 'create_customer', {
        customer_name: `收尾线索客户 ${stamp}`,
        customer_type: 'individual',
        source: 'social_media',
        contact_phone: `local-shadow-${stamp}`,
        notes: 'Photo Studio closeout smoke.',
    });
    record('customer_create', customer, firstDataId(customer, 'customer_id'));

    const lead = await orchestrator.runAction('client_leads', 'create_lead', {
        project_id: projectId,
        source_channel: 'social_media',
        intent_type: 'portrait',
        budget_range: '3000-5000',
        note: 'Photo Studio closeout smoke.',
    });
    record('lead_create', lead, firstDataId(lead, 'lead_id'));

    const quote = await orchestrator.runAction('client_leads', 'create_quote', {
        project_id: projectId,
        quote_type: `standard_${stamp}`,
        amount: 3999,
        valid_until: '2026-05-01',
        note: 'Photo Studio closeout smoke.',
    });
    record('quote_create', quote, firstDataId(quote, 'quote_id'));

    const draft = await orchestrator.runAction('client_leads', 'generate_draft', {
        project_id: projectId,
        context_type: 'quotation',
        tone: 'warm',
        key_points: '收尾冒烟报价沟通',
    });
    record('reply_draft', draft, (draft.data?.draft_text || draft.data?.reply_draft || '').slice(0, 20));

    const reminder = await orchestrator.runAction('client_leads', 'create_followup_reminder', {
        project_id: projectId,
        reminder_type: 'quotation_followup',
        due_date: '2026-04-25',
        note: 'Photo Studio closeout smoke.',
    });
    record('followup_reminder', reminder, firstDataId(reminder, 'reminder_id', 'status'));

    const booking = await orchestrator.runAction('schedule_board', 'create_booking', {
        project_id: projectId,
        booking_type: `consultation_${stamp}`,
        booking_date: '2026-04-26',
        start_time: '10:00',
        duration_minutes: 60,
        location: '线上',
        note: 'Photo Studio closeout smoke.',
    });
    record('booking_create', booking, booking.data?.event_key || '');

    const bookingUpdate = await orchestrator.runAction('schedule_board', 'update_booking_time', {
        project_id: projectId,
        event_key: booking.data?.event_key,
        booking_date: '2026-04-27',
        start_time: '11:00',
        duration_minutes: 120,
        location: '本地影子影棚',
    });
    record('booking_update', bookingUpdate, bookingUpdate.data?.event_date || '');

    const bookingStart = await orchestrator.runAction('schedule_board', 'start_booking', {
        project_id: projectId,
        event_key: booking.data?.event_key,
    });
    record('booking_start', bookingStart, bookingStart.data?.status || '');

    const bookingComplete = await orchestrator.runAction('schedule_board', 'complete_booking', {
        project_id: projectId,
        event_key: booking.data?.event_key,
    });
    record('booking_complete', bookingComplete, bookingComplete.data?.status || '');

    const deliveryProjectId = await ensureDeliveryCandidate(projectId);
    const deliveryTasks = await orchestrator.runAction('delivery_assets', 'create_delivery_tasks', {
        project_id: deliveryProjectId,
        delivery_mode: 'digital delivery',
    });
    record('delivery_tasks', deliveryTasks, deliveryTasks.data?.project_id || deliveryProjectId);

    const deliveryPackage = await orchestrator.runAction('delivery_assets', 'create_delivery_package', {
        project_id: deliveryProjectId,
        package_type: `client_delivery_${stamp}`,
    });
    record('delivery_package_create', deliveryPackage, firstDataId(deliveryPackage, 'delivery_package_id'));

    const packageSent = await orchestrator.runAction('delivery_assets', 'update_delivery_package_status', {
        delivery_package_id: deliveryPackage.data?.delivery_package_id,
        status: 'sent',
    });
    record('delivery_package_sent', packageSent, packageSent.data?.status || '');

    const packageAck = await orchestrator.runAction('delivery_assets', 'update_delivery_package_status', {
        delivery_package_id: deliveryPackage.data?.delivery_package_id,
        status: 'acknowledged',
    });
    record('delivery_package_ack', packageAck, packageAck.data?.status || '');

    const sync = await orchestrator.runAction('delivery_assets', 'sync_external', {
        project_id: deliveryProjectId,
        target_type: 'sheet',
        target_provider: 'dingtalk_ai_table',
        target_name: 'photo_studio_project_inventory',
        note: 'Photo Studio closeout smoke local shadow sync.',
    });
    record('sync_external_shadow', sync, firstDataId(sync, 'external_export_id', 'export_key'));

    const audit = await orchestrator.runAction('delivery_assets', 'inspect_delivery_audit_trail', {});
    record('delivery_audit', audit, `events=${audit.data?.audit_summary?.total_events ?? 0}`);

    for (const scene of ['home', 'project_command', 'client_leads', 'schedule_board', 'delivery_assets']) {
        const refreshed = await orchestrator.refreshScene(scene, {});
        record(`refresh_${scene}`, refreshed);
    }

    const failures = results.filter((result) => !result.success);
    console.log(`\nPhoto Studio closeout smoke: ${results.length - failures.length}/${results.length} passed`);
    if (failures.length) {
        process.exitCode = 1;
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
