const express = require('express');
const path = require('path');
const fs = require('fs');

function registerRoutes(app, pluginConfig, projectBasePath) {
    const debugMode = pluginConfig.DebugMode || false;
    const imageKey = typeof pluginConfig.DIST_IMAGE_KEY === 'string' ? pluginConfig.DIST_IMAGE_KEY.trim() : '';
    const imagePath = pluginConfig.DIST_IMAGE_PATH;
    const fallbackImagePath = path.resolve(projectBasePath, '..', 'AppData', 'UserData', 'attachments');

    if (imageKey.length < 16 || !imagePath) {
        console.error('[DistImageServer] Error: config.env must set DIST_IMAGE_KEY to a unique value of at least 16 characters and set DIST_IMAGE_PATH before enabling this service.');
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
