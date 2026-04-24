(function initPhotoStudioApi() {
    const channels = {
        open: 'photo-studio-open',
        getDashboard: 'photo-studio-get-dashboard',
        listProjects: 'photo-studio-list-projects',
        getProject: 'photo-studio-get-project',
        runAction: 'photo-studio-run-action',
        refreshScene: 'photo-studio-refresh-scene',
    };

    async function invoke(channel, payload) {
        if (!window.desktopAPI?.invoke) {
            throw new Error('desktopAPI.invoke is not available');
        }
        return window.desktopAPI.invoke(channel, payload);
    }

    window.PhotoStudioApi = {
        open() {
            return invoke(channels.open);
        },
        getDashboard() {
            return invoke(channels.getDashboard);
        },
        listProjects(filters = {}) {
            return invoke(channels.listProjects, filters);
        },
        getProject(projectId) {
            return invoke(channels.getProject, projectId);
        },
        runAction(scene, action, payload = {}) {
            return invoke(channels.runAction, { scene, action, payload });
        },
        refreshScene(scene, payload = {}) {
            return invoke(channels.refreshScene, { scene, payload });
        },
    };
})();
