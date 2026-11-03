import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createChatRepository } from '../modules/chat/chatRepository.js';
import { createChatHistoryMutationAuthority } from '../modules/chat/chatHistoryMutationAuthority.js';

const source = fs.readFileSync(new URL('../modules/chatManager.js', import.meta.url), 'utf8');
const start = source.indexOf('        // Save history with the user message before adding the thinking message or making API calls');
const end = source.indexOf('        // Consume only the exact draft transaction', start);
assert.ok(start > 0 && end > start);
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
const run = new AsyncFunction('persistOutgoingUserMessage', 'onAccepted', 'deadline', 'now', `
    const Date = { now: () => now ?? 0 };
    const sendContext = { agentId: 'synthetic-agent', itemType: 'agent', topicId: 'synthetic-topic' };
    const userMessage = { id: 'synthetic-user', role: 'user' }, existingCheckpoint = null;
    const sendHistoryRef = { get: () => [], set() {} }, userMessageItem = null;
    const request = { propagateError: true, onAccepted, deadline };
    const isSendContextCurrent = () => false, notifySendState = () => {};
    const uiHelper = { showToastNotification() {} }, console = { error() {}, warn() {} };
    ${source.slice(start, end)}
    return sendHistory;
`);

test('main send acknowledges only after the outgoing message save completes', async () => {
    let finish, accepted = [];
    const saved = new Promise(resolve => { finish = resolve; });
    const pending = run(() => saved, value => accepted.push(value));
    await Promise.resolve();
    assert.deepEqual(accepted, []);
    finish([{ id: 'synthetic-user' }]);
    await pending;
    assert.equal(accepted.length, 1);
    assert.equal(accepted[0].messageId, 'synthetic-user');
    assert.equal(accepted[0].context.topicId, 'synthetic-topic');
});

test('a failed outgoing message save never acknowledges acceptance', async () => {
    let accepted = 0;
    await assert.rejects(run(async () => { throw new Error('synthetic save failure'); }, () => accepted++), /synthetic save failure/);
    assert.equal(accepted, 0);
});

test('an acceptance observer failure cannot turn a saved message into a retryable send', async () => {
    let accepted = 0;
    const history = [{ id: 'synthetic-user' }];
    assert.equal(await run(async () => history, () => { accepted++; throw new Error('observer failed'); }), history);
    assert.equal(accepted, 1);
});

test('a deadline expiring while rendering never begins the outgoing write', async () => {
    let writes = 0, accepted = 0;
    await assert.rejects(run(async () => { writes++; return []; }, () => accepted++, 10, 11), /未发送/);
    assert.equal(writes, 0);
    assert.equal(accepted, 0);
});

function outgoingPersistence(repository, authority) {
    const helpersStart = source.indexOf('    function requireHistoryRepository()');
    const helpersEnd = source.indexOf('    // DOM Elements', helpersStart);
    const outgoingStart = source.indexOf('    function persistOutgoingUserMessage(');
    const outgoingEnd = source.indexOf('    function setCurrentItemActionButtonText(', outgoingStart);
    assert.ok(helpersEnd > helpersStart && outgoingEnd > outgoingStart);
    return new Function('chatRepository', 'historyMutationAuthority', `
        const outgoingPersistenceQueues = new Map();
        ${source.slice(helpersStart, helpersEnd)}
        ${source.slice(outgoingStart, outgoingEnd)}
        return persistOutgoingUserMessage;
    `)(repository, authority);
}
const sendContext = { agentId: 'a', itemType: 'agent', topicId: 't' };

test('outgoing messages use the existing mutation owner and preserve its canonical concurrent history', async () => {
    const calls = [];
    const peer = { id: 'peer', role: 'user', content: 'concurrent' };
    let history = [peer];
    const persist = outgoingPersistence({}, {
        async mutate(descriptor, transform) {
            calls.push(descriptor);
            history = await transform(structuredClone(history));
            return { history, result: { success: true } };
        },
        replace() { assert.fail('outgoing messages must not replace a copied history array'); },
    });
    const message = { id: 'outgoing', role: 'user', content: 'question' };
    await persist(sendContext, message);
    const saved = await persist(sendContext, message);
    assert.deepEqual(saved, [peer, message]);
    assert.equal(calls.length, 2);
    assert.ok(calls.every(d => d.itemId === 'a' && d.topicId === 't' && d.category === 'outgoing-message'));
});

test('legacy repository and mutation authority still serialize outgoing messages', async () => {
    let history = [];
    const repository = createChatRepository({
        async getChatHistory() { return structuredClone(history); },
        async saveChatHistory(_item, _topic, next) { history = structuredClone(next); return { success: true }; },
    });
    const authority = createChatHistoryMutationAuthority({ repository });
    const persist = outgoingPersistence(repository, authority);
    try {
        await Promise.all(['one', 'two'].map(id => persist(sendContext, { id, role: 'user', content: id })));
        assert.deepEqual(history.map(m => m.id), ['one', 'two']);
    } finally { await authority.dispose(); }
});

test('repository-only fallback passes the original revision and never substitutes a newer cached revision', async () => {
    const original = [{ id: 'peer' }];
    const persist = outgoingPersistence({
        async getHistory() { return original; },
        revisionOf(value) { assert.equal(value, original); return 'original-r1'; },
        revisionFor() { assert.fail('a current cached revision cannot authorize a copied snapshot'); },
        async saveHistory(_item, _type, _topic, _history, revision) {
            assert.equal(revision, 'original-r1');
            return { success: false, error: 'HISTORY_REVISION_CONFLICT' };
        },
    }, null);
    await assert.rejects(persist(sendContext, { id: 'outgoing' }), /HISTORY_REVISION_CONFLICT/);
});

test('a mutation rejection never acknowledges an outgoing message', async () => {
    let accepted = 0;
    const persist = outgoingPersistence({}, { async mutate() { throw Error('HISTORY_MESSAGE_CONFLICT'); } });
    await assert.rejects(run(() => persist(sendContext, { id: 'outgoing' }), () => accepted++), /HISTORY_MESSAGE_CONFLICT/);
    assert.equal(accepted, 0);
});
