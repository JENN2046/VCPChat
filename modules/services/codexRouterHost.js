const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const os = require('os');
const { spawn } = require('child_process');

const DEFAULT_VCPCHAT_ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_VCP_WORKSPACE_ROOT = path.resolve(DEFAULT_VCPCHAT_ROOT, '..');
const DEFAULT_CODEX_ROUTER_ROOT = path.join(DEFAULT_VCP_WORKSPACE_ROOT, 'codex-router');
const DEFAULT_VCP_TOOLBOX_ROOT = path.join(DEFAULT_VCP_WORKSPACE_ROOT, 'VCPToolBox');
const HOST_CLIENT_EXAMPLE_ENTRY = [
    'dist',
    'packages',
    'host-client-example',
    'src',
    'index.js',
];
const POLICY_CONFIG_ENTRY = [
    'dist',
    'packages',
    'policy-config',
    'src',
    'index.js',
];
const DEFAULT_POLICY_FILE = 'routing-policy.yaml';
const DEFAULT_ANCHOR = 'vcpchat-desktop@codex-router';
const REQUIRED_RUNTIME_METHODS = [
    'read_thread_terminal',
    'spawn_agent',
    'wait_agent',
    'send_input',
    'close_agent',
    'shell_command',
    'apply_patch',
    'automation_update',
];
const REQUIRED_MEMORY_METHODS = [
    'record_memory',
    'search_memory',
];
const OPTIONAL_MEMORY_METHODS = [
    'memory_overview',
];
const DEFAULT_TERMINAL_LOG_BYTES = 16 * 1024;
const DEFAULT_TERMINAL_LOG_FILES = 2;
const DEFAULT_SHELL_COMMAND_TIMEOUT_MS = 60_000;
const DEFAULT_VCP_TOOLBOX_MEMORY_PATH = '/mcp/codex-memory';
const DEFAULT_VCPCHAT_AUTOMATION_STORE = path.join(
    DEFAULT_VCPCHAT_ROOT,
    'AppData',
    'codexRouter',
    'automations.json'
);
const PTY_INTERACTIVE_AGENT_ID_PREFIX = 'pty_session_';
const BEGIN_PATCH_MARKER = '*** Begin Patch';
const END_PATCH_MARKER = '*** End Patch';
const ADD_FILE_MARKER = '*** Add File: ';
const DELETE_FILE_MARKER = '*** Delete File: ';
const UPDATE_FILE_MARKER = '*** Update File: ';
const MOVE_TO_MARKER = '*** Move to: ';
const EOF_MARKER = '*** End of File';
const CHANGE_CONTEXT_MARKER = '@@ ';
const EMPTY_CHANGE_CONTEXT_MARKER = '@@';

function resolveCodexRouterRoot(explicitRoot) {
    const candidate = explicitRoot || process.env.VCP_CODEX_ROUTER_ROOT || DEFAULT_CODEX_ROUTER_ROOT;
    return path.resolve(candidate);
}

function resolveCodexRouterHostClientEntry(explicitRoot) {
    return path.join(resolveCodexRouterRoot(explicitRoot), ...HOST_CLIENT_EXAMPLE_ENTRY);
}

function resolveCodexRouterPolicyConfigEntry(explicitRoot) {
    return path.join(resolveCodexRouterRoot(explicitRoot), ...POLICY_CONFIG_ENTRY);
}

function resolveCodexRouterPolicyFile(explicitRoot, explicitPolicyFile) {
    if (typeof explicitPolicyFile === 'string' && explicitPolicyFile.trim() !== '') {
        return path.resolve(explicitPolicyFile);
    }
    return path.join(resolveCodexRouterRoot(explicitRoot), DEFAULT_POLICY_FILE);
}

async function loadCodexRouterHostClientModule(options = {}) {
    const entry = resolveCodexRouterHostClientEntry(options.routerRoot);
    if (!fs.existsSync(entry)) {
        throw new Error(
            `codex_router_host_client_entry_missing:${entry}`
        );
    }

    return import(pathToFileURL(entry).href);
}

async function loadVcpChatCodexRouterPolicy(options = {}) {
    const moduleEntry = resolveCodexRouterPolicyConfigEntry(options.routerRoot);
    if (!fs.existsSync(moduleEntry)) {
        throw new Error(`codex_router_policy_config_entry_missing:${moduleEntry}`);
    }

    const policyPath = resolveCodexRouterPolicyFile(options.routerRoot, options.policyPath);
    if (!fs.existsSync(policyPath)) {
        throw new Error(`codex_router_policy_file_missing:${policyPath}`);
    }

    const policyConfigModule = await import(pathToFileURL(moduleEntry).href);
    if (typeof policyConfigModule.loadPolicyFromFile !== 'function') {
        throw new Error('codex_router_policy_loader_missing');
    }

    return policyConfigModule.loadPolicyFromFile(policyPath);
}

function pickVcpChatCodexRouterBindings(bindings = {}) {
    const selected = {};
    for (const method of [
        ...REQUIRED_RUNTIME_METHODS,
        ...REQUIRED_MEMORY_METHODS,
        ...OPTIONAL_MEMORY_METHODS,
    ]) {
        if (typeof bindings[method] === 'function') {
            selected[method] = bindings[method];
        }
    }
    return selected;
}

function summarizeVcpChatCodexRouterBindingCoverage(bindings = {}) {
    const selected = pickVcpChatCodexRouterBindings(bindings);
    const wiredMethods = Object.keys(selected);
    const wiredSet = new Set(wiredMethods);

    return {
        wiredMethods,
        pendingRuntimeMethods: REQUIRED_RUNTIME_METHODS.filter((method) => !wiredSet.has(method)),
        pendingMemoryMethods: REQUIRED_MEMORY_METHODS.filter((method) => !wiredSet.has(method)),
        pendingOptionalMemoryMethods: OPTIONAL_MEMORY_METHODS.filter((method) => !wiredSet.has(method)),
    };
}

function wireVcpChatCodexRouterHost(host, bindings = {}) {
    const selected = pickVcpChatCodexRouterBindings(bindings);
    for (const [method, implementation] of Object.entries(selected)) {
        host[method] = implementation;
    }
    return host;
}

