'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http'),net=require('node:net'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const {startSyncService}=require('../modules/services/nativeSync/httpService');
const {messageHash,messageKey}=require('../modules/services/nativeSync/protocol');
const root=path.resolve(__dirname,'..'),run=path.resolve(root,'../../artifacts/native-sync-r3','run-final-p1-'+Date.now());
const appData=path.join(run,'Daily'),owner='FinalP1Synthetic',topic='shared',d={itemId:owner,itemType:'agent',topicId:topic};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label,ms=45000){const end=Date.now()+ms;while(true){const value=await fn();if(value)return value;assert.ok(Date.now()<end,label+' timed out');await wait(100);}}
const json=async(file,value)=>{await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,JSON.stringify(value,null,2));};
class CDP{
 constructor(url){this.socket=new WebSocket(url);this.serial=0;this.pending=new Map();this.ready=new Promise((resolve,reject)=>{this.socket.addEventListener('open',resolve,{once:true});this.socket.addEventListener('error',reject,{once:true});});this.socket.addEventListener('message',({data})=>{const m=JSON.parse(data),p=this.pending.get(m.id);if(!p)return;this.pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error('CDP command failed')):p.resolve(m.result);});}
 async send(method,params={}){await this.ready;return new Promise((resolve,reject)=>{const id=++this.serial,timer=setTimeout(()=>reject(Error('CDP timeout')),15000);this.pending.set(id,{resolve,reject,timer});this.socket.send(JSON.stringify({id,method,params}));});}
 async evaluate(expression){const r=await this.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});assert.ok(!r.exceptionDetails,'real Renderer evaluation failed: '+(r.exceptionDetails?.exception?.description||r.exceptionDetails?.text||''));return r.result.value;}
 close(){this.socket.close();for(const p of this.pending.values())clearTimeout(p.timer);this.pending.clear();}
}
async function port(){const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;}
let center,model,client,modelCalls=0;const launches=[];
async function start(){
 const debug=await port(),env={};for(const k of ['PATH','Path','SystemRoot','WINDIR','COMSPEC','PATHEXT'])if(process.env[k])env[k]=process.env[k];
 Object.assign(env,{VCPCHAT_APP_DATA_DIR:appData,APPDATA:path.join(run,'roaming'),LOCALAPPDATA:path.join(run,'local'),TEMP:run,TMP:run,VCPCHAT_R3_RUN_ROOT:run,VCPCHAT_E2E_TEST:'1',VCP_FINAL_P1_ISOLATED:'1',VCP_FINAL_P1_CENTER:center.url,NODE_OPTIONS:'--require='+path.join(__dirname,'native-sync-final-p1-guard.cjs'),NODE_PATH:['native-sync-r3','native-sync-r2'].map(n=>path.resolve(root,'../../artifacts',n,'deps/node_modules')).join(path.delimiter)});
 const child=spawn(require('electron'),['.',`--remote-debugging-port=${debug}`,'--remote-debugging-address=127.0.0.1'],{cwd:root,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
 const record={pid:child.pid,exitCode:null,signal:null,isolatedAppData:appData};launches.push(record);let output='';for(const s of [child.stdout,child.stderr])s.on('data',b=>{output=(output+b).slice(-14000);});child.on('exit',(code,signal)=>Object.assign(record,{exitCode:code,signal}));
 client={child,record,logs:()=>output};const version=await until(async()=>{if(child.exitCode!==null)throw Error('isolated app exited early');try{return await fetch(`http://127.0.0.1:${debug}/json/version`).then(r=>r.json());}catch{return false;}},'inspector');
 client.browser=new CDP(version.webSocketDebuggerUrl);const page=await until(async()=>(await fetch(`http://127.0.0.1:${debug}/json/list`).then(r=>r.json())).find(t=>t.url.endsWith('/main.html')),'real main.html');client.page=new CDP(page.webSocketDebuggerUrl);
 await until(()=>client.page.evaluate("document.documentElement?.dataset.vcpRendererReady==='true'"),'real Renderer');
 await until(()=>client.page.evaluate(`!!document.querySelector('#agentList > [data-item-id="${owner}"]')`),'synthetic Agent');
 await client.page.evaluate(`document.querySelector('#agentList > [data-item-id="${owner}"]').click()`);
 await until(()=>client.page.evaluate(`!!document.querySelector('[data-item-id="${owner}"][data-topic-id="${topic}"]')`),'synthetic topic');
 await client.page.evaluate(`document.querySelector('[data-item-id="${owner}"][data-topic-id="${topic}"]').click()`);return client;
}
async function stop(){if(!client)return;const c=client;try{await c.browser.send('Browser.close');}catch{}await until(()=>c.record.exitCode!==null,'normal exit',18000);assert.equal(c.record.exitCode,0);c.page.close();c.browser.close();client=null;}
(async()=>{
 await fs.mkdir(run,{recursive:true});center=await startSyncService({dbPath:path.join(run,'central.sqlite'),token:'final-isolated-token'});
 model=http.createServer(async(q,r)=>{for await(const _ of q){}r.setHeader('Content-Type','application/json');if(q.url==='/v1/models'){r.end(JSON.stringify({data:[{id:'synthetic'}]}));return;}assert.equal(q.url,'/v1/chat/completions');modelCalls++;r.end(JSON.stringify({choices:[{message:{role:'assistant',content:'Synthetic offline cold-start reply'}}]}));});await new Promise(r=>model.listen(0,'127.0.0.1',r));
 const original={id:'original',role:'user',content:'Synthetic prior history',timestamp:1},id={ownerType:'agent',ownerId:owner,topicId:topic,msgId:original.id};const applied=center.store.apply({...id,deviceId:'seed',opId:'seed',action:'upsert',baseHash:null,message:original});
 await json(path.join(appData,'settings.json'),{uiMode:'next',userName:'Synthetic',enableDistributedServer:false,ChatDataServiceEnabled:false,assistantEnabled:false,vcpServerUrl:`http://127.0.0.1:${model.address().port}/v1/chat/completions`,vcpApiKey:'synthetic-only',enableContextCompaction:false});
 await json(path.join(appData,'rust-assistant-config.json'),{version:2,useRustAssistant:false});
 await json(path.join(appData,'Agents',owner,'config.json'),{name:owner,model:'synthetic',streamOutput:false,promptMode:'original',originalSystemPrompt:'Synthetic only',systemPrompt:'Synthetic only',topics:[{id:topic,name:'Final P1 isolated',createdAt:1,locked:true},{id:'other',name:'Other',createdAt:2,locked:true}]});
 await json(path.join(appData,'UserData',owner,'topics',topic,'history.json'),[original]);await json(path.join(appData,'UserData',owner,'topics','other','history.json'),[]);
 await json(path.join(appData,'.native-sync','connection.json'),{version:1,enabled:true,historySelectionApproved:true,deviceId:'final-isolated',topics:[d],transportUrl:'http://127.0.0.1:1',credentialSource:'desktop-sync-session',serverUrl:'http://wp10.unicorn.org.cn:13546',ssh:{alias:'wp08',remotePort:8888}});
 const stateFile=path.join(appData,'.native-sync','state.json');await json(stateFile,{version:1,deviceId:'final-isolated',topics:[d],cursor:1,acked:{[messageKey(id)]:{hash:applied.hash,seq:1,deleted:false}},outbox:[],pending:null});
 await start();const blocked=await client.page.evaluate(`(async()=>({topic:await window.electronAPI.deleteTopic('${owner}','${topic}'),agent:await window.electronAPI.deleteAgent('${owner}')}))()`);
 assert.equal(blocked.topic.code,'SYNC_WRITER_EXCLUDED');assert.equal(blocked.agent.code,'SYNC_WRITER_EXCLUDED');
 await client.page.evaluate("(()=>{const i=document.querySelector('#messageInput');i.value='Synthetic offline save';i.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#sendMessageBtn').click()})()");
 await until(async()=>{const h=await client.page.evaluate(`window.chatAPI.getNativeHistorySnapshot('${owner}','agent','${topic}')`);return h.history.some(m=>m.role==='assistant'&&m.content==='Synthetic offline cold-start reply');},'real local terminal persistence');
 await until(async()=>JSON.parse(await fs.readFile(stateFile,'utf8')).outbox.length>=2,'durable offline Outbox');const offline=JSON.parse(await fs.readFile(stateFile,'utf8'));assert.equal(offline.cursor,1);assert.equal(center.store.metrics().journalRows,1);
 const shot=await client.page.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await fs.writeFile(path.join(run,'offline-real-renderer.png'),Buffer.from(shot.data,'base64'));await stop();
 await start();const resumed=JSON.parse(await fs.readFile(stateFile,'utf8'));assert.deepEqual(resumed.outbox,offline.outbox);assert.equal(resumed.cursor,1);await fs.writeFile(path.join(appData,'.online'),'1');
 await until(async()=>{const s=JSON.parse(await fs.readFile(stateFile,'utf8'));return s.outbox.length===0&&s.cursor===center.store.metrics().headSeq&&!s.pending;},'reconnect and lost ACK recovery');
 const history=JSON.parse(await fs.readFile(path.join(appData,'UserData',owner,'topics',topic,'history.json'),'utf8'));assert.equal(history.length,3);assert.equal(modelCalls,1);
 for(const m of history){const row=center.store.db.prepare('select hash from messages where msg_id=?').get(m.id);assert.equal(row.hash,messageHash(m));}
 const transport=JSON.parse(await fs.readFile(path.join(appData,'FINAL_TRANSPORT.json'),'utf8'));assert.equal(transport.lostAcks,1);await stop();
 const receipt={result:'FINAL_P1_FULL_APP_PASS',runRoot:run,realMainPreloadRenderer:true,syntheticTransportOnly:true,productionConnections:0,offlineColdStarts:2,sharedTopicAndAgentDeletionRefused:true,offlineOutbox:offline.outbox.length,historyMessages:history.length,modelCalls,finalCursor:center.store.metrics().headSeq,outbox:0,pending:false,lostAckRecovered:true,canonicalHashesEqual:true,launches};await json(path.join(run,'FINAL_P1_APP_RECEIPT.json'),receipt);console.log(JSON.stringify(receipt));
})().catch(async e=>{await json(path.join(run,'FINAL_P1_APP_FAILURE.json'),{message:e.message,launches,syntheticOutput:client?.logs()||''});console.error(e.message);process.exitCode=1;}).finally(async()=>{if(client){client.page?.close();client.browser?.close();client.child.kill();}await center?.close();if(model){model.closeAllConnections();await new Promise(r=>model.close(r));}});
