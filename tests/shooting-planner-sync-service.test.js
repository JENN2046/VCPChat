'use strict';

const assert = require('assert');
const test = require('node:test');
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

test('snapshot and acknowledgement validation contracts remain intact', async () => {
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

});

test('pull and push retain root, proxy, nested and encoded base paths', async () => {
    const valid = () => ({ schemaVersion: 1, revision: 0, updatedAt: '2026-10-29T00:00:00.000Z', products: [], tasks: [], sessions: [] });
    const validAck = () => ({ ok: true, revision: 4, updatedAt: '2026-10-29T00:00:00.000Z' });
    for (const [baseUrl, expectedUrl] of [
        ['https://synthetic.example.test', 'https://synthetic.example.test/api/v1/snapshot'],
        ['https://synthetic.example.test/', 'https://synthetic.example.test/api/v1/snapshot'],
        ['https://synthetic.example.test/jso', 'https://synthetic.example.test/jso/api/v1/snapshot'],
        ['https://synthetic.example.test/jso/', 'https://synthetic.example.test/jso/api/v1/snapshot'],
        ['https://synthetic.example.test/proxy/jso/', 'https://synthetic.example.test/proxy/jso/api/v1/snapshot'],
        ['https://synthetic.example.test/team%20one/jso', 'https://synthetic.example.test/team%20one/jso/api/v1/snapshot'],
    ]) {
        const requested = [];
        const client = new ShootingPlannerSyncService({ baseUrl, schedulerToken: 'synthetic-only-token-1234',
            fetchImpl: async (url, options) => { requested.push({ url: url.toString(), options });
                return jsonResponse(200, options.method === 'GET' ? { ok: true, snapshot: valid() } : validAck()); } });
        const binding = client.baseUrl.toString();
        await client.pull(); await client.push({}, { expectedRevision: 3, operationId: 'synthetic-original-operation' });
        assert.deepStrictEqual(requested.map(r => r.url), [expectedUrl, expectedUrl]);
        assert.strictEqual(client.baseUrl.toString(), binding, 'requests must not mutate the configured binding');
        for (const request of requested) {
            assert.strictEqual(request.options.headers.Authorization, 'Bearer synthetic-only-token-1234');
            assert.strictEqual(request.options.redirect, 'error');
        }
    }
});

test('public failures never expose arbitrary response or transport error data', async () => {
    const marker = 'FAKE_ONLY_NOT_A_REAL_CREDENTIAL';
    const failure = async (status, body) => {
        const client = new ShootingPlannerSyncService({ baseUrl: 'https://synthetic.example.test/jso', schedulerToken: marker,
            fetchImpl: async () => ({ ...jsonResponse(500, body), status, ok: false }) });
        try { await client.pull(); assert.fail('expected a public failure'); } catch (error) { return error; }
    };
    for (const [status, body, expectedCode] of [
        [409, { code: marker, revision: { raw: marker } }, 'HTTP_409'], [500, { code: 'X'.repeat(20000), raw: marker }, 'HTTP_500'],
        [500, { code: 'REVISION_CONFLICT', revision: 9 }, 'HTTP_500'], [500, null, 'HTTP_500'], [403, [], 'HTTP_403'], [502, marker, 'HTTP_502'],
        [{ raw: marker }, { code: marker, revision: marker }, 'HTTP_502'],
    ]) {
        const error = await failure(status, body);
        assert.strictEqual(error.code, expectedCode);
        assert.strictEqual(error.status, Number(expectedCode.slice(5)));
        assert.strictEqual(error.revision, undefined);
        assert.ok(!JSON.stringify(error).includes(marker)); assert.ok(!error.message.includes(marker));
        assert.ok(!error.stack.includes(marker)); assert.strictEqual(error.cause, undefined);
    }
    for (const revision of [-1, Number.MAX_SAFE_INTEGER + 1, '9', { raw: marker }]) {
        const error = await failure(409, { code: 'REVISION_CONFLICT', revision });
        assert.strictEqual(error.code, 'REVISION_CONFLICT'); assert.strictEqual(error.revision, undefined);
    }
    for (const [status, code] of [[401, 'UNAUTHORIZED'], [403, 'FORBIDDEN'], [503, 'WRITE_ADMISSION_DISABLED']]) {
        assert.strictEqual((await failure(status, { code })).code, code);
    }
    const safeConflict = await failure(409, { code: 'REVISION_CONFLICT', revision: 9 });
    assert.strictEqual(safeConflict.code, 'REVISION_CONFLICT'); assert.strictEqual(safeConflict.revision, 9);
    for (const aborted of [false, true]) {
        const client = new ShootingPlannerSyncService({ baseUrl: 'https://synthetic.example.test', schedulerToken: marker,
            fetchImpl: async () => { throw Object.assign(new Error(marker), { name: aborted ? 'AbortError' : 'Error', code: marker, cause: { raw: marker } }); } });
        await assert.rejects(client.pull(), error => {
            assert.strictEqual(error.code, aborted ? 'SHOOTING_SYNC_TIMEOUT' : 'SHOOTING_SYNC_NETWORK_ERROR');
            assert.ok(!error.message.includes(marker)); assert.ok(!JSON.stringify(error).includes(marker));
            assert.strictEqual(error.cause, undefined); return true;
        });
    }
    const oversized = new ShootingPlannerSyncService({ baseUrl: 'https://synthetic.example.test', schedulerToken: marker, maxBytes: 1024,
        fetchImpl: async () => jsonResponse(200, { padding: 'X'.repeat(2048) }) });
    await assert.rejects(oversized.pull(), { code: 'SHOOTING_SYNC_RESPONSE_TOO_LARGE' });
    const invalidJson = new ShootingPlannerSyncService({ baseUrl: 'https://synthetic.example.test', schedulerToken: marker,
        fetchImpl: async () => ({ ok: true, status: 200, headers: { get: () => null }, arrayBuffer: async () => Buffer.from('invalid-' + marker) }) });
    await assert.rejects(invalidJson.pull(), { code: 'SHOOTING_SYNC_INVALID_RESPONSE' });

});
