const PRESENTATION_SCHEMA =
    'agents-os-resident.host-presentation.v1';
const PRESENTATION_KIND = 'OWNER_CONSENT_CHALLENGE';
const MUTATION_CONFIRMATION_PREFIX = Object.freeze({
    CREATE_GOAL_BUNDLE: '确认创建，',
    START_GOAL: '确认变更，',
    PAUSE_GOAL: '确认变更，',
    RESUME_GOAL: '确认变更，',
    REQUEST_COMPLETION_REVIEW: '确认变更，',
    COMPLETE_TASK_MANUALLY: '确认完成，',
    CLOSE_GOAL_ACHIEVED: '确认关闭，',
    START_TASK: '确认变更，',
    PAUSE_TASK: '确认变更，',
    RESUME_TASK: '确认变更，'
});
const CHALLENGE_WORDS_PATTERN =
    /^[^、，,\s。！？!?]{1,16}(?:、[^、，,\s。！？!?]{1,16}){2}$/u;
const PRESENTATION_KEYS = Object.freeze([
    'challenge',
    'expiresInSeconds',
    'kind',
    'mutationType',
    'schema',
    'title'
]);

function isPlainObject(value) {
    return value !== null
        && typeof value === 'object'
        && !Array.isArray(value)
        && (Object.getPrototypeOf(value) === Object.prototype
            || Object.getPrototypeOf(value) === null);
}

function exactKeys(value, expected) {
    if (!isPlainObject(value)) return false;
    const actual = Object.keys(value).sort();
    const wanted = [...expected].sort();
    return actual.length === wanted.length
        && actual.every((key, index) => key === wanted[index]);
}

export function validateResidentEphemeralPresentation(value) {
    if (!exactKeys(value, PRESENTATION_KEYS)
        || value.schema !== PRESENTATION_SCHEMA
        || value.kind !== PRESENTATION_KIND
        || value.title !== 'AGENTSOSResident · Owner Consent'
        || typeof value.mutationType !== 'string'
        || value.mutationType.length === 0
        || value.mutationType.length > 80
        || !Number.isSafeInteger(value.expiresInSeconds)
        || value.expiresInSeconds < 1
        || value.expiresInSeconds > 300
        || typeof value.challenge !== 'string'
        || value.challenge.length === 0
        || value.challenge.length > 200
        || value.challenge.normalize('NFC') !== value.challenge
        || /[\r\n\0]/u.test(value.challenge)) {
        return null;
    }
    const expectedPrefix =
        MUTATION_CONFIRMATION_PREFIX[value.mutationType];
    if (!expectedPrefix
        || !value.challenge.startsWith(expectedPrefix)
        || !CHALLENGE_WORDS_PATTERN.test(
            value.challenge.slice(expectedPrefix.length)
        )) {
        return null;
    }
    return Object.freeze({
        challenge: value.challenge,
        expiresInSeconds: value.expiresInSeconds,
        kind: value.kind,
        mutationType: value.mutationType,
        schema: value.schema,
        title: value.title
    });
}

function findMessageItem(container, messageId) {
    return Array.from(
        container.querySelectorAll('.message-item[data-message-id]')
    ).find((element) => element.dataset.messageId === messageId) || null;
}

function findExistingPresentation(container, messageId) {
    return Array.from(
        container.querySelectorAll(
            '.agents-os-resident-consent-presentation[data-request-message-id]'
        )
    ).find((element) =>
        element.dataset.requestMessageId === messageId) || null;
}

function textElement(document, className, text) {
    const element = document.createElement('div');
    element.className = className;
    element.textContent = text;
    return element;
}

export function renderResidentEphemeralPresentation({
    container,
    document,
    messageId,
    presentation
}) {
    if (!document
        || !container
        || typeof messageId !== 'string'
        || messageId.length === 0
        || messageId.length > 512) {
        return null;
    }
    const validated = validateResidentEphemeralPresentation(presentation);
    if (validated === null) return null;

    const existing = findExistingPresentation(container, messageId);
    if (existing) {
        return Object.freeze({
            element: existing,
            expiresInMilliseconds:
                validated.expiresInSeconds * 1000,
            rendered: false
        });
    }

    const card = document.createElement('section');
    card.className = 'agents-os-resident-consent-presentation';
    card.dataset.requestMessageId = messageId;
    card.dataset.ephemeral = 'true';
    card.setAttribute('role', 'region');
    card.setAttribute('aria-live', 'assertive');
    card.setAttribute('aria-label', validated.title);

    card.appendChild(textElement(
        document,
        'agents-os-resident-consent-title',
        validated.title
    ));
    card.appendChild(textElement(
        document,
        'agents-os-resident-consent-mutation',
        `Pending proposal · ${validated.mutationType}`
    ));
    card.appendChild(textElement(
        document,
        'agents-os-resident-consent-instruction',
        `请在 ${validated.expiresInSeconds} 秒内严格输入或口述以下整句：`
    ));
    card.appendChild(textElement(
        document,
        'agents-os-resident-consent-challenge',
        validated.challenge
    ));
    card.appendChild(textElement(
        document,
        'agents-os-resident-consent-privacy',
        '仅在当前请求中临时显示；不会写入对话历史或发送给 Agent。'
    ));

    const messageItem = findMessageItem(container, messageId);
    if (messageItem?.parentNode === container) {
        messageItem.insertAdjacentElement('afterend', card);
    } else {
        container.appendChild(card);
    }

    return Object.freeze({
        element: card,
        expiresInMilliseconds: validated.expiresInSeconds * 1000,
        rendered: true
    });
}