function createVcpChatLocalBindings(options = {}) {
    return {
        read_thread_terminal: createVcpChatReadThreadTerminalBinding(options),
        spawn_agent: createVcpChatSpawnAgentBinding(options),
        wait_agent: createVcpChatWaitAgentBinding(options),
        send_input: createVcpChatSendInputBinding(options),
        close_agent: createVcpChatCloseAgentBinding(options),
        shell_command: createVcpChatShellCommandBinding(options),
        apply_patch: createVcpChatApplyPatchBinding(options),
        automation_update: createVcpChatAutomationUpdateBinding(options),
    };
}

function createVcpChatRecommendedBindings(options = {}) {
    return mergeVcpChatCodexRouterBindings(
        createVcpChatLocalBindings(options),
        createVcpToolBoxMemoryBindings(options.memory || options)
    );
}

function createVcpChatMemoryBindings(operations = {}) {
    const bindings = {};

    if (typeof operations.record_memory === 'function') {
        bindings.record_memory = (input) => operations.record_memory(input);
    }

    if (typeof operations.search_memory === 'function') {
        bindings.search_memory = (input) => operations.search_memory(input);
    }

    if (typeof operations.memory_overview === 'function') {
        bindings.memory_overview = (input) => operations.memory_overview(input);
    }

    return bindings;
}

function mergeVcpChatCodexRouterBindings(...bindingSets) {
    return Object.assign({}, ...bindingSets.filter(Boolean));
}

function resolveVcpToolBoxRoot(explicitRoot) {
    const candidate = explicitRoot || process.env.VCP_TOOLBOX_ROOT || DEFAULT_VCP_TOOLBOX_ROOT;
    return path.resolve(candidate);
}

function resolveVcpToolBoxConfigPath(explicitRoot) {
    return path.join(resolveVcpToolBoxRoot(explicitRoot), 'config.env');
}

function resolveVcpToolBoxMemoryBaseUrl(options = {}) {
    if (typeof options.baseUrl === 'string' && options.baseUrl.trim() !== '') {
        return stripTrailingSlash(options.baseUrl.trim());
    }

    const port = readVcpToolBoxPort(options.toolboxRoot);
    return `http://127.0.0.1:${port}${DEFAULT_VCP_TOOLBOX_MEMORY_PATH}`;
}

function readVcpToolBoxPort(explicitRoot) {
    const configPath = resolveVcpToolBoxConfigPath(explicitRoot);
    try {
        const content = fs.readFileSync(configPath, 'utf8');
        const match = content.match(/^\s*PORT\s*=\s*(\d+)\s*$/m);
        if (match && match[1]) {
            return match[1];
        }
    } catch (error) {
        // Ignore and fall through to default.
    }
    return '6005';
}

function createVcpToolBoxMemoryBindings(options = {}) {
    const baseUrl = resolveVcpToolBoxMemoryBaseUrl(options);
    const authToken = typeof options.authToken === 'string' && options.authToken.trim() !== ''
        ? options.authToken.trim()
        : null;

    return createVcpChatMemoryBindings({
        async record_memory(input) {
            return callVcpToolBoxMemoryTool(baseUrl, 'record_memory', input, authToken);
        },
        async search_memory(input) {
            const result = await callVcpToolBoxMemoryTool(baseUrl, 'search_memory', input, authToken);
            return result;
        },
        async memory_overview(input) {
            return callVcpToolBoxMemoryTool(baseUrl, 'memory_overview', input || {}, authToken);
        },
    });
}

async function callVcpToolBoxMemoryTool(baseUrl, toolName, args, authToken = null) {
    const response = await fetch(baseUrl, {
        method: 'POST',
        headers: buildVcpToolBoxMemoryHeaders(authToken),
        body: JSON.stringify({
            jsonrpc: '2.0',
            id: `${toolName}-${Date.now()}`,
            method: 'tools/call',
            params: {
                name: toolName,
                arguments: args || {},
            },
        }),
    });

    const responseText = await response.text();
    let payload = null;
    if (responseText) {
        try {
            payload = JSON.parse(responseText);
        } catch (error) {
            payload = {
                status: response.status,
                raw: responseText,
            };
        }
    }

    if (!response.ok) {
        throw new Error(
            `vcp_toolbox_memory_http_error:${response.status}:${extractVcpToolBoxMemoryError(payload)}`
        );
    }

    if (payload && payload.error) {
        throw new Error(
            `vcp_toolbox_memory_rpc_error:${payload.error.message || 'unknown_error'}`
        );
    }

    const structuredContent = payload?.result?.structuredContent;
    if (structuredContent !== undefined) {
        return structuredContent;
    }

    return payload?.result;
}

