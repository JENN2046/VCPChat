'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),net=require('node:net'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'../../../artifacts/native-sync-r9'),adb=path.join(root,'tools/platform-tools/adb.exe'),home=path.join(root,'adb-session');
function command(args,binary=false){const env={...process.env,ANDROID_USER_HOME:home,ADB_VENDOR_KEYS:path.join(home,'adbkey'),USERPROFILE:home,TEMP:home,TMP:home};return execFileSync(adb,['-P','15037',...args],{windowsHide:true,env,timeout:15000,...(binary?{}:{encoding:'utf8'})});}
exports.command=command;
exports.resolveWebApk=function(origin){
 if(!/^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/.test(origin))throw Error('R9_WEBAPK_SCOPE_REQUIRED');
 const components=command(['shell','cmd','package','query-activities','--brief','-a','android.intent.action.VIEW','-d',origin+'/mobile/']).split(/\r?\n/).map(x=>x.trim()).filter(x=>/^org\.chromium\.webapk\.[a-zA-Z0-9_]+\/org\.chromium\.webapk\./.test(x));
 if(components.length!==1)return null;return {package:components[0].split('/')[0],launcherComponent:components[0],origin};
};
exports.launchWebApk=function(origin){
 const app=exports.resolveWebApk(origin);if(!app)throw Error('R9_OWN_INSTALLED_WEBAPK_REQUIRED');
 const output=command(['shell','cmd','package','resolve-activity','--brief','-a','android.intent.action.MAIN','-c','android.intent.category.LAUNCHER','-p',app.package]);
 const component=output.split(/\r?\n/).map(x=>x.trim()).find(x=>x.startsWith(app.package+'/'));
 if(!component||!/^org\.chromium\.webapk\.[a-zA-Z0-9_]+\/[a-zA-Z0-9_.]+$/.test(component))throw Error('R9_OWN_LAUNCHER_COMPONENT_REQUIRED');
 command(['shell','am','start','-a','android.intent.action.MAIN','-c','android.intent.category.LAUNCHER','-f','0x10200000','-n',component]);
 return {...app,actualLauncherComponent:component,launchMethod:'standard Android MAIN/LAUNCHER with NEW_TASK and RESET_TASK_IF_NEEDED; no injected touch'};
};
exports.open=async function({origin,CDP,waitFor,runRoot}){
 if(command(['get-state']).trim()!=='device')throw Error('R9_REAL_ANDROID_REQUIRED');
 const metadata={androidVersion:command(['shell','getprop','ro.build.version.release']).trim(),model:command(['shell','getprop','ro.product.model']).trim(),emulator:command(['shell','getprop','ro.kernel.qemu']).trim()==='1',emulationOverrides:false};if(metadata.emulator)throw Error('R9_EMULATOR_NOT_ACCEPTED');
 command(['shell','am','start','-a','android.intent.action.VIEW','-d',origin+'/mobile/','com.android.chrome']);
 const free=net.createServer();await new Promise(r=>free.listen(0,'127.0.0.1',r));const port=free.address().port;await new Promise(r=>free.close(r));command(['forward','tcp:'+port,'localabstract:chrome_devtools_remote']);
 async function page(){
  const targets=await waitFor(async()=>{try{const rows=(await fetch(`http://127.0.0.1:${port}/json/list`,{signal:AbortSignal.timeout(5000)}).then(r=>r.json())).filter(x=>x.type==='page'&&x.url.startsWith(origin+'/mobile/'));return rows.length&&rows;}catch{return false;}},'real Android Chrome PWA target',30000);
  const candidates=[];
  for(const target of targets){const url=new URL(target.webSocketDebuggerUrl);url.host='127.0.0.1:'+port;const p=new CDP(url.href);p.targetId=target.id;try{await p.send('Runtime.enable');await p.send('Page.enable');await p.send('Security.enable');const state=await p.evaluate("({visible:document.visibilityState==='visible',standalone:matchMedia('(display-mode: standalone)').matches})");candidates.push({p,score:(state.visible?2:0)+(state.standalone?1:0)});}catch{p.close();}}
  candidates.sort((a,b)=>b.score-a.score);const selected=candidates.shift();for(const x of candidates)x.p.close();if(!selected)throw Error('R9_OWN_ANDROID_TARGET_UNAVAILABLE');return selected.p;
 }
 const result={metadata,page:await page(),async reconnect(){result.page?.close();result.page=await page();},async hasTarget(id){return (await fetch(`http://127.0.0.1:${port}/json/list`,{signal:AbortSignal.timeout(5000)}).then(r=>r.json())).some(x=>x.id===id&&x.url.startsWith(origin+'/mobile/'));},async screenshot(name){if(!await result.page.evaluate("document.visibilityState==='visible'&&location.origin==="+JSON.stringify(origin)))throw Error('R9_SCREENSHOT_REQUIRES_VISIBLE_TEST_PAGE');await fs.writeFile(path.join(runRoot,name+'.png'),command(['exec-out','screencap','-p'],true));},async close(){result.page?.close();try{command(['forward','--remove','tcp:'+port]);}catch{}}};
 return result;
};
