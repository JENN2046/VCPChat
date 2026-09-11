'use strict';
const crypto=require('node:crypto'),assert=require('node:assert/strict'),path=require('node:path');
const C=require('./frozen-host/humanClientAdmissionCrypto');
const {wrapNative}=require('./frozen-c2/modules/trusted-client/trustedClientKeyProvider');
const native=require('./native/build/Release/qualification_provider.node');
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
function proof(purpose,fingerprint){const boundFields={protocolVersion:1,purpose,hostBootId:crypto.randomBytes(32).toString('base64url'),trustedHostOrigin:'https://127.0.0.1',surface:'vcp_chat',publicKeyFingerprint:fingerprint,nonceId:crypto.randomBytes(32).toString('base64url'),issuedAt:Date.now(),expiresAt:Date.now()+30000,method:'POST',path:'/qualification-only/v1/'+purpose,bodyDigest:hash('Q1 disposable fixture')};const t=C.transcript(boundFields);return {nonceId:boundFields.nonceId,boundFields,...t};}
async function runNative(mode,id,{foreign=true}={}){
 assert(['TARGET','SOFTWARE_DIAGNOSTIC'].includes(mode));assert(/^[a-f0-9]{32}$/.test(id));
 const r={mode,platform:process.platform,arch:process.arch,productionEligible:false,HumanInputProvenance:'UNPROVEN',nativeExecuted:true,qualifiedHumanAuthority:false};
 for(const bad of ['x','f'.repeat(33),'../production'])assert.throws(()=>native.qualificationInit(bad,mode));
 assert.throws(()=>native.createIdentity());native.qualificationInit(id,mode);assert.throws(()=>native.qualificationInit(id,mode));
 assert.equal(native.getIdentity(),null,'Fresh test namespace must be empty');assert.equal(native.getSecurityProperties().productionEligible,false);
 try{
  let identity;
  try{identity=native.createIdentity();}catch(e){r.keyLifecycle='UNPROVEN';r.reason=e.code||e.message;return r;}
  const k=C.importPublicKey(identity.publicKeySpki);assert.equal(k.publicKeyAlgorithm,'ECDSA_P256_SHA256');r.identity={algorithm:k.publicKeyAlgorithm,fingerprint:k.fingerprint,providerType:identity.providerType};
  const provider=wrapNative(native);const safeDescriptor={schemaVersion:1,clientEnrollmentId:'QUALIFICATION_ONLY_'+id,publicKeyFingerprint:k.fingerprint,implementationProfileId:'TEST_ONLY'};
  provider.writeDescriptor(safeDescriptor);assert.deepEqual(provider.readDescriptor(),safeDescriptor);
  r.purposes=[];
  for(const purpose of C.PURPOSES){const p=proof(purpose,k.fingerprint);const answer=await provider.signHumanClientProtocolProof(p,{...p.boundFields});assert(C.verifyHumanClientProof({publicKeyAlgorithm:k.publicKeyAlgorithm,canonicalPublicKey:k.key,signingInput:Buffer.from(p.signingInput,'base64url'),signature:answer.signature}));await assert.rejects(()=>provider.signHumanClientProtocolProof(p,{...p.boundFields}),/PROOF_REPLAYED/);r.purposes.push(purpose);}
  assert.throws(()=>native.signHumanClientProtocolProof(Buffer.from('arbitrary')));assert.throws(()=>native.signHumanClientProtocolProof(Buffer.concat([Buffer.from('VCP-HUMAN-CLIENT\0v1\0decision-sign\0'),Buffer.alloc(32)])));
  r.privateExportAPISucceeded=native.probePrivateExport();r.KeyExtractionProtection=r.privateExportAPISucceeded?'EXPORTABLE':'UNPROVEN_API_EXPORT_REJECTED';
  r.keyLifecycle='PASS';r.descriptorPersistence='SAME_PROCESS_PASS';r.KeyInvocationIsolation='UNPROVEN';
  if(foreign){const cp=require('node:child_process');const p=proof('capability-mint',k.fingerprint);const child=cp.spawnSync(process.execPath,[__filename,'foreign',id,mode,JSON.stringify(p),k.fingerprint],{encoding:'utf8',timeout:30000});assert.equal(child.status,0,child.stderr);const result=JSON.parse(child.stdout);assert(result.fingerprintSame&&result.descriptorSame&&result.signatureVerified);r.foreignProcess=result;r.KeyInvocationIsolation='SHARED_PRINCIPAL';r.descriptorPersistence='CROSS_PROCESS_PASS';}
  r.productionEligible=false;return r;
 }finally{native.destroyIdentity();assert.equal(native.getIdentity(),null,'Qualification key cleanup failed');r.cleanup='PASS';}
}
module.exports={runNative};
if(require.main===module){(async()=>{if(process.argv[2]==='foreign'){
 const [, , ,id,mode,json,fingerprint]=process.argv;native.qualificationInit(id,mode);const identity=native.getIdentity(),k=C.importPublicKey(identity.publicKeySpki),p=JSON.parse(json);const provider=wrapNative(native);const s=await provider.signHumanClientProtocolProof(p,{...p.boundFields});process.stdout.write(JSON.stringify({fingerprintSame:k.fingerprint===fingerprint,descriptorSame:provider.readDescriptor().publicKeyFingerprint===fingerprint,signatureVerified:C.verifyHumanClientProof({publicKeyAlgorithm:k.publicKeyAlgorithm,canonicalPublicKey:k.key,signingInput:Buffer.from(p.signingInput,'base64url'),signature:s.signature}),productionEligible:native.getSecurityProperties().productionEligible}));
 }else console.log(JSON.stringify(await runNative(process.argv[2],process.argv[3])));})().catch(e=>{console.error(e.stack);process.exitCode=1;});}
