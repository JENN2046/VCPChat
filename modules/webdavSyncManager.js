const fs = require('fs-extra');
const path = require('path');

const DEFAULT_MANIFEST_NAME = '.vcp-sync-manifest.json';
const DEFAULT_BACKUP_DIR = '.webdav-sync-backups';

const APPDATA_DIRECTORY_SCOPE = [
    'Agents',
    'AgentGroups',
    'UserData',
    'Notemodules',
    'avatarimage',
    'systemPromptPresets',
    'Translatormodules',
    'DesktopData',
    'DesktopWidgets',
    'canvas',
    'generated_lists',
];

const APPDATA_CONFIG_DIRECTORY_SCOPE = [
    'VCPDistributedServer',
];

const TOOLBOX_DIRECTORY_SCOPE = [
    'Agent',
    'dailynote',
    'TVStxt',
    'SillyTavernSub',
];

const TOOLBOX_CONFIG_DIRECTORY_SCOPE = [
    'Plugin',
    'modules/SSHManager',
];

const TOOLBOX_ROOT_FILE_ALLOWLIST = new Set([
    '.novacodemodes',
    'agent_map.json',
    'config.env',
    'ip_blacklist.json',
    'rag_params.json',
    'toolApprovalConfig.json',
    'toolbox_map.json',
]);

const DEFAULT_SYNC_SELECTIONS = Object.freeze({
    webdavSyncIncludeVcpChat: true,
    webdavSyncIncludeVcpChatRootFiles: true,
    webdavSyncIncludeVcpChatAgents: true,
    webdavSyncIncludeVcpChatUserData: true,
    webdavSyncIncludeVcpChatAssets: true,
    webdavSyncIncludeVcpChatDesktop: true,
    webdavSyncIncludeVcpChatServerConfig: true,
    webdavSyncIncludeVcpToolBox: true,
    webdavSyncIncludeVcpToolBoxRootConfig: true,
    webdavSyncIncludeVcpToolBoxAgents: true,
    webdavSyncIncludeVcpToolBoxDailyNote: true,
    webdavSyncIncludeVcpToolBoxTvstxt: true,
    webdavSyncIncludeVcpToolBoxSillyTavern: true,
    webdavSyncIncludeVcpToolBoxPluginConfig: true,
});

const ROOT_FILE_EXCLUDES = new Set([
    DEFAULT_MANIFEST_NAME,
    '.DS_Store',
]);

const ROOT_FILE_SUFFIX_EXCLUDES = [
    '.tmp',
    '.lock',
    '.backup',
    '.bak',
    '.old',
];

const CONFIG_DIRECTORY_EXCLUDES = new Set([
    '.git',
    '.github',
    '.idea',
    '.vscode',
    '__pycache__',
    '.venv',
    'venv',
    'node_modules',
    'dist',
    'build',
    'target',
    '.cache',
    '.file_cache',
    'DebugLog',
    'VectorStore',
]);

let fetchImpl = null;

function normalizeBaseUrl(baseUrl) {
    if (!baseUrl) {
        throw new Error('WebDAV base URL is required');
    }

    let normalized = baseUrl.trim();
    if (!/^https?:\/\//i.test(normalized)) {
        normalized = `http://${normalized}`;
    }

    const url = new URL(normalized);
    url.pathname = url.pathname.replace(/\/+$/, '');
    return url.toString().replace(/\/+$/, '');
}

function normalizeRemoteRoot(remoteRoot, fallback = '/VCPChat') {
    if (remoteRoot === undefined || remoteRoot === null) {
        remoteRoot = fallback;
    }

    const root = String(remoteRoot).trim();
    if (!root) return '';

    const trimmed = root.replace(/^\/+/, '').replace(/\/+$/, '');
    return `/${trimmed || 'VCPChat'}`;
}

function encodeRelativePath(relPath) {
    if (!relPath) return '';
    return relPath
        .split(/[\\/]+/)
        .filter(Boolean)
        .map(segment => encodeURIComponent(segment))
        .join('/');
}

function combineRemotePath(basePath, remoteRoot, relPath = '') {
    const parts = [];
    const normalizedBasePath = (basePath || '').replace(/\/+$/, '');
    if (normalizedBasePath && normalizedBasePath !== '/') {
        parts.push(normalizedBasePath.replace(/^\/+|\/+$/g, ''));
    }

    const normalizedRemoteRoot = normalizeRemoteRoot(remoteRoot).replace(/^\/+|\/+$/g, '');
    if (normalizedRemoteRoot) {
        parts.push(normalizedRemoteRoot);
    }

    const encodedRelativePath = encodeRelativePath(relPath);
    if (encodedRelativePath) {
        parts.push(encodedRelativePath);
    }

    return `/${parts.filter(Boolean).join('/')}`;
}

