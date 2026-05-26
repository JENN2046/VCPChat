#!/usr/bin/env node
'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const portfinder = require('portfinder');
const puppeteer = require('puppeteer');

const repoRoot = path.resolve(__dirname, '..');
const userDataDir = path.join(repoRoot, 'AppData', 'electron-ui-smoke-user-data');
const timeoutMs = Number(process.env.ELECTRON_UI_SMOKE_TIMEOUT_MS || 90000);

function log(message) {
    console.log(`[electron-ui-smoke] ${message}`);
}

function fail(message) {
    throw new Error(message);
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function getJson(url) {
    return new Promise((resolve, reject) => {
        const req = http.get(url, (res) => {
            let data = '';
            res.setEncoding('utf8');
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                if (res.statusCode < 200 || res.statusCode >= 300) {
                    reject(new Error(`HTTP ${res.statusCode}: ${url}`));
                    return;
                }
                try {
                    resolve(JSON.parse(data));
                } catch (error) {
                    reject(error);
                }
            });
        });
        req.on('error', reject);
        req.setTimeout(2000, () => {
            req.destroy(new Error(`Timeout: ${url}`));
        });
    });
}

async function waitForDebugEndpoint(port, deadline) {
    const versionUrl = `http://127.0.0.1:${port}/json/version`;
    while (Date.now() < deadline) {
        try {
            return await getJson(versionUrl);
        } catch (_error) {
            await sleep(500);
        }
    }
    fail(`Timed out waiting for Electron debugging endpoint on port ${port}`);
}

async function waitForPage(browser, predicate, label, deadline) {
    while (Date.now() < deadline) {
        const pages = await browser.pages();
        const matched = pages.find((page) => predicate(page.url()));
        if (matched) {
            await waitForDomReady(matched, label);
            return matched;
        }
        await sleep(500);
    }
    const urls = (await browser.pages()).map((page) => page.url()).join(', ');
    fail(`Timed out waiting for ${label}. Open pages: ${urls}`);
}

async function waitForDomReady(page, label) {
    await page.waitForFunction(
        () => document.readyState === 'interactive' || document.readyState === 'complete',
        { timeout: 15000 }
    ).catch((error) => {
        throw new Error(`${label} did not reach DOM ready: ${error.message}`);
    });
}

function trackPage(page, diagnostics) {
    if (diagnostics.trackedPages.has(page)) return;
    diagnostics.trackedPages.add(page);

    page.on('pageerror', (error) => {
        diagnostics.pageErrors.push(`${page.url()}: ${error.stack || error.message}`);
    });

    page.on('requestfailed', (request) => {
        const url = request.url();
        const resourceType = request.resourceType();
        const failure = request.failure();
        if (url.startsWith('file:') || resourceType === 'script' || resourceType === 'stylesheet') {
            diagnostics.failedRequests.push(`${resourceType} ${url}: ${failure?.errorText || 'failed'}`);
        }
    });

    page.on('console', (message) => {
        if (message.type() === 'error') {
            diagnostics.consoleErrors.push(`${page.url()}: ${message.text()}`);
        }
    });
}

function tailLines(chunks, maxLines = 80) {
    return chunks
        .join('')
        .split(/\r?\n/)
        .filter(Boolean)
        .slice(-maxLines)
        .join('\n');
}

function dumpDiagnostics(diagnostics) {
    const stdout = tailLines(diagnostics.stdout);
    const stderr = tailLines(diagnostics.stderr);
    if (stdout) {
        console.error('[electron-ui-smoke] Electron stdout tail:');
        console.error(stdout);
    }
    if (stderr) {
        console.error('[electron-ui-smoke] Electron stderr tail:');
        console.error(stderr);
    }
    if (diagnostics.consoleErrors.length > 0) {
        console.error('[electron-ui-smoke] Renderer console error tail:');
        console.error(diagnostics.consoleErrors.slice(-40).join('\n'));
    }
}

function stopChildProcess(child) {
    if (!child || child.killed) return;
    if (process.platform === 'win32' && child.pid) {
        spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
            stdio: 'ignore',
            windowsHide: true,
        });
        return;
    }
    child.kill('SIGTERM');
}

async function inspectMainPage(page) {
    await page.waitForFunction(
        () => Boolean(window.chatAPI || window.electronAPI),
        { timeout: 20000 }
    );
    await page.waitForFunction(
        () => Boolean(window.messageRenderer && typeof window.messageRenderer.renderMessage === 'function'),
        { timeout: 20000 }
    );
    await page.waitForFunction(
        () => Boolean(window.TavernManager && window.TavernRulesEngine),
        { timeout: 20000 }
    );
    await page.waitForFunction(
        async () => {
            const api = window.chatAPI || window.electronAPI;
            if (!api?.tavernGetRules) return false;
            try {
                const result = await api.tavernGetRules();
                return Boolean(result && result.success !== false);
            } catch (_error) {
                return false;
            }
        },
        { timeout: 30000 }
    );

    const result = await page.evaluate(async () => {
        const api = window.chatAPI || window.electronAPI;
        let tavernResult = null;
        try {
            tavernResult = api?.tavernGetRules ? await api.tavernGetRules() : null;
        } catch (error) {
            tavernResult = { success: false, error: error.message };
        }
        const renderedProbe = {
            hasMarked: Boolean(window.marked),
            hasMessageRenderer: Boolean(window.messageRenderer?.renderMessage),
            hasTavernManager: Boolean(window.TavernManager),
            hasTavernRulesEngine: Boolean(window.TavernRulesEngine),
            hasGroupRenderer: Boolean(window.GroupRenderer),
            tavernGetRulesOk: Boolean(tavernResult && tavernResult.success !== false),
        };
        return renderedProbe;
    });

    if (!result.hasMarked || !result.hasMessageRenderer) {
        fail(`messageRenderer probe failed: ${JSON.stringify(result)}`);
    }
    if (!result.hasTavernManager || !result.hasTavernRulesEngine || !result.tavernGetRulesOk) {
        fail(`tavern probe failed: ${JSON.stringify(result)}`);
    }
    if (!result.hasGroupRenderer) {
        fail(`group renderer probe failed: ${JSON.stringify(result)}`);
    }

    log(`main renderer probes passed: ${JSON.stringify(result)}`);
}

