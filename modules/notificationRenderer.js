// modules/notificationRenderer.js

var notificationRendererApi = window.chatAPI || window.electronAPI;
let filterManagerCapability = null;
let notificationLifecycleOwner = null;

function checkMessageFilter(messageTitle) {
    return filterManagerCapability?.checkMessageFilter?.(messageTitle) || null;
}

function scheduleNotificationTimeout(callback, delay) {
    return notificationLifecycleOwner?.timeout
        ? notificationLifecycleOwner.timeout(callback, delay)
        : setTimeout(callback, delay);
}

function listenNotification(target, type, handler, options) {
    if (notificationLifecycleOwner?.add) return notificationLifecycleOwner.add(target, type, handler, options);
    target?.addEventListener?.(type, handler, options);
    return true;
}

/**
 * @typedef {Object} VCPLogStatus
 * @property {'open'|'closed'|'error'|'connecting'} status
 * @property {string} message
 */

/**
 * @typedef {Object} VCPLogData
 * @property {string} type - e.g., 'vcp_log', 'daily_note_created', 'connection_ack'
 * @property {Object|string} data - The actual log data or message content
 * @property {string} [message] - A general message if data is not the primary content
 */

/**
 * Updates the VCPLog connection status display.
 * @param {VCPLogStatus} statusUpdate - The status object.
 * @param {HTMLElement} vcpLogConnectionStatusDiv - The DOM element for status display.
 */
function updateVCPLogStatus(statusUpdate, vcpLogConnectionStatusDiv) {
    if (!vcpLogConnectionStatusDiv || !statusUpdate) return; // 增加对 statusUpdate 自身的检查

    // 安全地从 statusUpdate 对象中提取数据，无论其内部结构如何
    const source = statusUpdate.source;
    const message = statusUpdate.message;
    const status = statusUpdate.status;

    const prefix = source || 'VCPLog';
    vcpLogConnectionStatusDiv.textContent = `${prefix}: ${message || '状态未知'}`;
    vcpLogConnectionStatusDiv.className = `notifications-status status-${status || 'unknown'}`;
}

const handledToolApprovalRequestIds = new Set();
const TOOL_CHANGE_DIFF_MATRIX_LIMIT = 120000;
const SUVEI_HUMAN_AUTHORIZATION_COMMANDS = new Set([
    'ExecuteAuthorizedGeneration',
    'ExecuteAuthorizedCorrection'
]);

function isSuveiHumanAuthorizationRequest(approvalData) {
    return Boolean(
        approvalData
        && approvalData.toolName === 'SUVEIStudio'
        && approvalData.args
        && SUVEI_HUMAN_AUTHORIZATION_COMMANDS.has(approvalData.args.command)
    );
}

function formatToolChangePreviewValue(value) {
    if (typeof value === 'string') return value;
    if (typeof value === 'undefined') return '';
    try {
        const serialized = JSON.stringify(value, null, 2);
        return typeof serialized === 'string' ? serialized : String(value ?? '');
    } catch (error) {
        return String(value ?? '');
    }
}

function buildToolChangeDiff(beforeValue, afterValue) {
    const beforeLines = formatToolChangePreviewValue(beforeValue).split('\n');
    const afterLines = formatToolChangePreviewValue(afterValue).split('\n');
    const matrixSize = (beforeLines.length + 1) * (afterLines.length + 1);

    if (matrixSize > TOOL_CHANGE_DIFF_MATRIX_LIMIT) {
        return [
            ...beforeLines.map(text => ({ type: 'delete', text })),
            ...afterLines.map(text => ({ type: 'add', text }))
        ];
    }

    const lengths = Array.from(
        { length: beforeLines.length + 1 },
        () => new Uint32Array(afterLines.length + 1)
    );

    for (let beforeIndex = beforeLines.length - 1; beforeIndex >= 0; beforeIndex -= 1) {
        for (let afterIndex = afterLines.length - 1; afterIndex >= 0; afterIndex -= 1) {
            lengths[beforeIndex][afterIndex] = beforeLines[beforeIndex] === afterLines[afterIndex]
                ? lengths[beforeIndex + 1][afterIndex + 1] + 1
                : Math.max(lengths[beforeIndex + 1][afterIndex], lengths[beforeIndex][afterIndex + 1]);
        }
    }

    const diff = [];
    let beforeIndex = 0;
    let afterIndex = 0;
    while (beforeIndex < beforeLines.length && afterIndex < afterLines.length) {
        if (beforeLines[beforeIndex] === afterLines[afterIndex]) {
            diff.push({ type: 'context', text: beforeLines[beforeIndex] });
            beforeIndex += 1;
            afterIndex += 1;
        } else if (lengths[beforeIndex + 1][afterIndex] >= lengths[beforeIndex][afterIndex + 1]) {
            diff.push({ type: 'delete', text: beforeLines[beforeIndex] });
            beforeIndex += 1;
        } else {
            diff.push({ type: 'add', text: afterLines[afterIndex] });
            afterIndex += 1;
        }
    }
    while (beforeIndex < beforeLines.length) {
        diff.push({ type: 'delete', text: beforeLines[beforeIndex++] });
    }
    while (afterIndex < afterLines.length) {
        diff.push({ type: 'add', text: afterLines[afterIndex++] });
    }
    return diff;
}

