import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const executable = process.platform === 'win32' ? 'vcp_chat_data_service.exe' : 'vcp_chat_data_service';
const binary = path.join(root, 'modules/services/chatDataService/bin', `${process.platform}-${process.arch}`, executable);
const originalBinary = fs.existsSync(binary) ? fs.readFileSync(binary) : null;
const originalMode = originalBinary ? fs.statSync(binary).mode & 0o777 : null;
try {
    const build = spawnSync(process.execPath, ['rust_chat_data_service/build-runtime.js'], {
        cwd: root,
        encoding: 'utf8',
        stdio: 'inherit',
        // A clean Windows cargo release build is legitimately slower than the
        // source-plane gates; classify a timeout as infrastructure failure rather
        // than silently accepting a stale binary.
        timeout: 600_000,
    });
    if (build.error || build.status !== 0) throw build.error || new Error(`build exited with ${build.status}`);
    if (!fs.existsSync(binary)) throw new Error(`built runtime missing: ${binary}`);
    const help = spawnSync(binary, ['--help'], { cwd: root, encoding: 'utf8', timeout: 20_000 });
    if (help.error || help.status !== 0) throw help.error || new Error(`built runtime --help exited with ${help.status}: ${help.stderr}`);
    if (!/Usage|Options|help/i.test(`${help.stdout}\n${help.stderr}`)) throw new Error('built runtime did not expose a help contract');
    console.log(`Built artifact smoke passed (${binary}; --help exit 0).`);
} finally {
    // The smoke validates the generated artifact but must not leave a tracked
    // release binary modified in a developer worktree.
    if (originalBinary) {
        // Replace the directory entry rather than reopening an executable inode
        // that the OS may still hold after the child reports its exit.
        const restored = `${binary}.restore-${process.pid}-${Date.now()}`;
        try {
            fs.writeFileSync(restored, originalBinary, { flag: 'wx', mode: originalMode });
            fs.renameSync(restored, binary);
        } finally {
            fs.rmSync(restored, { force: true });
        }
    }
    else fs.rmSync(binary, { force: true });
}
