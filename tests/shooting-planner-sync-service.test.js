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

    console.log('shooting-planner-sync-service.test.js: all assertions passed');
}

run().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
