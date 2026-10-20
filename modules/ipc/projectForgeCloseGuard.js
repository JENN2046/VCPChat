'use strict';

const windows = new Map();
const prepared = new Map();
const approved = new Set();
const promptOptions = {
    type: 'warning', buttons: ['继续编辑', '放弃更改并关闭'],
    defaultId: 0, cancelId: 0, noLink: true,
    title: 'ProjectForge 未保存的修改', message: '源码编辑器有未保存的修改。',
    detail: '关闭窗口或退出应用将丢失这些修改。',
};

function installProjectForgeCloseGuard(win, dialog) {
    if (!win?.webContents?.on || !dialog?.showMessageBoxSync) {
        throw new TypeError('ProjectForge close guard requires a window and dialog');
    }
    windows.set(win, dialog);
    win.on?.('closed', () => { windows.delete(win); prepared.delete(win); approved.delete(win); });
    win.webContents.on('will-prevent-unload', event => {
        if (approved.has(win) || dialog.showMessageBoxSync(win, promptOptions) === 1) event.preventDefault();
    });
}

// Ask the existing unsaved-source question BEFORE releasing any host resource.
// Inert prevents further user edits between this check and Electron's unload.
async function prepareProjectForgeQuit() {
    try {
        for (const [win, dialog] of windows) {
            if (win.isDestroyed()) continue;
            const state = await win.webContents.executeJavaScript(`(() => {
                const wasInert = document.documentElement.inert;
                document.documentElement.inert = true;
                return { wasInert, dirty: document.querySelector('#source-tab-dirty')?.hidden === false };
            })()`);
            prepared.set(win, state.wasInert);
            if (state.dirty && dialog.showMessageBoxSync(win, promptOptions) !== 1) {
                await cancelProjectForgeQuit();
                return false;
            }
            approved.add(win);
        }
        return true;
    } catch (error) {
        await cancelProjectForgeQuit();
        error.shutdownUnchanged = true;
        throw error;
    }
}

async function cancelProjectForgeQuit() {
    for (const [win, wasInert] of prepared) {
        if (!win.isDestroyed()) {
            await win.webContents.executeJavaScript(`document.documentElement.inert = ${wasInert === true}`);
        }
    }
    prepared.clear();
    approved.clear();
}
module.exports = { installProjectForgeCloseGuard, prepareProjectForgeQuit, cancelProjectForgeQuit };
