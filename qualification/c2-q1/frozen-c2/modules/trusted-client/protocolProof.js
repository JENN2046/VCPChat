 'use strict';
const { createHash, createPublicKey, verify } = require('node:crypto');
const PURPOSES = Object.freeze(['enrollment-claim', 'capability-mint', 'channel-upgrade', 'self-revoke', 'session-authenticate']);
const N = BigInt('0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551');
function decode(x) { if (typeof x !== 'string' || !/^[A-Za-z0-9_-]+$/.test(x)) throw Error('PROOF_INVALID'); const b = Buffer.from(x, 'base64url'); if (b.toString('base64url') !== x) throw Error('PROOF_INVALID'); return b; }
function canonical(x) { if (x === null || typeof x !== 'object') return JSON.stringify(x); if (Array.isArray(x)) return '['+x.map(canonical).join(',')+']'; return '{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}'; }
function validate(proof, expected, now = Date.now()) {
    const f = proof?.boundFields;
    if (!f || f.protocolVersion !== 1 || !PURPOSES.includes(f.purpose) || f.purpose !== expected.purpose || f.surface !== 'vcp_chat' ||
        !/^[A-Za-z0-9_-]{43}$/.test(f.nonceId) || f.nonceId !== proof.nonceId || !/^[A-Za-z0-9_-]{43}$/.test(f.hostBootId) ||
        !Number.isFinite(f.issuedAt) || !Number.isFinite(f.expiresAt) || f.expiresAt <= now || f.issuedAt > now + 5000 || f.expiresAt - f.issuedAt > 300000) throw Error('PROOF_INVALID');
    for (const [k,v] of Object.entries(expected)) if (f[k] !== v) throw Error('PROOF_BINDING');
    // Validate envelope; sign exact Host bytes, never a reconstructed client transcript.
    const bytes = decode(proof.signingInput), prefix = Buffer.from('VCP-HUMAN-CLIENT\0v1\0'+f.purpose+'\0', 'ascii');
    const digest = createHash('sha256').update(canonical(f)).digest();
    if (bytes.length !== prefix.length+32 || !bytes.subarray(0,prefix.length).equals(prefix) || !bytes.subarray(prefix.length).equals(digest) || proof.boundFieldDigest !== digest.toString('hex')) throw Error('PROOF_INVALID');
    return bytes;
}
function lowS(raw) {
    const b = Buffer.from(raw); if (b.length !== 64) throw Error('SIGNATURE_INVALID');
    const r=BigInt('0x'+b.subarray(0,32).toString('hex')),s=BigInt('0x'+b.subarray(32).toString('hex'));
    if (r<1n || r>=N || s<1n || s>=N) throw Error('SIGNATURE_INVALID');
    if (s>N/2n) Buffer.from((N-s).toString(16).padStart(64,'0'),'hex').copy(b,32); return b;
}
function fromDER(der) {
    const b=Buffer.from(der);let i=0;
    if(b[i++]!==0x30 || b[i++]!==b.length-2 || b.length>72) throw Error('SIGNATURE_INVALID');
    const parts=[];
    for(let k=0;k<2;k++) {
        if(b[i++]!==2)throw Error('SIGNATURE_INVALID');const len=b[i++];let n=b.subarray(i,i+len);i+=len;
        if(!len || len>33 || n.length!==len || (n[0]&128) || (len>1 && n[0]===0 && !(n[1]&128)))throw Error('SIGNATURE_INVALID');
        if(n[0]===0)n=n.subarray(1);if(n.length>32)throw Error('SIGNATURE_INVALID');parts.push(Buffer.concat([Buffer.alloc(32-n.length),n]));
    }
    if(i!==b.length)throw Error('SIGNATURE_INVALID');return lowS(Buffer.concat(parts));
}
function verifyOutput(spki, algorithm, bytes, signature) {
    const key=createPublicKey({key:decode(spki),format:'der',type:'spki'}),sig=decode(signature);
    if(sig.length!==64)return false;
    if(algorithm==='ED25519')return key.asymmetricKeyType==='ed25519' && verify(null,bytes,key,sig);
    if(algorithm==='ECDSA_P256_SHA256')return key.asymmetricKeyType==='ec' && key.asymmetricKeyDetails.namedCurve==='prime256v1' && lowS(sig).equals(sig) && verify('sha256',bytes,{key,dsaEncoding:'ieee-p1363'},sig);
    return false;
}
module.exports={PURPOSES,validate,decode,lowS,fromDER,verifyOutput};
