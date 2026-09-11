'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process');
const crypto=require('node:crypto'),assert=require('node:assert/strict');
const C=require('../c2-q1/frozen-host/humanClientAdmissionCrypto');
const {wrapNative}=require('../c2-q1/frozen-c2/modules/trusted-client/trustedClientKeyProvider');
const {reconcile}=require('../c2-q1/frozen-c2/modules/trusted-client/trustedClientIdentityDescriptor');
assert.equal(process.platform,'darwin');
const output=path.join(__dirname,'evidence');fs.mkdirSync(output,{recursive:true});
const bin=path.join(output,'enclave-fixture');
const build=cp.spawnSync('/usr/bin/swiftc',[path.join(__dirname,'enclave-fixture.swift'),'-o',bin],{encoding:'utf8',timeout:120000});
fs.writeFileSync(path.join(output,'ENCLAVE_COMPILE.log'),build.stdout+'\n'+build.stderr);assert.equal(build.status,0,build.stderr);
const root=fs.mkdtempSync(path.join(os.tmpdir(),'c2-q2-enclave-'));fs.chmodSync(root,0o700);
function invoke(mode,index){const r=cp.spawnSync(bin,[mode,root,...(index===undefined?[]:[String(index)])],{encoding:'utf8',timeout:30000});assert.equal(r.status,0,'Secure Enclave fixture failed: '+r.stderr);return JSON.parse(r.stdout);}
const report={platform:'darwin',productionEligible:false,HumanInputProvenance:'UNPROVEN',hostContact:false,receiptMinted:0,keysNamespace:'disposable runner temp only'};
(async()=>{try{
 const i=invoke('create'),spki=Buffer.from(i.publicKeySpki,'base64').toString('base64url'),key=C.importPublicKey(spki);
 assert.equal(key.publicKeyAlgorithm,'ECDSA_P256_SHA256');assert.equal(key.fingerprint,i.publicKeyFingerprint);
 const proofs=C.PURPOSES.map(purpose=>{const boundFields={protocolVersion:1,purpose,hostBootId:crypto.randomBytes(32).toString('base64url'),trustedHostOrigin:'https://q2.invalid',surface:'vcp_chat',publicKeyFingerprint:key.fingerprint,nonceId:crypto.randomBytes(32).toString('base64url'),issuedAt:Date.now(),expiresAt:Date.now()+60000,method:'POST',path:'/qualification-only/v1/'+purpose,bodyDigest:crypto.createHash('sha256').update('Q2 disposable crypto fixture').digest('hex')};return {nonceId:boundFields.nonceId,boundFields,...C.transcript(boundFields)};});
 fs.writeFileSync(path.join(root,'five-proofs.json'),JSON.stringify(proofs.map(p=>({purpose:p.boundFields.purpose,signingInput:Buffer.from(p.signingInput,'base64url').toString('base64')}))),{mode:0o600});
 const adapter={getIdentity:()=>({publicKeySpki:spki,publicKeyAlgorithm:key.publicKeyAlgorithm}),getSecurityProperties:()=>({productionEligible:false}),signHumanClientProtocolProof:bytes=>{const index=proofs.findIndex(p=>Buffer.from(p.signingInput,'base64url').equals(bytes));assert(index>=0,'No arbitrary signing: fixture index must match');return {format:'P1363',bytes:Buffer.from(invoke('sign-fixture',index).signatureP1363,'base64')};}};
 const provider=wrapNative(adapter);report.purposes=[];report.replayRejections=0;report.modifiedTranscriptRejections=0;
 for(const p of proofs){const signed=await provider.signHumanClientProtocolProof(p,{...p.boundFields});const input=Buffer.from(p.signingInput,'base64url');assert(C.verifyHumanClientProof({publicKeyAlgorithm:key.publicKeyAlgorithm,canonicalPublicKey:key.key,signingInput:input,signature:signed.signature}));const modified=Buffer.from(input);modified[modified.length-1]^=1;assert.equal(C.verifyHumanClientProof({publicKeyAlgorithm:key.publicKeyAlgorithm,canonicalPublicKey:key.key,signingInput:modified,signature:signed.signature}),false);report.modifiedTranscriptRejections++;await assert.rejects(()=>provider.signHumanClientProtocolProof(p,{...p.boundFields}),/PROOF_REPLAYED/);report.replayRejections++;report.purposes.push(p.boundFields.purpose);}
 const reopened=invoke('reopen');assert.equal(reopened.publicKeyFingerprint,key.fingerprint);report.crossProcessRecovery='PASS';
 // A separately launched same-user executable directly invokes the key for an exact
 // existing protocol fixture. Success is isolation FAIL, never a positive trust result.
 const foreign=invoke('sign-fixture',0),message=Buffer.from(proofs[0].signingInput,'base64url');
 const signature=Buffer.from(foreign.signatureP1363,'base64');
 assert(crypto.verify('sha256',message,{key:key.key,dsaEncoding:'ieee-p1363'},signature));
 report.sameUserForeignSignatureVerified=true;report.KeyInvocationIsolation='FAIL';
 report.KeyExtractionProtection='UNPROVEN';report.extractionQualification='CryptoKit API and encrypted-handle behavior are not independent physical hardware attestation';
 const identity={...adapter.getIdentity(),publicKeyFingerprint:key.fingerprint,providerType:'Q2_CRYPTO_KIT',providerKeyId:'DISPOSABLE'};
 const descriptor={schemaVersion:1,hostAuthorityId:'QUALIFICATION_ONLY',clientEnrollmentId:'QUALIFICATION_ONLY',publicKeyAlgorithm:key.publicKeyAlgorithm,publicKeyFingerprint:key.fingerprint,providerType:'Q2_CRYPTO_KIT',providerKeyId:'DISPOSABLE',implementationProfileId:'TEST_ONLY'};
 const expected={hostAuthorityId:'QUALIFICATION_ONLY',implementationProfileId:'TEST_ONLY'};
 assert.equal(reconcile(identity,descriptor,expected).state,'ENROLLED');assert.equal(reconcile(identity,null,expected).state,'RECOVERY_REQUIRED');assert.equal(reconcile(null,descriptor,expected).state,'KEY_LOST');
 report.descriptorProjection='three frozen states checked; OS durable descriptor store not qualified';
 report.hardwareKeyOperation='CryptoKit SecureEnclave create/reopen/sign executed; physical platform assurance UNPROVEN';
}finally{fs.rmSync(root,{recursive:true,force:true});report.temporaryHandleCleanup=!fs.existsSync(root);fs.writeFileSync(path.join(output,'ENCLAVE_FIVE_PURPOSE.json'),JSON.stringify(report,null,2));}
console.log(JSON.stringify(report));})().catch(e=>{console.error(e.stack);process.exitCode=1;});
