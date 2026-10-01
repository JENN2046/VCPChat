"use strict";

const { ipcMain } = require("electron");
const { SuveiHumanAuthorizationService } = require("../services/suveiHumanAuthorizationService");

let initialized = false;

function initialize({ mainWindow, getMainWindow, settingsManager, service } = {}) {
    if (initialized) return;
    initialized = true;
    const resolvedService = service || new SuveiHumanAuthorizationService({ settingsManager });
    const resolveMainWindow = () => {
        const current = typeof getMainWindow === "function" ? getMainWindow() : mainWindow;
        return current && !current.isDestroyed() ? current : null;
    };
    const isMainRenderer = event => {
        const current = resolveMainWindow();
        return Boolean(current && event?.sender === current.webContents);
    };
    const result = async (event, operation) => {
        if (!isMainRenderer(event)) {
            return { success: false, code: "SUVEI_TRUSTED_CLIENT_REQUIRED", error: "SUVEI human authorization is restricted to the main VCPChat surface." };
        }
        try {
            return { success: true, ...(await operation()) };
        } catch (error) {
            return {
                success: false,
                code: error?.code || "SUVEI_HUMAN_AUTHORIZATION_FAILED",
                status: error?.status ?? null,
                error: error?.message || "SUVEI human authorization failed.",
            };
        }
    };

    ipcMain.handle("suvei-human-authorization:status", event =>
        result(event, async () => ({ status: resolvedService.status() })));

    ipcMain.handle("suvei-human-authorization:login", (event, payload = {}) =>
        result(event, async () => ({ status: await resolvedService.login(payload.password) })));

    ipcMain.handle("suvei-human-authorization:logout", event =>
        result(event, async () => ({ status: await resolvedService.logout() })));

    ipcMain.handle("suvei-human-authorization:prepare", (event, approvalData = {}) =>
        result(event, async () => ({ packet: await resolvedService.prepare(approvalData) })));

    ipcMain.handle("suvei-human-authorization:decide", (event, payload = {}) =>
        result(event, async () => ({ decision: await resolvedService.decide(payload) })));

    const initialWindow = resolveMainWindow();
    initialWindow?.webContents?.once?.("destroyed", () => {
        void resolvedService.logout();
    });
}

module.exports = { initialize };
