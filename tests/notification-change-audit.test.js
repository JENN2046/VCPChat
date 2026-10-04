const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');

function source(path) {
    return fs.readFileSync(path, 'utf8');
}

function createAuditDom() {
    const mainDocument = new JSDOM(source('main.html')).window.document;
    const template = mainDocument.getElementById('toolChangeAuditModalTemplate');

    const dom = new JSDOM(`<!doctype html>
        <html>
            <body>
                <ul id="notificationsList"></ul>
                <div id="floating-toast-notifications-container"></div>
                <aside id="notificationsSidebar" class="active"></aside>
                <div id="modal-container"></div>
                ${template.outerHTML}
            </body>
        </html>`, {
        url: 'https://vcpchat.local/main.html',
        runScripts: 'outside-only',
        pretendToBeVisual: true
    });

    const { window } = dom;
    const sentMessages = [];
    window.chatAPI = {
        sendVCPLogMessage(message) {
            sentMessages.push(message);
        },
        async sendVCPLogMessageConfirmed(message) {
            sentMessages.push(message);
            return { success: true, queued: true };
        }
    };
    window.CSS ||= {};
    window.CSS.escape ||= value => String(value).replace(/["\\]/g, '\\$&');
    window.eval(source('modules/ui-helpers.js'));
    window.eval(source('modules/notificationRenderer.js'));

    return { dom, window, sentMessages };
}

test('main-window tool approval exposes change audit and submits modal reason', async () => {
    const { dom, window, sentMessages } = createAuditDom();
    const longBefore = Array.from({ length: 420 }, (_, index) => `const before_${index} = ${index};`).join('\n');
    const longAfter = `${longBefore}\nconst acceptedChange = true;`;
    const request = {
        type: 'tool_approval_request',
        data: {
            requestId: 'approve-change-audit-test',
            toolName: 'FileOperator',
            maid: 'Nova',
            args: { command: 'update' },
            changePreview: {
                target: longBefore,
                replace: longAfter
            },
            timestamp: '2026-08-24T11:11:00.123+08:00'
        }
    };

    window.notificationRenderer.renderVCPLogNotification(
        request,
        JSON.stringify(request),
        window.document.getElementById('notificationsList')
    );

    const auditButton = Array.from(window.document.querySelectorAll('.notification-actions button'))
        .find(button => button.textContent === '审计');
    assert.ok(auditButton, 'changePreview should add an audit button');

    auditButton.click();

    const modal = window.document.getElementById('toolChangeAuditModal');
    assert.ok(modal.classList.contains('active'));
    assert.equal(window.document.getElementById('toolChangeAuditBefore').textContent, longBefore);
    assert.equal(window.document.getElementById('toolChangeAuditAfter').textContent, longAfter);
    assert.ok(
        window.document.querySelectorAll('.tool-change-audit-diff-line.is-add').length >= 1,
        'line diff should expose additions'
    );

    const wrapToggle = window.document.getElementById('toolChangeAuditWrapToggle');
    assert.equal(wrapToggle.getAttribute('aria-pressed'), 'false');
    wrapToggle.click();
    assert.equal(wrapToggle.getAttribute('aria-pressed'), 'true');
    assert.ok(modal.classList.contains('is-wrap-enabled'));

    window.document.getElementById('toolChangeAuditReason').value = '已核对新增代码，可以执行。';
    window.document.getElementById('approveToolChangeAudit').click();

    assert.deepEqual(JSON.parse(JSON.stringify(sentMessages)), [{
        type: 'tool_approval_response',
        data: {
            requestId: 'approve-change-audit-test',
            approved: true,
            reason: '已核对新增代码，可以执行。'
        }
    }]);
    assert.equal(modal.classList.contains('active'), false);

    dom.window.close();
});

test('ordinary tool approval does not expose change audit', () => {
    const { dom, window } = createAuditDom();
    const request = {
        type: 'tool_approval_request',
        data: {
            requestId: 'approve-without-change-preview',
            toolName: 'ReadOnlyTool',
            maid: 'Nova',
            args: { command: 'read' },
            timestamp: '2026-08-24T11:11:00.123+08:00'
        }
    };

    window.notificationRenderer.renderVCPLogNotification(
        request,
        JSON.stringify(request),
        window.document.getElementById('notificationsList')
    );

    const actionLabels = Array.from(
        window.document.querySelectorAll('.notification-actions button'),
        button => button.textContent
    );
    assert.deepEqual(actionLabels, ['允许', '拒绝']);

    dom.window.close();
});

test('SUVEI Human authorization is never consumed by generic auto-approval rules', () => {
    const { dom, window, sentMessages } = createAuditDom();
    window.notificationRenderer.configureCapabilities({
        filterManager: {
            checkToolAutoApproval: () => ({ action: 'approve', rule: { name: 'unsafe catch-all' } }),
            checkMessageFilter: () => null
        }
    });
    const request = {
        type: 'tool_approval_request',
        data: {
            requestId: 'suvei-human-approval-no-auto',
            toolName: 'SUVEIStudio',
            maid: 'Nova',
            args: {
                command: 'ExecuteAuthorizedGeneration',
                projectId: '33333333-3333-4333-8333-333333333333',
                intentId: '44444444-4444-5444-8444-444444444444'
            },
            timestamp: '2026-10-01T14:00:00.000Z',
            approvalTtlMs: 300000
        }
    };

    window.notificationRenderer.renderVCPLogNotification(
        request,
        JSON.stringify(request),
        window.document.getElementById('notificationsList')
    );

    assert.deepEqual(JSON.parse(JSON.stringify(sentMessages)), [], 'SUVEI authority must never be auto-approved');
    const actionLabels = Array.from(
        window.document.querySelectorAll('.notification-actions button'),
        button => button.textContent
    );
    assert.deepEqual(actionLabels, ['审视 SUVEI 授权']);
    assert.match(window.document.querySelector('.notification-content').textContent, /canonical Intent/);

    dom.window.close();
});

test('SUVEI Core authorization must commit before ToolBox receives approved=true', async () => {
    const { dom, window, sentMessages } = createAuditDom();
    let resolveDecision;
    const decisionPromise = new Promise(resolve => { resolveDecision = resolve; });
    const packet = {
        schemaVersion: 'suvei_human_authorization_preview.v1',
        requestId: 'suvei-core-before-toolbox',
        projectId: '33333333-3333-4333-8333-333333333333',
        intentId: '44444444-4444-5444-8444-444444444444',
        authorityTargetDigest: 'f'.repeat(64),
        toolApprovalExpiresAt: '2026-10-01T14:05:00.000Z',
        intent: {
            id: '44444444-4444-5444-8444-444444444444',
            projectId: '33333333-3333-4333-8333-333333333333',
            action: 'generate_candidate',
            revision: 0,
            requestFingerprint: 'e'.repeat(64),
            delegateUserId: '55555555-5555-4555-8555-555555555555',
            productionUnitId: '99999999-9999-4999-8999-999999999999',
            recipeId: '66666666-6666-4666-8666-666666666666',
            recipeDigest: 'a'.repeat(64),
            capabilityId: 'newapi.gpt-image-2.5-flare.v1',
            capabilityVersion: '1',
            requestedOutputCount: 1,
            resolution: '1024x1024',
            aspectRatio: '1:1',
            normalizedReason: 'One bounded output'
        },
        authorization: {
            expectedRevision: 0,
            requestFingerprint: 'e'.repeat(64),
            expiresAt: '2026-10-01T14:30:00.000Z',
            maxAttempts: 1,
            maxOutputCount: 1,
            maxTotalCredits: 1,
            maxConcurrentAttempts: 1,
            maxWallClockMs: 300000,
            maxAdapterCallsPerAttempt: 1
        }
    };
    window.chatAPI.prepareSuveiHumanAuthorization = async () => ({ success: true, packet });
    window.chatAPI.decideSuveiHumanAuthorization = async () => decisionPromise;
    window.chatAPI.loginSuveiHumanOwner = async () => ({ success: true });

    const request = {
        type: 'tool_approval_request',
        data: {
            requestId: packet.requestId,
            toolName: 'SUVEIStudio',
            maid: 'Nova',
            args: {
                command: 'ExecuteAuthorizedGeneration',
                projectId: packet.projectId,
                intentId: packet.intentId
            },
            timestamp: '2026-10-01T14:00:00.000Z',
            approvalTtlMs: 300000
        }
    };

    window.notificationRenderer.renderVCPLogNotification(
        request,
        JSON.stringify(request),
        window.document.getElementById('notificationsList')
    );

    const reviewButton = Array.from(window.document.querySelectorAll('.notification-actions button'))
        .find(button => button.textContent === '审视 SUVEI 授权');
    assert.ok(reviewButton);
    reviewButton.click();
    await new Promise(resolve => setImmediate(resolve));

    const modal = window.document.getElementById('suveiHumanAuthorizationModal');
    assert.ok(modal);
    assert.equal(modal.style.display, 'flex');
    assert.match(window.document.getElementById('suveiHumanAuthorizationPacket').textContent, /Authority Target Digest/);

    window.document.getElementById('approveSuveiHumanAuthorization').click();
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(JSON.parse(JSON.stringify(sentMessages)), [], 'ToolBox must stay blocked while Core authorization is pending');

    resolveDecision({
        success: true,
        decision: {
            approved: true,
            proposalState: 'AUTHORIZED',
            authorityTargetDigest: packet.authorityTargetDigest
        }
    });
    await new Promise(resolve => setImmediate(resolve));

    assert.deepEqual(JSON.parse(JSON.stringify(sentMessages)), [{
        type: 'tool_approval_response',
        data: {
            requestId: packet.requestId,
            approved: true
        }
    }]);

    dom.window.close();
});

test('SUVEI recovery surface distinguishes resume from a fresh authorization', async () => {
    const { dom, window, sentMessages } = createAuditDom();
    const packet = {
        schemaVersion: 'suvei_human_authorization_preview.v1',
        requestId: 'suvei-authorized-recovery',
        projectId: '33333333-3333-4333-8333-333333333333',
        intentId: '44444444-4444-5444-8444-444444444444',
        decisionMode: 'reconcile_authorized',
        authorizationCommitted: true,
        authorityTargetDigest: 'a'.repeat(64),
        expectedAuthorizationTermsDigest: 'b'.repeat(64),
        toolApprovalExpiresAt: '2026-10-01T14:05:00.000Z',
        intent: {
            id: '44444444-4444-5444-8444-444444444444',
            projectId: '33333333-3333-4333-8333-333333333333',
            proposalState: 'AUTHORIZED',
            action: 'generate_candidate',
            revision: 1,
            requestFingerprint: 'e'.repeat(64),
            delegateUserId: '55555555-5555-4555-8555-555555555555',
            productionUnitId: '99999999-9999-4999-8999-999999999999',
            recipeId: '66666666-6666-4666-8666-666666666666',
            recipeDigest: 'c'.repeat(64),
            capabilityId: 'newapi.gpt-image-2.5-flare.v1',
            capabilityVersion: '1',
            requestedOutputCount: 1,
            resolution: '1024x1024',
            aspectRatio: '1:1',
            normalizedReason: 'Recover exact approved work'
        },
        authorization: {
            expectedRevision: 0,
            requestFingerprint: 'e'.repeat(64),
            expiresAt: '2026-10-01T14:30:00.000Z',
            maxAttempts: 1,
            maxOutputCount: 1,
            maxTotalCredits: 1,
            maxConcurrentAttempts: 1,
            maxWallClockMs: 300000,
            maxAdapterCallsPerAttempt: 1
        }
    };
    window.chatAPI.prepareSuveiHumanAuthorization = async () => ({ success: true, packet });
    window.chatAPI.decideSuveiHumanAuthorization = async () => ({
        success: true,
        decision: {
            approved: true,
            reconciled: true,
            proposalState: 'AUTHORIZED',
            authorityTargetDigest: packet.authorityTargetDigest
        }
    });
    window.chatAPI.loginSuveiHumanOwner = async () => ({ success: true });

    const request = {
        type: 'tool_approval_request',
        data: {
            requestId: packet.requestId,
            toolName: 'SUVEIStudio',
            maid: 'Nova',
            args: {
                command: 'ExecuteAuthorizedGeneration',
                projectId: packet.projectId,
                intentId: packet.intentId
            },
            timestamp: '2026-10-01T14:00:00.000Z',
            approvalTtlMs: 300000
        }
    };

    window.notificationRenderer.renderVCPLogNotification(
        request,
        JSON.stringify(request),
        window.document.getElementById('notificationsList')
    );
    const reviewButton = Array.from(window.document.querySelectorAll('.notification-actions button'))
        .find(button => button.textContent === '审视 SUVEI 授权');
    assert.ok(reviewButton);
    reviewButton.click();
    await new Promise(resolve => setImmediate(resolve));

    const packetText = window.document.getElementById('suveiHumanAuthorizationPacket').textContent;
    assert.match(packetText, /Core state: AUTHORIZED/);
    assert.match(packetText, /Decision mode: reconcile_authorized/);
    assert.equal(window.document.getElementById('approveSuveiHumanAuthorization').textContent, '继续执行（恢复）');
    assert.equal(window.document.getElementById('rejectSuveiHumanAuthorization').textContent, '撤销授权并拒绝');

    window.document.getElementById('approveSuveiHumanAuthorization').click();
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(JSON.parse(JSON.stringify(sentMessages)), [{
        type: 'tool_approval_response',
        data: {
            requestId: packet.requestId,
            approved: true
        }
    }]);

    dom.window.close();
});

test('SUVEI transport failure reparses committed Core state into recovery mode', async () => {
    const { dom, window, sentMessages } = createAuditDom();
    const packet = {
        schemaVersion: 'suvei_human_authorization_preview.v1',
        requestId: 'suvei-confirmed-transport-failure',
        projectId: '33333333-3333-4333-8333-333333333333',
        intentId: '44444444-4444-5444-8444-444444444444',
        decisionMode: 'authorize',
        authorizationCommitted: false,
        authorityTargetDigest: 'f'.repeat(64),
        toolApprovalExpiresAt: '2026-10-01T14:05:00.000Z',
        intent: {
            id: '44444444-4444-5444-8444-444444444444',
            projectId: '33333333-3333-4333-8333-333333333333',
            proposalState: 'PENDING',
            action: 'generate_candidate',
            revision: 0,
            requestFingerprint: 'e'.repeat(64),
            delegateUserId: '55555555-5555-4555-8555-555555555555',
            productionUnitId: '99999999-9999-4999-8999-999999999999',
            recipeId: '66666666-6666-4666-8666-666666666666',
            recipeDigest: 'a'.repeat(64),
            capabilityId: 'newapi.gpt-image-2.5-flare.v1',
            capabilityVersion: '1',
            requestedOutputCount: 1,
            resolution: '1024x1024',
            aspectRatio: '1:1',
            normalizedReason: 'One bounded output'
        },
        authorization: {
            expectedRevision: 0,
            requestFingerprint: 'e'.repeat(64),
            expiresAt: '2026-10-01T14:30:00.000Z',
            maxAttempts: 1,
            maxOutputCount: 1,
            maxTotalCredits: 1,
            maxConcurrentAttempts: 1,
            maxWallClockMs: 300000,
            maxAdapterCallsPerAttempt: 1
        }
    };
    const recoveryPacket = {
        ...packet,
        decisionMode: 'reconcile_authorized',
        authorizationCommitted: true,
        authorityTargetDigest: 'a'.repeat(64),
        intent: {
            ...packet.intent,
            proposalState: 'AUTHORIZED',
            revision: 1,
            authorizedBy: '11111111-1111-4111-8111-111111111111',
            authorizationExpiresAt: packet.authorization.expiresAt,
            authorizationTermsDigest: 'b'.repeat(64),
            executionGrantId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
        }
    };
    let prepareCalls = 0;
    window.chatAPI.prepareSuveiHumanAuthorization = async () => ({
        success: true,
        packet: ++prepareCalls === 1 ? packet : recoveryPacket
    });
    window.chatAPI.decideSuveiHumanAuthorization = async () => ({
        success: true,
        decision: { approved: true, proposalState: 'AUTHORIZED' }
    });
    window.chatAPI.loginSuveiHumanOwner = async () => ({ success: true });
    window.chatAPI.sendVCPLogMessageConfirmed = async () => ({
        success: false,
        code: 'VCPLOG_NOT_CONNECTED'
    });

    const request = {
        type: 'tool_approval_request',
        data: {
            requestId: packet.requestId,
            toolName: 'SUVEIStudio',
            maid: 'Nova',
            args: {
                command: 'ExecuteAuthorizedGeneration',
                projectId: packet.projectId,
                intentId: packet.intentId
            },
            timestamp: '2026-10-01T14:00:00.000Z',
            approvalTtlMs: 300000
        }
    };
    window.notificationRenderer.renderVCPLogNotification(
        request,
        JSON.stringify(request),
        window.document.getElementById('notificationsList')
    );
    const reviewButton = Array.from(window.document.querySelectorAll('.notification-actions button'))
        .find(button => button.textContent === '审视 SUVEI 授权');
    reviewButton.click();
    await new Promise(resolve => setImmediate(resolve));
    const modal = window.document.getElementById('suveiHumanAuthorizationModal');
    window.document.getElementById('approveSuveiHumanAuthorization').click();
    await new Promise(resolve => setImmediate(resolve));
    await new Promise(resolve => setImmediate(resolve));

    assert.equal(prepareCalls, 2);
    assert.equal(modal.style.display, 'flex');
    assert.deepEqual(JSON.parse(JSON.stringify(sentMessages)), []);
    assert.equal(window.document.getElementById('approveSuveiHumanAuthorization').textContent, '继续执行（恢复）');
    assert.equal(window.document.getElementById('rejectSuveiHumanAuthorization').textContent, '撤销授权并拒绝');
    assert.equal(window.document.getElementById('rejectSuveiHumanAuthorization').disabled, false);
    assert.match(window.document.getElementById('suveiHumanAuthorizationPacket').textContent, /Core state: AUTHORIZED/);
    dom.window.close();
});

test('SUVEI correction review displays exact source and mask content hashes', async () => {
    const { dom, window } = createAuditDom();
    const packet = {
        schemaVersion: 'suvei_human_authorization_preview.v1',
        requestId: 'suvei-correction-hashes',
        projectId: '33333333-3333-4333-8333-333333333333',
        intentId: '44444444-4444-5444-8444-444444444444',
        decisionMode: 'authorize',
        authorizationCommitted: false,
        authorityTargetDigest: 'f'.repeat(64),
        toolApprovalExpiresAt: '2026-10-01T14:05:00.000Z',
        intent: {
            id: '44444444-4444-5444-8444-444444444444',
            projectId: '33333333-3333-4333-8333-333333333333',
            proposalState: 'PENDING',
            action: 'inpaint_candidate',
            revision: 0,
            requestFingerprint: 'e'.repeat(64),
            delegateUserId: '55555555-5555-4555-8555-555555555555',
            productionUnitId: '99999999-9999-4999-8999-999999999999',
            recipeId: '66666666-6666-4666-8666-666666666666',
            recipeDigest: 'a'.repeat(64),
            capabilityId: 'newapi.gpt-image-2.5-flare.v1',
            capabilityVersion: '1',
            requestedOutputCount: 1,
            resolution: '1024x1024',
            aspectRatio: '1:1',
            normalizedReason: 'One exact correction',
            sourceCandidateId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
            sourceCandidateRevision: 2,
            sourceCandidateSha256: '1'.repeat(64),
            sourceCriticResultId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
            maskMediaObjectId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
            maskContentSha256: '2'.repeat(64),
            editInstruction: 'Repair only the masked edge'
        },
        authorization: {
            expectedRevision: 0,
            requestFingerprint: 'e'.repeat(64),
            expiresAt: '2026-10-01T14:30:00.000Z',
            maxAttempts: 1,
            maxOutputCount: 1,
            maxTotalCredits: 1,
            maxConcurrentAttempts: 1,
            maxWallClockMs: 300000,
            maxAdapterCallsPerAttempt: 1
        }
    };
    window.chatAPI.prepareSuveiHumanAuthorization = async () => ({ success: true, packet });
    window.chatAPI.decideSuveiHumanAuthorization = async () => ({ success: false });
    window.chatAPI.loginSuveiHumanOwner = async () => ({ success: true });

    const request = {
        type: 'tool_approval_request',
        data: {
            requestId: packet.requestId,
            toolName: 'SUVEIStudio',
            maid: 'Nova',
            args: {
                command: 'ExecuteAuthorizedCorrection',
                projectId: packet.projectId,
                intentId: packet.intentId
            },
            timestamp: '2026-10-01T14:00:00.000Z',
            approvalTtlMs: 300000
        }
    };
    window.notificationRenderer.renderVCPLogNotification(
        request,
        JSON.stringify(request),
        window.document.getElementById('notificationsList')
    );
    Array.from(window.document.querySelectorAll('.notification-actions button'))
        .find(button => button.textContent === '审视 SUVEI 授权').click();
    await new Promise(resolve => setImmediate(resolve));

    const text = window.document.getElementById('suveiHumanAuthorizationPacket').textContent;
    assert.match(text, /Source Candidate SHA256: 1{64}/);
    assert.match(text, /Mask SHA256: 2{64}/);
    dom.window.close();
});

test('SUVEI committed revocation recovery can only confirm approved=false to ToolBox', async () => {
    const { dom, window, sentMessages } = createAuditDom();
    const packet = {
        schemaVersion: 'suvei_human_authorization_preview.v1',
        requestId: 'suvei-revoked-recovery',
        projectId: '33333333-3333-4333-8333-333333333333',
        intentId: '44444444-4444-5444-8444-444444444444',
        decisionMode: 'reconcile_revoked',
        authorizationCommitted: false,
        revocationCommitted: true,
        authorityTargetDigest: 'd'.repeat(64),
        expectedAuthorizationTermsDigest: 'b'.repeat(64),
        toolApprovalExpiresAt: '2026-10-01T14:05:00.000Z',
        intent: {
            id: '44444444-4444-5444-8444-444444444444',
            projectId: '33333333-3333-4333-8333-333333333333',
            proposalState: 'REVOKED',
            action: 'generate_candidate',
            revision: 2,
            requestFingerprint: 'e'.repeat(64),
            delegateUserId: '55555555-5555-4555-8555-555555555555',
            productionUnitId: '99999999-9999-4999-8999-999999999999',
            recipeId: '66666666-6666-4666-8666-666666666666',
            recipeDigest: 'a'.repeat(64),
            capabilityId: 'newapi.gpt-image-2.5-flare.v1',
            capabilityVersion: '1',
            requestedOutputCount: 1,
            resolution: '1024x1024',
            aspectRatio: '1:1',
            normalizedReason: 'Revoked exact work'
        },
        authorization: {
            expectedRevision: 0,
            requestFingerprint: 'e'.repeat(64),
            expiresAt: '2026-10-01T14:30:00.000Z',
            maxAttempts: 1,
            maxOutputCount: 1,
            maxTotalCredits: 1,
            maxConcurrentAttempts: 1,
            maxWallClockMs: 300000,
            maxAdapterCallsPerAttempt: 1
        }
    };
    window.chatAPI.prepareSuveiHumanAuthorization = async () => ({ success: true, packet });
    window.chatAPI.decideSuveiHumanAuthorization = async ({ approved }) => {
        assert.equal(approved, false);
        return {
            success: true,
            decision: {
                approved: false,
                reconciled: true,
                proposalState: 'REVOKED',
                authorityTargetDigest: packet.authorityTargetDigest
            }
        };
    };
    window.chatAPI.loginSuveiHumanOwner = async () => ({ success: true });

    const request = {
        type: 'tool_approval_request',
        data: {
            requestId: packet.requestId,
            toolName: 'SUVEIStudio',
            maid: 'Nova',
            args: {
                command: 'ExecuteAuthorizedGeneration',
                projectId: packet.projectId,
                intentId: packet.intentId
            },
            timestamp: '2026-10-01T14:00:00.000Z',
            approvalTtlMs: 300000
        }
    };
    window.notificationRenderer.renderVCPLogNotification(
        request,
        JSON.stringify(request),
        window.document.getElementById('notificationsList')
    );
    Array.from(window.document.querySelectorAll('.notification-actions button'))
        .find(button => button.textContent === '审视 SUVEI 授权').click();
    await new Promise(resolve => setImmediate(resolve));

    const approve = window.document.getElementById('approveSuveiHumanAuthorization');
    const reject = window.document.getElementById('rejectSuveiHumanAuthorization');
    assert.equal(approve.disabled, true);
    assert.equal(approve.textContent, 'Core 已撤销');
    assert.equal(reject.textContent, '确认撤销并通知 ToolBox');

    reject.click();
    await new Promise(resolve => setImmediate(resolve));
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(JSON.parse(JSON.stringify(sentMessages)), [{
        type: 'tool_approval_response',
        data: { requestId: packet.requestId, approved: false }
    }]);
    dom.window.close();
});

test('RAG approval surfaces cannot emit generic approval for protected SUVEI execution', () => {
    const observer = source('RAGmodules/RAG_Observer.html');
    const overlay = source('RAGmodules/RAG_Overlay.html');
    const handlers = source('modules/ipc/ragHandlers.js');

    assert.match(observer, /protectedSuveiApprovalRequestIds/);
    assert.match(observer, /SUVEI protected approval must be completed in the trusted main VCPChat surface/);
    assert.match(observer, /requiresTrustedHumanAuthorization/);

    assert.match(overlay, /requiresTrustedHumanAuthorization/);
    assert.match(overlay, /请回主窗口审视/);
    assert.match(overlay, /只能在 VCPChat 主窗口审视 canonical authority target/);

    assert.match(handlers, /protectedSuveiApprovalRequestIds/);
    assert.match(handlers, /Refused SUVEI protected approval relay/);
});

test('SUVEI committed rejection recovery can only confirm approved=false to ToolBox', async () => {
    const { dom, window, sentMessages } = createAuditDom();
    const packet = {
        schemaVersion: 'suvei_human_authorization_preview.v1',
        requestId: 'suvei-rejected-recovery',
        projectId: '33333333-3333-4333-8333-333333333333',
        intentId: '44444444-4444-5444-8444-444444444444',
        decisionMode: 'reconcile_rejected',
        authorizationCommitted: false,
        authorityTargetDigest: 'd'.repeat(64),
        expectedAuthorizationTermsDigest: null,
        toolApprovalExpiresAt: '2026-10-01T14:05:00.000Z',
        intent: {
            id: '44444444-4444-5444-8444-444444444444',
            projectId: '33333333-3333-4333-8333-333333333333',
            proposalState: 'REJECTED',
            action: 'generate_candidate',
            revision: 1,
            requestFingerprint: 'e'.repeat(64),
            delegateUserId: '55555555-5555-4555-8555-555555555555',
            productionUnitId: '99999999-9999-4999-899d-2de959482469',
            recipeId: '66666666-6666-4666-8666-666666666666',
            recipeDigest: 'a'.repeat(64),
            capabilityId: 'newapi.gpt-image-2.5-flare.v1',
            capabilityVersion: '1',
            requestedOutputCount: 1,
            resolution: '1024x1024',
            aspectRatio: '1:1',
            normalizedReason: 'Rejected exact work'
        },
        authorization: null
    };
    window.chatAPI.prepareSuveiHumanAuthorization = async () => ({ success: true, packet });
    window.chatAPI.decideSuveiHumanAuthorization = async ({ approved }) => {
        assert.equal(approved, false);
        return {
            success: true,
            decision: {
                approved: false,
                reconciled: true,
                proposalState: 'REJECTED',
                authorityTargetDigest: packet.authorityTargetDigest
            }
        };
    };
    window.chatAPI.loginSuveiHumanOwner = async () => ({ success: true });

    const request = {
        type: 'tool_approval_request',
        data: {
            requestId: packet.requestId,
            toolName: 'SUVEIStudio',
            maid: 'Nova',
            args: {
                command: 'ExecuteAuthorizedGeneration',
                projectId: packet.projectId,
                intentId: packet.intentId
            },
            timestamp: '2026-10-01T14:00:00.000Z',
            approvalTtlMs: 300000
        }
    };

    window.notificationRenderer.renderVCPLogNotification(
        request,
        JSON.stringify(request),
        window.document.getElementById('notificationsList')
    );
    const reviewButton = Array.from(window.document.querySelectorAll('.notification-actions button'))
        .find(button => button.textContent === '审视 SUVEI 授权');
    assert.ok(reviewButton);
    reviewButton.click();
    await new Promise(resolve => setImmediate(resolve));

    const approve = window.document.getElementById('approveSuveiHumanAuthorization');
    const reject = window.document.getElementById('rejectSuveiHumanAuthorization');
    const packetText = window.document.getElementById('suveiHumanAuthorizationPacket').textContent;
    assert.equal(approve.disabled, true);
    assert.equal(approve.textContent, 'Core 已拒绝');
    assert.equal(reject.textContent, '确认拒绝并通知 ToolBox');
    assert.match(packetText, /Core state: REJECTED/);
    assert.match(packetText, /Decision mode: reconcile_rejected/);

    reject.click();
    await new Promise(resolve => setImmediate(resolve));
    await new Promise(resolve => setImmediate(resolve));

    assert.deepEqual(JSON.parse(JSON.stringify(sentMessages)), [{
        type: 'tool_approval_response',
        data: {
            requestId: packet.requestId,
            approved: false
        }
    }]);

    dom.window.close();
});

test('SUVEI generation review displays exact spec reference scratchpad and context identities', async () => {
    const { dom, window } = createAuditDom();
    const packet = {
        schemaVersion: 'suvei_human_authorization_preview.v1',
        requestId: 'suvei-generation-identities',
        projectId: '33333333-3333-4333-8333-333333333333',
        intentId: '44444444-4444-5444-8444-444444444444',
        decisionMode: 'authorize',
        authorizationCommitted: false,
        authorityTargetDigest: 'f'.repeat(64),
        toolApprovalExpiresAt: '2026-10-01T14:05:00.000Z',
        intent: {
            id: '44444444-4444-5444-8444-444444444444',
            projectId: '33333333-3333-4333-8333-333333333333',
            proposalState: 'PENDING',
            action: 'generate_candidate',
            revision: 0,
            requestFingerprint: 'e'.repeat(64),
            delegateUserId: '55555555-5555-4555-8555-555555555555',
            productionUnitId: '99999999-9999-4999-8999-999999999999',
            creativeSpecId: '77777777-7777-4777-8777-777777777777',
            creativeSpecVersionId: '88888888-8888-4888-8888-888888888888',
            referenceManifestDigest: '3'.repeat(64),
            targetScratchpadId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            contextDigest: '4'.repeat(64),
            recipeId: '66666666-6666-4666-8666-666666666666',
            recipeDigest: 'a'.repeat(64),
            capabilityId: 'newapi.gpt-image-2.5-flare.v1',
            capabilityVersion: '1',
            requestedOutputCount: 1,
            resolution: '1024x1024',
            aspectRatio: '1:1',
            normalizedReason: 'One exact generation'
        },
        authorization: {
            expectedRevision: 0,
            requestFingerprint: 'e'.repeat(64),
            expiresAt: '2026-10-01T14:30:00.000Z',
            maxAttempts: 1,
            maxOutputCount: 1,
            maxTotalCredits: 1,
            maxConcurrentAttempts: 1,
            maxWallClockMs: 300000,
            maxAdapterCallsPerAttempt: 1
        }
    };
    window.chatAPI.prepareSuveiHumanAuthorization = async () => ({ success: true, packet });
    window.chatAPI.decideSuveiHumanAuthorization = async () => ({ success: false });
    window.chatAPI.loginSuveiHumanOwner = async () => ({ success: true });

    const request = {
        type: 'tool_approval_request',
        data: {
            requestId: packet.requestId,
            toolName: 'SUVEIStudio',
            maid: 'Nova',
            args: {
                command: 'ExecuteAuthorizedGeneration',
                projectId: packet.projectId,
                intentId: packet.intentId
            },
            timestamp: '2026-10-01T14:00:00.000Z',
            approvalTtlMs: 300000
        }
    };
    window.notificationRenderer.renderVCPLogNotification(
        request,
        JSON.stringify(request),
        window.document.getElementById('notificationsList')
    );
    Array.from(window.document.querySelectorAll('.notification-actions button'))
        .find(button => button.textContent === '审视 SUVEI 授权').click();
    await new Promise(resolve => setImmediate(resolve));

    const text = window.document.getElementById('suveiHumanAuthorizationPacket').textContent;
    assert.match(text, /Creative Spec: 77777777-7777-4777-8777-777777777777/);
    assert.match(text, /Creative Spec Version: 88888888-8888-4888-8888-888888888888/);
    assert.match(text, /Reference Manifest Digest: 3{64}/);
    assert.match(text, /Target Scratchpad: aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/);
    assert.match(text, /Context Digest: 4{64}/);
    dom.window.close();
});



function mutationReviewPacket(mode = 'authorize') {
    return {
        schemaVersion: 'suvei_human_authorization_preview.v1', requestId: 'mutation-review',
        command: 'RequestMutationGrantAuthorization', projectId: '33333333-3333-4333-8333-333333333333',
        intentId: '44444444-4444-5444-8444-444444444444', decisionMode: mode,
        authorizationCommitted: mode === 'reconcile_authorized', revocationCommitted: mode === 'reconcile_revoked',
        authorityTargetDigest: 'a'.repeat(64), expectedAuthorizationTermsDigest: 'b'.repeat(64),
        toolApprovalExpiresAt: '2026-10-03T14:05:00.000Z',
        intent: {
            schemaVersion: 'agent_mutation_grant_intent.v1', id: '44444444-4444-5444-8444-444444444444',
            action: 'creative_spec.append_agent_version.v1', creativeSpecId: '77777777-7777-4777-8777-777777777777',
            delegateUserId: '55555555-5555-4555-8555-555555555555',
            proposalState: mode === 'authorize' ? 'PENDING' : (mode === 'reconcile_revoked' ? 'REVOKED' : 'AUTHORIZED'),
            revision: mode === 'authorize' ? 0 : (mode === 'reconcile_revoked' ? 2 : 1),
            allowedFieldKeys: ['lighting', 'styling'], baseVersion: 3, maxMutations: 2,
            expiresAt: '2026-10-03T14:30:00.000Z', normalizedReason: 'Bounded creative adjustment',
            requestFingerprint: 'c'.repeat(64), grantId: mode === 'authorize' ? null : 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            grantTermsDigest: mode === 'authorize' ? null : 'b'.repeat(64),
        },
        authorization: { expectedRevision: 0, requestFingerprint: 'c'.repeat(64), expiresAt: '2026-10-03T14:30:00.000Z' },
    };
}
async function openMutationReview(window, packet) {
    const request = { type: 'tool_approval_request', data: {
        requestId: packet.requestId, toolName: 'SUVEIStudio', maid: 'Nova',
        args: { command: packet.command, projectId: packet.projectId, intentId: packet.intentId },
        timestamp: '2026-10-03T14:00:00.000Z', approvalTtlMs: 300000,
    } };
    window.notificationRenderer.renderVCPLogNotification(request, JSON.stringify(request), window.document.getElementById('notificationsList'));
    Array.from(window.document.querySelectorAll('.notification-actions button')).find(b => b.textContent === '审视 SUVEI 授权').click();
    await new Promise(resolve => setImmediate(resolve));
}
test('mutation review shows exact field scope count base version and expiry before approval', async () => {
    const { dom, window, sentMessages } = createAuditDom();
    const packet = mutationReviewPacket(); const order = [];
    window.chatAPI.prepareSuveiHumanAuthorization = async () => ({ success: true, packet });
    window.chatAPI.decideSuveiHumanAuthorization = async ({ approved }) => {
        assert.equal(approved, true); order.push('Core AUTHORIZED');
        return { success: true, decision: { approved: true, proposalState: 'AUTHORIZED' } };
    };
    window.chatAPI.sendVCPLogMessageConfirmed = async message => { order.push('ToolBox approved'); sentMessages.push(message); return { success: true }; };
    await openMutationReview(window, packet);
    const text = window.document.getElementById('suveiHumanAuthorizationPacket').textContent;
    assert.match(text, /可修改字段: lighting, styling/); assert.match(text, /最多修改次数: 2/);
    assert.match(text, /基础版本: 3/); assert.match(text, /有效至: 2026-10-03T14:30:00.000Z/);
    assert.doesNotMatch(text, /最大 outputs|Recipe:|Capability:/);
    const approve = window.document.getElementById('approveSuveiHumanAuthorization');
    assert.equal(approve.textContent, '批准修改授权'); approve.click();
    await new Promise(resolve => setImmediate(resolve)); await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(order, ['Core AUTHORIZED', 'ToolBox approved']);
    assert.equal(sentMessages[0].data.approved, true); dom.window.close();
});
test('mutation committed authorization recovery offers return or revoke without another grant', async () => {
    const { dom, window, sentMessages } = createAuditDom(); const packet = mutationReviewPacket('reconcile_authorized');
    window.chatAPI.prepareSuveiHumanAuthorization = async () => ({ success: true, packet });
    window.chatAPI.decideSuveiHumanAuthorization = async ({ approved }) => {
        assert.equal(approved, false); return { success: true, decision: { approved: false, proposalState: 'REVOKED' } };
    };
    await openMutationReview(window, packet);
    assert.equal(window.document.getElementById('approveSuveiHumanAuthorization').textContent, '返回授权（恢复）');
    const revoke = window.document.getElementById('rejectSuveiHumanAuthorization');
    assert.equal(revoke.disabled, false); assert.equal(revoke.textContent, '撤销授权并拒绝'); revoke.click();
    await new Promise(resolve => setImmediate(resolve)); await new Promise(resolve => setImmediate(resolve));
    assert.equal(sentMessages[0].data.approved, false); dom.window.close();
});
test('mutation requests are protected in main review and RAG observer surfaces', () => {
    const { dom, window } = createAuditDom();
    assert.equal(window.notificationRenderer.isSuveiHumanAuthorizationRequest({ toolName: 'SUVEIStudio', args: { command: 'RequestMutationGrantAuthorization' } }), true);
    assert.match(source('RAGmodules/RAG_Observer.html'), /"RequestMutationGrantAuthorization"/);
    dom.window.close();
});

for (const failDecision of [false, true, "unknown"]) {
    test('expired mutation revoke-only UI never enables recovery; decision failure=' + failDecision, async () => {
        const { dom, window, sentMessages } = createAuditDom();
        const packet = { ...mutationReviewPacket('reconcile_authorized_expired_revoke_only'),
            authorizationExpired: true, revokeOnly: true, authorizationCommitted: true };
        let decisions = 0;
        window.chatAPI.prepareSuveiHumanAuthorization = async () => ({ success: true, packet });
        window.chatAPI.decideSuveiHumanAuthorization = async ({ approved }) => {
            decisions++;
            assert.equal(approved, false);
            return failDecision ? { success: false, code: failDecision === 'unknown' ? 'SUVEI_REVOCATION_OUTCOME_UNKNOWN' : 'CORE_UNAVAILABLE' }
                : { success: true, decision: { approved: false, proposalState: 'REVOKED' } };
        };
        await openMutationReview(window, packet);
        const text = window.document.getElementById('suveiHumanAuthorizationPacket').textContent;
        assert.match(text, /Core state: AUTHORIZED/);
        assert.match(text, /Authorization: EXPIRED/);
        assert.match(text, /当前授权不可再使用/);
        assert.match(text, /Owner 仍可显式撤销 canonical authorization/);
        const approve = window.document.getElementById('approveSuveiHumanAuthorization');
        assert.equal(approve.disabled, true);
        assert.equal(approve.onclick, null);
        assert.doesNotMatch(approve.textContent, /返回授权（恢复）/);
        approve.click(); assert.equal(decisions, 0);
        const revoke = window.document.getElementById('rejectSuveiHumanAuthorization');
        assert.equal(revoke.disabled, false);
        assert.equal(revoke.textContent, '撤销授权并拒绝');
        revoke.click();
        await new Promise(resolve => setImmediate(resolve));
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(decisions, 1);
        assert.equal(approve.disabled, true);
        if (failDecision === 'unknown') {
            assert.equal(revoke.textContent, '重新核对撤销结果');
            assert.match(window.document.getElementById('suveiHumanAuthorizationError').textContent, /不重复提交撤销/);
        }
        assert.equal(sentMessages.some(m => m.data?.approved === true), false);
        assert.equal(sentMessages.length, failDecision ? 0 : 1);
        if (!failDecision) assert.equal(sentMessages[0].data.approved, false);
        dom.window.close();
    });
}
