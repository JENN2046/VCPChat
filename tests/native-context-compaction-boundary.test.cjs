'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../modules/chatManager.js'), 'utf8');
const start = source.indexOf('        if (!content && attachedFiles.length === 0) return;');
const end = source.indexOf('        const uiAttachments = [];', start);
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
const run = new AsyncFunction('handled', 'rejectNative', `
    const calls = [], content = 'synthetic draft', attachedFiles = [], input = {};
    const currentSelectedItem = { id: 'synthetic-agent', type: 'agent', config: {} };
    const currentTopicId = 'synthetic-topic', request = null;
    const globalSettings = { vcpServerUrl: 'http://127.0.0.1:1', enableContextCompaction: true };
    const sendContext = { agentId: currentSelectedItem.id, topicId: currentTopicId };
    const pendingSendContexts = new Set(), isContextCompacting = () => false;
    const itemSelectionGeneration = 0, topicSelectionGeneration = 0;
    const sendHistoryRef = { get: () => [] }, sendSelectedItemRef = {}, sendTopicIdRef = {}, renderTarget = {};
    const isSendContextCurrent = () => true;
    const shouldCompactContext = () => { calls.push('capacity'); return true; };
    const summarizeCompactionInput = () => ({ sourceCount: 2, anchors: 0, openWindows: 0 });
    const compactContext = async () => calls.push('compact');
    const uiHelper = { showToastNotification() {}, openModal() {} };
    const setNextUiEmptyStateActive = () => {};
    const electronAPI = { prepareNativeConversation: async () => ({ handled, ok: !rejectNative, code: 'SYNTHETIC_REFUSAL' }) };
    async function preflight() {
        ${source.slice(start, end)}
        return 'continue';
        } finally { pendingSendContexts.delete(sendSignature); }
    }
    return { result: await preflight(), calls };
`);

test('native-owned send never compacts legacy history even when automatic compaction is enabled', async () => {
    assert.deepEqual(await run(true, false), { result: 'continue', calls: [] });
});

test('ordinary legacy send retains the author automatic compaction path', async () => {
    assert.deepEqual(await run(false, false), { result: 'continue', calls: ['capacity', 'compact'] });
});

test('native preflight rejection returns before any history compaction', async () => {
    assert.deepEqual(await run(true, true), {
        result: { handled: true, ok: false, code: 'SYNTHETIC_REFUSAL' }, calls: [],
    });
});
