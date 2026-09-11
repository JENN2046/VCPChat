'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto'),assert=require('node:assert/strict');
fs.mkdirSync('evidence',{recursive:true});const rows=[];
for(const mode of ['TARGET','SOFTWARE_DIAGNOSTIC']){const id=crypto.randomBytes(16).toString('hex');const r=cp.spawnSync(process.execPath,['probe.cjs',mode,id],{encoding:'utf8',timeout:60000});fs.writeFileSync('evidence/native-'+mode+'.log',r.stdout+'\n'+r.stderr);assert.equal(r.status,0,r.stderr);rows.push(JSON.parse(r.stdout));}
fs.writeFileSync('evidence/NATIVE_REPORT.json',JSON.stringify({rows,qualification:'Software diagnostic is not target TPM/Secure Enclave evidence. Same-user foreign invocation is measured, not asserted isolated.'},null,2));
