'use strict';
// Renderer acceptance against the actual ASAR, with its real role preloads.
// No application main-process handlers, providers, native audio, user files or services run here.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {createRequire}=require('node:module');
const {fileURLToPath}=require('node:url');
const root=process.cwd(),req=createRequire(path.join(root,'package.json'));
if(!process.versions.electron){
 const {spawn}=require('node:child_process');
 const child=spawn(req('electron'),[__filename],{cwd:root,env:process.env,windowsHide:true,stdio:'inherit'});
 child.on('exit',code=>process.exitCode=code??1);
}else{
 const {app,BrowserWindow,ipcMain,session}=require('electron');
 const resources=path.resolve(process.env.VCPCHAT_PACKAGED_RESOURCES || path.join(root,'dist/win-unpacked/resources')),asar=path.join(resources,'app.asar');
 const audit=fs.mkdtempSync(path.join(process.env.TEMP||os.tmpdir(),'window-render-'));
 app.setPath('userData',path.join(audit,'user-data'));
 const contract=req('./scripts/fixtures/window-package-resources.json');
 const {verifyWindowPackage}=req('./scripts/lib/window-package-contract.cjs');
 const {readPackagedFile}=req('./modules/bootstrap/packed-runtime');
 const verified=verifyWindowPackage({readSource:p=>fs.existsSync(path.join(root,p))?fs.readFileSync(path.join(root,p)):null,readPackaged:p=>readPackagedFile({resourcesDirectory:resources,relativePath:p})});
 const themes=[{name:'验收主题 Alpha',fileName:'alpha.css',isActive:true,variables:{dark:{'--primary-color':'#f0bd34'},light:{'--primary-color':'#3355bb'}}},{name:'验收主题 Beta',fileName:'beta.css',isActive:false,variables:{dark:{'--primary-color':'#80dfff'},light:{'--primary-color':'#307080'}}}];
 const fixtures={
  'get-current-theme':'dark','load-settings':{},'loadSettings':{},'get-themes':themes,
  'get-wallpaper-thumbnail':null,'window:get-state':{},'window:get-pin-state':false,
  'get-music-playlist':[],'music-get-pending-track':null,'music-get-state':{state:{volume:0.5,playing:false}},
  'music-get-settings':{},'music-get-devices':{devices:[]},'music-list-ir-presets':[],
  'desktop-load-layout':{widgets:[],globalSettings:{}},'desktop-load-dock':[],
  'desktop-list-widgets':[],'desktop-list-presets':[],'desktop-get-credentials':{},'desktop-canvas-ready':{success:true},
  'plugin-manager-list-plugins':{success:true,plugins:[]},'rag-overlay:get-state':{enabled:false},
  'canvas:list-files':[],'get-canvas-files':[],'get-forum-config':{},'get-memo-config':{},
  'is-window-pinned':false,'get-emoticon-library':{},'load-forum-config':{},'load-agents-list':[],
  'desktop-set-always-on-bottom':{success:true},'desktop-save-dock':{success:true},'loom:list-apps':{success:true,apps:[]},
  'get-custom-playlists':[],'rag-overlay-get-state':{enabled:false,passThrough:true,notificationCategoryEnabled:false},'get-platform':'win32',
 };
 const emptyArrays=['get-agents','get-agent-groups','music-load-custom-playlists'];
 for(const channel of emptyArrays)fixtures[channel]=[];
 let current=null;
 const registry=require(path.join(asar,'preloads/core/registry')).loadRegistry();
 const channels=new Set();
 for(const {entry} of registry.values()){
  if(channels.has(entry.channel))continue;channels.add(entry.channel);
  if(entry.kind==='query')ipcMain.handle(entry.channel,(_event,...args)=>{
   current?.calls.add(entry.channel);
   if(Object.hasOwn(fixtures,entry.channel))return fixtures[entry.channel];
   current?.unknown.add(entry.channel);
   throw Error('Unconfigured isolated fixture: '+entry.channel);
  });
  if(entry.kind==='command')ipcMain.on(entry.channel,(event)=>{
   current?.commands.add(entry.channel);
   if(entry.channel==='canvas-ready')event.sender.send('canvas-load-data',{history:[],current:null});
  });
 }
 const waits=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const results=[];
 app.whenReady().then(async()=>{
  for(const spec of contract.windows){
   console.log('WINDOW_START '+spec.id);
   current={id:spec.id,calls:new Set(),commands:new Set(),unknown:new Set(),errors:[],missing:[],blocked:new Set()};
   const record=current;
   const ses=session.fromPartition('window-'+spec.id+'-'+Date.now());
   ses.setPermissionRequestHandler((_web,_permission,callback)=>callback(false));
   ses.webRequest.onBeforeRequest((details,callback)=>{
    const u=new URL(details.url);
    const local=u.protocol==='file:'?path.resolve(fileURLToPath(u)):null;
    const allowed=['data:','blob:','about:'].includes(u.protocol)||
     (local!==null&&local.startsWith(asar+path.sep));
    if(!allowed)record.blocked.add(u.protocol+'//'+u.hostname);
    callback({cancel:!allowed});
   });
   ses.webRequest.onErrorOccurred(details=>{if(details.url.startsWith('file:'))record.missing.push({url:details.url,error:details.error});});
   const win=new BrowserWindow({width:1200,height:800,show:false,webPreferences:{preload:path.join(asar,spec.preload),sandbox:false,contextIsolation:true,nodeIntegration:false,session:ses,backgroundThrottling:false}});
   win.webContents.on('console-message',(_event,details,message)=>{if(details?.level==='error'||details===3)record.errors.push(details?.message||message);});
   win.webContents.on('preload-error',(_e,_p,error)=>record.errors.push('preload: '+error.message));
   try{
    await win.loadFile(path.join(asar,spec.page));
    await waits(1800);
    const dom=await win.webContents.executeJavaScript(`({title:document.title,nodes:document.body.querySelectorAll('*').length,text:document.body.innerText.length,styles:document.styleSheets.length,api:typeof window.electronAPI,codeMirror:typeof window.CodeMirror})`);
    assert.ok(dom.nodes>20&&dom.text>10&&dom.styles>0&&dom.api==='object','Blank/uninitialized window: '+JSON.stringify(dom));
    if(spec.id==='themes'){
     const count=await win.webContents.executeJavaScript(`document.querySelectorAll('.theme-card').length`);assert.equal(count,2);
     const selected=await win.webContents.executeJavaScript(`document.querySelectorAll('.theme-card')[1].click();document.querySelector('#previewThemeName').textContent`);assert.equal(selected,'验收主题 Beta');
     const filtered=await win.webContents.executeJavaScript(`document.querySelector('#themeSearchInput').value='Alpha';document.querySelector('#themeSearchInput').dispatchEvent(new Event('input',{bubbles:true}));document.querySelectorAll('.theme-card').length`);assert.equal(filtered,1);
    }
    if(spec.id==='canvas')assert.equal(dom.codeMirror,'function');
    if(spec.id==='music')assert.ok(record.commands.has('music-renderer-ready'),'Music renderer did not finish initialization');
    const landmarks={themes:'#themesGrid',canvas:'.CodeMirror',memo:'#search-memos',forum:'#search-posts',log:'#log-lines',tasks:'#agent-view',plugins:'#distributed-server-status',desktop:'#desktop-dock',music:'#playlist','rag-observer':'#connectionStatus','rag-overlay':'#overlayRoot'};
    assert.ok(await win.webContents.executeJavaScript('Boolean(document.querySelector('+JSON.stringify(landmarks[spec.id])+'))'),'Missing window-specific landmark');
    await waits(250);
    const image=await win.webContents.capturePage();fs.writeFileSync(path.join(audit,spec.id+'.png'),image.toPNG());
    results.push({id:spec.id,dom,missing:record.missing,errors:record.errors,unknown:[...record.unknown],blocked:[...record.blocked],calls:[...record.calls],commands:[...record.commands],status:record.missing.length||record.unknown.size||record.errors.some(e=>/Uncaught|preload:/.test(e))?'FAIL':'PASS'});
   }catch(error){results.push({id:spec.id,status:'FAIL',error:error.message,missing:record.missing,errors:record.errors,unknown:[...record.unknown]});}
   console.log('WINDOW_END '+JSON.stringify(results.at(-1)));
   fs.writeFileSync(path.join(audit,'results.json'),JSON.stringify({kind:'actual-asar-renderer-fixtures',verified,results},null,2));
   win.destroy();current=null;await waits(300);
  }
  fs.writeFileSync(path.join(audit,'results.json'),JSON.stringify({kind:'actual-asar-renderer-fixtures',verified,results},null,2));
  console.log(JSON.stringify({audit,results}));app.exit(results.every(row=>row.status==='PASS')?0:1);
 }).catch(error=>{console.error(error.stack);app.exit(1);});
 app.on('window-all-closed',()=>{});
}