function openToolChangeAuditModal(approvalData, options = {}) {
    const changePreview = approvalData?.changePreview;
    if (!changePreview || typeof changePreview !== 'object' || Array.isArray(changePreview)) return false;

    const uiHelper = window.uiHelperFunctions;
    uiHelper?.openModal?.('toolChangeAuditModal');

    const modal = document.getElementById('toolChangeAuditModal');
    const beforeElement = document.getElementById('toolChangeAuditBefore');
    const afterElement = document.getElementById('toolChangeAuditAfter');
    const diffElement = document.getElementById('toolChangeAuditDiff');
    const reasonInput = document.getElementById('toolChangeAuditReason');
    const wrapToggle = document.getElementById('toolChangeAuditWrapToggle');
    if (!modal || !beforeElement || !afterElement || !diffElement || !reasonInput || !wrapToggle) return false;

    const beforeText = formatToolChangePreviewValue(changePreview.target);
    const afterText = formatToolChangePreviewValue(changePreview.replace);
    const diff = buildToolChangeDiff(changePreview.target, changePreview.replace);
    const additions = diff.filter(line => line.type === 'add').length;
    const deletions = diff.filter(line => line.type === 'delete').length;

    document.getElementById('toolChangeAuditToolName').textContent = approvalData.toolName || '未知工具';
    document.getElementById('toolChangeAuditMaid').textContent = approvalData.maid || '未知助手';
    document.getElementById('toolChangeAuditRequestId').textContent = approvalData.requestId || '—';
    document.getElementById('toolChangeAuditTimestamp').textContent = approvalData.timestamp || '—';
    document.getElementById('toolChangeAuditStatus').textContent = '等待审核';
    document.getElementById('toolChangeAuditSummary').textContent =
        `检测到 ${additions} 行新增、${deletions} 行删除。请确认变更内容后再决定是否执行。`;
    beforeElement.textContent = beforeText || '（空内容）';
    afterElement.textContent = afterText || '（空内容）';
    reasonInput.value = typeof options.reason === 'string' ? options.reason : '';
    diffElement.replaceChildren();

    const setWrapEnabled = (enabled) => {
        modal.classList.toggle('is-wrap-enabled', enabled);
        wrapToggle.classList.toggle('active', enabled);
        wrapToggle.setAttribute('aria-pressed', enabled ? 'true' : 'false');
        wrapToggle.title = enabled
            ? '关闭代码与差异内容的自动换行'
            : '开启代码与差异内容的自动换行';
    };
    setWrapEnabled(false);
    wrapToggle.onclick = event => {
        event.stopPropagation();
        setWrapEnabled(wrapToggle.getAttribute('aria-pressed') !== 'true');
    };

    diff.forEach((line) => {
        const row = document.createElement('div');
        row.className = `tool-change-audit-diff-line is-${line.type}`;

        const marker = document.createElement('span');
        marker.className = 'tool-change-audit-diff-marker';
        marker.textContent = line.type === 'add' ? '+' : line.type === 'delete' ? '−' : ' ';

        const content = document.createElement('span');
        content.className = 'tool-change-audit-diff-text';
        content.textContent = line.text || ' ';

        row.append(marker, content);
        diffElement.appendChild(row);
    });

    const close = () => uiHelper?.closeModal?.('toolChangeAuditModal');
    const decide = (approved) => {
        if (handledToolApprovalRequestIds.has(approvalData.requestId)) {
            close();
            return;
        }
        const accepted = options.onDecision?.(approved, reasonInput.value);
        if (accepted !== false) close();
    };

    document.getElementById('closeToolChangeAuditModal').onclick = close;
    document.getElementById('cancelToolChangeAudit').onclick = close;
    document.getElementById('rejectToolChangeAudit').onclick = () => decide(false);
    document.getElementById('approveToolChangeAudit').onclick = () => decide(true);
    modal.onclick = event => {
        if (event.target === modal) close();
    };
    modal.onkeydown = event => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        close();
    };

    requestAnimationFrame(() => reasonInput.focus());
    return true;
}

function clearPersistentNotifications({ container = document.getElementById('notificationsList') } = {}) {
    if (!container) return { success: false, removed: 0 };
    let removed = 0;
    container.querySelectorAll('.notification-item').forEach(item => {
        if (item.dataset.protectedNotification === 'tool-approval') return;
        item.remove();
        removed += 1;
    });
    return { success: true, removed };
}

function sendToolApprovalResponse(requestId, approved, reason = '') {
    if (!requestId || !notificationRendererApi || typeof notificationRendererApi.sendVCPLogMessage !== 'function') {
        return false;
    }

    const responseData = {
        requestId,
        approved: approved === true
    };

    const trimmedReason = typeof reason === 'string' ? reason.trim() : '';
    if (trimmedReason) {
        responseData.reason = trimmedReason;
    }

    notificationRendererApi.sendVCPLogMessage({
        type: 'tool_approval_response',
        data: responseData
    });
    return true;
}

async function sendSuveiToolApprovalResponseConfirmed(requestId, approved, reason = '') {
    if (!requestId || !notificationRendererApi
        || typeof notificationRendererApi.sendVCPLogMessageConfirmed !== 'function') {
        return false;
    }
    const responseData = {
        requestId,
        approved: approved === true
    };
    const trimmedReason = typeof reason === 'string' ? reason.trim() : '';
    if (trimmedReason) responseData.reason = trimmedReason;
    const result = await notificationRendererApi.sendVCPLogMessageConfirmed({
        type: 'tool_approval_response',
        data: responseData
    });
    return result?.success === true && result?.queued === true;
}

function setSuveiModalOpen(modal, open) {
    if (!modal) return;
    modal.classList.toggle('active', open);
    modal.style.display = open ? 'flex' : 'none';
    modal.setAttribute('aria-hidden', open ? 'false' : 'true');
}

function ensureSuveiOwnerLoginModal() {
    let modal = document.getElementById('suveiOwnerLoginModal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'suveiOwnerLoginModal';
    modal.className = 'modal vcp-ui-scope';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'suveiOwnerLoginTitle');
    modal.setAttribute('aria-hidden', 'true');
    modal.style.display = 'none';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 520px;">
            <button class="close-button" type="button" id="closeSuveiOwnerLogin" aria-label="关闭">×</button>
            <h2 id="suveiOwnerLoginTitle">SUVEI Human Owner 登录</h2>
            <p>使用“服务器连接 → SUVEI 人类授权”中绑定的 Owner。密码只用于本次应用会话，不写入 settings.json。</p>
            <div class="form-group">
                <label for="suveiOwnerSessionPassword">Owner 密码</label>
                <input id="suveiOwnerSessionPassword" type="password" autocomplete="current-password" maxlength="128">
            </div>
            <div id="suveiOwnerLoginError" role="alert" style="min-height: 1.5em;"></div>
            <div class="form-actions">
                <button type="button" class="button-secondary" id="cancelSuveiOwnerLogin">取消</button>
                <button type="button" class="button-primary" id="confirmSuveiOwnerLogin">验证 Owner 身份</button>
            </div>
        </div>`;
    (document.getElementById('modal-container') || document.body).appendChild(modal);
    return modal;
}

function ensureSuveiAuthorityReviewModal() {
    let modal = document.getElementById('suveiHumanAuthorizationModal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'suveiHumanAuthorizationModal';
    modal.className = 'modal vcp-ui-scope';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'suveiHumanAuthorizationTitle');
    modal.setAttribute('aria-hidden', 'true');
    modal.style.display = 'none';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 760px;">
            <button class="close-button" type="button" id="closeSuveiHumanAuthorization" aria-label="关闭">×</button>
            <h2 id="suveiHumanAuthorizationTitle">SUVEI 人类授权审视</h2>
            <p>以下内容来自 SUVEI Core 当前 canonical Intent。批准只绑定这里显示的 exact target。</p>
            <pre id="suveiHumanAuthorizationPacket" style="max-height: 52vh; overflow: auto; white-space: pre-wrap;"></pre>
            <div class="form-group">
                <label for="suveiHumanAuthorizationReason">审核理由 <small>可选；拒绝时会写入 Core 决策理由</small></label>
                <textarea id="suveiHumanAuthorizationReason" maxlength="1000" rows="3"></textarea>
            </div>
            <div id="suveiHumanAuthorizationError" role="alert" style="min-height: 1.5em;"></div>
            <div class="form-actions">
                <button type="button" class="button-secondary" id="cancelSuveiHumanAuthorization">稍后处理</button>
                <button type="button" class="vcp-btn vcp-btn-danger" id="rejectSuveiHumanAuthorization">拒绝</button>
                <button type="button" class="vcp-btn vcp-btn-success" id="approveSuveiHumanAuthorization">批准并执行</button>
            </div>
        </div>`;
    (document.getElementById('modal-container') || document.body).appendChild(modal);
    return modal;
}