async function getFetch() {
    if (typeof fetch === 'function') {
        return fetch.bind(globalThis);
    }

    if (!fetchImpl) {
        fetchImpl = (await import('node-fetch')).default;
    }

    return fetchImpl;
}

function buildWebDavUrl(config, relPath = '') {
    const base = normalizeBaseUrl(config.baseUrl);
    const url = new URL(base);
    url.pathname = combineRemotePath(url.pathname, config.remoteRoot, relPath);
    return url.toString();
}

function buildAuthHeader(username, password) {
    if (!username || !password) return null;
    return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
}

async function request(config, method, relPath = '', options = {}) {
    const fetchFn = await getFetch();
    const url = buildWebDavUrl(config, relPath);
    const headers = { ...(options.headers || {}) };

    const authHeader = buildAuthHeader(config.username, config.password);
    if (authHeader) {
        headers.Authorization = authHeader;
    }

    return await fetchFn(url, {
        method,
        headers,
        body: options.body,
    });
}

function normalizeRelPath(relPath) {
    return relPath.replace(/\\/g, '/');
}

function shouldSkipRelativePath(relPath) {
    const normalized = normalizeRelPath(relPath);
    return normalized === `AppData/${DEFAULT_BACKUP_DIR}`
        || normalized.startsWith(`AppData/${DEFAULT_BACKUP_DIR}/`)
        || normalized === 'AppData/UserData/backups'
        || normalized.startsWith('AppData/UserData/backups/');
}

function shouldSkipSyncFile(relPath) {
    const normalized = normalizeRelPath(relPath);
    const fileName = path.posix.basename(normalized).toLowerCase();

    if (normalized === DEFAULT_MANIFEST_NAME || normalized.endsWith(`/${DEFAULT_MANIFEST_NAME}`)) {
        return true;
    }

    return ROOT_FILE_SUFFIX_EXCLUDES.some(suffix => fileName.endsWith(suffix));
}

function isRootFileExcluded(fileName) {
    const normalized = normalizeRelPath(fileName);
    if (ROOT_FILE_EXCLUDES.has(normalized)) {
        return true;
    }

    return shouldSkipSyncFile(normalized);
}

function shouldSkipConfigDirectoryEntry(entry) {
    return CONFIG_DIRECTORY_EXCLUDES.has(entry.name);
}

function shouldIncludeConfigFile(fileName) {
    const lowerName = fileName.toLowerCase();
    return lowerName.endsWith('.json') || lowerName.endsWith('.env');
}

function shouldIncludeToolboxRootFile(fileName) {
    return TOOLBOX_ROOT_FILE_ALLOWLIST.has(fileName);
}

function createTarget(relPath, absPath, stats, isDir) {
    return {
        relPath: normalizeRelPath(relPath),
        absPath,
        isDir,
        size: isDir ? null : stats.size,
        mtimeMs: isDir ? null : stats.mtimeMs,
    };
}

function getAppDataRoot(projectRoot) {
    return path.join(projectRoot, 'AppData');
}

function getVcpDistributedServerRoot(projectRoot) {
    return path.join(projectRoot, 'VCPDistributedServer');
}

function getToolboxRoot(projectRoot) {
    return path.join(projectRoot, '..', 'VCPToolBox');
}

function walkDirectory(absPath, relPath, targets, options = {}) {
    const {
        includeFile = () => true,
        skipDirectory = () => false,
    } = options;

    targets.push(createTarget(relPath, absPath, null, true));

    const entries = fs.readdirSync(absPath, { withFileTypes: true });
    for (const entry of entries) {
        if (entry.isDirectory() && skipDirectory(entry)) {
            continue;
        }

        const childAbsPath = path.join(absPath, entry.name);
        const childRelPath = path.posix.join(normalizeRelPath(relPath), entry.name);

        if (shouldSkipRelativePath(childRelPath) || shouldSkipSyncFile(childRelPath)) {
            continue;
        }

        if (entry.isDirectory()) {
            walkDirectory(childAbsPath, childRelPath, targets, options);
        } else if (entry.isFile() && includeFile(entry.name, childRelPath)) {
            const stats = fs.statSync(childAbsPath);
            targets.push(createTarget(childRelPath, childAbsPath, stats, false));
        }
    }
}

