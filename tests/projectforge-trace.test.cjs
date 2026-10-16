const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { verify, sha, DESTINATION, RECIPE } = require('../.github/scripts/verify-projectforge-trace.cjs');
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-trace-test-'));
  t.after(() => fs.rmSync(root, { recursive:true, force:true }));
  const put = (name, value) => { fs.mkdirSync(path.dirname(path.join(root,name)),{recursive:true}); fs.writeFileSync(path.join(root,name),value); };
  const inputs = ['Cargo.toml','Cargo.lock','src/main.rs','examples/probe.rs'];
  inputs.forEach(name => put('rust_projectforge_indexer/'+name, 'fixture '+name));
  const bin=Buffer.from('MZ synthetic identity fixture, never executed'); put(DESTINATION,bin); put(RECIPE,'fixture recipe');
  const receipt={upstreamTarget:'frozen',binaries:[{component:'rust_projectforge_indexer',destination:DESTINATION,size:bin.length,sha256:sha(bin),gitBlob:crypto.createHash('sha1').update(Buffer.from(`blob ${bin.length}\0`)).update(bin).digest('hex'),buildConditions:{recipe:RECIPE,recipeSha256:sha(Buffer.from('fixture recipe'))},inputHashes:inputs.map(name=>({path:name,sha256:sha(Buffer.from('fixture '+name))}))}]};
  put('docs/native-build-3cde8466.json',JSON.stringify(receipt)); return {root,put};
}
test('trace verifies exact source, recipe and bundled artifact without claiming cross-machine equality',t=>{
  const {root}=fixture(t); assert.equal(verify(root).crossMachineEquivalenceClaimed,false);
});
for (const [label,file] of [['source','rust_projectforge_indexer/src/main.rs'],['recipe',RECIPE],['artifact',DESTINATION]]) {
  test('reject changed '+label,t=>{const {root,put}=fixture(t);put(file,'changed');assert.throws(()=>verify(root));});
}
test('reject omitted source inventory entries',t=>{const {root,put}=fixture(t);put('rust_projectforge_indexer/src/extra.rs','new');assert.throws(()=>verify(root),/inventory/);});
test('reject new Cargo build scripts',t=>{const {root,put}=fixture(t);put('rust_projectforge_indexer/build.rs','new');assert.throws(()=>verify(root),/build script/);});
test('source byte checking never normalizes line endings to hide changes',t=>{const {root,put}=fixture(t);put('rust_projectforge_indexer/src/main.rs','fixture src/main.rs\r\n');assert.throws(()=>verify(root),/source identity/);});
