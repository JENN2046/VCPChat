// modules/ipc/imageLabReviewHandlers.js

const { ipcMain } = require('electron');

const CHANNELS = Object.freeze({
    LOAD_SESSION: 'imageLabReview.loadSession',
    PREVIEW_DRAFT: 'imageLabReview.previewDraft',
    SUBMIT_DRAFT: 'imageLabReview.submitDraft',
    CANCEL: 'imageLabReview.cancel'
});

const PROTOTYPE_GUARD_KEYS = Object.freeze([
    'api_called',
    'daily_note_called',
    'vcp_plugin_called',
    'disk_write_performed',
    'image_file_created'
]);

let ipcHandlersRegistered = false;
let trustedMainWindow = null;
let ackSequence = 0;

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function createAck(channel, payload, overrides = {}) {
    ackSequence += 1;

    return {
        ack_id: `imageLabReview_ack_${Date.now()}_${ackSequence}`,
        request_id: isPlainObject(payload) && typeof payload.request_id === 'string' ? payload.request_id : null,
        channel,
        accepted_by_handler: true,
        validation_passed: true,
        rejection_reason_cn: null,
        audit_summary_cn: 'Review Console 草案通道已通过本地校验；未执行插件、API、DailyNote、VCP 记忆或文件写入。',
        side_effects_performed: false,
        ...overrides
    };
}

function createRejectedAck(channel, payload, rejectionReasonCn) {
    return createAck(channel, payload, {
        accepted_by_handler: false,
        validation_passed: false,
        rejection_reason_cn: rejectionReasonCn,
        audit_summary_cn: 'Review Console 草案通道请求被拒绝；未保留敏感原文，未执行任何外部副作用。',
        side_effects_performed: false
    });
}

function validateSender(event) {
    if (!trustedMainWindow || trustedMainWindow.isDestroyed()) {
        return 'Review Console 主窗口不可用。';
    }

    if (!event || !event.sender || event.sender.id !== trustedMainWindow.webContents.id) {
        return 'IPC sender 未通过 Review Console 窗口校验。';
    }

    return null;
}

function validateDraftPayload(payload) {
    if (!isPlainObject(payload)) {
        return '请求 payload 必须是对象。';
    }

    const guard = payload.prototype_guard;
    if (guard !== undefined && !isPlainObject(guard)) {
        return 'prototype_guard 必须是对象。';
    }

    if (isPlainObject(guard)) {
        const unsafeKey = PROTOTYPE_GUARD_KEYS.find((key) => guard[key] === true);
        if (unsafeKey) {
            return `prototype_guard.${unsafeKey} 必须保持 false。`;
        }
    }

    return null;
}

function createPrototypeGuard() {
    return {
        api_called: false,
        daily_note_called: false,
        vcp_plugin_called: false,
        disk_write_performed: false,
        image_file_created: false
    };
}

function createReviewSessionDraft(payload = {}) {
    const sessionId = typeof payload.session_id === 'string' && payload.session_id.trim()
        ? payload.session_id.trim()
        : `review_session_${Date.now()}`;

    return {
        session_id: sessionId,
        task_id: typeof payload.task_id === 'string' ? payload.task_id : null,
        case_id: typeof payload.case_id === 'string' ? payload.case_id : null,
        image_versions: Array.isArray(payload.image_versions) ? payload.image_versions : [],
        current_version_id: typeof payload.current_version_id === 'string' ? payload.current_version_id : null,
        compare_version_id: typeof payload.compare_version_id === 'string' ? payload.compare_version_id : null,
        ai_review: isPlainObject(payload.ai_review) ? payload.ai_review : null,
        human_review: isPlainObject(payload.human_review) ? payload.human_review : null,
        final_review: isPlainObject(payload.human_review)
            ? payload.human_review
            : (isPlainObject(payload.ai_review) ? payload.ai_review : null),
        memory_preview: {
            chinese_diary_title: 'Review Console 草案预览',
            chinese_diary_content: '本条为本地审片台草案预览，尚未写入 DailyNote 或 VCP 长期记忆。',
            target_notebook: null,
            maid: null,
            tags: [],
            safety: {
                contains_secret: false,
                contains_private_path: false,
                contains_customer_private_data: false,
                should_write_to_vcp: false
            }
        },
        memory_approval: {
            status: 'pending',
            approved_by: null,
            approved_at: null,
            rejection_reason_cn: null
        },
        prototype_guard: createPrototypeGuard()
    };
}

function createDraftBundle(payload = {}) {
    const reviewSessionDraft = createReviewSessionDraft(payload.review_session_draft || payload);

    return {
        review_session_draft: reviewSessionDraft,
        image_case_draft: {
            case_id: reviewSessionDraft.case_id,
            asset_status: 'draft',
            human_approval: {
                approved: false,
                approved_by: null,
                approved_at: null,
                approval_notes_cn: null
            }
        },
        memory_delta_draft: {
            memory_delta_id: `memory_delta_${reviewSessionDraft.session_id}`,
            write_mode: 'draft',
            approval_status: 'pending',
            approved_by: null,
            approved_at: null,
            rejection_reason_cn: null,
            chinese_diary_content: reviewSessionDraft.memory_preview.chinese_diary_content,
            final_decision: {
                should_write_to_vcp: false
            }
        },
        prototype_guard: createPrototypeGuard()
    };
}

function registerHandler(channel, handler) {
    ipcMain.handle(channel, async (event, payload = {}) => {
        const senderError = validateSender(event);
        if (senderError) {
            return createRejectedAck(channel, payload, senderError);
        }

        return handler(payload);
    });
}

function initialize(mainWindow) {
    trustedMainWindow = mainWindow;

    if (ipcHandlersRegistered) {
        return;
    }

    registerHandler(CHANNELS.LOAD_SESSION, async (payload) => {
        const validationError = payload !== undefined && !isPlainObject(payload)
            ? 'loadSession payload 必须是对象。'
            : null;

        if (validationError) {
            return createRejectedAck(CHANNELS.LOAD_SESSION, payload, validationError);
        }

        return createAck(CHANNELS.LOAD_SESSION, payload, {
            review_session_draft: createReviewSessionDraft(payload || {})
        });
    });

    registerHandler(CHANNELS.PREVIEW_DRAFT, async (payload) => {
        const validationError = validateDraftPayload(payload);
        if (validationError) {
            return createRejectedAck(CHANNELS.PREVIEW_DRAFT, payload, validationError);
        }

        return createAck(CHANNELS.PREVIEW_DRAFT, payload, createDraftBundle(payload));
    });

    registerHandler(CHANNELS.SUBMIT_DRAFT, async (payload) => {
        const validationError = validateDraftPayload(payload);
        if (validationError) {
            return createRejectedAck(CHANNELS.SUBMIT_DRAFT, payload, validationError);
        }

        return createAck(CHANNELS.SUBMIT_DRAFT, payload, {
            draft_received: true,
            stored: false,
            submitted_to_daily_note: false,
            submitted_to_vcp_memory: false
        });
    });

    registerHandler(CHANNELS.CANCEL, async (payload) => {
        const validationError = payload !== undefined && !isPlainObject(payload)
            ? 'cancel payload 必须是对象。'
            : null;

        if (validationError) {
            return createRejectedAck(CHANNELS.CANCEL, payload, validationError);
        }

        return createAck(CHANNELS.CANCEL, payload, {
            cancelled: true
        });
    });

    ipcHandlersRegistered = true;
}

module.exports = {
    CHANNELS,
    initialize
};
