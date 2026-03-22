const { ipcMain } = require('electron');
const webdavSyncManager = require('../webdavSyncManager');

function initialize(paths) {
    const { projectRoot } = paths;

    ipcMain.handle('webdav-sync:test-connection', async (event, config) => {
        try {
            return await webdavSyncManager.testConnection(config);
        } catch (error) {
            return { success: false, message: error.message };
        }
    });

    ipcMain.handle('webdav-sync:upload', async (event, config) => {
        try {
            return await webdavSyncManager.uploadAppData(config, projectRoot);
        } catch (error) {
            return { success: false, message: error.message };
        }
    });

    ipcMain.handle('webdav-sync:download', async (event, config) => {
        try {
            return await webdavSyncManager.downloadAppData(config, projectRoot);
        } catch (error) {
            return { success: false, message: error.message };
        }
    });
}

module.exports = {
    initialize,
};
