const ALLOWED_TRANSITIONS = Object.freeze({
    lead: ['quoted', 'cancelled'],
    quoted: ['confirmed', 'cancelled'],
    confirmed: ['preparing', 'cancelled'],
    preparing: ['shot', 'cancelled'],
    shot: ['selection_pending', 'cancelled'],
    selection_pending: ['retouching', 'cancelled'],
    retouching: ['delivering', 'cancelled'],
    delivering: ['completed'],
    completed: ['archived'],
    archived: [],
    cancelled: [],
});

function getAllowedTransitions(status) {
    return ALLOWED_TRANSITIONS[status] ? [...ALLOWED_TRANSITIONS[status]] : [];
}

module.exports = {
    ALLOWED_TRANSITIONS,
    getAllowedTransitions,
};
