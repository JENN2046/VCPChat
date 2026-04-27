const SHELL_COMMAND_DEFAULT_TIMEOUT_MS = 60_000;

function createVcpChatCodexRouterDirectiveBuilders(builders = {}) {
    return {
        ...(typeof builders.shellCommand === 'function'
            ? { shellCommand: builders.shellCommand }
            : {}),
        ...(typeof builders.applyPatch === 'function'
            ? { applyPatch: builders.applyPatch }
            : {}),
        ...(typeof builders.automationUpdate === 'function'
            ? { automationUpdate: builders.automationUpdate }
            : {}),
    };
}

function buildVcpChatShellCommandDirective(command, options = {}) {
    if (typeof command !== 'string' || command.trim() === '') {
        return undefined;
    }

    return {
        command,
        timeout_ms: options.timeout_ms ?? SHELL_COMMAND_DEFAULT_TIMEOUT_MS,
        ...(typeof options.workdir === 'string' ? { workdir: options.workdir } : {}),
        ...(typeof options.justification === 'string'
            ? { justification: options.justification }
            : {}),
        ...(typeof options.login === 'boolean' ? { login: options.login } : {}),
    };
}

function buildVcpChatApplyPatchDirective(patch) {
    return typeof patch === 'string' && patch.trim() !== '' ? patch : undefined;
}

function buildVcpChatAutomationUpdateDirective(request = {}) {
    return Object.keys(request).length > 0 ? { ...request } : undefined;
}

module.exports = {
    SHELL_COMMAND_DEFAULT_TIMEOUT_MS,
    createVcpChatCodexRouterDirectiveBuilders,
    buildVcpChatShellCommandDirective,
    buildVcpChatApplyPatchDirective,
    buildVcpChatAutomationUpdateDirective,
};