function collectRootFiles(baseAbsPath, relPrefix, targets, includeFile) {
    if (!fs.existsSync(baseAbsPath)) {
        return;
    }

    const entries = fs.readdirSync(baseAbsPath, { withFileTypes: true });
    for (const entry of entries) {
        if (!entry.isFile()) continue;
        if (!includeFile(entry.name)) continue;

        const relPath = path.posix.join(relPrefix, entry.name);
        if (isRootFileExcluded(entry.name) || shouldSkipRelativePath(relPath)) {
            continue;
        }

        const absPath = path.join(baseAbsPath, entry.name);
        const stats = fs.statSync(absPath);
        targets.push(createTarget(relPath, absPath, stats, false));
    }
}

function collectDirectoryTargets(projectRoot, rootDirName, directoryName, targets) {
    const absPath = path.join(projectRoot, rootDirName, directoryName);
    if (!fs.existsSync(absPath)) return;
    walkDirectory(absPath, path.posix.join(rootDirName, directoryName), targets);
}

function collectConfigDirectoryTargets(projectRoot, rootDirName, directoryName, targets) {
    const absPath = path.join(projectRoot, rootDirName, ...directoryName.split('/'));
    if (!fs.existsSync(absPath)) return;

    walkDirectory(absPath, path.posix.join(rootDirName, directoryName), targets, {
        includeFile: (fileName) => shouldIncludeConfigFile(fileName),
        skipDirectory: (entry) => shouldSkipConfigDirectoryEntry(entry),
    });
}

function getSyncTargets(projectRoot) {
    const targets = [];

    collectRootFiles(
        getAppDataRoot(projectRoot),
        'AppData',
        targets,
        (fileName) => !isRootFileExcluded(fileName)
    );

    for (const directoryName of APPDATA_DIRECTORY_SCOPE) {
        collectDirectoryTargets(projectRoot, 'AppData', directoryName, targets);
    }

    for (const directoryName of APPDATA_CONFIG_DIRECTORY_SCOPE) {
        collectConfigDirectoryTargets(projectRoot, '', directoryName, targets);
    }

    collectRootFiles(
        getToolboxRoot(projectRoot),
        'VCPToolBox',
        targets,
        (fileName) => shouldIncludeToolboxRootFile(fileName)
    );

    for (const directoryName of TOOLBOX_DIRECTORY_SCOPE) {
        const absPath = path.join(getToolboxRoot(projectRoot), directoryName);
        if (!fs.existsSync(absPath)) continue;
        walkDirectory(absPath, path.posix.join('VCPToolBox', directoryName), targets);
    }

    for (const directoryName of TOOLBOX_CONFIG_DIRECTORY_SCOPE) {
        const absPath = path.join(getToolboxRoot(projectRoot), ...directoryName.split('/'));
        if (!fs.existsSync(absPath)) continue;
        walkDirectory(absPath, path.posix.join('VCPToolBox', directoryName), targets, {
            includeFile: (fileName) => shouldIncludeConfigFile(fileName),
            skipDirectory: (entry) => shouldSkipConfigDirectoryEntry(entry),
        });
    }

    return targets;
}

function getEffectiveSelections(config = {}) {
    return {
        ...DEFAULT_SYNC_SELECTIONS,
        ...config,
    };
}

function isTopLevelFileUnder(relPath, prefix) {
    const normalized = normalizeRelPath(relPath);
    if (!normalized.startsWith(`${prefix}/`)) return false;
    return normalized.split('/').length === prefix.split('/').length + 1;
}