function formatSuveiAuthorityPacket(packet) {
    const intent = packet?.intent || {};
    const authorization = packet?.authorization || {};
    const action = intent.action === 'inpaint_candidate' ? '单步 Candidate 修正' : '生成 Candidate';
    const authorizedRecovery = packet?.decisionMode === 'reconcile_authorized'
        || packet?.authorizationCommitted === true;
    const rejectedRecovery = packet?.decisionMode === 'reconcile_rejected';
    const revokedRecovery = packet?.decisionMode === 'reconcile_revoked'
        || packet?.revocationCommitted === true;
    const lines = [
        `动作: ${action}`,
        `Core state: ${intent.proposalState || '—'}${authorizedRecovery ? '（已存在 exact authorization，当前是恢复流程）' : ''}${rejectedRecovery ? '（Core 已拒绝，当前只恢复拒绝通知）' : ''}${revokedRecovery ? '（Core 已撤销，当前只恢复阻断通知）' : ''}`,
        `Decision mode: ${packet?.decisionMode || 'authorize'}`,
        `Project: ${packet?.projectId || '—'}`,
        `Intent: ${packet?.intentId || '—'}`,
        `Revision: ${intent.revision ?? '—'}`,
        `Request Fingerprint: ${intent.requestFingerprint || '—'}`,
        `Agent / Delegate: ${intent.delegateUserId || '—'}`,
        `Production Unit: ${intent.productionUnitId || '—'}`,
        `Creative Spec: ${intent.creativeSpecId || '—'}`,
        `Creative Spec Version: ${intent.creativeSpecVersionId || '—'}`,
        `Reference Manifest Digest: ${intent.referenceManifestDigest || '—'}`,
        `Target Scratchpad: ${intent.targetScratchpadId || '—'}`,
        `Context Digest: ${intent.contextDigest || '—'}`,
        `Recipe: ${intent.recipeId || '—'}`,
        `Recipe Digest: ${intent.recipeDigest || '—'}`,
        `Capability: ${intent.capabilityId || '—'} @ ${intent.capabilityVersion || '—'}`,
        `输出: ${intent.requestedOutputCount ?? '—'} × ${intent.resolution || '—'} (${intent.aspectRatio || '—'})`,
        `Agent 理由: ${intent.normalizedReason || '—'}`,
    ];
    if (intent.action === 'inpaint_candidate') {
        lines.push(
            `Source Candidate: ${intent.sourceCandidateId || '—'} rev ${intent.sourceCandidateRevision ?? '—'}`,
            `Source Candidate SHA256: ${intent.sourceCandidateSha256 || '—'}`,
            `Source Critic: ${intent.sourceCriticResultId || '—'}`,
            `Mask: ${intent.maskMediaObjectId || '—'}`,
            `Mask SHA256: ${intent.maskContentSha256 || '—'}`,
            `修正指令: ${intent.editInstruction || '—'}`
        );
    }
    lines.push(
        '',
        '授权上限（本次批准绑定以下 exact terms）',
        `有效至: ${authorization.expiresAt || '—'}`,
        `最大 attempts: ${authorization.maxAttempts ?? '—'}`,
        `最大 outputs: ${authorization.maxOutputCount ?? '—'}`,
        `最大 credits: ${authorization.maxTotalCredits ?? '—'}`,
        `最大并发 attempts: ${authorization.maxConcurrentAttempts ?? '—'}`,
        `最大 wall clock: ${authorization.maxWallClockMs ?? '—'} ms`,
        `每 attempt 最大 adapter calls: ${authorization.maxAdapterCallsPerAttempt ?? '—'}`,
        '',
        `Authority Target Digest: ${packet?.authorityTargetDigest || '—'}`,
        `Tool approval expires: ${packet?.toolApprovalExpiresAt || '—'}`
    );
    return lines.join('\n');
}
async function openSuveiOwnerLogin(onAuthenticated, statusElement) {
    if (!notificationRendererApi || typeof notificationRendererApi.loginSuveiHumanOwner !== 'function') {
        if (statusElement) statusElement.textContent = '当前 preload 未暴露 SUVEI Human Authorization API。';
        return false;
    }
    const modal = ensureSuveiOwnerLoginModal();
    const input = document.getElementById('suveiOwnerSessionPassword');
    const error = document.getElementById('suveiOwnerLoginError');
    const confirm = document.getElementById('confirmSuveiOwnerLogin');
    const close = () => {
        input.value = '';
        error.textContent = '';
        setSuveiModalOpen(modal, false);
    };
    document.getElementById('closeSuveiOwnerLogin').onclick = close;
    document.getElementById('cancelSuveiOwnerLogin').onclick = close;
    confirm.onclick = async () => {
        const password = input.value;
        input.value = '';
        error.textContent = '';
        confirm.disabled = true;
        try {
            const response = await notificationRendererApi.loginSuveiHumanOwner({ password });
            if (!response?.success) {
                error.textContent = `${response?.code || 'LOGIN_FAILED'}: ${response?.error || 'Owner 登录失败'}`;
                return;
            }
            close();
            if (statusElement) statusElement.textContent = 'Owner 身份已验证，正在重新读取 canonical Intent…';
            await onAuthenticated?.();
        } catch (loginError) {
            error.textContent = loginError?.message || 'Owner 登录失败';
        } finally {
            confirm.disabled = false;
        }
    };
    setSuveiModalOpen(modal, true);
    input.focus();
    return true;
}