async function openFromPage(page, expression, label) {
    const result = await page.evaluate(expression);
    log(`${label} IPC result: ${JSON.stringify(result ?? null)}`);
}

async function main() {
    fs.mkdirSync(userDataDir, { recursive: true });

    const electronPath = require('electron');
    const port = await portfinder.getPortPromise({ port: Number(process.env.ELECTRON_UI_SMOKE_PORT || 9333) });
    const deadline = Date.now() + timeoutMs;
    const diagnostics = {
        trackedPages: new WeakSet(),
        pageErrors: [],
        failedRequests: [],
        consoleErrors: [],
        stderr: [],
        stdout: [],
    };

    const args = [
        repoRoot,
        `--remote-debugging-port=${port}`,
        `--user-data-dir=${userDataDir}`,
        '--disable-gpu',
        '--vcpchat-electron-ui-smoke',
    ];

    log(`launching Electron on debugging port ${port}`);
    const child = spawn(electronPath, args, {
        cwd: repoRoot,
        env: {
            ...process.env,
            ELECTRON_ENABLE_LOGGING: '1',
            VCPCHAT_ELECTRON_UI_SMOKE: '1',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
    });

    child.stdout.on('data', (chunk) => {
        diagnostics.stdout.push(chunk.toString());
    });
    child.stderr.on('data', (chunk) => {
        diagnostics.stderr.push(chunk.toString());
    });

    let childExit = null;
    let stoppedBySmoke = false;
    child.on('exit', (code, signal) => {
        childExit = { code, signal };
    });

    let browser;
    try {
        await waitForDebugEndpoint(port, deadline);
        browser = await puppeteer.connect({
            browserURL: `http://127.0.0.1:${port}`,
            defaultViewport: null,
        });

        browser.on('targetcreated', async (target) => {
            if (target.type() === 'page') {
                const page = await target.page();
                if (page) trackPage(page, diagnostics);
            }
        });

        for (const page of await browser.pages()) {
            trackPage(page, diagnostics);
        }

        const mainPage = await waitForPage(browser, (url) => url.includes('main.html'), 'main window', deadline);
        await inspectMainPage(mainPage);

        await openFromPage(
            mainPage,
            async () => (window.chatAPI || window.electronAPI).openDesktopWindow(),
            'open desktop window'
        );
        const desktopPage = await waitForPage(browser, (url) => url.includes('/Desktopmodules/desktop.html'), 'desktop window', deadline);
        await desktopPage.waitForFunction(
            () => Boolean((window.desktopAPI || window.electronAPI) && window.VCPDesktop),
            { timeout: 20000 }
        );
        log('desktop window probes passed');

        await openFromPage(
            mainPage,
            async () => (window.chatAPI || window.electronAPI).openNotesWindow(),
            'open notes window'
        );
        const notesPage = await waitForPage(browser, (url) => url.includes('/Desktopmodules/legacy/Notemodules/notes.html'), 'notes window', deadline);
        await notesPage.waitForFunction(
            () => Boolean((window.utilityAPI || window.electronAPI) && document.getElementById('noteList') && document.getElementById('noteContent')),
            { timeout: 20000 }
        );
        log('notes window probes passed');

        await openFromPage(
            notesPage,
            async () => (window.utilityAPI || window.electronAPI).openNoteMiniWindow(),
            'open notemini window'
        );
        const noteMiniPage = await waitForPage(browser, (url) => url.includes('/Desktopmodules/legacy/Notemodules/notemini.html'), 'notemini window', deadline);
        await noteMiniPage.waitForFunction(
            () => Boolean((window.utilityAPI || window.electronAPI) && document.getElementById('miniNoteContent')),
            { timeout: 20000 }
        );
        log('notemini window probes passed');

        if (diagnostics.pageErrors.length > 0 || diagnostics.failedRequests.length > 0) {
            fail([
                'Electron UI smoke detected page-level failures.',
                ...diagnostics.pageErrors.map((entry) => `pageerror: ${entry}`),
                ...diagnostics.failedRequests.map((entry) => `requestfailed: ${entry}`),
            ].join('\n'));
        }

        const urls = (await browser.pages()).map((page) => page.url()).filter(Boolean);
        log(`PASS pages: ${urls.join(' | ')}`);
    } catch (error) {
        dumpDiagnostics(diagnostics);
        throw error;
    } finally {
        if (browser) {
            browser.disconnect();
        }
        if (!child.killed && childExit === null) {
            stoppedBySmoke = true;
            stopChildProcess(child);
        }
        await sleep(1000);
    }

    if (!stoppedBySmoke && childExit && childExit.code !== 0 && childExit.signal === null) {
        fail(`Electron exited with code ${childExit.code}`);
    }
}

main().catch((error) => {
    console.error(`[electron-ui-smoke] FAIL: ${error.stack || error.message}`);
    process.exitCode = 1;
});