function buildVcpToolBoxMemoryHeaders(authToken) {
    return {
        'content-type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    };
}

function extractVcpToolBoxMemoryError(payload) {
    if (payload?.error?.message) {
        return payload.error.message;
    }
    if (payload?.error) {
        return String(payload.error);
    }
    if (payload?.raw) {
        return String(payload.raw);
    }
    return 'request_failed';
}

function stripTrailingSlash(value) {
    return value.endsWith('/') ? value.slice(0, -1) : value;
}

function createVcpChatReadThreadTerminalBinding(options = {}) {
    const root = path.resolve(options.vcpChatRoot || DEFAULT_VCPCHAT_ROOT);
    const maxFiles = normalizePositiveInteger(options.maxFiles, DEFAULT_TERMINAL_LOG_FILES);
    const maxBytes = normalizePositiveInteger(options.maxBytes, DEFAULT_TERMINAL_LOG_BYTES);

    return async function readThreadTerminal() {
        const logFiles = listRecentVcpChatLogFiles(root, maxFiles);
        if (logFiles.length === 0) {
            return {
                terminalOutput: '',
                payload: {
                    root,
                    files: [],
                },
                summary: 'no VCPChat log files found',
            };
        }

        const payloadFiles = logFiles.map((entry) => ({
            path: entry.path,
            mtimeMs: entry.mtimeMs,
            size: entry.size,
            text: tailFile(entry.path, maxBytes),
        }));
        const terminalOutput = payloadFiles
            .map((entry) => `# ${path.basename(entry.path)}\n${entry.text}`)
            .join('\n\n');

        return {
            terminalOutput,
            payload: {
                root,
                files: payloadFiles.map(({ path: filePath, mtimeMs, size }) => ({
                    path: filePath,
                    mtimeMs,
                    size,
                })),
            },
            summary: `loaded ${payloadFiles.length} VCPChat log file(s)`,
        };
    };
}

function createVcpChatShellCommandBinding(options = {}) {
    const defaultWorkdir = path.resolve(options.defaultWorkdir || DEFAULT_VCPCHAT_ROOT);
    const defaultTimeoutMs = normalizePositiveInteger(
        options.defaultTimeoutMs,
        DEFAULT_SHELL_COMMAND_TIMEOUT_MS
    );

    return async function shellCommand(request = {}) {
        const command = typeof request.command === 'string' ? request.command.trim() : '';
        if (!command) {
            throw new Error('vcpchat_shell_command_requires_command');
        }

        const timeoutMs = normalizePositiveInteger(request.timeout_ms, defaultTimeoutMs);
        const workdir = path.resolve(request.workdir || defaultWorkdir);
        return runShellCommand(command, {
            cwd: workdir,
            timeoutMs,
            env: {
                ...process.env,
                ...(request.env && typeof request.env === 'object' ? request.env : {}),
            },
        });
    };
}

function createVcpChatApplyPatchBinding(options = {}) {
    const patchRoot = path.resolve(options.defaultPatchRoot || options.defaultWorkdir || DEFAULT_VCPCHAT_ROOT);

    return async function applyPatch(patch) {
        if (typeof patch !== 'string' || patch.trim() === '') {
            throw new Error('vcpchat_apply_patch_requires_patch');
        }

        const parsedPatch = parseCodexApplyPatch(patch);
        if (parsedPatch.hunks.length === 0) {
            return {
                changedFiles: 0,
                summary: 'no file operations found in patch',
            };
        }

        const changes = processCodexPatchHunks(parsedPatch.hunks, patchRoot);
        applyCodexPatchChanges(changes, patchRoot);

        return {
            changedFiles: changes.length,
            summary: `applied ${changes.length} file change(s) in ${patchRoot}`,
            changes: changes.map((change) => ({
                type: change.type,
                path: change.path,
                ...(change.movePath ? { movePath: change.movePath } : {}),
            })),
        };
    };
}

function createVcpChatAutomationUpdateBinding(options = {}) {
    const storePath = path.resolve(options.automationStorePath || DEFAULT_VCPCHAT_AUTOMATION_STORE);

    return async function automationUpdate(request = {}) {
        const mode = typeof request.mode === 'string' ? request.mode.trim() : '';
        if (!mode) {
            throw new Error('vcpchat_automation_update_requires_mode');
        }

        const store = readVcpChatAutomationStore(storePath);

        switch (mode) {
            case 'view':
                return viewVcpChatAutomation(store, request);
            case 'delete':
                return deleteVcpChatAutomation(storePath, store, request);
            case 'create':
            case 'suggested_create':
                return upsertVcpChatAutomation(storePath, store, request, { create: true, suggested: mode === 'suggested_create' });
            case 'update':
            case 'suggested_update':
                return upsertVcpChatAutomation(storePath, store, request, { create: false, suggested: mode === 'suggested_update' });
            default:
                throw new Error(`vcpchat_automation_update_unsupported_mode:${mode}`);
        }
    };
}

function createVcpChatSpawnAgentBinding(options = {}) {
    return async function spawnAgent(request = {}) {
        const command = typeof request.message === 'string' ? request.message.trim() : '';
        if (!command) {
            throw new Error('vcpchat_spawn_agent_requires_message');
        }

        const plugin = loadVcpChatPtyShellExecutor();
        const mode = typeof request.mode === 'string' ? request.mode.trim().toLowerCase() : 'interactive';

        if (mode === 'async') {
            const result = await plugin.processToolCall({
                action: 'async',
                command,
                ...(typeof request.workdir === 'string' ? { cwd: request.workdir } : {}),
                ...(typeof request.cwd === 'string' ? { cwd: request.cwd } : {}),
                ...(typeof request.shell === 'string' ? { shell: request.shell } : {}),
            });

            return {
                agentId: result?.taskId,
                nickname: 'vcpchat-pty-agent',
                status: result?.status,
                summary: result?.message || 'spawned PTY shell task',
                payload: result,
            };
        }

        const existingSession = typeof plugin.getInteractiveSessionState === 'function'
            ? plugin.getInteractiveSessionState()
            : null;
        if (existingSession?.connected && existingSession?.sessionId) {
            throw new Error(`vcpchat_spawn_agent_interactive_session_busy:${existingSession.sessionId}`);
        }

        const session = plugin.ensureInteractiveSession({
            newSession: true,
            ...(typeof request.shell === 'string' ? { shell: request.shell } : {}),
        });
        plugin.sendInteractiveInput(buildInteractiveAgentBootstrapInput(request, command, session?.shellName));
        const snapshot = plugin.getInteractiveSessionState();

        return {
            agentId: snapshot?.sessionId,
            nickname: 'vcpchat-pty-agent',
            status: snapshot?.connected ? 'running' : 'unknown',
            summary: session?.sessionId
                ? `spawned interactive PTY session ${session.sessionId}`
                : 'spawned interactive PTY session',
            payload: snapshot,
        };
    };
}

function createVcpChatWaitAgentBinding(options = {}) {
    return async function waitAgent(request = {}) {
        const taskId = Array.isArray(request.targets) ? request.targets[0] : undefined;
        if (typeof taskId !== 'string' || taskId.trim() === '') {
            throw new Error('vcpchat_wait_agent_requires_target');
        }

        const plugin = loadVcpChatPtyShellExecutor();
        if (isInteractivePtyAgentId(taskId) && typeof plugin.getInteractiveSessionState === 'function') {
            const state = plugin.getInteractiveSessionState();
            if (!state?.connected || state?.sessionId !== taskId) {
                return {
                    agentId: taskId,
                    status: 'closed',
                    message: `interactive session ${taskId} is not active`,
                    payload: state || null,
                };
            }

            return {
                agentId: taskId,
                status: 'running',
                message: buildInteractiveSessionStatusMessage(state),
                payload: state,
            };
        }

        const result = await plugin.processToolCall({
            action: 'query',
            taskId,
        });

        return {
            agentId: taskId,
            status: result?.status,
            message: buildVcpChatAgentStatusMessage(result),
            payload: result,
        };
    };
}

function createVcpChatSendInputBinding(options = {}) {
    return async function sendInput(request = {}) {
        const target = typeof request.target === 'string' ? request.target.trim() : '';
        if (!target) {
            throw new Error('vcpchat_send_input_requires_target');
        }

        if (!isInteractivePtyAgentId(target)) {
            throw new Error(`vcpchat_send_input_unsupported_target:${target}`);
        }

        const message = extractAgentInputMessage(request);
        if (!message) {
            throw new Error('vcpchat_send_input_requires_message');
        }

        const plugin = loadVcpChatPtyShellExecutor();
        const state = typeof plugin.getInteractiveSessionState === 'function'
            ? plugin.getInteractiveSessionState()
            : null;
        if (!state?.connected || state?.sessionId !== target) {
            throw new Error(`vcpchat_send_input_target_not_active:${target}`);
        }

        if (request.interrupt === true) {
            plugin.sendInteractiveInput('\u0003');
        }

        plugin.sendInteractiveInput(ensureShellInputTerminator(message, state?.shellName));
        const snapshot = plugin.getInteractiveSessionState();

        return {
            agentId: target,
            status: snapshot?.connected ? 'running' : 'unknown',
            message: 'input sent to interactive PTY session',
            payload: snapshot,
        };
    };
}

function createVcpChatCloseAgentBinding(options = {}) {
    return async function closeAgent(request = {}) {
        const target = typeof request.target === 'string' ? request.target.trim() : '';
        if (!target) {
            throw new Error('vcpchat_close_agent_requires_target');
        }

        const plugin = loadVcpChatPtyShellExecutor();
        if (isInteractivePtyAgentId(target) && typeof plugin.closeInteractiveSession === 'function') {
            const result = plugin.closeInteractiveSession({ sessionId: target });
            return {
                agentId: target,
                status: result?.status,
                message: result?.message || 'interactive session close request sent',
                payload: result,
            };
        }

        const result = await plugin.processToolCall({
            action: 'cancel',
            taskId: target,
        });

        return {
            agentId: target,
            status: result?.status,
            message: result?.message || 'close request sent',
            payload: result,
        };
    };
}

function loadVcpChatPtyShellExecutor() {
    const entry = path.join(
        DEFAULT_VCPCHAT_ROOT,
        'VCPDistributedServer',
        'Plugin',
        'PTYShellExecutor',
        'PTYShellExecutor.js'
    );

    if (!fs.existsSync(entry)) {
        throw new Error(`vcpchat_pty_shell_executor_missing:${entry}`);
    }

    return require(entry);
}

function buildVcpChatAgentStatusMessage(result) {
    if (!result || typeof result !== 'object') {
        return undefined;
    }

    const status = typeof result.status === 'string' ? result.status : 'unknown';
    const exitCode = result.exitCode;
    if (typeof exitCode === 'number') {
        return `task ${status} with exitCode ${exitCode}`;
    }
    return `task ${status}`;
}

function buildInteractiveSessionStatusMessage(state) {
    if (!state || typeof state !== 'object') {
        return 'interactive session state unavailable';
    }

    const pid = typeof state.pid === 'number' ? ` pid=${state.pid}` : '';
    const mode = typeof state.mode === 'string' ? ` mode=${state.mode}` : '';
    return `interactive session running${pid}${mode}`;
}

function isInteractivePtyAgentId(value) {
    return typeof value === 'string' && value.startsWith(PTY_INTERACTIVE_AGENT_ID_PREFIX);
}

function extractAgentInputMessage(request = {}) {
    if (typeof request.message === 'string' && request.message.trim() !== '') {
        return request.message;
    }

    if (Array.isArray(request.items)) {
        const textParts = request.items
            .filter((item) => item && item.type === 'text' && typeof item.text === 'string')
            .map((item) => item.text)
            .filter(Boolean);
        if (textParts.length > 0) {
            return textParts.join('\n');
        }
    }

    return '';
}

function ensureShellInputTerminator(value, shellName) {
    const lineEnding = getInteractiveShellLineEnding(shellName);
    if (value.endsWith('\r\n') || value.endsWith('\n') || value.endsWith('\r')) {
        return value;
    }
    return `${value}${lineEnding}`;
}

function buildInteractiveAgentBootstrapInput(request, command, shellName) {
    const parts = [];
    const workdir = typeof request.workdir === 'string' && request.workdir.trim() !== ''
        ? request.workdir.trim()
        : (typeof request.cwd === 'string' && request.cwd.trim() !== '' ? request.cwd.trim() : '');

    if (workdir) {
        parts.push(`cd ${quotePosixShellArgument(workdir)}`);
    }
    parts.push(command);
    return `${parts.join(getInteractiveShellLineEnding(shellName))}${getInteractiveShellLineEnding(shellName)}`;
}

function quotePosixShellArgument(value) {
    return `'${String(value).replace(/'/g, `'\"'\"'`)}'`;
}

function getInteractiveShellLineEnding(shellName) {
    const normalized = typeof shellName === 'string' ? shellName.toLowerCase() : '';
    if (
        process.platform === 'win32'
        || normalized.includes('powershell')
        || normalized.includes('pwsh')
        || normalized.includes('cmd')
    ) {
        return '\r';
    }
    return '\n';
}

function parseCodexApplyPatch(patch) {
    const trimmedPatch = patch.trim();
    if (!trimmedPatch) {
        throw new Error('vcpchat_apply_patch_empty_patch');
    }

    const lines = trimmedPatch.replace(/\r\n/g, '\n').split('\n');
    let effectiveLines = lines;

    if (lines.length >= 4) {
        const firstLine = lines[0];
        const lastLine = lines[lines.length - 1];
        if (
            (firstLine === '<<EOF' || firstLine === "<<'EOF'" || firstLine === '<<"EOF"')
            && typeof lastLine === 'string'
            && lastLine.endsWith('EOF')
        ) {
            effectiveLines = lines.slice(1, lines.length - 1);
        }
    }

    checkPatchBoundaries(effectiveLines);

    const hunks = [];
    let remainingLines = effectiveLines.slice(1, effectiveLines.length - 1);
    let lineNumber = 2;

    while (remainingLines.length > 0) {
        const { hunk, linesConsumed } = parsePatchHunk(remainingLines, lineNumber);
        hunks.push(hunk);
        lineNumber += linesConsumed;
        remainingLines = remainingLines.slice(linesConsumed);
    }

    return {
        hunks,
        patch: effectiveLines.join('\n'),
    };
}

function checkPatchBoundaries(lines) {
    if (!Array.isArray(lines) || lines.length === 0) {
        throw new Error('vcpchat_apply_patch_empty_patch');
    }

    const firstLine = lines[0]?.trim();
    const lastLine = lines[lines.length - 1]?.trim();
    if (firstLine !== BEGIN_PATCH_MARKER) {
        throw new Error('vcpchat_apply_patch_missing_begin_marker');
    }
    if (lastLine !== END_PATCH_MARKER) {
        throw new Error('vcpchat_apply_patch_missing_end_marker');
    }
}

function parsePatchHunk(lines, lineNumber) {
    const firstLine = lines[0]?.trim();

    if (firstLine?.startsWith(ADD_FILE_MARKER)) {
        const filePath = firstLine.substring(ADD_FILE_MARKER.length);
        let contents = '';
        let parsedLines = 1;

        for (let index = 1; index < lines.length; index += 1) {
            const line = lines[index];
            if (typeof line === 'string' && line.startsWith('+')) {
                contents += line.substring(1) + '\n';
                parsedLines += 1;
                continue;
            }
            break;
        }

        return {
            hunk: { type: 'AddFile', path: filePath, contents },
            linesConsumed: parsedLines,
        };
    }

    if (firstLine?.startsWith(DELETE_FILE_MARKER)) {
        return {
            hunk: { type: 'DeleteFile', path: firstLine.substring(DELETE_FILE_MARKER.length) },
            linesConsumed: 1,
        };
    }

    if (firstLine?.startsWith(UPDATE_FILE_MARKER)) {
        const filePath = firstLine.substring(UPDATE_FILE_MARKER.length);
        let remainingLines = lines.slice(1);
        let parsedLines = 1;
        let movePath = null;

        if (remainingLines[0]?.startsWith(MOVE_TO_MARKER)) {
            movePath = remainingLines[0].substring(MOVE_TO_MARKER.length);
            remainingLines = remainingLines.slice(1);
            parsedLines += 1;
        }

        const chunks = [];
        while (remainingLines.length > 0) {
            if (remainingLines[0]?.trim() === '') {
                remainingLines = remainingLines.slice(1);
                parsedLines += 1;
                continue;
            }

            if (remainingLines[0]?.startsWith('***')) {
                break;
            }

            const { chunk, linesConsumed } = parseUpdateFileChunk(
                remainingLines,
                lineNumber + parsedLines,
                chunks.length === 0
            );
            chunks.push(chunk);
            parsedLines += linesConsumed;
            remainingLines = remainingLines.slice(linesConsumed);
        }

        if (chunks.length === 0) {
            throw new Error(`vcpchat_apply_patch_empty_update_hunk:${filePath}:${lineNumber}`);
        }

        return {
            hunk: { type: 'UpdateFile', path: filePath, movePath, chunks },
            linesConsumed: parsedLines,
        };
    }

    throw new Error(`vcpchat_apply_patch_invalid_hunk_header:${lineNumber}:${firstLine}`);
}

function parseUpdateFileChunk(lines, lineNumber, allowMissingContext) {
    if (!Array.isArray(lines) || lines.length === 0) {
        throw new Error(`vcpchat_apply_patch_empty_update_chunk:${lineNumber}`);
    }

    let changeContext = null;
    let startIndex = 0;
    if (lines[0] === EMPTY_CHANGE_CONTEXT_MARKER) {
        startIndex = 1;
    } else if (lines[0]?.startsWith(CHANGE_CONTEXT_MARKER)) {
        changeContext = lines[0].substring(CHANGE_CONTEXT_MARKER.length);
        startIndex = 1;
    } else if (!allowMissingContext) {
        throw new Error(`vcpchat_apply_patch_missing_update_context:${lineNumber}:${lines[0]}`);
    }

    if (startIndex >= lines.length) {
        throw new Error(`vcpchat_apply_patch_empty_update_chunk:${lineNumber}`);
    }

    const chunk = {
        changeContext,
        oldLines: [],
        newLines: [],
        isEndOfFile: false,
    };

    let parsedLines = 0;
    for (let index = startIndex; index < lines.length; index += 1) {
        const line = lines[index];
        if (line === EOF_MARKER) {
            if (parsedLines === 0) {
                throw new Error(`vcpchat_apply_patch_empty_update_chunk:${lineNumber}`);
            }
            chunk.isEndOfFile = true;
            parsedLines += 1;
            break;
        }

        if (line === '') {
            chunk.oldLines.push('');
            chunk.newLines.push('');
            parsedLines += 1;
            continue;
        }

        const firstChar = line.charAt(0);
        switch (firstChar) {
            case ' ':
                chunk.oldLines.push(line.substring(1));
                chunk.newLines.push(line.substring(1));
                parsedLines += 1;
                break;
            case '+':
                chunk.newLines.push(line.substring(1));
                parsedLines += 1;
                break;
            case '-':
                chunk.oldLines.push(line.substring(1));
                parsedLines += 1;
                break;
            default:
                if (parsedLines === 0) {
                    throw new Error(`vcpchat_apply_patch_invalid_update_line:${lineNumber}:${line}`);
                }
                return {
                    chunk,
                    linesConsumed: parsedLines + startIndex,
                };
        }
    }

    return {
        chunk,
        linesConsumed: parsedLines + startIndex,
    };
}

function processCodexPatchHunks(hunks, root) {
    const state = new Map();
    const changes = [];

    for (const hunk of hunks) {
        const change = processCodexPatchHunk(hunk, root, state);
        changes.push(change);
        updatePatchState(state, change);
    }

    return changes;
}

function processCodexPatchHunk(hunk, root, state) {
    switch (hunk.type) {
        case 'AddFile':
            assertPatchPathMissing(state, root, hunk.path);
            return {
                type: 'add',
                path: normalizePatchPath(hunk.path),
                newContent: hunk.contents,
            };
        case 'DeleteFile': {
            const filePath = normalizePatchPath(hunk.path);
            return {
                type: 'delete',
                path: filePath,
                originalContent: readPatchContent(state, root, filePath),
            };
        }
        case 'UpdateFile': {
            const filePath = normalizePatchPath(hunk.path);
            const originalContent = readPatchContent(state, root, filePath);
            return {
                type: 'update',
                path: filePath,
                movePath: hunk.movePath ? normalizePatchPath(hunk.movePath) : undefined,
                originalContent,
                newContent: applyChunksToContent(originalContent, filePath, hunk.chunks),
            };
        }
        default:
            throw new Error(`vcpchat_apply_patch_unknown_hunk_type:${hunk.type}`);
    }
}

function updatePatchState(state, change) {
    switch (change.type) {
        case 'add':
            state.set(change.path, {
                exists: true,
                content: change.newContent,
            });
            break;
        case 'delete':
            state.set(change.path, {
                exists: false,
                content: null,
            });
            break;
        case 'update':
            state.set(change.path, {
                exists: change.movePath ? false : true,
                content: change.movePath ? null : change.newContent,
            });
            if (change.movePath) {
                state.set(change.movePath, {
                    exists: true,
                    content: change.newContent,
                });
            }
            break;
        default:
            throw new Error(`vcpchat_apply_patch_unknown_change_type:${change.type}`);
    }
}

function readPatchContent(state, root, filePath) {
    const normalizedPath = normalizePatchPath(filePath);
    const currentState = state.get(normalizedPath);
    if (currentState) {
        if (!currentState.exists) {
            throw new Error(`vcpchat_apply_patch_missing_source:${normalizedPath}`);
        }
        return currentState.content;
    }

    const absolutePath = resolvePatchPath(root, normalizedPath);
    if (!fs.existsSync(absolutePath)) {
        throw new Error(`vcpchat_apply_patch_missing_source:${normalizedPath}`);
    }
    return fs.readFileSync(absolutePath, 'utf8');
}

function assertPatchPathMissing(state, root, filePath) {
    const normalizedPath = normalizePatchPath(filePath);
    const currentState = state.get(normalizedPath);
    if (currentState) {
        if (currentState.exists) {
            throw new Error(`vcpchat_apply_patch_add_target_exists:${normalizedPath}`);
        }
        return;
    }

    const absolutePath = resolvePatchPath(root, normalizedPath);
    if (fs.existsSync(absolutePath)) {
        throw new Error(`vcpchat_apply_patch_add_target_exists:${normalizedPath}`);
    }
}

function applyChunksToContent(originalContent, filePath, chunks) {
    let originalLines = originalContent.replace(/\r\n/g, '\n').split('\n');
    if (originalLines.length > 0 && originalLines[originalLines.length - 1] === '') {
        originalLines = originalLines.slice(0, -1);
    }

    const replacements = computeReplacements(originalLines, filePath, chunks);
    let newLines = applyReplacements(originalLines, replacements);
    if (newLines.length === 0 || newLines[newLines.length - 1] !== '') {
        newLines = [...newLines, ''];
    }
    return newLines.join('\n');
}

function computeReplacements(originalLines, filePath, chunks) {
    const replacements = [];
    let lineIndex = 0;

    for (const chunk of chunks) {
        if (chunk.changeContext !== null) {
            const contextIndex = seekSequence(originalLines, [chunk.changeContext], lineIndex, false);
            if (contextIndex === null) {
                throw new Error(`vcpchat_apply_patch_missing_context:${filePath}:${chunk.changeContext}`);
            }
            lineIndex = contextIndex + 1;
        }

        if (chunk.oldLines.length === 0) {
            const insertionIndex = originalLines.length > 0 && originalLines[originalLines.length - 1] === ''
                ? originalLines.length - 1
                : originalLines.length;
            replacements.push([insertionIndex, 0, chunk.newLines]);
            continue;
        }

        let pattern = chunk.oldLines;
        let newSlice = chunk.newLines;
        let found = seekSequence(originalLines, pattern, lineIndex, chunk.isEndOfFile);

        if (found === null && pattern.length > 0 && pattern[pattern.length - 1] === '') {
            pattern = pattern.slice(0, -1);
            if (newSlice.length > 0 && newSlice[newSlice.length - 1] === '') {
                newSlice = newSlice.slice(0, -1);
            }
            found = seekSequence(originalLines, pattern, lineIndex, chunk.isEndOfFile);
        }

        if (found === null) {
            throw new Error(`vcpchat_apply_patch_expected_lines_not_found:${filePath}`);
        }

        replacements.push([found, pattern.length, newSlice]);
        lineIndex = found + pattern.length;
    }

    replacements.sort((left, right) => left[0] - right[0]);
    return replacements;
}

function applyReplacements(lines, replacements) {
    const result = [...lines];
    for (let index = replacements.length - 1; index >= 0; index -= 1) {
        const [startIndex, oldLength, newSegment] = replacements[index];
        result.splice(startIndex, oldLength, ...newSegment);
    }
    return result;
}

function seekSequence(lines, pattern, startIndex, endOfFile) {
    if (pattern.length === 0) {
        return startIndex;
    }
    if (pattern.length > lines.length) {
        return null;
    }

    const effectiveStart = endOfFile && lines.length >= pattern.length
        ? lines.length - pattern.length
        : startIndex;
    const maxStart = lines.length - pattern.length;

    for (let index = effectiveStart; index <= maxStart; index += 1) {
        if (exactMatch(lines, pattern, index)) {
            return index;
        }
    }
    for (let index = effectiveStart; index <= maxStart; index += 1) {
        if (trimEndMatch(lines, pattern, index)) {
            return index;
        }
    }
    for (let index = effectiveStart; index <= maxStart; index += 1) {
        if (trimMatch(lines, pattern, index)) {
            return index;
        }
    }
    for (let index = effectiveStart; index <= maxStart; index += 1) {
        if (normalizedMatch(lines, pattern, index)) {
            return index;
        }
    }

    return null;
}

function exactMatch(lines, pattern, startIndex) {
    for (let index = 0; index < pattern.length; index += 1) {
        if (lines[startIndex + index] !== pattern[index]) {
            return false;
        }
    }
    return true;
}

function trimEndMatch(lines, pattern, startIndex) {
    for (let index = 0; index < pattern.length; index += 1) {
        if (lines[startIndex + index]?.trimEnd() !== pattern[index]?.trimEnd()) {
            return false;
        }
    }
    return true;
}

function trimMatch(lines, pattern, startIndex) {
    for (let index = 0; index < pattern.length; index += 1) {
        if (lines[startIndex + index]?.trim() !== pattern[index]?.trim()) {
            return false;
        }
    }
    return true;
}

function normalizedMatch(lines, pattern, startIndex) {
    for (let index = 0; index < pattern.length; index += 1) {
        if (normalizePatchUnicode(lines[startIndex + index] ?? '') !== normalizePatchUnicode(pattern[index] ?? '')) {
            return false;
        }
    }
    return true;
}

function normalizePatchUnicode(value) {
    return value.trim().split('').map((character) => {
        if ('‐‑‒–—―−'.includes(character)) {
            return '-';
        }
        if ('‘’‚‛'.includes(character)) {
            return "'";
        }
        if ('“”„‟'.includes(character)) {
            return '"';
        }
        if ('\u00a0\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200A\u202F\u205F\u3000'.includes(character)) {
            return ' ';
        }
        return character;
    }).join('');
}

function applyCodexPatchChanges(changes, root) {
    for (const change of changes) {
        switch (change.type) {
            case 'add':
                writeAddedFile(root, change);
                break;
            case 'delete':
                deleteExistingFile(root, change);
                break;
            case 'update':
                writeUpdatedFile(root, change);
                break;
            default:
                throw new Error(`vcpchat_apply_patch_unknown_change_type:${change.type}`);
        }
    }
}

function writeAddedFile(root, change) {
    const absolutePath = resolvePatchPath(root, change.path);
    if (fs.existsSync(absolutePath)) {
        throw new Error(`vcpchat_apply_patch_add_target_exists:${change.path}`);
    }
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, change.newContent, 'utf8');
}

