 'use strict';
const proofCrypto=require('./protocolProof');
// Private key never leaves native provider. This wrapper has no renderer registration.
// Production factory accepts only the bundled native loader, not caller-supplied paths.
function wrapNative(native) {
    const used=new Map();
    return Object.freeze({
        getIdentity:()=>native.getIdentity(), createIdentity:()=>native.createIdentity(),
        readDescriptor:()=>{const d=native.readDescriptor();return typeof d==='string'?JSON.parse(d):d;}, writeDescriptor:d=>native.writeDescriptor(JSON.stringify(d)),
        getSecurityProperties:()=>Object.freeze(native.getSecurityProperties()),
        async signHumanClientProtocolProof(challenge,expected) {
            const bytes=proofCrypto.validate(challenge,expected);
            for(const [id,expiresAt] of used)if(expiresAt<=Date.now())used.delete(id);
            if(used.has(challenge.nonceId)||used.size>=1024)throw Error('PROOF_REPLAYED_OR_CAPACITY');
            used.set(challenge.nonceId,challenge.boundFields.expiresAt);
            const identity=native.getIdentity();if(!identity)throw Error('KEY_LOST');
            const output=await native.signHumanClientProtocolProof(bytes);
            const raw=identity.publicKeyAlgorithm==='ECDSA_P256_SHA256' ? (output.format==='DER'?proofCrypto.fromDER(output.bytes):proofCrypto.lowS(output.bytes)):Buffer.from(output.bytes);
            const signature=raw.toString('base64url');
            if(!proofCrypto.verifyOutput(identity.publicKeySpki,identity.publicKeyAlgorithm,bytes,signature))throw Error('PROVIDER_SIGNATURE_MISMATCH');
            return Object.freeze({nonceId:challenge.nonceId,signature});
        }
    });
}
function loadProvider() {
    try { return wrapNative(require('./native/build/Release/trusted_client.node')); }
    catch { return Object.freeze({getIdentity:()=>null,readDescriptor:()=>null,getSecurityProperties:()=>({KeyExtractionProtection:'UNKNOWN',KeyInvocationIsolation:'UNKNOWN',productionEligible:false}),createIdentity(){throw Error('PROVIDER_UNAVAILABLE');},writeDescriptor(){throw Error('PROVIDER_UNAVAILABLE');},signHumanClientProtocolProof(){throw Error('PROVIDER_UNAVAILABLE');}}); }
}
module.exports={loadProvider,wrapNative};