async function openSuveiHumanAuthorizationReview(approvalData, initialReason, onCommitted, statusElement) {
    if (!notificationRendererApi || typeof notificationRendererApi.prepareSuveiHumanAuthorization !== 'function'
        || typeof notificationRendererApi.decideSuveiHumanAuthorization !== 'function') {
        if (statusElement) statusElement.textContent = '当前 VCPChat 未加载 SUVEI Human Authorization API。';
        return false;
    }
    if (statusElement) statusElement.textContent = '正在从 SUVEI Core 读取 exact pending target…';
    let prepared;
    try {
        prepared = await notificationRendererApi.prepareSuveiHumanAuthorization(approvalData);
    } catch (error) {
        if (statusElement) statusElement.textContent = error?.message || '读取 SUVEI authority target 失败。';
        return false;
    }
    if (!prepared?.success) {
        if (prepared?.code === 'SUVEI_OWNER_SESSION_REQUIRED') {
            if (statusElement) statusElement.textContent = '需要验证 Human Owner 身份。';
            return openSuveiOwnerLogin(
                () => openSuveiHumanAuthorizationReview(approvalData, initialReason, onCommitted, statusElement),
                statusElement
            );
        }
        if (statusElement) statusElement.textContent =
            `${prepared?.code || 'PREPARE_FAILED'}: ${prepared?.error || '无法准备 SUVEI 授权包'}`;
        return false;
    }

    const packet = prepared.packet;
    const modal = ensureSuveiAuthorityReviewModal();
    const packetElement = document.getElementById('suveiHumanAuthorizationPacket');
    const reasonInput = document.getElementById('suveiHumanAuthorizationReason');
    const errorElement = document.getElementById('suveiHumanAuthorizationError');
    const approveButton = document.getElementById('approveSuveiHumanAuthorization');
    const rejectButton = document.getElementById('rejectSuveiHumanAuthorization');
    const authorizedRecovery = packet?.decisionMode === 'reconcile_authorized'
        || packet?.authorizationCommitted === true;
    const rejectedRecovery = packet?.decisionMode === 'reconcile_rejected';
    const revokedRecovery = packet?.decisionMode === 'reconcile_revoked'
        || packet?.revocationCommitted === true;
    packetElement.textContent = formatSuveiAuthorityPacket(packet);
    reasonInput.value = typeof initialReason === 'string' ? initialReason : '';
    errorElement.textContent = '';
    approveButton.textContent = rejectedRecovery
        ? 'Core 已拒绝'
        : (revokedRecovery
            ? 'Core 已撤销'
            : (authorizedRecovery ? '继续执行（恢复）' : '批准并执行'));
    rejectButton.textContent = rejectedRecovery
        ? '确认拒绝并通知 ToolBox'
        : (revokedRecovery
            ? '确认撤销并通知 ToolBox'
            : (authorizedRecovery ? '撤销授权并拒绝' : '拒绝'));
    approveButton.disabled = rejectedRecovery || revokedRecovery;
    if (statusElement) {
        statusElement.textContent = rejectedRecovery
            ? `SUVEI Core 已提交拒绝；当前只恢复 ToolBox 的 approved=false。Target: ${packet.authorityTargetDigest}`
            : (revokedRecovery
                ? `SUVEI Core 已撤销这次 exact authorization；当前只恢复 ToolBox 的 approved=false。Target: ${packet.authorityTargetDigest}`
                : (authorizedRecovery
                    ? `SUVEI Core 已存在这次 exact authorization；当前只恢复 ToolBox transport。Target: ${packet.authorityTargetDigest}`
                    : `已绑定 exact target: ${packet.authorityTargetDigest}`));
    }

    const close = () => setSuveiModalOpen(modal, false);
    document.getElementById('closeSuveiHumanAuthorization').onclick = close;
    document.getElementById('cancelSuveiHumanAuthorization').onclick = close;

    const decide = async (approved) => {
        approveButton.disabled = true;
        rejectButton.disabled = true;
        errorElement.textContent = '';
        let handedOffToRecovery = false;
        try {
            const reason = reasonInput.value;
            const response = await notificationRendererApi.decideSuveiHumanAuthorization({
                requestId: approvalData.requestId,
                approved,
                reason
            });
            if (!response?.success) {
                errorElement.textContent =
                    `${response?.code || 'DECISION_FAILED'}: ${response?.error || 'SUVEI Core 决策失败'}`;
                return;
            }
            const transported = await onCommitted?.(approved, reason);
            if (transported === false) {
                errorElement.textContent =
                    'SUVEI Core 已完成决策，但 VCPLog transport 当前不可用。正在重新读取 committed Core state…';
                handedOffToRecovery = await openSuveiHumanAuthorizationReview(
                    approvalData,
                    reason,
                    onCommitted,
                    statusElement
                ) === true;
                if (!handedOffToRecovery) {
                    errorElement.textContent =
                        'Core 决策已提交，但恢复审批包失败。请关闭并重新打开该审批请求；不要重复 Core 决策。';
                }
                return;
            }
            if (statusElement) {
                statusElement.textContent = approved
                    ? (authorizedRecovery
                        ? '已确认恢复：没有重复授权，Agent 调用继续。'
                        : 'SUVEI Core 已授权，Agent 调用已放行。')
                    : (rejectedRecovery
                        ? '已确认恢复：没有重复拒绝，ToolBox 已收到阻断决定。'
                        : (revokedRecovery
                            ? '已确认恢复：没有重复撤销，ToolBox 已收到阻断决定。'
                            : (authorizedRecovery
                                ? 'SUVEI Core 的既有授权已撤销，Agent 调用已阻断。'
                                : 'SUVEI Core 已拒绝，Agent 调用已阻断。')));
            }
            close();
        } catch (decisionError) {
            errorElement.textContent = decisionError?.message || 'SUVEI Core 决策失败';
        } finally {
            if (!handedOffToRecovery) {
                approveButton.disabled = rejectedRecovery || revokedRecovery;
                rejectButton.disabled = false;
            }
        }
    };
    approveButton.onclick = (rejectedRecovery || revokedRecovery) ? null : () => void decide(true);
    rejectButton.onclick = () => void decide(false);
    setSuveiModalOpen(modal, true);
    reasonInput.focus();
    return true;
}
/**
 * Renders a VCPLog notification in the notifications list.
 * @param {VCPLogData|string} logData - The parsed JSON log data or a raw string message.
 * @param {string|null} originalRawMessage - The original raw string message from WebSocket, if available.
 * @param {HTMLElement} notificationsListUl - The UL element for the persistent notifications sidebar.
 * @param {Object} themeColors - An object containing theme colors (largely unused now with CSS variables).
 */
