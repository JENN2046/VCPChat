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
