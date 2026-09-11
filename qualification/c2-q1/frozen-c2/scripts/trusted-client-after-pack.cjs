 'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const original=require('./electron-builder-bootstrap-hooks.cjs');
const {readPackagedFile}=require('../modules/bootstrap/packed-runtime');
module.exports=async context=>{
    await original(context); // Preserve the existing runtime-closure guard; no bypass.
    const resources=context.electronPlatformName==='darwin'?path.join(context.appOutDir,context.packager.appInfo.productFilename+'.app/Contents/Resources'):path.join(context.appOutDir,'resources');
    const root=context.packager.projectDir,files=[];
    function scan(dir){for(const entry of fs.readdirSync(path.join(root,dir),{withFileTypes:true})){const rel=dir+'/'+entry.name;if(entry.isDirectory())scan(rel);else if(/\.(js|html|css|node)$/.test(rel)){const bytes=readPackagedFile({resourcesDirectory:resources,relativePath:rel});if(!bytes)throw Error('C2_PACKAGED_FILE_MISSING: '+rel);files.push({path:rel,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});}}}
    scan('modules/trusted-client');const preload='preloads/trusted-approval.js',bytes=readPackagedFile({resourcesDirectory:resources,relativePath:preload});if(!bytes)throw Error('C2_PRELOAD_MISSING');files.push({path:preload,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});
    fs.writeFileSync(path.join(resources,'trusted-client-manifest.json'),JSON.stringify({schemaVersion:1,profile:'PRODUCTION_DISABLED',platform:context.electronPlatformName,files,qualification:'Supplementary packaged hashes, not a self-hashing trust root. Platform signing and caller/input assurance remain independently required.'},null,2));
};
