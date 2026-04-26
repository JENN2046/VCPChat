(function initPhotoStudioEvents() {
    const listeners = new Map();

    function on(eventName, callback) {
        if (!listeners.has(eventName)) {
            listeners.set(eventName, new Set());
        }
        listeners.get(eventName).add(callback);
        return () => listeners.get(eventName)?.delete(callback);
    }

    function emit(eventName, payload) {
        const callbacks = listeners.get(eventName);
        if (!callbacks) {
            return;
        }
        callbacks.forEach((callback) => callback(payload));
    }

    function normalizeScene(scene) {
        const aliases = {
            dashboard: 'home',
            projects: 'project_command',
            project_board: 'project_command',
            inquiry: 'client_leads',
            delivery: 'delivery_assets',
            delivery_panel: 'delivery_assets',
        };
        return aliases[scene] || scene;
    }

    function applyUiHints(uiHints = {}) {
        if (uiHints.toast) {
            emit('toast:show', uiHints.toast);
        }

        const drawerId = uiHints.open_drawer_id || uiHints.open_drawer_project_id;
        if (drawerId) {
            emit('project:selected', drawerId);
        }

        if (uiHints.focus_scene) {
            emit('scene:focus', normalizeScene(uiHints.focus_scene));
        }

        if (Array.isArray(uiHints.refresh)) {
            uiHints.refresh.forEach((scene) => emit('scene:refresh', normalizeScene(scene)));
        }
    }

    window.PhotoStudioEvents = {
        on,
        emit,
        applyUiHints,
    };
})();
