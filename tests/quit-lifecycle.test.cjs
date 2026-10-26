'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createQuitAdmission}=require('../modules/services/quitAdmission.cjs');
const root=path.resolve(__dirname,'..');
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};}
function manager(gate){
 const source=fs.readFileSync(path.join(root,'VCPDistributedServer/Plugin.js'),'utf8');
 const ctx={__dirname:'/isolated',process:{env:{}},console:{log(){},error(){},warn(){}},module:{exports:{}},require:id=>{
  if(id==='../modules/services/quitAdmission.cjs')return gate;
  if(id==='fs')return {promises:{}};if(id==='path')return path;
  if(id==='child_process')return {};if(id==='dotenv'||id==='node-schedule')return {};
  throw Error('Unexpected dependency '+id);
 }};vm.runInNewContext(source,ctx);return ctx.module.exports;
}
function server(gate,plugins,extra={}){
 const s=fs.readFileSync(path.join(root,'VCPDistributedServer/VCPDistributedServer.js'),'utf8');
 const method=s.slice(s.indexOf('    async stop('),s.lastIndexOf('\n}'));
 const stop=vm.runInNewContext('({'+method+'}).stop',{quitAdmission:gate,pluginManager:plugins,console:{log(){},warn(){}},clearTimeout,WebSocket:{OPEN:1,CONNECTING:0}});
 const events=[];return {events,stopped:false,stop,stopPromise:null,initializePromise:null,clearStaticPlaceholderUpdates:()=>events.push('timers'),closeMusicPlaylistWatcher:async()=>events.push('watcher'),...extra};
}
function main(gate,distributed,gui={cleanupForQuit:async()=>{}}){
 const s=fs.readFileSync(path.join(root,'main.js'),'utf8');const events=[];
 const context={quitAdmission:gate,prepareProjectForgeQuit:async()=>true,cancelProjectForgeQuit:async()=>{},appQuitCleanupPromise:null,distributedServer:distributed,projectForgeHandlers:gui,
 historyWatcherLeases:{dispose:async()=>events.push('history')},localSttHandlers:{shutdown:()=>events.push('voice')},voiceHandlers:{shutdownVoiceInputEngine:async()=>{}},
 getAgentMoodStore:()=>null,appFeatures:{disposeAll:async()=>events.push('features')},chatDataService:null,loomManager:null,workspaceHandlers:{dispose:()=>events.push('workspace')},historyMutationQueue:null,pluginAgentOperationService:{},chartService:null,stopAudioEngine:async()=>events.push('audio'),
 mainWindow:null,console:{log(){},warn(){}},quitCleanupSettled:false,isFinalizingQuit:false,app:{on:(name,cb)=>context.beforeQuit=cb,quit:()=>events.push('quit')}};
 vm.createContext(context);vm.runInContext(s.slice(s.indexOf('async function performQuitCleanup()'),s.indexOf('// --- Main Window Creation ---')),context);
 vm.runInContext(s.slice(s.indexOf("    app.on('before-quit'"),s.indexOf("    app.on('will-quit'")),context);
 return {context,events,quit:()=>context.beforeQuit({preventDefault:()=>events.push('prevent')})};
}
test('held GUI or tool work refuses quit without starting any teardown, then idle retry succeeds',async()=>{
 for(const kind of ['GUI','tool']){
  const gate=createQuitAdmission(),hold=deferred(),p=manager(gate);let calls=0;
  p.plugins.set('ProjectForge',{pluginType:'hybridservice',communication:{protocol:'direct'}});
  p.serviceModules.set('ProjectForge',{module:{cleanup:async()=>calls++,processToolCall:()=>hold.promise}});
  const guiHandlers=new Map();gate.guardIpcMain({handle:(name,cb)=>guiHandlers.set(name,cb)}).handle('revert',()=>hold.promise);
  const pending=kind==='GUI'?guiHandlers.get('revert')():p.processToolCall('ProjectForge',{});
  const d=server(gate,p),app=main(gate,d);await app.quit();
  assert.equal(calls,0);assert.deepEqual(d.events,[]);assert.deepEqual(app.events,['prevent']);
  assert.equal(app.context.distributedServer,d);assert.equal(app.context.quitCleanupSettled,false);
  hold.resolve('done');await pending;await app.quit();
  assert.equal(calls,1);assert.equal(d.stopped,true);assert.equal(app.events.at(-1),'quit');
 }
});
test('PF busy refusal preserves timers, GUI, evidence and server; retry opens admission',async()=>{
 const gate=createQuitAdmission(),p=manager(gate),trace=[];let busy=true;
 p.scheduledJobs.set('timer',{cancel:()=>trace.push('timer')});
 p.serviceModules.set('Other',{module:{cleanup:async()=>trace.push('other')}});
 p.serviceModules.set('ProjectForge',{module:{cleanup:async()=>{trace.push('PF');if(busy)throw Error('PROJECTFORGE_BUSY')}}});
 const d=server(gate,p),app=main(gate,d);await app.quit();
 assert.deepEqual(trace,['PF']);assert.deepEqual(d.events,[]);assert.equal(d.stopped,false);assert.equal(d.stopPromise,null);
 assert.equal(await gate.run(()=>42),42);assert.equal(app.context.distributedServer,d);assert.equal(app.context.appQuitCleanupPromise,null);
 busy=false;await app.quit();assert.deepEqual(trace,['PF','PF','timer','other']);assert.equal(app.events.at(-1),'quit');
});
test('GUI-only lazy PF busy refusal runs before shutdown of any other service',async()=>{
 const gate=createQuitAdmission();let busy=true;const app=main(gate,null,{cleanupForQuit:async()=>{if(busy)throw Object.assign(Error('PROJECTFORGE_BUSY'),{shutdownUnchanged:true})}});
 await app.quit();assert.deepEqual(app.events,['prevent']);assert.equal(await gate.run(()=>true),true);
 busy=false;await app.quit();assert.equal(app.events.at(-1),'quit');
});
test('new GUI/tool admission is rejected throughout asynchronous cleanup',async()=>{
 const gate=createQuitAdmission(),hold=deferred(),entered=deferred(),p=manager(gate);
 p.serviceModules.set('ProjectForge',{module:{cleanup:async()=>{entered.resolve();await hold.promise}}});
 const d=server(gate,p),app=main(gate,d),pending=app.quit();await entered.promise;
 await assert.rejects(gate.run(()=>assert.fail('new GUI work ran')),/APPLICATION_SHUTTING_DOWN/);
 await assert.rejects(p.processToolCall('ProjectForge',{}),/APPLICATION_SHUTTING_DOWN/);
 assert.deepEqual(d.events,[]);hold.resolve();await pending;assert.equal(app.events.at(-1),'quit');
});
test('cleanup failure is propagated, never marked successful or quit; retry can finish',async()=>{
 const gate=createQuitAdmission(),p=manager(gate);let fails=true;
 p.serviceModules.set('Other',{module:{cleanup:async()=>{if(fails)throw Error('cleanup failed')}}});
 const d=server(gate,p),app=main(gate,d);await app.quit();assert.equal(app.context.quitCleanupSettled,false);assert.equal(app.events.includes('quit'),false);assert.equal(app.context.distributedServer,d);
 await assert.rejects(gate.run(()=>1),/APPLICATION_SHUTTING_DOWN/);fails=false;await app.quit();assert.equal(app.events.at(-1),'quit');
});
test('repeated quit shares one pending cleanup and keeps the window visible until success',async()=>{
 const gate=createQuitAdmission(),hold=deferred(),entered=deferred();let cleanup=0;
 const d={stop:async()=>{cleanup++;entered.resolve();await hold.promise}};const app=main(gate,d);
 const a=app.quit();await entered.promise;await app.quit();assert.equal(cleanup,1);assert.equal(app.events.includes('quit'),false);
 hold.resolve();await a;assert.equal(app.events.filter(x=>x==='quit').length,1);await app.quit();assert.equal(cleanup,1);
});
test('WS admission encloses execution and result delivery; late calls receive definite shutdown error',async()=>{
 const source=fs.readFileSync(path.join(root,'VCPDistributedServer/VCPDistributedServer.js'),'utf8');
 const method=source.slice(source.indexOf('    async handleToolExecutionRequest('),source.indexOf('    async handleAdmittedToolExecutionRequest('));
 const gate=createQuitAdmission(),hold=deferred(),trace=[];
 const handler=vm.runInNewContext('({'+method+'}).handleToolExecutionRequest',{quitAdmission:gate});
 const d={handleAdmittedToolExecutionRequest:async()=>{trace.push('execution');await hold.promise;trace.push('delivered')},sendMessage:value=>trace.push(value.data.error)};
 const pending=handler.call(d,{requestId:'synthetic-1'});assert.throws(()=>gate.begin(),/APPLICATION_BUSY/);hold.resolve();await pending;
 gate.begin();await handler.call(d,{requestId:'synthetic-2'});assert.deepEqual(trace,['execution','delivered','APPLICATION_SHUTTING_DOWN']);
});

