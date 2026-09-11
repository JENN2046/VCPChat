 'use strict';
class HumanInteractionEligibility {
    #epoch = 0; #state = 'UNKNOWN';
    get epoch() { return this.#epoch; }
    get state() { return this.#state; }
    invalidate() { this.#epoch++; this.#state = 'INELIGIBLE'; }
    reconcile({ lockState, freshSync, visible, focused, integrity }) {
        this.#epoch++;
        this.#state = lockState === 'UNLOCKED' && freshSync === true && visible === true && focused === true && integrity === true ? 'ELIGIBLE' : 'UNKNOWN';
        return this.#state;
    }
}
module.exports = { HumanInteractionEligibility };
