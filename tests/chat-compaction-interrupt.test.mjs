import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { parse } from '@babel/parser';

const source = fs.readFileSync(new URL('../modules/chatManager.js', import.meta.url), 'utf8');
const wanted = new Map();
function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'FunctionDeclaration' && ['checkStreamContextBudget', 'finishStreamContextCompaction', 'abandonStreamContextCompaction'].includes(node.id.name)) wanted.set(node.id.name, source.slice(node.start, node.end));
    for (const value of Object.values(node)) {
        if (Array.isArray(value)) value.forEach(visit);
        else if (value && typeof value === 'object') visit(value);
    }
}
visit(parse(source, { sourceType: 'module' }));
const timerCode = source.slice(source.indexOf('const INTERRUPT_SETTLE_MS'), source.indexOf('// 有差分立绘'));
function fixture(success = true) {
    const events = [], timers = new Map(), requests = new Map(), signals = new Map();
    let nextTimer = 0;
    const scope = { agentId: 'A', topicId: 'T' };
    const selected = { id: 'A', type: 'agent', config: { contextTokenLimit: 1 } };
    const context = { disposed: false, streamCompactionRequests: requests, streamCompactionTerminalSignals: signals,
        globalSettingsRef: { get: () => ({ enableContextCompaction: true }) },
        currentSelectedItemRef: { get: () => selected }, currentTopicIdRef: { get: () => 'T' },
        currentChatHistoryRef: { get: () => [] }, effectiveContextHistory: value => value, estimateContextTokens: () => 2,
        getHistory: async () => [], notifySendStateChanged() {},
        compactionFlowlock: { suspendForContextCompaction: () => events.push('suspend') },
        interruptCapability: { interrupt: async () => { events.push('interrupt'); return { success }; } },
        contextCompactionService: { compact: async () => { events.push('compact'); return null; } },
        uiHelper: { showToastNotification() {} }, console,
        setTimeout: (callback, ms) => { const id = ++nextTimer; timers.set(id, { callback, ms }); return id; },
        clearTimeout: id => timers.delete(id),
    };
    vm.createContext(context);
    vm.runInContext(timerCode + '\n' + [...wanted.values()].join('\n'), context);
    const start = () => context.checkStreamContextBudget({ messageId: 'M', context: scope, text: 'synthetic text',
        cancelStream: async () => { events.push('cancel'); await context.finishStreamContextCompaction({ messageId: 'M' }); } });
    return { context, events, timers, requests, signals, start };
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test('an interrupt acknowledgement without a terminal event falls back after a bounded wait', async () => {
    const f = fixture();
    const checking = f.start();
    await flush();
    assert.equal(f.timers.size, 1, 'successful acknowledgement must not end the terminal wait');
    const timer = [...f.timers.values()][0];
    assert.equal(timer.ms, 3000);
    timer.callback();
    await checking;
    assert.deepEqual(f.events, ['suspend', 'interrupt', 'cancel', 'compact']);
    assert.equal(f.requests.size, 0);
    assert.equal(f.signals.size, 0);
});
test('a durably finalized stream completes the wait without local cancellation', async () => {
    const f = fixture();
    let settled = false;
    const checking = f.start().then(() => { settled = true; });
    await flush();
    assert.equal(settled, false);
    await f.context.finishStreamContextCompaction({ messageId: 'M' });
    await checking;
    assert.deepEqual(f.events, ['suspend', 'interrupt', 'compact']);
    assert.equal(f.timers.size, 0);
    assert.equal(f.signals.size, 0);
});
test('a refused upstream interrupt uses local cancellation immediately', async () => {
    const f = fixture(false);
    await f.start();
    assert.deepEqual(f.events, ['suspend', 'interrupt', 'cancel', 'compact']);
    assert.equal(f.timers.size, 0);
});

test('failed terminal persistence releases the waiter without resuming compaction', async () => {
    const f = fixture();
    const checking = f.start();
    await flush();
    f.context.abandonStreamContextCompaction({ messageId: 'M', event: { outcome: { persistence: { error: 'synthetic write failure' } } } });
    await checking;
    assert.deepEqual(f.events, ['suspend', 'interrupt']);
    assert.equal(f.requests.size, 0);
    assert.equal(f.signals.size, 0);
});
