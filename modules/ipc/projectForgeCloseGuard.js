'use strict';

// The renderer cancels beforeunload only when the ProjectForge source editor is dirty.
// Electron then emits will-prevent-unload; stay is the fail-closed default.
function installProjectForgeCloseGuard(win, dialog) {
    if (!win?.webContents?.on || !dialog?.showMessageBoxSync) {
        throw new TypeError('ProjectForge close guard requires a window and dialog');
    }
    win.webContents.on('will-prevent-unload', event => {
        const choice = dialog.showMessageBoxSync(win, {
            type: 'warning',
            buttons: ['继续编辑', '放弃更改并关闭'],
            defaultId: 0,
            cancelId: 0,
            noLink: true,
            title: 'ProjectForge 未保存的修改',
            message: '源码编辑器有未保存的修改。',
            detail: '关闭窗口或退出应用将丢失这些修改。',
        });
        if (choice === 1) event.preventDefault();
    });
}

module.exports = { installProjectForgeCloseGuard };
