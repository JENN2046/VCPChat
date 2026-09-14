'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const {
    takeResidentPresentationFromChunk,
    takeResidentPresentationsFromResponse,
    redactResidentPresentationDiagnostic,
    sendResidentPresentation,
} = require('../modules/vcpClient');
const channel = '1234567890abcdef1234567890abcdef';
const presentation = {
    schema: 'agents-os-resident.host-presentation.v1',
    kind: 'OWNER_CONSENT_CHALLENGE',
    title: 'AGENTSOSResident · Owner Consent',
    mutationType: 'START_TASK',
    expiresInSeconds: 1,
    challenge: '确认变更，测试甲、测试乙、测试丙',
};

test('stream presentation requires the matching response channel and never enters content handling', () => {
    const chunk = { choices: [{ delta: { vcp_ephemeral_presentation: { channelId: channel, presentation } } }] };
    assert.deepEqual(takeResidentPresentationFromChunk(chunk, channel), { handled: true, presentation });
    for (const expected of [null, 'invalid', 'f'.repeat(32)]) {
        assert.deepEqual(takeResidentPresentationFromChunk(chunk, expected), { handled: true, presentation: null });
    }
    assert.deepEqual(takeResidentPresentationFromChunk({ choices: [{ delta: { content: 'normal' } }] }, channel), { handled: false, presentation: null });
});

test('non-stream presentation metadata is removed before response/history delivery, including rejected envelopes', () => {
    for (const expected of [channel, null, 'f'.repeat(32)]) {
        const response = {
            choices: [{ message: { content: 'normal' } }],
            vcp_ephemeral_presentations: [{ channelId: channel, presentation }],
        };
        assert.deepEqual(takeResidentPresentationsFromResponse(response, expected), expected === channel ? [presentation] : []);
        assert.equal(Object.hasOwn(response, 'vcp_ephemeral_presentations'), false);
        assert.equal(JSON.stringify(response).includes(presentation.challenge), false);
    }
});

test('diagnostics redact presentation data and sender lifecycle guard remains authoritative', () => {
    assert.equal(redactResidentPresentationDiagnostic(JSON.stringify(presentation)), '[AGENTSOSResident presentation diagnostic redacted]');
    assert.equal(redactResidentPresentationDiagnostic('ordinary error'), 'ordinary error');
    let directCalls = 0;
    let guardedCalls = 0;
    const webContents = { isDestroyed: () => false, send() { directCalls++; } };
    assert.equal(sendResidentPresentation({ presentation, messageId: 'm', webContents, sendPayload(payload) {
        guardedCalls++;
        assert.equal(payload.type, 'ephemeral_presentation');
        return false;
    } }), false);
    assert.equal(guardedCalls, 1);
    assert.equal(directCalls, 0);
    webContents.isDestroyed = () => true;
    assert.equal(sendResidentPresentation({ presentation, webContents }), false);
});

test('owned event bridge isolates consent from history, stream coordinator and raw diagnostics', async () => {
    const { createMainChatEventBridge } = await import('../modules/renderer/mainChatEventBridge.js');
    let listener;
    const diagnostics = [];
    let presentations = 0;
    const bridge = createMainChatEventBridge({
        chatAPI: { onVCPStreamEvent(fn) { listener = fn; return () => {}; } },
        acceptStreamEvent() { assert.fail('presentation reached durable stream consumer'); },
        consumeNonStreamingEvent() { assert.fail('presentation reached non-stream history consumer'); },
        consumeEphemeralPresentation() { presentations++; throw new Error(presentation.challenge); },
        onUnhandled(...args) { diagnostics.push(args); },
    });
    assert.equal(await listener({ type: 'ephemeral_presentation', messageId: 'm', presentation }), false);
    assert.equal(presentations, 1);
    assert.equal(JSON.stringify(diagnostics).includes(presentation.challenge), false);
    assert.equal(await listener({ type: 'ephemeral_presentation', presentation }), false);
    assert.equal(presentations, 1);
    bridge.dispose();
    assert.equal(await listener({ type: 'ephemeral_presentation', messageId: 'm', presentation }), false);
});

