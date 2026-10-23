'use strict';
// An isolated, actual Electron browser-process benchmark, not a renderer mock.
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {performance,monitorEventLoopDelay}=require('node:perf_hooks');
const {makeFixture,loadAdapter,topic}=require('../tests/helpers/nativeSyncCaptureFixture.cjs');
const {durableJson}=require('../modules/services/nativeSync/durableJson');
if(process.type!=='browser')throw Error('REAL_ELECTRON_MAIN_REQUIRED');
const out=path.resolve(process.argv[2]||''),baseline=path.resolve(process.argv[3]||'');
if(!out.toLowerCase().startsWith('p:\\vcpkf\\vcp\\artifacts\\native-sync-p1\\')||!baseline.toLowerCase().startsWith('p:\\vcpkf\\vcp\\artifacts\\native-sync-p1\\'))throw Error('EXPLICIT_P1_ISOLATION_REQUIRED');
app.setPath('userData',path.join(out,'electron-profile'));app.disableHardwareAcceleration();
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
async function measure(label,file,n){
 const counters={},Adapter=loadAdapter(file,counters),fixture=makeFixture(n);
 const folder=path.join(out,label+'-'+n);await fs.mkdir(folder,{recursive:true});let persists=0;
 const queue={userDataDir:path.join(folder,'UserData'),getHistoryPath:(owner,id)=>path.join(folder,'UserData',owner,'topics',id,'history.json')};
 const adapter=new Adapter({queue,statePath:path.join(folder,'sync.json'),deviceId:'performance-device',url:'http://127.0.0.1:1',token:'synthetic-unused',topics:[topic],persist:async(file,value)=>{persists++;await durableJson(file,value);}});adapter.state=fixture.state;
 assert.equal(fixture.history.length,n);assert.equal(adapter.state.outbox.length,n);
 const histogram=monitorEventLoopDelay({resolution:10});histogram.enable();await pause(80);histogram.reset();
 let last=performance.now();const delays=[];
 const heartbeat=setInterval(()=>{const now=performance.now();delays.push(Math.max(0,now-last-10));last=now;},10);
 const probeStart=performance.now(),timerProbe=new Promise(resolve=>setTimeout(()=>resolve(performance.now()-probeStart),0));
 const cpu=process.cpuUsage(),started=performance.now();await adapter.capture(topic,fixture.history);
 const elapsedMs=performance.now()-started,cpuUsed=process.cpuUsage(cpu),timerProbeMs=await timerProbe;await pause(80);histogram.disable();clearInterval(heartbeat);
 delays.sort((a,b)=>a-b);
 const bytes=await fs.readFile(adapter.statePath);assert.equal(persists,1);
 return {label,n,elapsedMs,cpuUserMs:cpuUsed.user/1000,cpuSystemMs:cpuUsed.system/1000,eventLoopMaxMs:delays.at(-1)||0,eventLoopP99Ms:delays[Math.max(0,Math.ceil(delays.length*.99)-1)]||0,timerProbeMs,perfHooksMaxMs:histogram.max/1e6,counters,persistCalls:persists,initialOutbox:n,finalOutbox:adapter.state.outbox.length,stateSha256:digest(bytes)};
}
app.whenReady().then(async()=>{
 await fs.mkdir(out,{recursive:true});const window=new BrowserWindow({show:false,webPreferences:{sandbox:true}});await window.loadURL('data:text/html,<title>P1 isolated capture benchmark</title>');
 const fixed=path.resolve(__dirname,'../modules/services/nativeSync/adapter.js'),rows=[];
 for(const n of [1000,5000]){
  const before=await measure('before',baseline,n),after=await measure('after',fixed,n);rows.push({before,after,elapsedSpeedup:before.elapsedMs/after.elapsedMs,keyCallReduction:before.counters.messageKey/after.counters.messageKey});
  assert.equal(before.stateSha256,after.stateSha256,'Outbox/baseHash/tombstone/order/state bytes changed');
  for(const name of ['messageHash','canonicalMessage','tombstoneHash'])assert.equal(before.counters[name],after.counters[name],name+' calls changed');
  assert.ok(after.counters.messageKey<20*n,'Outbox key work must be linear');assert.ok(before.counters.messageKey>after.counters.messageKey*20,'Baseline quadratic work must be reproduced');
  assert.ok(after.elapsedMs<before.elapsedMs*.5,'Same-runtime relative performance improvement required');
  assert.ok(after.timerProbeMs<before.timerProbeMs*.5,'Main-thread timer lateness must improve, not only total elapsed time');
 }
 const receipt={result:'P1_ELECTRON_CAPTURE_PERFORMANCE_PASS',electron:process.versions.electron,node:process.versions.node,processType:process.type,platform:process.platform,sameProcess:true,hashFunctionsUnchanged:true,durableWritesPerCapture:1,comparison:'Both variants use the same deterministic UUID and counting wrappers around unchanged real protocol functions; actual durableJson writes. No metadata hash cache.',rows};
 await fs.writeFile(path.join(out,'PERFORMANCE.json'),JSON.stringify(receipt,null,2));process.stdout.write(JSON.stringify(receipt)+'\n');window.destroy();app.quit();
}).catch(async error=>{await fs.mkdir(out,{recursive:true});await fs.writeFile(path.join(out,'PERFORMANCE_FAILURE.json'),JSON.stringify({result:'FAIL',code:error.code||error.name,message:error.message}));app.exit(1);});
