(function initPhotoStudioApi() {
    function requireApi(name) {
        const fn = window.desktopAPI?.[name];
        if (typeof fn !== 'function') {
            throw new Error(`desktopAPI.${name} is not available`);
        }
        return fn;
    }

    window.PhotoStudioApi = {
        open() {
            return requireApi('photoStudioOpen')();
        },
        getDashboard() {
            return requireApi('photoStudioGetDashboard')();
        },
        listProjects(filters = {}) {
            return requireApi('photoStudioListProjects')(filters);
        },
        getProject(projectId) {
            return requireApi('photoStudioGetProject')(projectId);
        },
        runAction(scene, action, payload = {}) {
            return requireApi('photoStudioRunAction')({ scene, action, payload });
        },
        refreshScene(scene, payload = {}) {
            return requireApi('photoStudioRefreshScene')({ scene, payload });
        },
    };
})();
