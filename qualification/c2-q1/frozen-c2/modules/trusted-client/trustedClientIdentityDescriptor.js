 'use strict';
const { createHash, createPublicKey } = require('node:crypto');
function keyIdentity(spki) {
    if (typeof spki !== 'string' || !/^[A-Za-z0-9_-]+$/.test(spki)) throw Error('IDENTITY_RECOVERY_LOCKED');
    const bytes = Buffer.from(spki, 'base64url'); if (bytes.toString('base64url') !== spki) throw Error('IDENTITY_RECOVERY_LOCKED');
    const key = createPublicKey({ key: bytes, type: 'spki', format: 'der' });
    if (!key.export({ type: 'spki', format: 'der' }).equals(bytes)) throw Error('IDENTITY_RECOVERY_LOCKED');
    const algorithm = key.asymmetricKeyType === 'ed25519' ? 'ED25519' : key.asymmetricKeyType === 'ec' && key.asymmetricKeyDetails.namedCurve === 'prime256v1' ? 'ECDSA_P256_SHA256' : null;
    if (!algorithm) throw Error('IDENTITY_RECOVERY_LOCKED');
    return { publicKeyAlgorithm: algorithm, publicKeyFingerprint: createHash('sha256').update(bytes).digest('hex') };
}
function reconcile(key, descriptor, expected) {
    if (!key && !descriptor) return { state: 'UNENROLLED' };
    if (!key) return { state: 'KEY_LOST' };
    if (!descriptor) return { state: 'RECOVERY_REQUIRED' };
    try {
        const actual = keyIdentity(key.publicKeySpki);
        if (descriptor.schemaVersion !== 1 || !descriptor.clientEnrollmentId || !descriptor.hostAuthorityId ||
            descriptor.publicKeyAlgorithm !== actual.publicKeyAlgorithm || descriptor.publicKeyFingerprint !== actual.publicKeyFingerprint ||
            descriptor.providerType !== key.providerType || descriptor.providerKeyId !== key.providerKeyId ||
            descriptor.implementationProfileId !== expected.implementationProfileId || descriptor.hostAuthorityId !== expected.hostAuthorityId) throw Error();
        return { state: 'ENROLLED', descriptor: Object.freeze({ ...descriptor }) };
    } catch { return { state: 'IDENTITY_RECOVERY_LOCKED' }; }
}
module.exports = { reconcile, keyIdentity };
