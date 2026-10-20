'use strict';

// Host lifecycle only: never revoke an in-flight operation to make quit succeed.
function createQuitAdmission() {
    let active = 0;
    let closing = false;
    return {
        async run(callback) {
            if (closing) throw Object.assign(new Error('APPLICATION_SHUTTING_DOWN'), { code: 'APPLICATION_SHUTTING_DOWN' });
            active++;
            try { return await callback(); } finally { active--; }
        },
        begin() {
            if (active) throw Object.assign(new Error('APPLICATION_BUSY'), { code: 'APPLICATION_BUSY', shutdownUnchanged: true });
            const wasClosing = closing;
            closing = true;
            return wasClosing;
        },
        resume() { closing = false; },
        guardIpcMain(ipc) {
            // Adapt the narrow IPC interface without proxying a frozen object.
            // sidePaneIpcPolicy/domainActivator expose non-configurable methods.
            return Object.freeze({
                handle: (channel, callback) => ipc.handle(channel, (...args) => this.run(() => callback(...args))),
                removeHandler: channel => ipc.removeHandler(channel),
            });
        },
    };
}
module.exports = createQuitAdmission();
module.exports.createQuitAdmission = createQuitAdmission;