function renderVCPLogNotification(logData, originalRawMessage = null, notificationsListUl, themeColors = {}) {
    if (logData && typeof logData === 'object' && logData.type === 'tool_approval_request' && logData.data && typeof logData.data === 'object') {
        const isSuveiAuthorityRequest = isSuveiHumanAuthorizationRequest(logData.data);
        const autoApprovalResult = isSuveiAuthorityRequest
            ? null
            : (filterManagerCapability || window.filterManager)?.checkToolAutoApproval?.(logData.data);
        if (autoApprovalResult && autoApprovalResult.action === 'approve') {
            const sent = sendToolApprovalResponse(logData.data.requestId, true);
            const autoApprovalLog = {
                type: 'tool_auto_approval',
                data: {
                    toolName: logData.data.toolName,
                    maid: logData.data.maid,
                    requestId: logData.data.requestId,
                    ruleName: autoApprovalResult.rule?.name || '未命名规则',
                    sent,
                    timestamp: new Date().toISOString()
                }
            };

            if (notificationsListUl) {
                renderVCPLogNotification(autoApprovalLog, JSON.stringify(autoApprovalLog), notificationsListUl, themeColors);
            }

            console.log('[NotificationRenderer] 工具调用已按规则自动允许:', autoApprovalLog.data);
            return;
        }
    }

    // Suppress the generic English connection success message for VCPLog
    if (logData && typeof logData === 'object' && logData.type === 'connection_ack' && logData.message === 'WebSocket connection successful for VCPLog.') {
        return; // Do not render this notification
    }

    const toastContainer = document.getElementById('floating-toast-notifications-container');

    const textToCopy = originalRawMessage !== null ? originalRawMessage :
                       (typeof logData === 'object' && logData !== null ? JSON.stringify(logData, null, 2) : String(logData));

    let titleText = 'VCP 通知:';
    let mainContent = '';
    let contentIsPreformatted = false;

    // --- Content Parsing Logic (adapted from original renderer.js) ---
    if (logData && typeof logData === 'object' && logData.type === 'vcp_log' && logData.data && typeof logData.data === 'object') {
        const vcpData = logData.data;
        if (vcpData.tool_name && vcpData.status) {
            titleText = `${vcpData.tool_name} ${vcpData.status}`;
            if (typeof vcpData.content !== 'undefined') {
                let rawContentString = String(vcpData.content);
                mainContent = rawContentString;
                contentIsPreformatted = true;

                // Handle common error pattern: "执行错误: {"plugin_error": "..."}"
                if (vcpData.status === 'error' && rawContentString.includes('{')) {
                    const jsonStart = rawContentString.indexOf('{');
                    const prefix = rawContentString.substring(0, jsonStart);
                    const jsonPart = rawContentString.substring(jsonStart);
                    try {
                        const parsed = JSON.parse(jsonPart);
                        const displayError = parsed.plugin_error || parsed.error || parsed.message;
                        if (displayError) {
                            mainContent = prefix.trim() + (prefix.trim().endsWith(':') ? ' ' : ': ') + displayError;
                            contentIsPreformatted = false;
                        }
                    } catch (e) {
                        // Not valid JSON or parsing failed, keep raw content
                    }
                }

                try {
                    const parsedInnerContent = JSON.parse(rawContentString);
                    let titleSuffix = '';
                    if (parsedInnerContent.MaidName) {
                        titleSuffix += ` by ${parsedInnerContent.MaidName}`;
                    }
                    if (parsedInnerContent.timestamp && typeof parsedInnerContent.timestamp === 'string' && parsedInnerContent.timestamp.length >= 16) {
                        const timePart = parsedInnerContent.timestamp.substring(11, 16);
                        titleSuffix += `${parsedInnerContent.MaidName ? ' ' : ''}@ ${timePart}`;
                    }
                    if (titleSuffix) {
                        titleText += ` (${titleSuffix.trim()})`;
                    }
                    if (typeof parsedInnerContent.original_plugin_output !== 'undefined') {
                        const pluginOutput = parsedInnerContent.original_plugin_output;
                        if (typeof pluginOutput === 'object' && pluginOutput !== null) {
                            // DailyNote 插件返回带有 status 和 message 字段，优先显示友好消息
                            if (vcpData.tool_name === 'DailyNote' && pluginOutput.message) {
                                const statusIcon = pluginOutput.status === 'success' ? '✅' : '❌';
                                mainContent = `${statusIcon} ${pluginOutput.message}`;
                                contentIsPreformatted = false;
                            } else if (pluginOutput.message && typeof pluginOutput.message === 'string') {
                                // 通用处理：如果插件输出包含 message 字段，优先显示
                                mainContent = pluginOutput.message;
                                contentIsPreformatted = false;
                            } else {
                                mainContent = JSON.stringify(pluginOutput, null, 2);
                                // contentIsPreformatted is already true (from line 52) and should remain true for JSON display
                            }
                        } else {
                            mainContent = String(pluginOutput);
                            contentIsPreformatted = false; // If it's not an object, treat as plain text
                        }
                    } else if (vcpData.tool_name === 'DailyNote') {
                        // DailyNote 新格式：content 直接包含 message/folder/fileName/MaidName/timestamp
                        // 也兼容旧格式（无 message 字段时显示默认文本）
                        const statusIcon = vcpData.status === 'success' ? '✅' : '❌';
                        if (parsedInnerContent.message) {
                            mainContent = `${statusIcon} ${parsedInnerContent.message}`;
                        } else {
                            mainContent = `${statusIcon} 日记内容已成功记录到本地知识库。`;
                        }
                        contentIsPreformatted = false;
                    }
                } catch (e) {
                    // console.warn('VCP Notifier: Could not parse vcpData.content as JSON:', e, rawContentString);
                }
            } else {
                mainContent = '(无内容)';
            }
        } else if (vcpData.source === 'DistPluginManager' && vcpData.content) {
            titleText = '分布式服务器:';
            mainContent = vcpData.content;
            contentIsPreformatted = false;
        } else {
            titleText = 'VCP 日志条目:';
            mainContent = JSON.stringify(vcpData, null, 2);
            contentIsPreformatted = true;
        }
    } else if (logData && typeof logData === 'object' && logData.type === 'video_generation_status' && logData.data && typeof logData.data === 'object') {
        titleText = '视频生成状态:';
        if (logData.data.original_plugin_output && typeof logData.data.original_plugin_output.message === 'string') {
            mainContent = logData.data.original_plugin_output.message;
            contentIsPreformatted = false;
        } else if (logData.data.original_plugin_output) { // If original_plugin_output exists but not its message, stringify it
            mainContent = JSON.stringify(logData.data.original_plugin_output, null, 2);
            contentIsPreformatted = true;
        } else { // Fallback to stringify the whole data part
            mainContent = JSON.stringify(logData.data, null, 2);
            contentIsPreformatted = true;
        }
        // Attempt to add timestamp to title
        if (logData.data.timestamp && typeof logData.data.timestamp === 'string' && logData.data.timestamp.length >= 16) {
            const timePart = logData.data.timestamp.substring(11, 16);
            titleText += ` (@ ${timePart})`;
        }
    } else if (logData && typeof logData === 'object' && logData.type === 'daily_note_created' && logData.data && typeof logData.data === 'object') {
        const noteData = logData.data;
        titleText = `日记: ${noteData.maidName || 'N/A'} (${noteData.dateString || 'N/A'})`;
        if (noteData.status === 'success') {
            mainContent = noteData.message || '日记已成功创建。';
        } else {
            mainContent = noteData.message || `日记处理状态: ${noteData.status || '未知'}`;
        }
    } else if (logData && typeof logData === 'object' && logData.type === 'connection_ack' && logData.message) {
        titleText = 'VCP 连接:';
        mainContent = String(logData.message);
    } else if (logData && typeof logData === 'object' && logData.type === 'tool_auto_approval' && logData.data && typeof logData.data === 'object') {
        const approvalLog = logData.data;
        titleText = `✅ 已自动允许: ${approvalLog.toolName || '未知工具'}`;
        mainContent = `助手: ${approvalLog.maid || '未知'}\n规则: ${approvalLog.ruleName || '未命名规则'}\n请求ID: ${approvalLog.requestId || 'N/A'}\n状态: ${approvalLog.sent ? '已发送允许响应' : '发送失败'}`;
        contentIsPreformatted = true;
    } else if (logData && typeof logData === 'object' && logData.type && logData.message) { // Generic type + message
        titleText = `类型: ${logData.type}`;
        mainContent = String(logData.message);
        if (logData.data) {
            mainContent += `\n数据: ${JSON.stringify(logData.data, null, 2)}`;
            contentIsPreformatted = true;
        }
    } else if (logData && typeof logData === 'object' && logData.type === 'tool_approval_request' && logData.data && typeof logData.data === 'object') {
        const approvalData = logData.data;
        if (isSuveiHumanAuthorizationRequest(approvalData)) {
            titleText = '🔐 SUVEI Human Owner 授权';
            mainContent = `助手: ${approvalData.maid || '—'}\n动作: ${approvalData.args?.command || '—'}\nProject: ${approvalData.args?.projectId || '—'}\nIntent: ${approvalData.args?.intentId || '—'}\n\n必须先读取 SUVEI Core 当前 canonical Intent，再由 Human Owner 明确批准或拒绝。现有自动允许规则对此请求无效。`;
        } else {
            titleText = `🛠️ 审核请求: ${approvalData.toolName}`;
            mainContent = `助手: ${approvalData.maid}\n命令: ${approvalData.args?.command || JSON.stringify(approvalData.args)}\n时间: ${approvalData.timestamp}`;
        }
        contentIsPreformatted = true;
    } else { // Fallback for other structures or plain string
        titleText = 'VCP 消息:';
        mainContent = typeof logData === 'object' && logData !== null ? JSON.stringify(logData, null, 2) : String(logData);
        contentIsPreformatted = typeof logData === 'object';
    }
    // --- End Content Parsing ---

    const isToolApprovalRequest = logData && logData.type === 'tool_approval_request';
    const isSuveiAuthorityRequest = isToolApprovalRequest && isSuveiHumanAuthorizationRequest(logData.data);
    const hasToolChangePreview = isToolApprovalRequest
        && logData.data?.changePreview
        && typeof logData.data.changePreview === 'object'
        && !Array.isArray(logData.data.changePreview);

    // Function to populate a notification element (either toast or list item)
    const populateNotificationElement = (element, isToast) => {
        if (isToolApprovalRequest) {
            element.dataset.protectedNotification = 'tool-approval';
            element.dataset.toolApprovalRequestId = logData.data?.requestId || '';
            element.classList.add('notification-protected', 'notification-tool-approval');
        }

        const strongTitle = document.createElement('strong');
        strongTitle.textContent = titleText;
        element.appendChild(strongTitle);

        const contentDiv = document.createElement('div');
        contentDiv.classList.add('notification-content');
        if (mainContent) {
            if (contentIsPreformatted) {
                const pre = document.createElement('pre');
                pre.textContent = mainContent.substring(0, 300) + (mainContent.length > 300 ? '...' : '');
                pre.style.overflowWrap = 'break-word'; //  处理长文本换行
                pre.style.whiteSpace = 'pre-wrap'; //  确保<pre>标签也能自动换行
                contentDiv.appendChild(pre);
            } else {
                const p = document.createElement('p');
                p.textContent = mainContent.substring(0, 300) + (mainContent.length > 300 ? '...' : '');
                p.style.overflowWrap = 'break-word'; //  处理长文本换行
                contentDiv.appendChild(p);
            }
        }
        element.appendChild(contentDiv);

        // Special handling for approval requests - Moved here to be before timestamp
        if (isToolApprovalRequest) {
            const approvalReasonWrapper = document.createElement('div');
            approvalReasonWrapper.classList.add('notification-approval-reason');

            const reasonInput = document.createElement('textarea');
            reasonInput.classList.add('notification-approval-reason-input');
            reasonInput.placeholder = '可选：告诉 AI 为什么通过或拒绝';
            reasonInput.maxLength = 1000;
            reasonInput.rows = isToast ? 2 : 3;
            reasonInput.addEventListener('click', (e) => e.stopPropagation());
            reasonInput.addEventListener('keydown', (e) => e.stopPropagation());

            const reasonHint = document.createElement('div');
            reasonHint.classList.add('notification-approval-reason-hint');
            reasonHint.textContent = '拒绝时建议填写可执行的修正建议，最多 1000 字。';

            approvalReasonWrapper.appendChild(reasonInput);
            approvalReasonWrapper.appendChild(reasonHint);
            element.appendChild(approvalReasonWrapper);

            const approvalActions = document.createElement('div');
            approvalActions.classList.add('notification-actions');

            const finishApproval = (approved, suppliedReason = reasonInput.value) => {
                const requestId = logData.data.requestId;
                if (handledToolApprovalRequestIds.has(requestId)) return false;

                const sent = sendToolApprovalResponse(requestId, approved, suppliedReason);
                if (!sent) return false;

                handledToolApprovalRequestIds.add(requestId);
                dismissToolApprovalNotifications(requestId);
                return true;
            };

            const finishSuveiApproval = async (approved, suppliedReason = reasonInput.value) => {
                const requestId = logData.data.requestId;
                if (handledToolApprovalRequestIds.has(requestId)) return false;
                const sent = await sendSuveiToolApprovalResponseConfirmed(
                    requestId,
                    approved,
                    suppliedReason
                );
                if (!sent) return false;
                handledToolApprovalRequestIds.add(requestId);
                dismissToolApprovalNotifications(requestId);
                return true;
            };

            if (isSuveiAuthorityRequest) {
                const authorityStatus = document.createElement('div');
                authorityStatus.classList.add('notification-approval-reason-hint');
                authorityStatus.textContent = '等待 Human Owner 审视 canonical authority target。';
                element.appendChild(authorityStatus);

                const reviewBtn = document.createElement('button');
                reviewBtn.type = 'button';
                reviewBtn.textContent = '审视 SUVEI 授权';
                reviewBtn.classList.add('vcp-btn', 'vcp-btn-audit');
                reviewBtn.onclick = (event) => {
                    event.stopPropagation();
                    void openSuveiHumanAuthorizationReview(
                        logData.data,
                        reasonInput.value,
                        (approved, reason) => finishSuveiApproval(approved, reason),
                        authorityStatus
                    );
                };
                approvalActions.appendChild(reviewBtn);
            } else {
                if (hasToolChangePreview) {
                    const auditBtn = document.createElement('button');
                    auditBtn.type = 'button';
                    auditBtn.textContent = '审计';
                    auditBtn.classList.add('vcp-btn', 'vcp-btn-audit');
                    auditBtn.setAttribute('aria-label', `审计 ${logData.data.toolName || '工具'} 的内容变更`);
                    auditBtn.onclick = (event) => {
                        event.stopPropagation();
                        openToolChangeAuditModal(logData.data, {
                            reason: reasonInput.value,
                            onDecision: (approved, reason) => finishApproval(approved, reason)
                        });
                    };
                    approvalActions.appendChild(auditBtn);
                }

                const allowBtn = document.createElement('button');
                allowBtn.textContent = '允许';
                allowBtn.classList.add('vcp-btn', 'vcp-btn-success');
                allowBtn.onclick = (e) => {
                    e.stopPropagation();
                    finishApproval(true);
                };

                const rejectBtn = document.createElement('button');
                rejectBtn.textContent = '拒绝';
                rejectBtn.classList.add('vcp-btn', 'vcp-btn-danger');
                rejectBtn.onclick = (e) => {
                    e.stopPropagation();
                    finishApproval(false);
                };

                approvalActions.appendChild(allowBtn);
                approvalActions.appendChild(rejectBtn);
            }
            element.appendChild(approvalActions);
        }

        const timestampSpan = document.createElement('span');
        timestampSpan.classList.add('notification-timestamp');
        timestampSpan.textContent = new Date().toLocaleTimeString('zh-CN', { hour12: false });
        element.appendChild(timestampSpan);

        if (isToast) {
            if (isToolApprovalRequest) {
                // 审核请求防误触：悬浮通知本体点击不关闭，必须点“允许/拒绝”。
                element.onclick = null;
            } else {
                element.onclick = () => {
                    // 清除自动消失的timeout（如果有的话）
                    if (element.dataset.autoDismissTimeout) {
                        clearTimeout(parseInt(element.dataset.autoDismissTimeout));
                    }
                    closeToastNotification(element);
                }; // Click on bubble itself still closes it
            }
        } else { // For persistent list item
            const copyButton = document.createElement('button');
            copyButton.className = 'notification-copy-btn';
            copyButton.textContent = '📋';
            copyButton.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>';
            copyButton.title = '复制消息到剪贴板';
            copyButton.onclick = (e) => {
                e.stopPropagation();
                navigator.clipboard.writeText(textToCopy).then(() => {
                    const originalText = copyButton.textContent;
                    const originalMarkup = copyButton.innerHTML;
                    copyButton.textContent = '已复制!';
                    copyButton.disabled = true;
                    scheduleNotificationTimeout(() => {
                        copyButton.textContent = originalText;
                        copyButton.innerHTML = originalMarkup;
                        copyButton.disabled = false;
                    }, 1500);
                }).catch(err => {
                    console.error('通知复制失败: ', err);
                    const originalText = copyButton.textContent;
                    const originalMarkup = copyButton.innerHTML;
                    copyButton.textContent = '错误!';
                    scheduleNotificationTimeout(() => {
                        copyButton.textContent = originalText;
                        copyButton.innerHTML = originalMarkup;
                    }, 1500);
                });
            };
            element.appendChild(copyButton);

            // Click to dismiss for list items
            element.onclick = () => {
                // If it's an approval request, don't dismiss on body click to avoid misoperation
                if (logData && logData.type === 'tool_approval_request') return;

                element.style.opacity = '0';
                element.style.transform = 'translateX(100%)'; // Assuming this is the desired animation for list items
                scheduleNotificationTimeout(() => {
                    if (element.parentNode) {
                        element.parentNode.removeChild(element);
                    }
                }, 500); // Match CSS transition for .notification-item
            };
        }
    };

    const closeToastNotification = (toastElement) => {
        toastElement.classList.add('exiting');
        
        // 设置一个fallback timeout，确保元素一定会被移除
        const fallbackTimeout = scheduleNotificationTimeout(() => {
            if (toastElement.parentNode) {
                toastElement.parentNode.removeChild(toastElement);
            }
        }, 500); // 500ms后强制移除，即使transition没有完成
        
        listenNotification(toastElement, 'transitionend', () => {
            clearTimeout(fallbackTimeout); // 如果transition正常完成，清除fallback
            if (toastElement.parentNode) {
                toastElement.parentNode.removeChild(toastElement);
            }
        }, { once: true });
    };

    const dismissToolApprovalNotifications = (requestId) => {
        if (!requestId) return;

        const escapedRequestId = CSS.escape(String(requestId));
        const approvalElements = document.querySelectorAll(`.notification-tool-approval[data-tool-approval-request-id="${escapedRequestId}"]`);

        approvalElements.forEach((approvalElement) => {
            approvalElement.querySelectorAll('button, textarea').forEach((control) => {
                control.disabled = true;
            });

            const auditModal = document.getElementById('toolChangeAuditModal');
            if (auditModal?.classList.contains('active')
                && document.getElementById('toolChangeAuditRequestId')?.textContent === String(requestId)) {
                window.uiHelperFunctions?.closeModal?.('toolChangeAuditModal');
            }

            if (approvalElement.classList.contains('floating-toast-notification')) {
                closeToastNotification(approvalElement);
            } else {
                approvalElement.style.opacity = '0';
                approvalElement.style.transform = 'translateX(100%)';
                scheduleNotificationTimeout(() => approvalElement.remove(), 500);
            }
        });
    };

    // 初始化焦点清理机制
    initializeFocusCleanup();

    // Render Floating Toast only if the sidebar is not already active and filter allows it
    const notificationsSidebarElement = document.getElementById('notificationsSidebar');

    // Check if message should be filtered
    const filterResult = checkMessageFilter(titleText);

    // 如果过滤总开关未启用，或者明确匹配白名单规则，则显示通知
    const shouldShowNotification = !filterResult || (filterResult.action === 'show');

    if (toastContainer && (!notificationsSidebarElement || !notificationsSidebarElement.classList.contains('active')) && shouldShowNotification) {
        const toastBubble = document.createElement('div');
        toastBubble.classList.add('floating-toast-notification');
        // 添加创建时间戳
        toastBubble.dataset.createdAt = Date.now().toString();
        populateNotificationElement(toastBubble, true);

        toastContainer.prepend(toastBubble);
        scheduleNotificationTimeout(() => toastBubble.classList.add('visible'), 50);
        
        // 增强自动消失逻辑，支持自定义停留时间
        let autoDismissDelay = 7000; // 默认7秒

        // 审核类通知永不自动消失
        if (isToolApprovalRequest) {
            autoDismissDelay = Infinity;
        } else {
            const filterResult = checkMessageFilter(titleText);
            if (filterResult && filterResult.duration !== undefined) {
                autoDismissDelay = filterResult.duration === 0 ? Infinity : filterResult.duration * 1000;
            }
        }

        let autoDismissTimeout;
        if (autoDismissDelay === Infinity) {
            // 永久显示，不设置自动消失定时器
            autoDismissTimeout = null;
        } else {
            autoDismissTimeout = scheduleNotificationTimeout(() => {
                if (toastBubble.parentNode && toastBubble.classList.contains('visible') && !toastBubble.classList.contains('exiting')) {
                    closeToastNotification(toastBubble);
                }
            }, autoDismissDelay);
        }
        
        // 保存timeout ID，以便在手动关闭时清除（如果有的话）
        if (autoDismissTimeout) {
            toastBubble.dataset.autoDismissTimeout = autoDismissTimeout.toString();
        }
    } else if (toastContainer && notificationsSidebarElement && notificationsSidebarElement.classList.contains('active')) {
        // console.log('Notification sidebar is active, suppressing floating toast.');
    } else if (filterResult && filterResult.action === 'hide') {
        console.log('Message filtered out by rule:', filterResult.rule?.name || 'default blacklist', 'Action:', filterResult.action);
    } else if (!toastContainer) {
        console.warn('Floating toast container not found. Toast not displayed.');
    }

    // Render to Persistent Notification Sidebar List
    if (notificationsListUl) {
        const listItemBubble = document.createElement('li'); // Use 'li' for the list
        listItemBubble.classList.add('notification-item'); // Existing class for list items
        populateNotificationElement(listItemBubble, false);
        notificationsListUl.prepend(listItemBubble);
        // Apply 'visible' class for potential animations on list items if defined in CSS
        scheduleNotificationTimeout(() => listItemBubble.classList.add('visible'), 50);
    } else {
        console.warn('Notifications sidebar UL not found. Persistent notification not added.');
    }
}

