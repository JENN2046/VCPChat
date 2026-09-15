import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createMainChatSurfaceAdapter } from '../modules/renderer/mainChatSurfaceAdapter.js';

test('MainChatSurfaceAdapter owns renderer, stream routes and quiescent teardown', async () => {
    const dom = new JSDOM('<main><div id="root"></div><textarea></textarea></main>');
    const root = dom.window.document.getElementById('root');
    let initialized = null;
    let rendererDisposed = false;
    const renderer = {
        initializeMessageRenderer(value) { initialized = value; },
        renderHistory() {}, renderMessage() {},
    };
    const adapter = createMainChatSurfaceAdapter({
        root,
        renderer,
        repository: { getHistory: async () => [], saveHistory() {} },
        focusTarget: dom.window.document.querySelector('textarea'),
        operations: { dispose: async () => {} },
        renderDependencies: {},
        streamServices: {
            streamProjection: {
                startStreamingMessage() {}, appendStreamChunk() {}, projectStreamTerminal() {},
            },
            historyPersistence: { commit() {} },
            messageRenderer: renderer,
            getSelection: () => null,
            getTopicId: () => null,
        },
        disposeRenderer: async () => { rendererDisposed = true; },
    });
    assert.equal(initialized.chatDomRenderer, adapter.domRenderer);
    const release = adapter.streamRoutes.register('m1', { kind: 'main-chat' });
    assert.equal(typeof release.retract, 'function');
    assert.equal(typeof release.cancel, 'function');
    release();
    await adapter.dispose();
    assert.equal(rendererDisposed, true);
    assert.equal(root.hasAttribute('data-chat-surface'), false);
    assert.throws(() => adapter.streamRoutes.register('late', {}), /disposed/);
});

test('MainChatSurfaceAdapter owns the window unload receipt and releases it on dispose', async () => {
    const dom = new JSDOM('<main><div id="root"></div><textarea></textarea>');
    const root = dom.window.document.getElementById('root');
    let disposed = 0;
    const renderer = { initializeMessageRenderer() {}, renderHistory() {}, renderMessage() {} };
    const adapter = createMainChatSurfaceAdapter({
        root,
        renderer,
        repository: { getHistory: async () => [], saveHistory() {} },
        focusTarget: dom.window.document.querySelector('textarea'),
        operations: { dispose: async () => {} },
        renderDependencies: {},
        streamServices: {
            streamProjection: { startStreamingMessage() {}, appendStreamChunk() {}, projectStreamTerminal() {} },
            historyPersistence: { commit() {} },
            messageRenderer: renderer,
            getSelection: () => null,
            getTopicId: () => null,
        },
        disposeRenderer: async () => { disposed += 1; },
        ownerWindow: dom.window,
    });
    dom.window.dispatchEvent(new dom.window.Event('beforeunload'));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(disposed, 1);
    await adapter.dispose();
    dom.window.close();
});

