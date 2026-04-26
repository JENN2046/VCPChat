const express = require('express');
const path = require('path');
const fs = require('fs');

function registerRoutes(app, pluginConfig, projectBasePath) {
    const debugMode = pluginConfig.DebugMode || false;
    const imageKey = pluginConfig.DIST_IMAGE_KEY;
    const imagePath = pluginConfig.DIST_IMAGE_PATH;
    const fallbackImagePath = path.resolve(projectBasePath, '..', 'AppData', 'UserData', 'attachments');

    if (!imageKey || !imagePath) {
        console.error('[DistImageServer] Error: config.env is missing DIST_IMAGE_KEY or DIST_IMAGE_PATH.');
        return;
    }

    const resolvedImagePath = fs.existsSync(imagePath) ? imagePath : fallbackImagePath;

    if (resolvedImagePath !== imagePath) {
        console.warn(`[DistImageServer] Configured path missing, falling back to project attachments dir: ${resolvedImagePath}`);
    }

    if (!fs.existsSync(resolvedImagePath)) {
        console.error(`[DistImageServer] Error: attachment directory does not exist: ${resolvedImagePath}`);
        return;
    }

    // Legacy-compatible route format for old path-to-regexp usage.
    app.get(/\/pw=([^\/]+)\/files\/(.*)/, (req, res) => {
        const requestKey = req.params[0];
        const requestedFile = req.params[1];

        if (requestKey !== imageKey) {
            return res.status(401).send('Unauthorized');
        }

        if (!requestedFile) {
            return res.status(400).send('Bad Request: Missing filename.');
        }

        const resolvedBasePath = path.resolve(resolvedImagePath);
        const fullFilePath = path.resolve(path.join(resolvedBasePath, requestedFile));

        if (!fullFilePath.startsWith(resolvedBasePath)) {
            return res.status(403).send('Forbidden');
        }

        res.sendFile(fullFilePath, (err) => {
            if (err && !res.headersSent) {
                res.status(404).send('File not found');
            }
        });
    });

    console.log('[DistImageServer] Image server started.');
    console.log(`[DistImageServer] Attachment dir: ${resolvedImagePath}`);
    console.log('[DistImageServer] Access path: /pw=<key>/files/<filename>');
}

module.exports = { registerRoutes };