function deleteExistingFile(root, change) {
    const absolutePath = resolvePatchPath(root, change.path);
    if (!fs.existsSync(absolutePath)) {
        throw new Error(`vcpchat_apply_patch_delete_missing:${change.path}`);
    }
    fs.unlinkSync(absolutePath);
}

function writeUpdatedFile(root, change) {
    const absolutePath = resolvePatchPath(root, change.path);
    if (!fs.existsSync(absolutePath)) {
        throw new Error(`vcpchat_apply_patch_update_missing:${change.path}`);
    }

    if (change.movePath && change.movePath !== change.path) {
        const moveAbsolutePath = resolvePatchPath(root, change.movePath);
        if (fs.existsSync(moveAbsolutePath)) {
            throw new Error(`vcpchat_apply_patch_move_target_exists:${change.movePath}`);
        }
        fs.mkdirSync(path.dirname(moveAbsolutePath), { recursive: true });
        fs.writeFileSync(moveAbsolutePath, change.newContent, 'utf8');
        fs.unlinkSync(absolutePath);
        return;
    }

    fs.writeFileSync(absolutePath, change.newContent, 'utf8');
}

function normalizePatchPath(filePath) {
    if (typeof filePath !== 'string' || filePath.trim() === '') {
        throw new Error('vcpchat_apply_patch_invalid_path');
    }
    return filePath.trim().replace(/\//g, path.sep);
}

function resolvePatchPath(root, relativePath) {
    const absolutePath = path.resolve(root, relativePath);
    const relative = path.relative(root, absolutePath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error(`vcpchat_apply_patch_path_outside_root:${relativePath}`);
    }
    return absolutePath;
}

function listRecentVcpChatLogFiles(root, maxFiles) {
    try {
        return fs.readdirSync(root, { withFileTypes: true })
            .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.log'))
            .map((entry) => {
                const filePath = path.join(root, entry.name);
                const stats = fs.statSync(filePath);
                return {
                    path: filePath,
                    mtimeMs: stats.mtimeMs,
                    size: stats.size,
                };
            })
            .sort((left, right) => right.mtimeMs - left.mtimeMs)
            .slice(0, maxFiles);
    } catch (error) {
        return [];
    }
}

function readVcpChatAutomationStore(storePath) {
    try {
        if (!fs.existsSync(storePath)) {
            return { automations: [] };
        }

        const parsed = JSON.parse(fs.readFileSync(storePath, 'utf8'));
        if (!parsed || !Array.isArray(parsed.automations)) {
            return { automations: [] };
        }

        return {
            automations: parsed.automations.filter((item) => item && typeof item === 'object'),
        };
    } catch (error) {
        throw new Error(`vcpchat_automation_store_read_failed:${error.message}`);
    }
}

function writeVcpChatAutomationStore(storePath, store) {
    try {
        fs.mkdirSync(path.dirname(storePath), { recursive: true });
        fs.writeFileSync(storePath, JSON.stringify(store, null, 2), 'utf8');
    } catch (error) {
        throw new Error(`vcpchat_automation_store_write_failed:${error.message}`);
    }
}

function viewVcpChatAutomation(store, request) {
    const id = typeof request.id === 'string' ? request.id.trim() : '';
    if (!id) {
        throw new Error('vcpchat_automation_view_requires_id');
    }

    const automation = store.automations.find((item) => item.id === id);
    if (!automation) {
        throw new Error(`vcpchat_automation_not_found:${id}`);
    }

    return {
        automation,
        summary: `loaded automation ${id}`,
    };
}

function deleteVcpChatAutomation(storePath, store, request) {
    const id = typeof request.id === 'string' ? request.id.trim() : '';
    if (!id) {
        throw new Error('vcpchat_automation_delete_requires_id');
    }

    const nextAutomations = store.automations.filter((item) => item.id !== id);
    if (nextAutomations.length === store.automations.length) {
        throw new Error(`vcpchat_automation_not_found:${id}`);
    }

    writeVcpChatAutomationStore(storePath, { automations: nextAutomations });
    return {
        deleted: true,
        automation: { id },
        summary: `deleted automation ${id}`,
    };
}

function upsertVcpChatAutomation(storePath, store, request, options = {}) {
    const now = new Date().toISOString();
    const createMode = options.create === true;
    const id = createMode
        ? createVcpChatAutomationId()
        : (typeof request.id === 'string' ? request.id.trim() : '');

    if (!id) {
        throw new Error('vcpchat_automation_update_requires_id');
    }

    const existingIndex = store.automations.findIndex((item) => item.id === id);
    if (!createMode && existingIndex === -1) {
        throw new Error(`vcpchat_automation_not_found:${id}`);
    }

    if (createMode && existingIndex !== -1) {
        throw new Error(`vcpchat_automation_id_conflict:${id}`);
    }

    const previous = existingIndex >= 0 ? store.automations[existingIndex] : null;
    const nextAutomation = {
        ...(previous || {}),
        ...(extractVcpChatAutomationFields(request)),
        id,
        mode: request.mode,
        updatedAt: now,
        ...(options.suggested ? { suggested: true } : {}),
        ...(previous?.createdAt ? {} : { createdAt: now }),
    };

    const nextAutomations = store.automations.slice();
    if (existingIndex >= 0) {
        nextAutomations[existingIndex] = nextAutomation;
    } else {
        nextAutomations.push(nextAutomation);
    }

    writeVcpChatAutomationStore(storePath, { automations: nextAutomations });
    return {
        automation: nextAutomation,
        summary: `${createMode ? 'created' : 'updated'} automation ${id}`,
    };
}

function extractVcpChatAutomationFields(request = {}) {
    const fields = {};
    for (const key of [
        'name',
        'prompt',
        'rrule',
        'kind',
        'status',
        'destination',
        'targetThreadId',
        'cwds',
        'executionEnvironment',
        'model',
        'reasoningEffort',
        'localEnvironmentConfigPath'
    ]) {
        if (request[key] !== undefined) {
            fields[key] = request[key];
        }
    }
    return fields;
}

function createVcpChatAutomationId() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).slice(2, 8);
    return `vcpchat_automation_${timestamp}_${random}`;
}

