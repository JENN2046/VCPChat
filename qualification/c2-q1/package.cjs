'use strict';
const {build,Platform}=require('electron-builder'),fs=require('node:fs'),crypto=require('node:crypto');
// Sign the disposable native artifact before committing its hash inside ASAR.
if(process.platform==='darwin')require('node:child_process').execFileSync('/usr/bin/codesign',['--force','--sign','-','--timestamp=none','native/build/Release/qualification_provider.node']);
fs.writeFileSync('artifact-native.json',JSON.stringify({sha256:crypto.createHash('sha256').update(fs.readFileSync('native/build/Release/qualification_provider.node')).digest('hex')}));
build({targets:Platform.current().createTarget('dir'),config:{directories:{output:'artifact'},electronFuses:{runAsNode:false,enableNodeOptionsEnvironmentVariable:false,enableNodeCliInspectArguments:false,onlyLoadAppFromAsar:true,enableEmbeddedAsarIntegrityValidation:process.platform!=='linux'}}}).catch(e=>{console.error(e.stack);process.exitCode=1;});