test('projection owns ephemeral DOM, expiry and teardown without creating history or cross-Surface state', async () => {
    const domA = new JSDOM('<!doctype html><div id="chat"></div>');
    const domB = new JSDOM('<!doctype html><div id="chat"></div>');
    const previousWindow = global.window;
    global.window = domA.window;
    const { createStreamProjection } = await import('../modules/renderer/streamManager.js');
    const projections = [];
    const timers = new Map();
    let timerSequence = 0;
    domA.window.setTimeout = callback => { const id = ++timerSequence; timers.set(id, callback); return id; };
    domA.window.clearTimeout = id => timers.delete(id);
    try {
        const makeProjection = dom => {
            const projection = createStreamProjection();
            projection.attachStreamProjection({
                chatMessagesDiv: dom.window.document.getElementById('chat'),
                viewAuthority: { isCurrent: context => context?.agentId === 'visible' && context?.topicId === 'topic' },
                transientStreamHistory: {
                    prepare() { assert.fail('ephemeral UI touched history'); },
                    finalize() { assert.fail('ephemeral UI touched history'); },
                    pendingCount: 0,
                },
                electronAPI: { onDesktopStatus: () => () => {} },
            });
            projections.push(projection);
            return projection;
        };
        const a = makeProjection(domA);
        const b = makeProjection(domB);
        const context = { agentId: 'visible', topicId: 'topic' };
        assert.equal(a.renderResidentEphemeralPresentation('same-id', presentation, { ...context, topicId: 'hidden' }), false);
        assert.equal(a.renderResidentEphemeralPresentation('same-id', { ...presentation, extra: 'rejected' }, context), false);
        assert.equal(a.renderResidentEphemeralPresentation('same-id', presentation, context), true);
        assert.equal(a.renderResidentEphemeralPresentation('same-id', presentation, context), true);
        assert.equal(domA.window.document.querySelectorAll('.agents-os-resident-consent-presentation').length, 1);
        assert.equal(domB.window.document.querySelectorAll('.agents-os-resident-consent-presentation').length, 0);
        assert.equal(timers.size, 1, 'duplicate must not renew the consent expiry');
        assert.equal(a.getDiagnostics().contexts, 0);
        assert.equal(a.getDiagnostics().pendingHistory, 0);
        const expire = timers.values().next().value;
        timers.clear();
        expire();
        assert.equal(domA.window.document.querySelectorAll('.agents-os-resident-consent-presentation').length, 0);
        a.renderResidentEphemeralPresentation('same-id', presentation, context);
        b.renderResidentEphemeralPresentation('same-id', presentation, context);
        await a.dispose();
        assert.equal(timers.size, 0);
        assert.equal(domA.window.document.querySelectorAll('.agents-os-resident-consent-presentation').length, 0);
        assert.equal(domB.window.document.querySelectorAll('.agents-os-resident-consent-presentation').length, 1);
        assert.equal(a.renderResidentEphemeralPresentation('late', presentation, context), false);
    } finally {
        for (const projection of projections) await projection.dispose();
        global.window = previousWindow;
        domA.window.close();
        domB.window.close();
    }
});

async function withResidentProjectionFixture(run) {
    const dom = new JSDOM('<!doctype html><div id="chat"></div>');
    const previousWindow = global.window;
    global.window = dom.window;
    const timers = new Map();
    const callbacks = new Map();
    let sequence = 0;
    let current = true;
    let scrolls = 0;
    dom.window.setTimeout = (callback, delay) => {
        const id = ++sequence;
        timers.set(id, { callback, delay });
        callbacks.set(id, callback);
        return id;
    };
    dom.window.clearTimeout = id => timers.delete(id);
    const { createStreamProjection } = await import('../modules/renderer/streamManager.js');
    const projection = createStreamProjection();
    const context = { agentId: 'visible', topicId: 'topic' };
    const container = dom.window.document.getElementById('chat');
    projection.attachStreamProjection({
        chatMessagesDiv: container,
        viewAuthority: { isCurrent: value => current && value?.agentId === context.agentId && value?.topicId === context.topicId },
        transientStreamHistory: {
            prepare() { assert.fail('consent replacement touched history'); },
            finalize() { assert.fail('consent replacement touched history'); },
            pendingCount: 0,
        },
        electronAPI: { onDesktopStatus: () => () => {} },
        uiHelper: { scrollToBottom() { scrolls++; } },
    });
    try {
        await run({
            projection, context, container, timers, callbacks,
            card: () => container.querySelector('.agents-os-resident-consent-presentation'),
            setCurrent(value) { current = value; },
            scrollCount: () => scrolls,
        });
    } finally {
        await projection.dispose();
        global.window = previousWindow;
        dom.window.close();
    }
}

