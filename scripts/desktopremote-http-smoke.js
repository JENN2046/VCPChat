#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const dotenv = require('dotenv');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const DIST_CONFIG_PATH = path.join(PROJECT_ROOT, 'VCPDistributedServer', 'config.env');
const GENERATED_LISTS_CONFIG_PATH = path.join(PROJECT_ROOT, 'AppData', 'generated_lists', 'config.env');
const TOOLBOX_CONFIG_PATH = path.resolve(PROJECT_ROOT, '..', 'VCPToolBox', 'config.env');
const DEFAULT_HOST = '127.0.0.1';
const HOST_ENV_VAR = 'DESKTOP_REMOTE_HOST';
const PORT_ENV_VAR = 'DESKTOP_REMOTE_PORT';
const FILE_KEY_ENV_VAR = 'DESKTOP_REMOTE_FILE_KEY';
const TEST_WIDGET_ID = 'desktopremote-http-smoke';
const TEST_WIDGET_MARKER = 'Codex DesktopRemote HTTP Smoke';

function readEnvFile(filePath) {
    try {
        if (!fs.existsSync(filePath)) return {};
        return dotenv.parse(fs.readFileSync(filePath));
    } catch (error) {
        throw new Error(`Failed to read ${path.relative(PROJECT_ROOT, filePath)}: ${error.message}`);
    }
}

function parseArgs(argv) {
    const options = {};
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (!arg.startsWith('--')) continue;

        const key = arg.slice(2);
        const value = argv[i + 1];
        if (!value || value.startsWith('--')) {
            throw new Error(`Missing value for --${key}`);
        }
        options[key] = value;
        i += 1;
    }
    return options;
}

function resolveConfig(cliOptions) {
    const distConfig = readEnvFile(DIST_CONFIG_PATH);
    const generatedConfig = readEnvFile(GENERATED_LISTS_CONFIG_PATH);
    const toolboxConfig = readEnvFile(TOOLBOX_CONFIG_PATH);

    const port = Number(cliOptions.port || process.env[PORT_ENV_VAR] || distConfig.DIST_SERVER_PORT);
    if (!port || Number.isNaN(port)) {
        throw new Error(`DesktopRemote port is missing or invalid. Provide --port, ${PORT_ENV_VAR}, or DIST_SERVER_PORT.`);
    }

    const key = cliOptions.key
        || process.env[FILE_KEY_ENV_VAR]
        || pickFileKey(process.env)
        || pickFileKey(generatedConfig)
        || pickFileKey(toolboxConfig);
    if (!key) {
        throw new Error(`DesktopRemote file key is missing. Provide --key, ${FILE_KEY_ENV_VAR}, file_key/File_Key/FILE_KEY, AppData/generated_lists/config.env, or VCPToolBox/config.env.`);
    }

    return {
        host: cliOptions.host || process.env[HOST_ENV_VAR] || DEFAULT_HOST,
        port,
        key,
    };
}

function pickFileKey(config = {}) {
    return config.file_key || config.File_Key || config.FILE_KEY || null;
}

function postJson({ host, port, key }, payload) {
    const requestBody = JSON.stringify(payload);
    const requestOptions = {
        host,
        port,
        path: `/pw=${encodeURIComponent(key)}/desktop-remote-test`,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(requestBody),
        },
        timeout: 10000,
    };

    return new Promise((resolve, reject) => {
        const req = http.request(requestOptions, (res) => {
            let raw = '';
            res.setEncoding('utf8');
            res.on('data', (chunk) => {
                raw += chunk;
            });
            res.on('end', () => {
                let parsed = null;
                try {
                    parsed = raw ? JSON.parse(raw) : null;
                } catch (error) {
                    return reject(new Error(`Invalid JSON response (${res.statusCode}): ${raw}`));
                }

                if (res.statusCode < 200 || res.statusCode >= 300) {
                    return reject(new Error(`HTTP ${res.statusCode}: ${parsed?.error || raw || 'Request failed'}`));
                }

                resolve(parsed);
            });
        });

        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy(new Error('Request timed out.'));
        });

        req.write(requestBody);
        req.end();
    });
}

function extractTextContent(response) {
    const blocks = response?.result?.result?.content;
    if (!Array.isArray(blocks)) return '';
    return blocks
        .filter((item) => item && item.type === 'text')
        .map((item) => item.text || '')
        .join('\n');
}

async function main() {
    const cliOptions = parseArgs(process.argv.slice(2));
    const config = resolveConfig(cliOptions);
    let cleanupRequired = false;
    let primaryError = null;

    console.log(`[smoke] DesktopRemote HTTP target: http://${config.host}:${config.port}/pw=<key>/desktop-remote-test`);

    try {
        const createPayload = {
            command: 'CreateWidget',
            widgetId: TEST_WIDGET_ID,
            htmlContent: `<div style="padding:12px;font-size:18px;">${TEST_WIDGET_MARKER}</div>`,
            x: 180,
            y: 180,
            width: 320,
            height: 140,
        };
        const createResponse = await postJson(config, createPayload);
        if (!createResponse?.success || createResponse?.result?.status !== 'success') {
            throw new Error('CreateWidget did not succeed.');
        }
        const createdWidgetId = createResponse?.result?.result?.content
            ? TEST_WIDGET_ID
            : (createResponse?.commandPayload?.widgetId || TEST_WIDGET_ID);
        cleanupRequired = true;
        console.log(`[smoke] CreateWidget PASS: ${createdWidgetId}`);

        const queryResponse = await postJson(config, { command: 'QueryDesktop' });
        const desktopReport = extractTextContent(queryResponse);
        if (!queryResponse?.success || !desktopReport.includes(TEST_WIDGET_ID)) {
            throw new Error('QueryDesktop did not report the smoke widget.');
        }
        console.log('[smoke] QueryDesktop PASS');

        const sourceResponse = await postJson(config, {
            command: 'ViewWidgetSource',
            widgetId: TEST_WIDGET_ID,
        });
        const widgetSource = extractTextContent(sourceResponse);
        if (!sourceResponse?.success || !widgetSource.includes(TEST_WIDGET_MARKER)) {
            throw new Error('ViewWidgetSource did not include the smoke marker.');
        }
        console.log('[smoke] ViewWidgetSource PASS');

        console.log('[smoke] DesktopRemote HTTP smoke test passed.');
    } catch (error) {
        primaryError = error;
        throw error;
    } finally {
        if (cleanupRequired) {
            try {
                await cleanupSmokeWidget(config);
            } catch (error) {
                if (!primaryError) {
                    throw error;
                }
                console.warn(`[smoke] DeleteWidget cleanup failed after smoke failure: ${error.message}`);
            }
        }
    }
}

async function cleanupSmokeWidget(config) {
    try {
        const deleteResponse = await postJson(config, {
            command: 'DeleteWidget',
            widgetId: TEST_WIDGET_ID,
        });
        if (deleteResponse?.success && deleteResponse?.result?.status === 'success') {
            console.log('[smoke] DeleteWidget cleanup PASS');
        } else {
            throw new Error('DeleteWidget cleanup did not report success.');
        }
    } catch (error) {
        throw new Error(`DeleteWidget cleanup failed: ${error.message}`);
    }
}

main().catch((error) => {
    console.error(`[smoke] FAIL: ${error.message}`);
    process.exit(1);
});
