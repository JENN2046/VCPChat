const { BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');

let sheetWindow = null;
let openChildWindows = [];

function buildSheetWindowUrl(options = {}) {
    const targetUrl = pathToFileURL(path.join(__dirname, '..', '..', 'Desktopmodules', 'legacy', 'Sheetmodules', 'sheet-studio.html'));
    if (options.workbookId) {
        targetUrl.searchParams.set('workbookId', options.workbookId);
    }
    return targetUrl.toString();
}

function createOrFocusSheetWindow(options = {}) {
    if (sheetWindow && !sheetWindow.isDestroyed()) {
        if (!sheetWindow.isVisible()) {
            sheetWindow.show();
        }
        sheetWindow.focus();
        if (options.workbookId) {
            sheetWindow.webContents.send('sheet-open-workbook', {
                workbookId: options.workbookId
            });
        }
        return sheetWindow;
    }

    sheetWindow = new BrowserWindow({
        width: 1280,
        height: 860,
        minWidth: 960,
        minHeight: 640,
        title: 'VCP SheetAI',
        frame: false,
        ...(process.platform === 'darwin' ? {} : { titleBarStyle: 'hidden' }),
        webPreferences: {
            preload: path.join(__dirname, '..', '..', 'preloads', 'desktop.js'),
            contextIsolation: true,
            nodeIntegration: false,
            devTools: true
        },
        icon: path.join(__dirname, '..', '..', 'assets', 'icon.png'),
        show: false
    });

    sheetWindow.loadURL(buildSheetWindowUrl(options));
    sheetWindow.setMenu(null);
    openChildWindows.push(sheetWindow);

    sheetWindow.once('ready-to-show', () => {
        sheetWindow.show();
    });

    sheetWindow.on('close', (event) => {
        if (process.platform === 'darwin' && !require('electron').app.isQuitting) {
            event.preventDefault();
            sheetWindow.hide();
        }
    });

    sheetWindow.on('closed', () => {
        openChildWindows = openChildWindows.filter((win) => win !== sheetWindow);
        sheetWindow = null;
    });

    return sheetWindow;
}

function initialize(options) {
    openChildWindows = options.openChildWindows || [];

    ipcMain.handle('open-sheet-window', (_event, payload) => {
        createOrFocusSheetWindow(payload || {});
    });
}

module.exports = {
    initialize,
    createOrFocusSheetWindow: (options) => createOrFocusSheetWindow(options || {}),
    getSheetWindow: () => sheetWindow
};
