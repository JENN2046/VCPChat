const { execSync } = require('child_process');

let initialized = false;

function initWindowsConsoleUtf8() {
    if (initialized || process.platform !== 'win32') {
        return;
    }

    initialized = true;

    process.env.PYTHONIOENCODING = process.env.PYTHONIOENCODING || 'utf-8';
    process.env.PYTHONUTF8 = process.env.PYTHONUTF8 || '1';

    if (typeof process.stdin?.setEncoding === 'function') {
        process.stdin.setEncoding('utf8');
    }
    if (typeof process.stdout?.setDefaultEncoding === 'function') {
        process.stdout.setDefaultEncoding('utf8');
    }
    if (typeof process.stderr?.setDefaultEncoding === 'function') {
        process.stderr.setDefaultEncoding('utf8');
    }

    try {
        execSync('chcp 65001', { stdio: 'ignore' });
    } catch (error) {
        // Ignore environments without a traditional Windows console.
    }
}

module.exports = initWindowsConsoleUtf8;