test('same-request consent deduplicates the validated payload and replaces different content without renewing duplicates', async () => {
    await withResidentProjectionFixture(({ projection, context, container, timers, card, scrollCount }) => {
        assert.equal(projection.renderResidentEphemeralPresentation('request', presentation, context), true);
        const firstCard = card();
        const firstTimer = timers.keys().next().value;
        const reordered = Object.fromEntries(Object.entries(presentation).reverse());
        assert.equal(projection.renderResidentEphemeralPresentation('request', reordered, context), true);
        assert.equal(card(), firstCard);
        assert.deepEqual([...timers.keys()], [firstTimer]);
        assert.equal(timers.get(firstTimer).delay, 1000);
        assert.equal(scrollCount(), 1);

        const next = { ...presentation, challenge: '确认变更，更新甲、更新乙、更新丙', expiresInSeconds: 2 };
        assert.equal(projection.renderResidentEphemeralPresentation('request', next, context), true);
        const replacement = card();
        assert.notEqual(replacement, firstCard, 'a new challenge must replace the request-owned card');
        assert.equal(firstCard.isConnected, false);
        assert.equal(container.querySelectorAll('.agents-os-resident-consent-presentation').length, 1);
        assert.equal(replacement.querySelector('.agents-os-resident-consent-challenge').textContent, next.challenge);
        assert.equal(timers.has(firstTimer), false);
        assert.equal(timers.size, 1);
        const nextTimer = timers.keys().next().value;
        assert.equal(timers.get(nextTimer).delay, 2000);
        assert.equal(scrollCount(), 2);
        assert.equal(projection.renderResidentEphemeralPresentation('request', { ...next }, context), true);
        assert.equal(card(), replacement);
        assert.deepEqual([...timers.keys()], [nextTimer]);
        assert.equal(scrollCount(), 2);
        assert.equal(projection.getDiagnostics().contexts, 0);
        assert.equal(projection.getDiagnostics().pendingHistory, 0);
    });
});

test('invalid or non-current replacement cannot evict consent or renew its expiry', async () => {
    await withResidentProjectionFixture(({ projection, context, timers, card, setCurrent, scrollCount }) => {
        assert.equal(projection.renderResidentEphemeralPresentation('request', presentation, context), true);
        const original = card();
        const timer = timers.keys().next().value;
        for (const invalid of [
            { ...presentation, expiresInSeconds: 0 },
            { ...presentation, expiresInSeconds: 301 },
            { ...presentation, challenge: '确认创建，测试甲、测试乙、测试丙' },
            { ...presentation, mutationType: 'UNKNOWN_MUTATION' },
            { ...presentation, authority: 'not-a-capability' },
            { ...presentation, challenge: presentation.challenge + '\n' },
        ]) {
            assert.equal(projection.renderResidentEphemeralPresentation('request', invalid, context), false);
            assert.equal(card(), original);
            assert.deepEqual([...timers.keys()], [timer]);
        }
        const next = { ...presentation, challenge: '确认变更，更新甲、更新乙、更新丙' };
        for (const rejectedContext of [null, { ...context, topicId: 'other' }, { ...context, agentId: 'other' }]) {
            assert.equal(projection.renderResidentEphemeralPresentation('request', next, rejectedContext), false);
        }
        setCurrent(false);
        assert.equal(projection.renderResidentEphemeralPresentation('request', next, context), false);
        assert.equal(card(), original);
        assert.deepEqual([...timers.keys()], [timer]);
        assert.equal(scrollCount(), 1);
        assert.equal(projection.getDiagnostics().contexts, 0);
        assert.equal(projection.getDiagnostics().pendingHistory, 0);
    });
});

test('replaced consent expiry cannot clear a newer owner and disposal removes the current view', async () => {
    await withResidentProjectionFixture(async ({ projection, context, timers, callbacks, card }) => {
        projection.renderResidentEphemeralPresentation('request', presentation, context);
        const oldTimer = timers.keys().next().value;
        const next = { ...presentation, challenge: '确认变更，更新甲、更新乙、更新丙' };
        projection.renderResidentEphemeralPresentation('request', next, context);
        assert.equal(card().querySelector('.agents-os-resident-consent-challenge').textContent, next.challenge);
        callbacks.get(oldTimer)(); // Simulate a previously queued callback after cancellation.
        assert.equal(card().querySelector('.agents-os-resident-consent-challenge').textContent, next.challenge);
        const third = { ...presentation, mutationType: 'PAUSE_TASK', challenge: '确认变更，暂停甲、暂停乙、暂停丙' };
        assert.equal(projection.renderResidentEphemeralPresentation('request', third, context), true);
        assert.equal(card().querySelector('.agents-os-resident-consent-challenge').textContent, third.challenge);
        assert.equal(timers.size, 1, 'late expiry must not lose the newer timer owner');
        const activeTimer = timers.keys().next().value;
        timers.delete(activeTimer);
        callbacks.get(activeTimer)();
        assert.equal(card(), null);
        assert.equal(projection.renderResidentEphemeralPresentation('request', presentation, context), true);
        const disposalTimer = timers.keys().next().value;
        await projection.dispose();
        assert.equal(card(), null);
        assert.equal(timers.size, 0);
        callbacks.get(disposalTimer)();
        assert.equal(card(), null);
        assert.equal(projection.renderResidentEphemeralPresentation('request', third, context), false);
    });
});
