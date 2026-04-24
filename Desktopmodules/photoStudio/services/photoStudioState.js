(function initPhotoStudioState() {
    const state = {
        currentScene: 'home',
        selectedProjectId: null,
        refreshing: new Set(),
        dashboard: null,
        projects: null,
        projectDetail: null,
        lastActionResult: null,
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
        setLastActionResult(result) {
            this.lastActionResult = result;
        },
    };

    window.PhotoStudioState = state;
})();
