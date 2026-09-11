'use strict';
const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict');const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const m=JSON.parse(fs.readFileSync('FROZEN_C2_MANIFEST.json'));for(const [p,v] of Object.entries(m.files))assert.equal(hash('frozen-c2/'+p),v.sha256,p);
for(const [p,v] of Object.entries(JSON.parse(fs.readFileSync('FROZEN_HOST_CRYPTO.json'))))assert.equal(hash('frozen-host/'+p),v,p);
const original=fs.readFileSync('frozen-c2/modules/trusted-client/native/provider.cc','utf8');assert(original.includes('return fail(e,"PROVIDER_NOT_ADMITTED");'));assert(!original.includes('qualificationInit'));
assert(!fs.readFileSync('frozen-c2/modules/trusted-client/trustedClientKeyProvider.js','utf8').includes('qualification_provider'));
assert(fs.readFileSync('native/provider.cc','utf8').includes('"productionEligible",boolean(e,false)'));
console.log('Frozen C2 40/40; Host crypto2/2; separate qualification target; production loader unchanged');
