 'use strict';
// This is an interruption-safe local projection, never Host admission authority.
class SecurityEpoch {
    #state = 'CURRENT'; #epoch; #closed = false;
    constructor(epoch) { this.#epoch = epoch; }
    get state() { return this.#state; }
    ordinaryUpdate(authoritativeEpoch, identityUnchanged) { return this.#state === 'CURRENT' && authoritativeEpoch === this.#epoch && identityUnchanged === true; }
    withdraw() { this.#state = 'WITHDRAWN'; }
    closeOldIdentity() { if (this.#state !== 'WITHDRAWN') throw Error('ORDER'); this.#closed = true; this.#state = 'OLD_CLOSED'; }
    async verifyPathB(verifyHostContinuity) {
        if (!this.#closed || this.#state !== 'OLD_CLOSED') throw Error('ORDER');
        const proof = await verifyHostContinuity();
        if (this.#state !== 'OLD_CLOSED' || !proof || proof.enrollmentState !== 'REVOKED' || proof.commitVerified !== true ||
            !proof.hostAuthorityId || !Number.isSafeInteger(proof.epoch) || !/^[a-f0-9]{64}$/.test(proof.head)) throw Error('CONTINUITY_UNPROVEN');
        this.#state = 'AWAITING_SEPARATE_HOST_ADMISSION'; return true;
    }
    pathA() { return 'UNPROVEN'; }
    canAuthorize() { return this.#state === 'CURRENT'; }
}
module.exports = { SecurityEpoch };
