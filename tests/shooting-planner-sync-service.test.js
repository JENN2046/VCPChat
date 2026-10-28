'use strict';

const assert = require('assert');
const { ShootingPlannerSyncService } = require('../modules/services/shootingPlannerSyncService');

function jsonResponse(status, body) {
    const buffer = Buffer.from(JSON.stringify(body));
    return {
        ok: status >= 200 && status < 300,
        status,
        headers: { get: name => name.toLowerCase() === 'content-length' ? String(buffer.length) : null },
        arrayBuffer: async () => buffer,
    };
}

async function run() {
    const calls = [];
    const service = new ShootingPlannerSyncService({
        baseUrl: 'https://schedule.example.test',
        schedulerToken: 'scheduler-token-00000001',
        fetchImpl: async (url, options) => {
            calls.push({ url: url.toString(), options });
            if (options.method === 'GET') {
                return jsonResponse(200, {
                    ok: true,
                    snapshot: { schemaVersion: 1, revision: 3, updatedAt: '2026-09-22T00:00:00.000Z', products: [], tasks: [], sessions: [] },
                });
            }
            return jsonResponse(200, { ok: true, revision: 4, updatedAt: '2026-09-22T00:01:00.000Z' });
        },
    });

    assert.deepStrictEqual(service.status(), { enabled: true, reason: null });
    assert.strictEqual((await service.pull()).revision, 3);
    const pushed = await service.push({ schemaVersion: 1 }, { expectedRevision: 3, operationId: 'operation-0001' });
    assert.strictEqual(pushed.revision, 4);
    assert.strictEqual(calls[1].options.headers.Authorization, 'Bearer scheduler-token-00000001');
    assert.strictEqual(calls[1].options.headers['If-Match'], '3');
    assert.strictEqual(calls[1].options.redirect, 'error');

    assert.throws(
        () => new ShootingPlannerSyncService({ baseUrl: 'http://example.com', schedulerToken: 'scheduler-token-00000001' }),
        error => error.code === 'SHOOTING_SYNC_HTTPS_REQUIRED'
    );
    assert.strictEqual(new ShootingPlannerSyncService({}).status().enabled, false);

    const conflict = new ShootingPlannerSyncService({
        baseUrl: 'http://127.0.0.1:3800',
        schedulerToken: 'scheduler-token-00000001',
        fetchImpl: async () => jsonResponse(409, { ok: false, code: 'REVISION_CONFLICT', revision: 9 }),
    });
    await assert.rejects(
        conflict.push({}, { expectedRevision: 3, operationId: 'operation-0002' }),
        error => error.code === 'REVISION_CONFLICT' && error.revision === 9 && !error.message.includes('scheduler-token')
    );

    const valid = () => ({ schemaVersion: 1, revision: 0, updatedAt: '2026-10-28T00:00:00.000Z', products: [], tasks: [], sessions: [] });
    const pullBody = body => new ShootingPlannerSyncService({
        baseUrl: 'https://synthetic.example.test', schedulerToken: 'synthetic-only-token-1234',
        fetchImpl: async () => jsonResponse(200, body),
    }).pull();
    for (const snapshot of [null, [], {}, { ...valid(), schemaVersion: 2 }, { ...valid(), schemaVersion: '1' },
        ...[-1, 0.5, Number.MAX_SAFE_INTEGER + 1, '0', null].map(revision => ({ ...valid(), revision })),
        ...[undefined, null, '', 'not-a-date'].map(updatedAt => ({ ...valid(), updatedAt })),
        ...['products', 'tasks', 'sessions'].flatMap(key => [undefined, null, {}, 'invalid'].map(value => ({ ...valid(), [key]: value })))]) {
        await assert.rejects(pullBody({ ok: true, snapshot }), { code: 'SHOOTING_SYNC_INVALID_RESPONSE' });
    }
    for (const body of [null, [], {}, { ok: false, snapshot: valid() }, { snapshot: valid() }]) {
        await assert.rejects(pullBody(body), { code: 'SHOOTING_SYNC_INVALID_RESPONSE' });
    }
    assert.deepStrictEqual(await pullBody({ ok: true, snapshot: valid() }), valid(), 'revision zero and intentionally empty collections remain valid');
    const populated = { ...valid(), revision: Number.MAX_SAFE_INTEGER, products: [['SKU', 'Synthetic product']], tasks: [{ id: 'task' }], sessions: [{ id: 'session' }] };
    assert.deepStrictEqual(await pullBody({ ok: true, snapshot: populated }), populated);

    const validAck = () => ({ ok: true, revision: 4, updatedAt: '2026-10-28T00:00:00.000Z' });
    const pushBody = body => new ShootingPlannerSyncService({
        baseUrl: 'https://synthetic.example.test', schedulerToken: 'synthetic-only-token-1234',
        fetchImpl: async () => jsonResponse(200, body),
    }).push({}, { expectedRevision: 3, operationId: 'synthetic-original-operation' });
    for (const body of [null, [], {}, { ...validAck(), ok: false }, { ...validAck(), ok: undefined },
        ...[undefined, null, '4', -1, 0, 3, 4.5, Number.MAX_SAFE_INTEGER + 1].map(revision => ({ ...validAck(), revision })),
        ...[undefined, null, '', 'invalid'].map(updatedAt => ({ ...validAck(), updatedAt }))]) {
        await assert.rejects(pushBody(body), { code: 'SHOOTING_SYNC_INVALID_RESPONSE' });
    }
    const replayed = { ...validAck(), replayed: true };
    assert.deepStrictEqual(await pushBody(replayed), replayed);

    console.log('shooting-planner-sync-service.test.js: all assertions passed');
}

run().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