test('cancelled dirty editor quit performs no cleanup and reopens admission',async()=>{
 const gate=createQuitAdmission();let cleanup=0;const app=main(gate,{stop:async()=>cleanup++});
 app.context.prepareProjectForgeQuit=async()=>false;await app.quit();
 assert.equal(cleanup,0);assert.equal(await gate.run(()=>true),true);assert.equal(app.context.isFinalizingQuit,false);
 app.context.prepareProjectForgeQuit=async()=>true;await app.quit();assert.equal(cleanup,1);assert.equal(app.events.at(-1),'quit');
});

test('quit refusal restores a minimized main window and resets quitting state',async()=>{
 const gate=createQuitAdmission(),hold=deferred(),pending=gate.run(()=>hold.promise),app=main(gate,null),trace=[];
 app.context.app.isQuitting=true;
 app.context.mainWindow={isDestroyed:()=>false,isMinimized:()=>true,restore:()=>trace.push('restore'),show:()=>trace.push('show'),focus:()=>trace.push('focus')};
 await app.quit();assert.deepEqual(trace,['restore','show','focus']);assert.equal(app.context.app.isQuitting,false);
 hold.resolve();await pending;
});
test('CDS failure retains its reference and retries the failed shutdown before quit',async()=>{
 const gate=createQuitAdmission(),app=main(gate,null);let attempts=0;const cds={stop:async()=>{attempts++;if(attempts===1)throw Error('CDS failed')}};
 app.context.chatDataService=cds;await app.quit();assert.equal(app.context.chatDataService,cds);assert.equal(app.events.includes('quit'),false);
 await app.quit();assert.equal(attempts,2);assert.equal(app.context.chatDataService,null);assert.equal(app.events.at(-1),'quit');
});

