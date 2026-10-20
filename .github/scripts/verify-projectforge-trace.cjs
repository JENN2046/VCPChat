'use strict';
// Traceability and artifact identity, NOT cross-machine build equivalence.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const DESTINATION = 'VCPDistributedServer/Plugin/ProjectForge/bin/win32-x64/projectforge_indexer.exe';
const RECIPE = '.github/scripts/build-projectforge-windows.ps1';
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function regular(file) {
  assert.ok(fs.lstatSync(file).isFile() && !fs.lstatSync(file).isSymbolicLink(), 'regular file required');
  return fs.readFileSync(file);
}
function verify(root) {
  const receipt = JSON.parse(regular(path.join(root, 'docs/native-build-3cde8466.json')));
  const entries = receipt.binaries.filter(b => b.component === 'rust_projectforge_indexer');
  assert.equal(entries.length, 1, 'one ProjectForge record required');
  const record = entries[0];
  assert.equal(record.destination, DESTINATION);
  assert.equal(record.buildConditions.recipe, RECIPE);
  assert.equal(sha(regular(path.join(root, RECIPE))), record.buildConditions.recipeSha256, 'recipe identity');
  const source = path.join(root, 'rust_projectforge_indexer');
  const actual = ['Cargo.toml', 'Cargo.lock'];
  function walk(dir) {
    for (const entry of fs.readdirSync(path.join(source, dir), { withFileTypes: true })) {
      assert.ok(!entry.isSymbolicLink(), 'source link forbidden');
      const name = dir + '/' + entry.name;
      if (entry.isDirectory()) walk(name);
      else { assert.ok(entry.isFile() && (name.endsWith('.rs') || name === 'tests/sample_script.ps1'), 'unexpected Rust source input'); actual.push(name); }
    }
  }
  walk('src'); walk('examples');
  if (fs.existsSync(path.join(source, 'tests'))) walk('tests');
  assert.ok(!fs.existsSync(path.join(source, 'build.rs')), 'new build script requires provenance review');
  assert.ok(!fs.existsSync(path.join(source, '.cargo')), 'local Cargo configuration not admitted');
  assert.deepEqual(record.inputHashes.map(x => x.path).sort(), actual.sort(), 'complete source inventory');
  for (const item of record.inputHashes) {
    assert.equal(sha(regular(path.join(source, item.path))), item.sha256, 'source identity: ' + item.path);
  }
  const bytes = regular(path.join(root, DESTINATION));
  assert.equal(bytes.length, record.size, 'bundled size');
  assert.equal(sha(bytes), record.sha256, 'bundled SHA256');
  assert.equal(crypto.createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex'), record.gitBlob, 'bundled Git object');
  return { schema: 'vcpchat-projectforge-trace/v1', upstreamTarget: receipt.upstreamTarget,
    sourceInputs: record.inputHashes, recipeSha256: record.buildConditions.recipeSha256,
    bundledSha256: record.sha256, crossMachineEquivalenceClaimed: false };
}
function smoke(executable) {
  const input = [
    { id: 1, method: 'ping', params: {} },
    { id: 2, method: 'outline', params: { lang: 'javascript', text: 'export function traceFixture() { return 42; }\n' } },
    { id: 3, method: 'outline', params: { lang: 'javascript' } },
    { id: 4, method: 'outline', params: { lang: 'ps1', text: 'function Trace-Geometry {\n    return 42\n}\n' } },
    { id: 5, method: 'outline', params: { lang: 'rust', text: 'pub fn broken() {\n    if true {\n' } },
    { id: 6, method: 'outline', params: { lang: 'sh', text: 'health_check() { curl localhost; }\n' } },
    { id: 7, method: 'outline', params: { lang: 'vue', text: 'function outer() {\n  if (ready) {\n    call();\n  } else {\n    call();\n  }\n}\n' } },
  ].map(v => JSON.stringify(v)).join('\n') + '\n';
  const child = spawnSync(executable, [], { input, encoding: 'utf8', timeout: 20000, maxBuffer: 1024 * 1024, windowsHide: true });
  assert.ifError(child.error); assert.equal(child.status, 0, 'native exit');
  const rows = child.stdout.trim().split(/\r?\n/).map(v => JSON.parse(v));
  assert.equal(rows[0].type, 'ready'); assert.equal(rows[0].protocolVersion, 3);
  const response = id => { const hits=rows.filter(v => v.id === id); assert.equal(hits.length, 1); return hits[0]; };
  assert.equal(response(1).ok, true); assert.equal(response(1).result.pong, true);
  assert.equal(response(2).ok, true);
  assert.ok(response(2).result.symbols.some(v => v.name === 'traceFixture' && v.kind === 'function'));
  assert.equal(response(3).ok, false); assert.equal(response(3).error.code, 'INVALID_PARAMS');
  assert.equal(response(4).ok, true);
  assert.ok(response(4).result.symbols.some(v => v.name === 'Trace-Geometry'));
  assert.equal(response(5).ok, true); assert.equal(response(5).result.hasError, true);
  assert.equal(response(6).ok, true);
  assert.ok(response(6).result.symbols.some(v => v.name === 'health_check' && v.start === 1 && v.end === 1));
  assert.equal(response(7).ok, true);
  assert.deepEqual(response(7).result.symbols.map(v => v.name), ['outer']);
  return { ready: true, ping: true, javascriptOutline: true, powershellGeometry: true,
    sameLineShellGeometry: true, controlContinuationsExcluded: true, malformedRustReported: true, invalidInputRejected: true };
}
if (require.main === module) {
  try {
  const root = path.resolve(process.argv[2] || '.');
  const result = verify(root);
  if (process.argv[3]) {
    assert.equal(process.platform, 'win32', 'native smoke requires Windows');
    const rebuilt = path.resolve(process.argv[3]);
    result.bundledSmoke = smoke(path.join(root, DESTINATION));
    result.rebuiltSha256 = sha(regular(rebuilt));
    result.rebuiltSmoke = smoke(rebuilt);
    const compiler = spawnSync('rustc', ['--version', '--verbose'], { encoding: 'utf8', windowsHide: true });
    assert.equal(compiler.status, 0); result.compiler = compiler.stdout.trim();
    assert.match(result.compiler, /^release: 1\.89\.0$/m);
    result.ciCommit = process.env.GITHUB_SHA || null;
    result.ciRun = process.env.GITHUB_RUN_ID || null;
  }
  if (process.argv[4]) fs.writeFileSync(process.argv[4], JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    // Structured, bounded diagnostics; do not need raw job or runtime logs.
    const message=String(error.message).split('\n')[0].replace(/[%\r\n]/g, ' ').slice(0,240);
    console.error('::error::ProjectForge trace: '+message);
    process.exitCode=1;
  }
}
module.exports = { verify, smoke, sha, DESTINATION, RECIPE };
