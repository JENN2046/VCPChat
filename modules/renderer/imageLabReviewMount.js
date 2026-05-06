// modules/renderer/imageLabReviewMount.js

const PROTOTYPE_GUARD = Object.freeze({
    api_called: false,
    daily_note_called: false,
    vcp_plugin_called: false,
    disk_write_performed: false,
    image_file_created: false
});

function clonePrototypeGuard() {
    return { ...PROTOTYPE_GUARD };
}

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function createReviewSessionDraft(input = {}) {
    const sessionId = typeof input.session_id === 'string' && input.session_id.trim()
        ? input.session_id.trim()
        : `review_session_${Date.now()}`;

    const humanReview = isPlainObject(input.human_review) ? input.human_review : null;
    const aiReview = isPlainObject(input.ai_review) ? input.ai_review : null;

    return {
        session_id: sessionId,
        task_id: typeof input.task_id === 'string' ? input.task_id : null,
        case_id: typeof input.case_id === 'string' ? input.case_id : null,
        image_versions: Array.isArray(input.image_versions) ? input.image_versions : [],
        current_version_id: typeof input.current_version_id === 'string' ? input.current_version_id : null,
        compare_version_id: typeof input.compare_version_id === 'string' ? input.compare_version_id : null,
        ai_review: aiReview,
        human_review: humanReview,
        final_review: humanReview || aiReview,
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
        next_iteration: null,
        audit_log: [],
        prototype_guard: clonePrototypeGuard()
    };
}

function createDraftBundle(input = {}) {
    const reviewSessionDraft = createReviewSessionDraft(input.review_session_draft || input);

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
        prototype_guard: clonePrototypeGuard()
    };
}

function getBridge() {
    return window.imageLabReview || null;
}

function createUnavailableBridgeResult(channel) {
    return Promise.resolve({
        channel,
        accepted_by_handler: false,
        validation_passed: false,
        rejection_reason_cn: 'imageLabReview preload bridge 不可用。',
        side_effects_performed: false
    });
}

function createRuntimeApi() {
    return {
        createDraftBundle,
        loadSession(payload = {}) {
            const bridge = getBridge();
            return bridge ? bridge.loadSession(payload) : createUnavailableBridgeResult('imageLabReview.loadSession');
        },
        previewDraft(payload = {}) {
            const bridge = getBridge();
            const draftBundle = createDraftBundle(payload);
            return bridge ? bridge.previewDraft(draftBundle) : createUnavailableBridgeResult('imageLabReview.previewDraft');
        },
        submitDraft(payload = {}) {
            const bridge = getBridge();
            const draftBundle = createDraftBundle(payload);
            return bridge ? bridge.submitDraft(draftBundle) : createUnavailableBridgeResult('imageLabReview.submitDraft');
        },
        cancel(payload = {}) {
            const bridge = getBridge();
            return bridge ? bridge.cancel(payload) : createUnavailableBridgeResult('imageLabReview.cancel');
        }
    };
}

function markMountReady() {
    const mount = document.getElementById('imageLabReviewMount');
    if (!mount) {
        return;
    }

    mount.dataset.runtimeStatus = 'ready';
    mount.dataset.sideEffects = 'false';
}

function initializeImageLabReviewMount() {
    window.imageLabReviewRuntime = createRuntimeApi();
    markMountReady();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeImageLabReviewMount, { once: true });
} else {
    initializeImageLabReviewMount();
}
