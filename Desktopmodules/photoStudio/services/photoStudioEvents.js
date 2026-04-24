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

    function applyUiHints(uiHints = {}) {
        if (uiHints.toast) {
            emit('toast:show', uiHints.toast);
        }

        if (uiHints.open_drawer_project_id) {
            emit('project:selected', uiHints.open_drawer_project_id);
        }

        if (Array.isArray(uiHints.refresh)) {
            uiHints.refresh.forEach((scene) => emit('scene:refresh', scene));
        }
    }

    window.PhotoStudioEvents = {
        on,
        emit,
        applyUiHints,
    };
})();