function tailFile(filePath, maxBytes) {
    try {
        const stats = fs.statSync(filePath);
        const start = Math.max(0, stats.size - maxBytes);
        const length = stats.size - start;
        const fd = fs.openSync(filePath, 'r');
        try {
            const buffer = Buffer.alloc(length);
            fs.readSync(fd, buffer, 0, length, start);
            return buffer.toString('utf8').trim();
        } finally {
            fs.closeSync(fd);
        }
    } catch (error) {
        return '';
    }
}

function normalizePositiveInteger(value, fallback) {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : fallback;
}

function runShellCommand(command, options = {}) {
    const shell = resolvePlatformShell(command);

    return new Promise((resolve, reject) => {
        const child = spawn(shell.file, shell.args, {
            cwd: options.cwd,
            env: options.env || process.env,
            windowsHide: true,
            stdio: ['ignore', 'pipe', 'pipe'],
        });

        let stdout = '';
        let stderr = '';
        let settled = false;
        let timedOut = false;

        const timeoutId = setTimeout(() => {
            timedOut = true;
            child.kill();
        }, options.timeoutMs || DEFAULT_SHELL_COMMAND_TIMEOUT_MS);

        child.stdout.on('data', (chunk) => {
            stdout += chunk.toString();
        });

        child.stderr.on('data', (chunk) => {
            stderr += chunk.toString();
        });

        child.on('error', (error) => {
            if (settled) {
                return;
            }
            settled = true;
            clearTimeout(timeoutId);
            reject(error);
        });

        child.on('close', (code, signal) => {
            if (settled) {
                return;
            }
            settled = true;
            clearTimeout(timeoutId);

            resolve({
                exitCode: typeof code === 'number' ? code : (timedOut ? 124 : null),
                stdout: stdout.trimEnd(),
                stderr: stderr.trimEnd(),
                ...(signal ? { signal } : {}),
                ...(timedOut ? { timedOut: true } : {}),
            });
        });
    });
}

