'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createRuntimeClosureManifest, validateRuntimePolicy } = require('../modules/bootstrap/runtime-closure');
const { readPackagedFile } = require('../modules/bootstrap/packed-runtime');
const { verifyWindowPackage } = require('./lib/window-package-contract.cjs');

module.exports = async function afterPack(context) {
    const projectRoot = context.packager.projectDir;
    const manifest = createRuntimeClosureManifest({
        projectRoot,
        buildId: process.env.VCPCHAT_BUILD_ID || process.env.GITHUB_SHA || null,
        platform: context.electronPlatformName,
        arch: context.arch === 0 ? 'ia32' : context.arch === 3 ? 'arm64' : 'x64',
    });
    const policy = validateRuntimePolicy(manifest);
    if (!policy.ok) {
        throw new Error(`Runtime closure policy failed: ${JSON.stringify(policy.failures)}`);
    }
    const resourcesDirectory = context.electronPlatformName === 'darwin'
        ? path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, 'Contents', 'Resources')
        : path.join(context.appOutDir, 'resources');
    // A ready main renderer is not proof that auxiliary windows were shipped.
    // Fail the build on omissions or stale bytes before emitting a closure receipt.
    verifyWindowPackage({
        readSource: relative => {
            const target = path.join(projectRoot, relative);
            return fs.existsSync(target) ? fs.readFileSync(target) : null;
        },
        readPackaged: relative => readPackagedFile({ resourcesDirectory, relativePath: relative }),
    });
    manifest.files = manifest.files.map(entry => {
        const content = readPackagedFile({ resourcesDirectory, relativePath: entry.path });
        if (!content) throw new Error(`Packaged runtime is missing closure entry: ${entry.path}`);
        return {
            path: entry.path,
            size: content.length,
            sha256: crypto.createHash('sha256').update(content).digest('hex'),
        };
    });
    fs.mkdirSync(resourcesDirectory, { recursive: true });
    fs.writeFileSync(
        path.join(resourcesDirectory, 'vcp-runtime-closure.json'),
        `${JSON.stringify(manifest, null, 2)}\n`,
        'utf8',
    );
};
