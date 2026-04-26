const path = require('path');

function createPluginRoots(pluginRoot) {
    if (!pluginRoot) {
        throw new Error('pluginRoot is required');
    }

    const normalizedPluginRoot = path.resolve(pluginRoot);
    const serverRoot = path.resolve(normalizedPluginRoot, '..', '..');
    const workspaceRoot = path.resolve(serverRoot, '..');

    return {
        workspaceRoot,
        serverRoot,
        pluginRoot: normalizedPluginRoot,
        runtimeDataRoot: path.join(workspaceRoot, 'AppData'),
    };
}

function createServerRoots(serverRoot) {
    if (!serverRoot) {
        throw new Error('serverRoot is required');
    }

    const normalizedServerRoot = path.resolve(serverRoot);
    const workspaceRoot = path.resolve(normalizedServerRoot, '..');

    return {
        workspaceRoot,
        serverRoot: normalizedServerRoot,
        runtimeDataRoot: path.join(workspaceRoot, 'AppData'),
    };
}

function expandTemplatePath(rawValue, roots) {
    if (typeof rawValue !== 'string') {
        return rawValue;
    }

    const trimmed = rawValue.trim();
    if (!trimmed) {
        return trimmed;
    }

    if (trimmed.startsWith('<workspace>')) {
        return path.join(roots.workspaceRoot, trimmed.slice('<workspace>'.length));
    }

    if (trimmed.startsWith('<runtime>')) {
        return path.join(roots.runtimeDataRoot, trimmed.slice('<runtime>'.length));
    }

    if (trimmed.startsWith('<server>')) {
        return path.join(roots.serverRoot, trimmed.slice('<server>'.length));
    }

    if (roots.pluginRoot && trimmed.startsWith('<plugin>')) {
        return path.join(roots.pluginRoot, trimmed.slice('<plugin>'.length));
    }

    return trimmed;
}

function resolveConfiguredPath(rawValue, roots, options = {}) {
    const {
        baseRoot = roots.pluginRoot || roots.workspaceRoot,
        fallback = '',
    } = options;

    const candidate = expandTemplatePath(rawValue, roots);
    if (!candidate) {
        return fallback ? path.resolve(fallback) : candidate;
    }

    if (path.isAbsolute(candidate)) {
        return path.normalize(candidate);
    }

    return path.resolve(baseRoot, candidate);
}

module.exports = {
    createPluginRoots,
    createServerRoots,
    expandTemplatePath,
    resolveConfiguredPath,
};
