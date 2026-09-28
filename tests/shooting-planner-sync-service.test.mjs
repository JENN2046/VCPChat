import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const {
  ShootingPlannerSyncError,
  ShootingPlannerSyncService,
} = require('../modules/services/shootingPlannerSyncService.js');

const schedulerToken = 'scheduler-token-test-0001';

async function withServer(handler, action) {
  const server = createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const address = server.address();
    return await action(`http://127.0.0.1:${address.port}`);
  } finally {
    server.close();
    await once(server, 'close');
  }
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

test('pull -> guarded push -> verification pull uses the JSO V1 contract', async () => {
  let snapshot = {
    schemaVersion: 1,
    revision: 0,
    updatedAt: '2026-09-28T00:00:00.000Z',
    products: [],
    tasks: [],
    sessions: [],
  };
  let getCount = 0;
  let putCount = 0;

  await withServer(async (request, response) => {
    if (request.method === 'GET' && request.url === '/api/v1/snapshot') {
      getCount += 1;
      assert.equal(request.headers.authorization, undefined);
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ ok: true, snapshot }));
      return;
    }

    if (request.method === 'PUT' && request.url === '/api/v1/snapshot') {
      putCount += 1;
      assert.equal(request.headers.authorization, `Bearer ${schedulerToken}`);
      assert.equal(request.headers['if-match'], '0');
      assert.equal(request.headers['idempotency-key'], 'integration-push-0001');
      assert.match(request.headers['content-type'], /^application\/json\b/u);

      const incoming = await readJson(request);
      snapshot = {
        schemaVersion: 1,
        revision: 1,
        updatedAt: '2026-09-28T00:01:00.000Z',
        products: incoming.products,
        tasks: incoming.tasks,
        sessions: incoming.sessions,
      };
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({
        ok: true,
        status: 200,
        revision: 1,
        updatedAt: snapshot.updatedAt,
      }));
      return;
    }

    response.writeHead(404, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ ok: false, code: 'NOT_FOUND' }));
  }, async baseUrl => {
    const client = new ShootingPlannerSyncService({ baseUrl, schedulerToken });

    const initial = await client.pull();
    assert.equal(initial.revision, 0);

    const next = {
      ...initial,
      products: [['SKU-INTEGRATION', '联调产品']],
      tasks: [{
        id: 'TASK-INTEGRATION',
        sku: 'SKU-INTEGRATION',
        name: '联调产品',
        client: '待确认',
        deliver: '主图模特',
        kind: '模特',
      }],
    };

    const pushed = await client.push(next, {
      expectedRevision: initial.revision,
      operationId: 'integration-push-0001',
    });
    assert.equal(pushed.revision, 1);

    const verified = await client.pull();
    assert.equal(verified.revision, 1);
    assert.equal(verified.tasks[0].id, 'TASK-INTEGRATION');
  });

  assert.equal(getCount, 2);
  assert.equal(putCount, 1);
});

test('revision conflict is fail-closed and exposes only bounded public facts', async () => {
  await withServer((request, response) => {
    response.writeHead(409, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({
      ok: false,
      status: 409,
      code: 'REVISION_CONFLICT',
      revision: 7,
      privateDetail: schedulerToken,
    }));
  }, async baseUrl => {
    const client = new ShootingPlannerSyncService({ baseUrl, schedulerToken });

    await assert.rejects(
      () => client.push({
        schemaVersion: 1,
        revision: 0,
        updatedAt: '2026-09-28T00:00:00.000Z',
        products: [],
        tasks: [],
        sessions: [],
      }, {
        expectedRevision: 0,
        operationId: 'conflict-operation-0001',
      }),
      error => {
        assert.ok(error instanceof ShootingPlannerSyncError);
        assert.equal(error.code, 'REVISION_CONFLICT');
        assert.equal(error.status, 409);
        assert.equal(error.revision, 7);
        assert.equal(error.message.includes(schedulerToken), false);
        assert.equal(JSON.stringify(error).includes(schedulerToken), false);
        return true;
      },
    );
  });
});

test('invalid idempotency key is rejected before any network call', async () => {
  let calls = 0;
  const client = new ShootingPlannerSyncService({
    baseUrl: 'https://example.invalid',
    schedulerToken,
    fetchImpl: async () => {
      calls += 1;
      throw new Error('should not be reached');
    },
  });

  await assert.rejects(
    () => client.push({}, { expectedRevision: 0, operationId: 'short' }),
    /idempotency-key contract/u,
  );
  assert.equal(calls, 0);
});

test('adapter does not automatically retry a failed request', async () => {
  let calls = 0;
  const client = new ShootingPlannerSyncService({
    baseUrl: 'https://example.invalid',
    schedulerToken,
    fetchImpl: async () => {
      calls += 1;
      throw new Error('network down');
    },
  });

  await assert.rejects(
    () => client.pull(),
    error => error instanceof ShootingPlannerSyncError
      && error.code === 'VCP_SYNC_NETWORK_ERROR',
  );
  assert.equal(calls, 1);
});
