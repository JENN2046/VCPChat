function createUiHints(overrides = {}) {
    return {
        refresh: [],
        toast: '',
        open_drawer_project_id: null,
        ...overrides,
    };
}

function hintsForProject(projectId, refresh = ['dashboard', 'project_board', 'project_drawer'], toast = '') {
    return createUiHints({
        refresh,
        toast,
        open_drawer_project_id: projectId || null,
    });
}

module.exports = {
    createUiHints,
    hintsForProject,
};
