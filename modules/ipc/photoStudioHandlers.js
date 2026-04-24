const { ipcMain } = require('electron');
const windowService = require('../services/windowService');
const WINDOW_APP_IDS = require('../services/windowAppIds');
const { CHANNELS } = require('./ipcContracts');
const PhotoStudioOrchestrator = require('../services/photoStudio/PhotoStudioOrchestrator');

let orchestrator = null;

function initialize() {
    if (!orchestrator) {
        orchestrator = new PhotoStudioOrchestrator();
    }

    ipcMain.handle(CHANNELS.PHOTO_STUDIO_OPEN, async () => {
        await windowService.open(WINDOW_APP_IDS.PHOTO_STUDIO);
        return {
            success: true,
            appId: WINDOW_APP_IDS.PHOTO_STUDIO,
        };
    });

    ipcMain.handle(CHANNELS.PHOTO_STUDIO_GET_DASHBOARD, async () => {
        return orchestrator.getDashboard();
    });

    ipcMain.handle(CHANNELS.PHOTO_STUDIO_LIST_PROJECTS, async (_event, filters = {}) => {
        return orchestrator.listProjects(filters);
    });

    ipcMain.handle(CHANNELS.PHOTO_STUDIO_GET_PROJECT, async (_event, projectId) => {
        return orchestrator.getProject(projectId);
    });

    ipcMain.handle(CHANNELS.PHOTO_STUDIO_RUN_ACTION, async (_event, request = {}) => {
        return orchestrator.runAction(request.scene, request.action, request.payload || {});
    });

    ipcMain.handle(CHANNELS.PHOTO_STUDIO_REFRESH_SCENE, async (_event, request = {}) => {
        return orchestrator.refreshScene(request.scene || 'dashboard', request.payload || {});
    });
}

module.exports = {
    initialize,
};
