'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { RealHostTransport } = require('../scripts/native-sync-r4-transport.cjs');

test('an intentionally signaled SSH tunnel is already stopped even with a null exitCode', async () => {
    const transport = new RealHostTransport('P:/VCPKF/vcp/artifacts/native-sync-r4/run-1');
    transport.tunnel = { child: { exitCode: null, signalCode: 'SIGTERM', kill() { assert.fail('must not kill an exited process'); } }, record: { exited: true } };
    await transport.disconnect();
    assert.equal(transport.tunnel, null);
});

test('remote server cleanup still runs when local tunnel cleanup fails', async () => {
    let stopped = false;
    await assert.rejects(RealHostTransport.prototype.close.call({
        async disconnect() { throw new Error('synthetic tunnel cleanup failure'); },
        async stopServer() { stopped = true; },
    }), /synthetic tunnel cleanup failure/);
    assert.equal(stopped, true);
});
