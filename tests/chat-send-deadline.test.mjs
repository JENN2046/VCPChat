import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../modules/chatManager.js', import.meta.url), 'utf8');
const start = source.indexOf('        if (!content && attachedFiles.length === 0) return;');
const end = source.indexOf('        const uiAttachments = [];', start);
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
const run = new AsyncFunction('deadline', `
    let clock = 0;
    const Date = { now: () => clock }, calls = [], input = {};
    const request = { deadline, propagateError: true };
    const content = 'synthetic pet draft', attachedFiles = [];
    const currentSelectedItem = { id: 'A', type: 'agent', config: {} }, currentTopicId = 'T';
    const globalSettings = { vcpServerUrl: 'http://127.0.0.1:1', enableContextCompaction: true };
    const sendContext = { agentId: 'A', topicId: 'T' }, pendingSendContexts = new Set();
    const itemSelectionGeneration = 0, topicSelectionGeneration = 0;
    const isContextCompacting = () => false, shouldCompactContext = () => true;
    const summarizeCompactionInput = () => ({ sourceCount: 1, anchors: 0 });
    const compactContext = async () => { calls.push('compact'); clock = 11; };
    const sendHistoryRef = { get: () => [] }, sendSelectedItemRef = {}, sendTopicIdRef = {}, renderTarget = {};
    const isSendContextCurrent = () => true, setNextUiEmptyStateActive = () => {};
    const uiHelper = { showToastNotification() {}, openModal() {} }, electronAPI = {};
    async function preflight() {
        ${source.slice(start, end)}
        calls.push('would-persist'); return calls;
        } finally { pendingSendContexts.delete(sendSignature); }
    }
    return preflight();
`);

test('a pet deadline expiring during automatic compaction prevents outgoing persistence', async () => {
    await assert.rejects(run(10), /未发送|expired|没有响应/);
});
test('an unexpired pet deadline retains ordinary context compaction and sending', async () => {
    assert.deepEqual(await run(20), ['compact', 'would-persist']);
});