function matchesAnyPrefix(relPath, prefixes) {
    const normalized = normalizeRelPath(relPath);
    return prefixes.some((prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`));
}

function shouldIncludeRelPath(relPath, config = {}) {
    const normalized = normalizeRelPath(relPath);
    const selections = getEffectiveSelections(config);

    if (matchesAnyPrefix(normalized, ['AppData'])) {
        if (!selections.webdavSyncIncludeVcpChat) {
            return false;
        }

        if (isTopLevelFileUnder(normalized, 'AppData')) {
            return selections.webdavSyncIncludeVcpChatRootFiles;
        }

        if (matchesAnyPrefix(normalized, ['AppData/Agents', 'AppData/AgentGroups'])) {
            return selections.webdavSyncIncludeVcpChatAgents;
        }

        if (matchesAnyPrefix(normalized, ['AppData/UserData'])) {
            return selections.webdavSyncIncludeVcpChatUserData;
        }

        if (matchesAnyPrefix(normalized, [
            'AppData/Notemodules',
            'AppData/avatarimage',
            'AppData/systemPromptPresets',
            'AppData/Translatormodules',
            'AppData/generated_lists',
        ])) {
            return selections.webdavSyncIncludeVcpChatAssets;
        }

        if (matchesAnyPrefix(normalized, [
            'AppData/DesktopData',
            'AppData/DesktopWidgets',
            'AppData/canvas',
        ])) {
            return selections.webdavSyncIncludeVcpChatDesktop;
        }
    }

    if (matchesAnyPrefix(normalized, ['VCPDistributedServer'])) {
        return selections.webdavSyncIncludeVcpChat && selections.webdavSyncIncludeVcpChatServerConfig;
    }

    if (matchesAnyPrefix(normalized, ['VCPToolBox'])) {
        if (!selections.webdavSyncIncludeVcpToolBox) {
            return false;
        }

        if (isTopLevelFileUnder(normalized, 'VCPToolBox')) {
            return selections.webdavSyncIncludeVcpToolBoxRootConfig;
        }

        if (matchesAnyPrefix(normalized, ['VCPToolBox/Agent'])) {
            return selections.webdavSyncIncludeVcpToolBoxAgents;
        }

        if (matchesAnyPrefix(normalized, ['VCPToolBox/dailynote'])) {
            return selections.webdavSyncIncludeVcpToolBoxDailyNote;
        }

        if (matchesAnyPrefix(normalized, ['VCPToolBox/TVStxt'])) {
            return selections.webdavSyncIncludeVcpToolBoxTvstxt;
        }

        if (matchesAnyPrefix(normalized, ['VCPToolBox/SillyTavernSub'])) {
            return selections.webdavSyncIncludeVcpToolBoxSillyTavern;
        }

        if (matchesAnyPrefix(normalized, ['VCPToolBox/Plugin', 'VCPToolBox/modules/SSHManager'])) {
            return selections.webdavSyncIncludeVcpToolBoxPluginConfig;
        }
    }

    return false;
}

function filterEntriesBySelection(entries, config = {}) {
    return entries.filter((entry) => shouldIncludeRelPath(entry.relPath, config));
}

function sortByDepthDesc(a, b) {
    return b.relPath.split(/[\\/]+/).length - a.relPath.split(/[\\/]+/).length;
}

function resolveAbsolutePath(projectRoot, relPath) {
    const normalized = normalizeRelPath(relPath);
    if (normalized === 'AppData' || normalized.startsWith('AppData/')) {
        const suffix = normalized === 'AppData' ? [] : normalized.slice('AppData/'.length).split('/');
        return path.join(getAppDataRoot(projectRoot), ...suffix);
    }

    if (normalized === 'VCPToolBox' || normalized.startsWith('VCPToolBox/')) {
        const suffix = normalized === 'VCPToolBox' ? [] : normalized.slice('VCPToolBox/'.length).split('/');
        return path.join(getToolboxRoot(projectRoot), ...suffix);
    }

    return path.join(projectRoot, ...normalized.split('/'));
}

async function ensureRemoteDirectory(config, relPath = '') {
    const normalizedRelPath = relPath ? normalizeRelPath(relPath) : '';
    if (!normalizedRelPath || normalizedRelPath === '.' || normalizedRelPath === './') return;

    const segments = normalizedRelPath.split('/').filter(Boolean);
    let currentPath = '';

    for (const segment of segments) {
        currentPath = currentPath ? `${currentPath}/${segment}` : segment;
        const response = await request(config, 'MKCOL', currentPath);
        if (response.ok || response.status === 405 || response.status === 409) {
            continue;
        }

        const errorText = await response.text().catch(() => '');
        throw new Error(`Failed to create remote folder "${currentPath}": ${response.status}${errorText ? ` ${errorText}` : ''}`);
    }
}

async function readRemoteJson(config, relPath) {
    const response = await request(config, 'GET', relPath, {
        headers: { Accept: 'application/json,text/plain,*/*' },
    });

    if (response.status === 404) {
        return null;
    }

    if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`Failed to read remote file "${relPath}": ${response.status}${errorText ? ` ${errorText}` : ''}`);
    }

    return JSON.parse(await response.text());
}

async function putJson(config, relPath, data) {
    const response = await request(config, 'PUT', relPath, {
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify(data, null, 2),
    });

    if (!response.ok && response.status !== 201 && response.status !== 204) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`Failed to write remote file "${relPath}": ${response.status}${errorText ? ` ${errorText}` : ''}`);
    }
}

async function putBuffer(config, relPath, buffer, contentType = 'application/octet-stream') {
    const response = await request(config, 'PUT', relPath, {
        headers: { 'Content-Type': contentType },
        body: buffer,
    });

    if (!response.ok && response.status !== 201 && response.status !== 204) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`Failed to upload "${relPath}": ${response.status}${errorText ? ` ${errorText}` : ''}`);
    }
}

async function deleteRemotePath(config, relPath) {
    if (!relPath || relPath === DEFAULT_MANIFEST_NAME) return;

    const response = await request(config, 'DELETE', relPath);
    if (response.ok || response.status === 404 || response.status === 204) {
        return;
    }

    const errorText = await response.text().catch(() => '');
    throw new Error(`Failed to delete remote path "${relPath}": ${response.status}${errorText ? ` ${errorText}` : ''}`);
}

function createManifest(entries) {
    return {
        version: 2,
        generatedAt: new Date().toISOString(),
        entries,
    };
}

function toManifestEntries(projectRoot, config = {}) {
    return filterEntriesBySelection(getSyncTargets(projectRoot), config).map(item => ({
        relPath: item.relPath,
        isDir: item.isDir,
        size: item.size,
        mtimeMs: item.mtimeMs,
    }));
}

async function collectCurrentEntries(projectRoot, config = {}) {
    return toManifestEntries(projectRoot, config);
}

async function createLocalBackup(projectRoot, entries, backupRoot) {
    await fs.ensureDir(backupRoot);
    for (const entry of entries) {
        const absPath = resolveAbsolutePath(projectRoot, entry.relPath);
        const destPath = path.join(backupRoot, ...normalizeRelPath(entry.relPath).split('/'));
        if (await fs.pathExists(absPath)) {
            if (entry.isDir) {
                await fs.copy(absPath, destPath, { overwrite: true });
            } else {
                await fs.ensureDir(path.dirname(destPath));
                await fs.copy(absPath, destPath, { overwrite: true });
            }
        }
    }
}

async function removeEntries(projectRoot, entries) {
    const sorted = [...entries].sort(sortByDepthDesc);
    for (const entry of sorted) {
        const absPath = resolveAbsolutePath(projectRoot, entry.relPath);
        if (await fs.pathExists(absPath)) {
            await fs.remove(absPath);
        }
    }
}

async function testConnection(config) {
    const normalized = {
        baseUrl: normalizeBaseUrl(config.baseUrl),
        remoteRoot: '',
        username: config.username || '',
        password: config.password || '',
    };

    const response = await request(normalized, 'PROPFIND', '', {
        headers: {
            Depth: '0',
            'Content-Type': 'application/xml; charset=utf-8',
        },
        body: `<?xml version="1.0"?>
<d:propfind xmlns:d="DAV:">
  <d:prop>
    <d:displayname/>
  </d:prop>
</d:propfind>`,
    });

    if (response.ok || response.status === 207) {
        return { success: true, message: 'WebDAV 连接成功' };
    }

    const errorText = await response.text().catch(() => '');
    if (response.status === 404) {
        return {
            success: true,
            message: 'WebDAV 服务可访问，但同步目录尚未创建。首次上传时会自动创建。',
        };
    }

    return {
        success: false,
        message: `WebDAV 响应异常：${response.status}${errorText ? ` ${errorText}` : ''}`,
    };
}

async function uploadAppData(config, projectRoot) {
    const normalized = {
        baseUrl: normalizeBaseUrl(config.baseUrl),
        remoteRoot: normalizeRemoteRoot(config.remoteRoot),
        username: config.username || '',
        password: config.password || '',
    };

    const entries = await collectCurrentEntries(projectRoot, config);
    if (entries.length === 0) {
        throw new Error('No sync items selected. Please enable at least one WebDAV sync scope.');
    }
    const manifest = createManifest(entries);
    const manifestPath = DEFAULT_MANIFEST_NAME;
    const remoteManifestPath = path.posix.join(normalized.remoteRoot, manifestPath);

    await request(normalized, 'MKCOL', '');

    let previousManifest = null;
    try {
        previousManifest = await readRemoteJson(normalized, manifestPath);
    } catch {
        previousManifest = null;
    }

    if (previousManifest?.entries?.length) {
        const currentPaths = new Set(entries.map(entry => entry.relPath));
        const staleEntries = filterEntriesBySelection(previousManifest.entries, config)
            .filter(entry => entry?.relPath && entry.relPath !== manifestPath && !currentPaths.has(entry.relPath))
            .sort(sortByDepthDesc);

        for (const staleEntry of staleEntries) {
            await deleteRemotePath(normalized, staleEntry.relPath);
        }
    }

    const dirEntries = entries
        .filter(entry => entry.isDir)
        .sort((a, b) => a.relPath.split('/').length - b.relPath.split('/').length);

    for (const dirEntry of dirEntries) {
        await ensureRemoteDirectory(normalized, dirEntry.relPath);
    }

    const fileEntries = entries.filter(entry => !entry.isDir);
    for (const fileEntry of fileEntries) {
        await ensureRemoteDirectory(normalized, path.posix.dirname(fileEntry.relPath));
        const buffer = await fs.readFile(resolveAbsolutePath(projectRoot, fileEntry.relPath));
        await putBuffer(normalized, fileEntry.relPath, buffer);
    }

    await putJson(normalized, manifestPath, manifest);

    return {
        success: true,
        message: `已上传 ${fileEntries.length} 个文件和 ${dirEntries.length} 个目录`,
        manifestPath: remoteManifestPath,
        uploadedFiles: fileEntries.length,
        uploadedFolders: dirEntries.length,
    };
}

async function downloadAppData(config, projectRoot) {
    const normalized = {
        baseUrl: normalizeBaseUrl(config.baseUrl),
        remoteRoot: normalizeRemoteRoot(config.remoteRoot),
        username: config.username || '',
        password: config.password || '',
    };

    const manifestPath = DEFAULT_MANIFEST_NAME;
    const manifest = await readRemoteJson(normalized, manifestPath);
    if (!manifest?.entries?.length) {
        throw new Error('Remote manifest not found. Please upload from this machine first.');
    }

    const currentEntries = await collectCurrentEntries(projectRoot, config);
    const manifestEntries = filterEntriesBySelection(manifest.entries, config);
    if (manifestEntries.length === 0) {
        throw new Error('The current sync scope has no remote data. Please check your WebDAV sync selections.');
    }
    const manifestByPath = new Map(manifestEntries.map(entry => [entry.relPath, entry]));

    const backupRoot = path.join(
        getAppDataRoot(projectRoot),
        DEFAULT_BACKUP_DIR,
        new Date().toISOString().replace(/[:.]/g, '-')
    );
    await createLocalBackup(projectRoot, currentEntries, backupRoot);

    const staleLocalEntries = currentEntries
        .filter(entry => !manifestByPath.has(entry.relPath))
        .sort(sortByDepthDesc);
    await removeEntries(projectRoot, staleLocalEntries);

    const dirEntries = manifestEntries
        .filter(entry => entry.isDir)
        .sort((a, b) => a.relPath.split('/').length - b.relPath.split('/').length);
    for (const dirEntry of dirEntries) {
        await fs.ensureDir(resolveAbsolutePath(projectRoot, dirEntry.relPath));
    }

    const fileEntries = manifestEntries.filter(entry => !entry.isDir);
    for (const fileEntry of fileEntries) {
        const remoteFileResponse = await request(normalized, 'GET', fileEntry.relPath, {
            headers: { Accept: '*/*' },
        });

        if (!remoteFileResponse.ok) {
            const errorText = await remoteFileResponse.text().catch(() => '');
            throw new Error(`Failed to download "${fileEntry.relPath}": ${remoteFileResponse.status}${errorText ? ` ${errorText}` : ''}`);
        }

        const arrayBuffer = await remoteFileResponse.arrayBuffer();
        const localPath = resolveAbsolutePath(projectRoot, fileEntry.relPath);
        await fs.ensureDir(path.dirname(localPath));
        await fs.writeFile(localPath, Buffer.from(arrayBuffer));
    }

    return {
        success: true,
        message: `已下载 ${fileEntries.length} 个文件和 ${dirEntries.length} 个目录`,
        backupRoot,
    };
}

module.exports = {
    collectCurrentEntries,
    downloadAppData,
    normalizeBaseUrl,
    normalizeRemoteRoot,
    testConnection,
    uploadAppData,
};