function resolvePlatformShell(command) {
    if (process.platform === 'win32') {
        return {
            file: 'powershell.exe',
            args: ['-NoProfile', '-NonInteractive', '-Command', command],
        };
    }

    const shellPath = process.env.SHELL || '/bin/sh';
    return {
        file: shellPath,
        args: ['-lc', command],
    };
}

async function createVcpChatCodexRouterHostSkeleton(options = {}) {
    const codexRouter = await loadCodexRouterHostClientModule(options);
    const starter = codexRouter.createCodexDesktopTargetHostEmbeddingStarter({
        policy: options.policy,
        anchor: options.anchor || DEFAULT_ANCHOR,
        ...(options.directiveBuilders ? { directiveBuilders: options.directiveBuilders } : {}),
        ...(options.directives ? { directives: options.directives } : {}),
        ...(options.availableAgents !== undefined
            ? { availableAgents: options.availableAgents }
            : {}),
        ...(options.preflight ? { preflight: options.preflight } : {}),
        ...(options.telemetryStore ? { telemetryStore: options.telemetryStore } : {}),
    });

    wireVcpChatCodexRouterHost(starter.host, options.bindings);
    return starter;
}

async function createVcpChatCodexRouterBundle(options = {}) {
    const starter = await createVcpChatCodexRouterHostSkeleton(options);
    if (options.assertReady !== false) {
        starter.assertReady();
    }

    return {
        starter,
        bundle: starter.createBundle(),
    };
}

