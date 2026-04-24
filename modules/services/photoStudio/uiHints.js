function createUiHints(overrides = {}) {
    const drawerId = overrides.open_drawer_id || overrides.open_drawer_project_id || null;
    return {
        refresh: [],
        toast: '',
        open_drawer_id: drawerId,
        open_drawer_project_id: drawerId,
        focus_scene: null,
        highlight_id: null,
        confirm_required: false,
        confirm_message: '',
        ...overrides,
        open_drawer_id: drawerId,
        open_drawer_project_id: drawerId,
    };
}

function hintsForProject(projectId, refresh = ['dashboard', 'project_board', 'project_drawer'], toast = '') {
    return createUiHints({
        refresh,
        toast,
        open_drawer_id: projectId || null,
    });
}

module.exports = {
    createUiHints,
    hintsForProject,
};
