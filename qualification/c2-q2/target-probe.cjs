'use strict';
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
const crypto = require('node:crypto'), assert = require('node:assert/strict');
const q1 = path.resolve(__dirname, '../c2-q1');
const out = path.join(__dirname, 'evidence');
fs.mkdirSync(out, { recursive: true });
// Reuse the exact frozen Q1 hardware target, with no software fallback or modified verifier.
const r = cp.spawnSync(process.execPath, ['probe.cjs', 'TARGET', crypto.randomBytes(16).toString('hex')],
  { cwd: q1, encoding: 'utf8', timeout: 90000 });
fs.writeFileSync(path.join(out, 'TARGET_PROBE.log'), (r.stdout || '') + '\n' + (r.stderr || ''));
assert.equal(r.status, 0, r.stderr);
const observed = JSON.parse(r.stdout);
assert.equal(observed.mode, 'TARGET');
assert.equal(observed.productionEligible, false);
assert.equal(observed.qualifiedHumanAuthority, false);
assert.equal(observed.canonicalAuthority.isHuman, false);
assert.equal(observed.canonicalAuthority.receiptMinted, 0);
assert.equal(observed.cleanup, 'PASS');
fs.writeFileSync(path.join(out, 'TARGET_PROBE.json'), JSON.stringify(observed, null, 2));
console.log(JSON.stringify({ probeExecuted: true, hardwareKeyLifecycle: observed.keyLifecycle,
  reason: observed.reason || null, qualifiedHumanAuthority: false }));