module.exports = {
    DEFAULT_ANCHOR,
    DEFAULT_CODEX_ROUTER_ROOT,
    DEFAULT_POLICY_FILE,
    DEFAULT_VCPCHAT_ROOT,
    DEFAULT_VCP_WORKSPACE_ROOT,
    DEFAULT_VCP_TOOLBOX_ROOT,
    REQUIRED_RUNTIME_METHODS,
    REQUIRED_MEMORY_METHODS,
    OPTIONAL_MEMORY_METHODS,
    DEFAULT_TERMINAL_LOG_BYTES,
    DEFAULT_TERMINAL_LOG_FILES,
    DEFAULT_SHELL_COMMAND_TIMEOUT_MS,
    DEFAULT_VCP_TOOLBOX_MEMORY_PATH,
    DEFAULT_VCPCHAT_AUTOMATION_STORE,
    resolveCodexRouterRoot,
    resolveCodexRouterHostClientEntry,
    resolveCodexRouterPolicyConfigEntry,
    resolveCodexRouterPolicyFile,
    resolveVcpToolBoxRoot,
    resolveVcpToolBoxConfigPath,
    resolveVcpToolBoxMemoryBaseUrl,
    readVcpToolBoxPort,
    loadCodexRouterHostClientModule,
    loadVcpChatCodexRouterPolicy,
    pickVcpChatCodexRouterBindings,
    summarizeVcpChatCodexRouterBindingCoverage,
    wireVcpChatCodexRouterHost,
    createVcpChatLocalBindings,
    createVcpChatRecommendedBindings,
    createVcpChatMemoryBindings,
    mergeVcpChatCodexRouterBindings,
    createVcpToolBoxMemoryBindings,
    callVcpToolBoxMemoryTool,
    createVcpChatReadThreadTerminalBinding,
    createVcpChatSpawnAgentBinding,
    createVcpChatWaitAgentBinding,
    createVcpChatCloseAgentBinding,
    createVcpChatShellCommandBinding,
    createVcpChatApplyPatchBinding,
    createVcpChatAutomationUpdateBinding,
    listRecentVcpChatLogFiles,
    tailFile,
    createVcpChatCodexRouterHostSkeleton,
    createVcpChatCodexRouterBundle,
};
