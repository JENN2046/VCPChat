'use strict';
// Put a fully written temporary file in place of the target in one step.
// fs-extra's move(..., { overwrite: true }) removes the target first and renames after (two steps: a crash between
// them leaves no file at all), and it makes a read-only target writable to remove it; graceful-fs's rename retries for
// up to a minute while a file is held open. Node's own rename is MoveFileEx with REPLACE_EXISTING on Windows: one step,
// and a read-only target is refused. Briefly busy files (antivirus, indexing, sync clients) get two more tries.
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const BUSY = new Set(['EPERM', 'EACCES', 'EBUSY']);
const BUSY_MESSAGE = '文件为只读，或正被其他程序占用，未能保存；原文件未改动。';

async function replaceWith(temporary, target) {
    for (let attempt = 1; ; attempt += 1) {
        try {
            await fs.promises.rename(temporary, target);
            return;
        } catch (error) {
            if (!BUSY.has(error.code)) throw error;
            if (attempt >= 3) throw new Error(BUSY_MESSAGE);
            await new Promise((resolve) => setTimeout(resolve, 150 * attempt));
        }
    }
}

// Secure creation prevents an existing private file's content from becoming
// visible through a default-umask temporary file while it is still being written.
async function writeAtomically(target, data) {
    const temporary = path.join(path.dirname(target), `.scriptorium-writing-${randomUUID()}.tmp`);
    let handle = null;
    let created = false;
    let installed = false;
    try {
        handle = await fs.promises.open(temporary, 'wx', 0o600);
        created = true;
        await handle.writeFile(data);
        if (process.platform !== 'win32') {
            const previous = await fs.promises.stat(target).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
            if (previous && !previous.isFile()) throw new Error('保存目标不是普通文件，未替换。');
            // Preserve ordinary rwx bits. Do not propagate setuid/setgid bits to
            // a new inode; new destinations keep the existing umask policy.
            await handle.chmod(previous ? previous.mode & 0o777 : 0o666 & ~process.umask());
        }
        await handle.close();
        handle = null;
        await replaceWith(temporary, target);
        installed = true;
    } finally {
        if (handle) await handle.close().catch(() => {});
        if (created && !installed) await fs.promises.rm(temporary, { force: true }).catch(() => {});
    }
}

module.exports = { replaceWith, writeAtomically };
