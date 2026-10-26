import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../modules/chatManager.js', import.meta.url), 'utf8');
const start = source.indexOf('        // Save history with the user message before adding the thinking message or making API calls');
const end = source.indexOf('        // Consume only the exact draft transaction', start);
assert.ok(start > 0 && end > start);
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
const run = new AsyncFunction('persistOutgoingUserMessage', 'onAccepted', `
    const sendContext = { agentId: 'synthetic-agent', itemType: 'agent', topicId: 'synthetic-topic' };
    const userMessage = { id: 'synthetic-user', role: 'user' }, existingCheckpoint = null;
    const sendHistoryRef = { get: () => [], set() {} }, userMessageItem = null;
    const request = { propagateError: true, onAccepted };
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
