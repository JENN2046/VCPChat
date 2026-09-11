 'use strict';
const {build,Platform}=require('electron-builder');
const config={electronFuses:{runAsNode:false,enableNodeOptionsEnvironmentVariable:false,enableNodeCliInspectArguments:false,onlyLoadAppFromAsar:true,enableEmbeddedAsarIntegrityValidation:process.platform!=='linux'}};
if(process.env.C2_ELECTRON_DIST)config.electronDist=process.env.C2_ELECTRON_DIST;
if(process.env.C2_ARTIFACT_OUTPUT)config.directories={output:process.env.C2_ARTIFACT_OUTPUT};
// Native C2 N-API module is built explicitly. Other application native rebuilds remain
// the existing application build prerequisite; this source pack does not run live VCP.
config.npmRebuild=false;
build({targets:Platform.current().createTarget('dir'),config}).catch(e=>{console.error(e.message);process.exitCode=1;});