// 添加窗口焦点变化监听，清理残留的通知元素
let focusCleanupInitialized = false;

function initializeFocusCleanup(options = {}) {
    if (focusCleanupInitialized) return;
    focusCleanupInitialized = true;
    notificationLifecycleOwner = options.owner || notificationLifecycleOwner;

    const cleanupExpiredToasts = (maxAgeMs) => {
        const toastContainer = document.getElementById('floating-toast-notifications-container');
        if (!toastContainer) return;
        toastContainer.querySelectorAll('.floating-toast-notification').forEach(toast => {
            if (toast.dataset.protectedNotification === 'tool-approval') return;
            const createdAt = Number(toast.dataset.createdAt || Date.now());
            if (!toast.dataset.createdAt) toast.dataset.createdAt = String(createdAt);
            if (Date.now() - createdAt > maxAgeMs) toast.parentNode?.removeChild(toast);
        });
    };

    // 当窗口重新获得焦点时，清理所有可能残留的通知元素
    const onFocus = () => {
        const toastContainer = document.getElementById('floating-toast-notifications-container');
        if (toastContainer) {
            // 查找所有添加了 exiting 类但仍在 DOM 中的元素
            const exitingToasts = toastContainer.querySelectorAll('.floating-toast-notification.exiting');
            exitingToasts.forEach(toast => {
                if (toast.parentNode) {
                    console.log('[NotificationRenderer] 清理残留的通知元素');
                    toast.parentNode.removeChild(toast);
                }
            });
            
            // 清理超时的通知元素（显示超过10秒的）
            const allToasts = toastContainer.querySelectorAll('.floating-toast-notification');
            allToasts.forEach(toast => {
                if (toast.dataset.protectedNotification === 'tool-approval') return;

                // 检查元素创建时间，如果没有时间戳则设置一个
                if (!toast.dataset.createdAt) {
                    toast.dataset.createdAt = Date.now().toString();
                } else {
                    const createdAt = parseInt(toast.dataset.createdAt);
                    const now = Date.now();
                    if (now - createdAt > 10000) { // 超过10秒
                        console.log('[NotificationRenderer] 清理超时的通知元素');
                        if (toast.parentNode) {
                            toast.parentNode.removeChild(toast);
                        }
                    }
                }
            });
        }
    };
    if (notificationLifecycleOwner?.add) notificationLifecycleOwner.add(window, 'focus', onFocus);
    else window.addEventListener('focus', onFocus);

    // 定期清理机制，每30秒检查一次
    const scheduleCleanup = () => {
        cleanupExpiredToasts(15000);
        if (notificationLifecycleOwner?.timeout) notificationLifecycleOwner.timeout(scheduleCleanup, 30000);
        else scheduleNotificationTimeout(scheduleCleanup, 30000);
    };
    scheduleCleanup();
}

// Expose functions to be used by renderer.js
window.notificationRenderer = {
    updateVCPLogStatus,
    renderVCPLogNotification,
    initializeFocusCleanup,
    clearPersistentNotifications,
    buildToolChangeDiff,
    openToolChangeAuditModal,
    isSuveiHumanAuthorizationRequest,
    formatSuveiAuthorityPacket,
    openSuveiHumanAuthorizationReview,
    configureCapabilities({ filterManager = null, listenerOwner = null } = {}) {
        filterManagerCapability = filterManager;
        notificationLifecycleOwner = listenerOwner;
    }
};
