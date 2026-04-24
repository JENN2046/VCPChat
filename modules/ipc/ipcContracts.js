const CHANNEL_TYPES = Object.freeze({
    COMMAND: 'command',
    QUERY: 'query',
    STREAM: 'stream',
    LIFECYCLE: 'lifecycle',
});

const CHANNELS = Object.freeze({
    WINDOW_READY: 'window-lifecycle:ready',
    DESKTOP_REMOTE_REQUEST: 'desktop-remote:request',
    DESKTOP_REMOTE_RESPONSE: 'desktop-remote:response',
    FLOWLOCK_REQUEST: 'flowlock:request',
    FLOWLOCK_RESPONSE: 'flowlock:response',
    DESKTOP_LAUNCH: 'desktop-launch-vchat-app',
    PHOTO_STUDIO_OPEN: 'photo-studio-open',
    PHOTO_STUDIO_GET_DASHBOARD: 'photo-studio-get-dashboard',
    PHOTO_STUDIO_LIST_PROJECTS: 'photo-studio-list-projects',
    PHOTO_STUDIO_GET_PROJECT: 'photo-studio-get-project',
    PHOTO_STUDIO_RUN_ACTION: 'photo-studio-run-action',
    PHOTO_STUDIO_REFRESH_SCENE: 'photo-studio-refresh-scene',
});

const channelRegistry = new Map([
    [CHANNELS.WINDOW_READY, {
        channelName: CHANNELS.WINDOW_READY,
        channelType: CHANNEL_TYPES.LIFECYCLE,
        owner: 'VChat Shell',
        requestSchema: { appId: 'string', payload: 'object?' },
        responseSchema: null,
        supportsConcurrent: true,
    }],
    [CHANNELS.DESKTOP_REMOTE_REQUEST, {
        channelName: CHANNELS.DESKTOP_REMOTE_REQUEST,
        channelType: CHANNEL_TYPES.QUERY,
        owner: 'VDesktop Platform',
        requestSchema: { requestId: 'string', command: 'string', payload: 'object?' },
        responseSchema: { requestId: 'string', ok: 'boolean', data: 'object?', error: 'string?' },
        supportsConcurrent: true,
    }],
    [CHANNELS.DESKTOP_REMOTE_RESPONSE, {
        channelName: CHANNELS.DESKTOP_REMOTE_RESPONSE,
        channelType: CHANNEL_TYPES.QUERY,
        owner: 'VDesktop Platform',
        requestSchema: { requestId: 'string', ok: 'boolean', data: 'object?', error: 'string?' },
        responseSchema: null,
        supportsConcurrent: true,
    }],
    [CHANNELS.FLOWLOCK_REQUEST, {
        channelName: CHANNELS.FLOWLOCK_REQUEST,
        channelType: CHANNEL_TYPES.QUERY,
        owner: 'VChat Shell',
        requestSchema: { requestId: 'string', command: 'string', payload: 'object?' },
        responseSchema: { requestId: 'string', ok: 'boolean', data: 'object?', error: 'string?' },
        supportsConcurrent: true,
    }],
    [CHANNELS.FLOWLOCK_RESPONSE, {
        channelName: CHANNELS.FLOWLOCK_RESPONSE,
        channelType: CHANNEL_TYPES.QUERY,
        owner: 'VChat Shell',
        requestSchema: { requestId: 'string', ok: 'boolean', data: 'object?', error: 'string?' },
        responseSchema: null,
        supportsConcurrent: true,
    }],
    [CHANNELS.DESKTOP_LAUNCH, {
        channelName: CHANNELS.DESKTOP_LAUNCH,
        channelType: CHANNEL_TYPES.QUERY,
        owner: 'VChat Shell',
        requestSchema: { appAction: 'string' },
        responseSchema: { success: 'boolean', appId: 'string?' },
        supportsConcurrent: true,
    }],
    [CHANNELS.PHOTO_STUDIO_OPEN, {
        channelName: CHANNELS.PHOTO_STUDIO_OPEN,
        channelType: CHANNEL_TYPES.QUERY,
        owner: 'Photo Studio',
        requestSchema: {},
        responseSchema: { success: 'boolean', appId: 'string?' },
        supportsConcurrent: true,
    }],
    [CHANNELS.PHOTO_STUDIO_GET_DASHBOARD, {
        channelName: CHANNELS.PHOTO_STUDIO_GET_DASHBOARD,
        channelType: CHANNEL_TYPES.QUERY,
        owner: 'Photo Studio',
        requestSchema: {},
        responseSchema: { success: 'boolean', data: 'object?', error: 'object?', ui_hints: 'object?' },
        supportsConcurrent: true,
    }],
    [CHANNELS.PHOTO_STUDIO_LIST_PROJECTS, {
        channelName: CHANNELS.PHOTO_STUDIO_LIST_PROJECTS,
        channelType: CHANNEL_TYPES.QUERY,
        owner: 'Photo Studio',
        requestSchema: { filters: 'object?' },
        responseSchema: { success: 'boolean', data: 'array?', error: 'object?', ui_hints: 'object?' },
        supportsConcurrent: true,
    }],
    [CHANNELS.PHOTO_STUDIO_GET_PROJECT, {
        channelName: CHANNELS.PHOTO_STUDIO_GET_PROJECT,
        channelType: CHANNEL_TYPES.QUERY,
        owner: 'Photo Studio',
        requestSchema: { projectId: 'string' },
        responseSchema: { success: 'boolean', data: 'object?', error: 'object?', ui_hints: 'object?' },
        supportsConcurrent: true,
    }],
    [CHANNELS.PHOTO_STUDIO_RUN_ACTION, {
        channelName: CHANNELS.PHOTO_STUDIO_RUN_ACTION,
        channelType: CHANNEL_TYPES.QUERY,
        owner: 'Photo Studio',
        requestSchema: { scene: 'string', action: 'string', payload: 'object?' },
        responseSchema: { success: 'boolean', data: 'object?', error: 'object?', ui_hints: 'object?' },
        supportsConcurrent: true,
    }],
    [CHANNELS.PHOTO_STUDIO_REFRESH_SCENE, {
        channelName: CHANNELS.PHOTO_STUDIO_REFRESH_SCENE,
        channelType: CHANNEL_TYPES.QUERY,
        owner: 'Photo Studio',
        requestSchema: { scene: 'string', payload: 'object?' },
        responseSchema: { success: 'boolean', data: 'object?', error: 'object?', ui_hints: 'object?' },
        supportsConcurrent: true,
    }],
]);

function getChannelMeta(channelName) {
    return channelRegistry.get(channelName) || null;
}

function listChannels() {
    return Array.from(channelRegistry.values());
}

module.exports = {
    CHANNELS,
    CHANNEL_TYPES,
    getChannelMeta,
    listChannels,
};
