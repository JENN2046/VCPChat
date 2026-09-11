'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
const {wrapNative}=require('../../modules/trusted-client/trustedClientKeyProvider');
const host=process.env.C2_FROZEN_HOST_FIXTURE_ROOT;
for(const algorithm of ['ED25519','ECDSA_P256_SHA256'])test('frozen C1 actual five-purpose fixture interoperability '+algorithm,{skip:!host},async()=>{
 const {fixture}=require(path.join(host,'tests/humanClientAdmissionFixtures'));
 const h=fixture({time:Date.now()});let ws;
 try {
 const keys=crypto.generateKeyPairSync(algorithm==='ED25519'?'ed25519':'ec',algorithm==='ED25519'?{}:{namedCurve:'prime256v1'}),publicKeySpki=keys.publicKey.export({type:'spki',format:'der'}).toString('base64url');
 const provider=wrapNative({getIdentity:()=>({publicKeySpki,publicKeyAlgorithm:algorithm}),getSecurityProperties:()=>({productionEligible:false}),signHumanClientProtocolProof:bytes=>({format:'P1363',bytes:crypto.sign(algorithm==='ED25519'?null:'sha256',bytes,{key:keys.privateKey,dsaEncoding:'ieee-p1363'})})});
 const sign=p=>provider.signHumanClientProtocolProof(p,{purpose:p.boundFields.purpose,trustedHostOrigin:'https://host.fixture',surface:'vcp_chat',path:p.boundFields.path});
 const e=h.a.begin({protocolVersion:1,publicKeySpki},'isolated-c2-fixture');h.a.browserDecision(e.enrollmentId,'approve');const enrolled=h.a.claim(e.enrollmentId,await sign(e.proof));
 const sc=h.a.sessionChallenge(enrolled.clientEnrollmentId),s=h.a.authenticate(enrolled.clientEnrollmentId,await sign(sc));assert.equal(s.clientEnrollmentId,enrolled.clientEnrollmentId);assert.equal(s.productionAdmission,'DENIED');
 const cap=h.a.mint(s.sessionId,await sign(h.a.nonce(s.sessionId,'capability-mint')));const claim=h.authority.claimClientChannel(cap.capability);ws=h.socket();const challenge=h.a.beginChannel(ws,claim);h.a.completeChannel(ws,await sign(challenge));assert(h.a.channelVerified(ws,claim));assert.equal(h.authority.isHuman(ws),false,'TEST_ONLY cannot mint production authority');
 h.a.selfRevoke(s.sessionId,await sign(h.a.nonce(s.sessionId,'self-revoke')));assert.equal(h.a.client(s.clientEnrollmentId).enrollmentState,'REVOKED');assert.equal(h.authority.isHuman(ws),false);
 } finally {ws?.close();fs.rmSync(h.storage.root,{recursive:true,force:true});}
});