test('main Surface releases send state at terminal projection before durable persistence settles', async () => {
    const dom = new JSDOM('<main><div id="root"></div><textarea></textarea>');
    const root = dom.window.document.getElementById('root');
    const renderer = { initializeMessageRenderer() {}, renderHistory() {}, renderMessage() {} };
    const notifications = [];
    let resolveEarly;
    let resolveFinal;
    let markPersistenceStarted;
    let releasePersistence;
    const earlyNotification = new Promise(resolve => { resolveEarly = resolve; });
    const finalNotification = new Promise(resolve => { resolveFinal = resolve; });
    const persistenceStarted = new Promise(resolve => { markPersistenceStarted = resolve; });
    const persistenceGate = new Promise(resolve => { releasePersistence = resolve; });
    const adapter = createMainChatSurfaceAdapter({
        root,
        renderer,
        repository: { getHistory: async () => [], saveHistory() {} },
        focusTarget: dom.window.document.querySelector('textarea'),
        operations: { dispose: async () => {} },
        renderDependencies: {},
        streamServices: {
            streamProjection: {
                startStreamingMessage() {},
                appendStreamChunk() {},
                projectStreamTerminal: async (messageId, finishReason, context, payload) => ({
                    messageId, finishReason, context, content: payload.fullResponse, history: [],
                }),
            },
            historyPersistence: {
                async commit(projected) {
                    markPersistenceStarted();
                    await persistenceGate;
                    return projected;
                },
            },
            messageRenderer: renderer,
            getSelection: () => ({ id: 'agent-a' }),
            getTopicId: () => 'topic-a',
            notifySendStateChanged(value) {
                notifications.push(value);
                if (notifications.length === 1) resolveEarly(value);
                if (notifications.length === 2) resolveFinal(value);
            },
        },
        disposeRenderer: async () => {},
    });
    const context = { agentId: 'agent-a', topicId: 'topic-a' };
    assert.equal(adapter.acceptStreamEvent({ type: 'start', messageId: 'm1', streamOperationId: 'op1', context }), true);
    assert.equal(adapter.acceptStreamEvent({ type: 'end', messageId: 'm1', streamOperationId: 'op1', context, fullResponse: 'done', finish_reason: 'completed' }), true);

    const early = await earlyNotification;
    await persistenceStarted;
    assert.equal(notifications.length, 1);
    assert.equal(early.event.type, 'completed');
    assert.equal(early.terminal.kind, 'completed');
    assert.equal(early.projected.messageId, 'm1');

    releasePersistence();
    const final = await finalNotification;
    assert.equal(notifications.length, 2);
    assert.notEqual(early, final);
    assert.equal(final.event.type, 'completed');
    assert.equal(final.finalized.messageId, 'm1');

    await adapter.dispose();
    dom.window.close();
});

test('main Surface renders terminal stream errors with the initial messageId', async () => {
    const dom = new JSDOM('<main><div id="root"></div><textarea></textarea></main>');
    const root = dom.window.document.getElementById('root');
    const rendered = [];
    let projectedFullResponse = null;
    const renderer = {
        initializeMessageRenderer() {},
        renderHistory() {},
        renderMessage(message) { rendered.push(message); },
    };
    const adapter = createMainChatSurfaceAdapter({
        root,
        renderer,
        repository: { getHistory: async () => [], saveHistory() {} },
        focusTarget: dom.window.document.querySelector('textarea'),
        operations: { dispose: async () => {} },
        renderDependencies: {},
        streamServices: {
            streamProjection: {
                startStreamingMessage() {},
                appendStreamChunk() {},
                projectStreamTerminal: async (messageId, finishReason, context, payload) => {
                    projectedFullResponse = payload.fullResponse;
                    return { messageId, content: payload.fullResponse, history: [] };
                },
            },
            historyPersistence: { commit: async projected => projected },
            messageRenderer: renderer,
            getSelection: () => ({ id: 'agent-a' }),
            getTopicId: () => 'topic-a',
        },
        disposeRenderer: async () => {},
    });

    const context = { agentId: 'agent-a', topicId: 'topic-a' };
    assert.equal(adapter.acceptStreamEvent({ type: 'start', messageId: 'message-42', context }), true);
    assert.equal(adapter.acceptStreamEvent({
        type: 'data',
        messageId: 'message-42',
        context,
        chunk: 'partial',
    }), true);
    assert.equal(adapter.acceptStreamEvent({
        type: 'error',
        messageId: 'message-42',
        context,
        error: 'VCP流读取错误: terminated',
        accumulatedResponse: 'partial',
    }), true);

    await new Promise(resolve => setImmediate(resolve));
    assert.equal(rendered.length, 1);
    assert.match(rendered[0].content, /流处理错误 \(ID: message-42\)/);
    assert.doesNotMatch(rendered[0].content, /ID: undefined/);
    assert.equal(rendered[0].id, 'err_message-42');
    assert.match(projectedFullResponse, /^partial/);
    assert.match(projectedFullResponse, /已保存已接收的部分内容/);

    await adapter.dispose();
    dom.window.close();
});
