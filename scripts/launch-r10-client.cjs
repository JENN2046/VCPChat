'use strict';
// Small local launcher: existing SSH transport, unchanged application entry.
const {spawn}=require('node:child_process'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(process.argv[2]||''),source=path.resolve(__dirname,'..'),electron='P:/VCPKF/vcp/artifacts/native-sync-r2/deps/node_modules/electron/dist/electron.exe';
let ssh,client,stopping=false,retry;
const write=(file,value)=>fs.writeFileSync(path.join(root,file),JSON.stringify(value,null,2));
function tunnel(){
 ssh=spawn('ssh',['-vv','-T','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','SendEnv=-*','-o','ExitOnForwardFailure=yes','-o','ServerAliveInterval=15','-o','ServerAliveCountMax=3','-L','127.0.0.1:53306:127.0.0.1:6005','wp08','cat'],{windowsHide:true,stdio:['pipe','ignore','ignore']});
 ssh.stdin.on('error',()=>{});ssh.on('error',()=>write('MODEL_TUNNEL_STATUS.json',{status:'SSH_SPAWN_FAILED'}));
 ssh.on('exit',(code,signal)=>{if(!stopping){write('MODEL_TUNNEL_STATUS.json',{status:'RECONNECTING',exitCode:code,signal});retry=setTimeout(tunnel,3000);}});
}
function stop(){stopping=true;clearTimeout(retry);if(ssh&&!ssh.killed){ssh.stdin.end();const timer=setTimeout(()=>ssh.kill(),3000);timer.unref();}}
async function main(){
 // SSH reconnects independently; local chat and durable Outbox must start offline.
 tunnel();
 const env={};for(const key of ['PATH','SystemRoot','WINDIR','COMSPEC','PATHEXT','USERPROFILE','HOMEDRIVE','HOMEPATH','USERNAME','USERDOMAIN','PROCESSOR_ARCHITECTURE','NUMBER_OF_PROCESSORS','PROGRAMFILES','PROGRAMFILES(X86)','PROGRAMDATA','PUBLIC','SESSIONNAME'])if(process.env[key])env[key]=process.env[key];
 Object.assign(env,{VCPCHAT_APP_DATA_DIR:path.join(root,'AppData'),APPDATA:path.join(root,'os-roaming'),LOCALAPPDATA:path.join(root,'os-local'),TEMP:path.join(root,'temp'),TMP:path.join(root,'temp'),NODE_PATH:['P:/VCPKF/vcp/artifacts/native-sync-r3/deps/node_modules','P:/VCPKF/vcp/artifacts/native-sync-r2/deps/node_modules'].join(path.delimiter)});
 const debugPort=Number(process.env.VCP_R10_ACCEPTANCE_DEBUG_PORT)||0;
 if(debugPort&&(!Number.isSafeInteger(debugPort)||debugPort<1024||debugPort>65535))throw Error('INVALID_ACCEPTANCE_DEBUG_PORT');
 client=spawn(electron,[source,...(debugPort?[`--remote-debugging-port=${debugPort}`,'--remote-debugging-address=127.0.0.1']:[])],{cwd:source,env,windowsHide:true,stdio:'ignore'});
 client.on('error',()=>{write('LAUNCH_ERROR.json',{code:'ELECTRON_SPAWN_FAILED'});stop();});
 write('LAUNCH.json',{pid:client.pid,sourceRoot:source,appData:env.VCPCHAT_APP_DATA_DIR,productSource:'current-worktree',launchedUtc:new Date().toISOString(),supervisorPid:process.pid,modelSshPid:ssh.pid,modelForward:'127.0.0.1:53306 -> wp08:127.0.0.1:6005',syncForward:'127.0.0.1:53305 -> wp08:127.0.0.1:8888',debugPortEnabled:!!debugPort,debugPort:debugPort||undefined,productionServiceRestarted:false});
 write('MODEL_TUNNEL_STATUS.json',{status:'CONNECTING',localAddress:'127.0.0.1',localPort:53306,remoteLoopbackPort:6005});
 client.on('exit',(code,signal)=>{write('LAST_EXIT.json',{pid:client.pid,exitCode:code,signal,closedUtc:new Date().toISOString()});stop();});
}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
if(!process.argv[2])throw Error('EXPLICIT_LAUNCH_DATA_ROOT_REQUIRED');
main().catch(e=>{write('LAUNCH_ERROR.json',{code:/^[A-Z_]+$/.test(e.message)?e.message:'LAUNCH_FAILED'});stop();process.exitCode=1;});