test('frozen sender-guard IPC composes with lifecycle admission and preserves denial',async()=>{
 const {guardIpcMain}=require('../modules/ipc/sidePaneIpcPolicy');
 for(const allowed of [true,false]){
  const gate=createQuitAdmission(),handlers=new Map(),removed=[];
  const raw={handle:(name,cb)=>handlers.set(name,cb),removeHandler:name=>removed.push(name)};
  const guarded=guardIpcMain(raw,()=>allowed);assert.equal(Object.isFrozen(guarded),true);
  const wrapped=gate.guardIpcMain(guarded);wrapped.removeHandler('old');
  wrapped.handle('read',async()=>42);assert.deepEqual(removed,['old']);
  const result=await handlers.get('read')({});
  if(allowed)assert.equal(result,42);else assert.equal(result.success,false);
  gate.begin();if(allowed)await assert.rejects(handlers.get('read')({}),/APPLICATION_SHUTTING_DOWN/);else assert.equal((await handlers.get('read')({})).success,false);
 }
});
test('real PF GUI registration boots through the frozen sender and quit adapters without loading PF',()=>{
 const {guardIpcMain}=require('../modules/ipc/sidePaneIpcPolicy');const raw={handle(){},removeHandler(){}};
 const ipc=createQuitAdmission().guardIpcMain(guardIpcMain(raw,()=>false));
 const source=fs.readFileSync(path.join(root,'modules/ipc/projectForgeHandlers.js'),'utf8');
 const context={module:{exports:{}},__dirname:path.join(root,'modules/ipc'),console,require:id=>{
  if(id==='electron')return {ipcMain:raw};
  if(['path','fs','url'].includes(id))return require(id);
  throw Error('PF must not be loaded during GUI registration: '+id);
 }};
 vm.runInNewContext(source,context);context.module.exports.initialize({ipcMain:ipc});
});

// Exercise the real editor guard, including cancellation before host teardown.
for (const choice of [0, 1]) test(`dirty source quit choice ${choice} preserves discard semantics`, async () => {
 const { EventEmitter } = require('node:events');
 const guard = require('../modules/ipc/projectForgeCloseGuard');
 const win = new EventEmitter(), webContents = new EventEmitter();
 const document = { documentElement: { inert: false }, querySelector: () => ({ hidden: false }) };
 let prompts = 0;
 webContents.executeJavaScript = async code => vm.runInNewContext(code, { document });
 win.webContents = webContents; win.isDestroyed = () => false;
 guard.installProjectForgeCloseGuard(win, { showMessageBoxSync: () => { prompts++; return choice; } });
 try {
  assert.equal(await guard.prepareProjectForgeQuit(), choice === 1);
  assert.equal(document.documentElement.inert, choice === 1);
  if (choice === 1) {
   let allowed = false;
   webContents.emit('will-prevent-unload', { preventDefault: () => { allowed = true; } });
   assert.equal(allowed, true);
   assert.equal(prompts, 1, 'confirmed discard must not prompt twice');
  }
  await guard.cancelProjectForgeQuit();
  assert.equal(document.documentElement.inert, false);
 } finally { win.emit('closed'); }
});

for (const retry of ['cancel', 'busy']) test(`partial cleanup followed by ${retry} keeps host admission closed`, async () => {
 const gate = createQuitAdmission();
 let attempts = 0;
 const app = main(gate, { stop: async () => {
  if (++attempts === 1) throw Error('partial cleanup failed');
  throw Object.assign(Error('PROJECTFORGE_BUSY'), { shutdownUnchanged: true });
 } });
 await app.quit();
 await assert.rejects(gate.run(() => 1), /APPLICATION_SHUTTING_DOWN/);
 if (retry === 'cancel') app.context.prepareProjectForgeQuit = async () => false;
 await app.quit();
 await assert.rejects(gate.run(() => 1), /APPLICATION_SHUTTING_DOWN/);
 assert.equal(app.events.includes('quit'), false);
});

test('stop cancels remaining startup before waiting for initialization', async () => {
 const gate = createQuitAdmission(), p = manager(gate), hold = deferred();
 const d = server(gate, p);
 let lateStartup = false;
 d.initializePromise = hold.promise.then(() => { if (!d.stopped) lateStartup = true; });
 const stopping = d.stop();
 hold.resolve();
 await stopping;
 assert.equal(lateStartup, false, 'startup must observe the stop request before loading more services');
 assert.equal(d.stopped, true);
});
