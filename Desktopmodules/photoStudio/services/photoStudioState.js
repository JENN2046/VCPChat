(function initPhotoStudioState() {
    const state = {
        currentScene: 'dashboard',
        selectedProjectId: null,
        refreshing: new Set(),
        dashboard: null,
        projects: null,
        projectDetail: null,
        markRefreshing(scene) {
            this.refreshing.add(scene);
        },
        markRefreshed(scene) {
            this.refreshing.delete(scene);
        },
        isRefreshing(scene) {
            return this.refreshing.has(scene);
        },
        setDashboard(result) {
            this.dashboard = result;
        },
        setProjects(result) {
            this.projects = result;
        },
        setProjectDetail(result) {
            this.projectDetail = result;
        },
    };

    window.PhotoStudioState = state;
})();
