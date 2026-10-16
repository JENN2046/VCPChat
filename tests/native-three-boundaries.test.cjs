'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),http=require('node:http'),{EventEmitter}=require('node:events'),{createRequire}=require('node:module');
const {createNativeTransport}=require('../modules/services/trustedConversation/transport.cjs');
const manager=fs.readFileSync(path.join(__dirname,'../modules/chatManager.js'),'utf8'),AsyncFunction=Object.getPrototypeOf(async()=>{}).constructor;
const begin=manager.indexOf('        let nativeResult = null;'),preEnd=manager.indexOf('        const uiAttachments = [];',begin),resultStart=manager.indexOf('        if (nativeResult?.handled) {'),resultEnd=manager.indexOf('        const thinkingMessageId',resultStart);
const send=new AsyncFunction('electronAPI','request','renderTarget',`const observeNativeDraft=()=>{},nativeDraftEdited=false,nativeDraftItemGeneration=0,nativeDraftTopicGeneration=0,itemSelectionGeneration=0,topicSelectionGeneration=0,input={},consumeDraft=()=>{},attachedFiles=[],content='可以',currentSelectedItem={id:'A',type:'agent',name:'Synthetic'},currentTopicId='T',globalSettings={vcpServerUrl:'http://unused.invalid'},setNextUiEmptyStateActive=()=>{},uiHelper={showToastNotification(){},openModal(){}},sendContext={topicId:'T'},persistOutgoingUserMessage=async()=>{},isSendContextCurrent=()=>true;${manager.slice(begin,preEnd)}${manager.slice(resultStart,resultEnd)}return {ordinaryBranch:true};`);
function transport(url){return createNativeTransport({binding:{toolboxUrl:url,toolName:'Example',transportTokenEnv:'T',applicationAuthorizationEnv:'A'},env:{T:'wrong-synthetic',A:'Bearer '+'x'.repeat(40)}});}
async function ipc(port,document,context={conversationId:'A:T'}){
 const file=path.join(__dirname,'../modules/ipc/nativeConversationHandlers.js'),base=createRequire(file),handlers=new Map(),module={exports:{}},wc=new EventEmitter();wc.mainFrame={};wc.executeJavaScript=async code=>vm.runInNewContext(code,{document,window:{__nativeConversationContext:context}});
 const require=p=>p==='electron'?{ipcMain:{handle:(k,v)=>handlers.set(k,v),removeHandler:k=>handlers.delete(k)}}:p.endsWith('/transport.cjs')?{createNativeTransport:()=>port}:p.includes('ChartControllerService')?{initialize(){}}:base(p);
 vm.runInNewContext(fs.readFileSync(file,'utf8'),{module,exports:module.exports,require,process:{env:{}},setInterval:()=>({unref(){}}),clearInterval(){}});await module.exports.initialize({mainWindow:{webContents:wc,isFocused:()=>true,isDestroyed:()=>false},binding:{toolName:'Example'}});
 return {wc,call:(action,p)=>handlers.get('native-conversation:'+action)({sender:wc,senderFrame:wc.mainFrame},p)};
}
function documentFixture(){const input={value:'可以'},button={dataset:{},disabled:false},messages=[],plans=[],root={contains:e=>e.surface==='main',querySelectorAll:q=>q==='.message-item'?messages:plans};return {input,button,messages,plans,root,activeElement:input,getElementById:id=>id==='chatMessages'?root:id==='messageInput'?input:button};}
test('real HTTP failure and invalid protocol -> real IPC -> actual send branch never reaches ordinary chat',async t=>{
 let status=401,body={error:'Unauthorized (Bearer token required)'},coldFailure=false;const actions=[];
 // Use the paired server's actual Bearer guard when the local integration source is available.
 const toolbox=process.env.JSO_TOOLBOX_ROOT;let guard;
 if(toolbox){const s=fs.readFileSync(path.join(toolbox,'server.js'),'utf8'),start=s.indexOf('    const authHeader = req.headers.authorization;',s.indexOf('// General API authentication')),end=s.indexOf('\n});',start);assert.ok(start>0);guard=new Function('req','res','next','serverKey',s.slice(start,end));}
 const server=http.createServer(async(req,res)=>{let raw='';for await(const chunk of req)raw+=chunk;const {action}=JSON.parse(raw);actions.push(action);if(action==='invalidate'&&!coldFailure){res.end(JSON.stringify({ok:true}));return;}const adapter={status(n){res.statusCode=n;return this},json(value){res.end(JSON.stringify(value))}};if(status===401&&guard)return guard(req,adapter,()=>assert.fail('synthetic wrong key admitted'),'correct-synthetic');res.statusCode=status;res.end(typeof body==='string'?body:JSON.stringify(body));});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 for(const fixture of [[401,{}],[403,{error:'forbidden'}],[500,{error:'failure'}],[200,{error:'wrong protocol'}],[200,null],[200,{ok:true}],[200,{ok:true,handled:true}],[200,{ok:true,handled:false,sequence:-1}],[200,'not JSON']]){
  [status,body]=fixture;const api=await ipc(transport(`http://127.0.0.1:${server.address().port}`),documentFixture());try{api.wc.emit('before-input-event',{}, {type:'keyDown',key:'Enter'});let rendered;const result=await send({prepareNativeConversation:p=>api.call('prepare',p)},null,{renderMessage:async r=>rendered=r.content});assert.notEqual(result.ordinaryBranch,true,JSON.stringify(fixture));assert.equal(result.handled,true);assert.equal(result.code,'NATIVE_TRANSPORT_UNAVAILABLE');assert.equal(rendered,undefined);}finally{api.wc.emit('destroyed');}
 }
 // Transport failures during cold reconciliation must remain handled and never reach prepare.
 coldFailure=true;
 for(const fixture of [[401,{}],[403,{}],[500,{}],[200,{error:'wrong protocol'}],[200,null],[200,{ok:false}],[200,'not JSON']]){
  [status,body]=fixture;actions.length=0;const api=await ipc(transport(`http://127.0.0.1:${server.address().port}`),documentFixture());
  try{api.wc.emit('before-input-event',{}, {type:'keyDown',key:'Enter'});let rendered;const result=await send({prepareNativeConversation:p=>api.call('prepare',p)},null,{renderMessage:async r=>rendered=r.content});assert.equal(result.handled,true);assert.equal(result.code,'PRESENTATION_INVALIDATION_REQUIRED');assert.equal(rendered,undefined);assert.equal(actions.includes('prepare'),false);assert.equal(actions.includes('execute'),false);}finally{api.wc.emit('destroyed');}
 }
 coldFailure=false;
 for(const response of [{ok:true,handled:false},{ok:false,handled:false,code:'READ_ONLY_POLICY'}]){status=200;body=response;const api=await ipc(transport(`http://127.0.0.1:${server.address().port}`),documentFixture());try{api.wc.emit('before-input-event',{}, {type:'keyDown',key:'Enter'});assert.equal((await send({prepareNativeConversation:p=>api.call('prepare',p)},null,{})).ordinaryBranch,true);}finally{api.wc.emit('destroyed');}}
});
test('IPC rejection is locally handled; independent ordinary chat never enters native prepare',async()=>{
 let calls=0;const api={prepareNativeConversation:async()=>{calls++;throw Error('IPC failed')}};let text;const result=await send(api,null,{renderMessage:async r=>text=r.content});assert.equal(result.handled,true);assert.equal(result.code,'NATIVE_TRANSPORT_UNAVAILABLE');assert.equal(text,undefined);assert.equal((await send(api,{conversation:{id:'B'}},{})).ordinaryBranch,true);assert.equal(calls,1);
});
test('independent B surface cannot propose as A, hidden or visible; main IPC requires primary message and primary display',async()=>{
 const doc=documentFixture(),calls=[];doc.messages.push({isConnected:true,dataset:{messageId:'A-message'}});
 const api=await ipc({sequence:()=>0,request:async(action,p)=>{calls.push(action);if(action==='propose')return {ok:true,plan:{id:'plan-A',conversationId:'A:T',messageId:'A-message',presentation:'exact'}};return {ok:true}}},doc);
 const source=fs.readFileSync(path.join(__dirname,'../modules/renderer/nativeConversationPresentation.js'),'utf8'),present=new Function('marked',source.replaceAll('export async function','async function')+';return presentNativeProposal')(require('../vendor/marked.min.js')),content='```vcp-tool-proposal\n{"tool":"Example","payload":{}}\n```';
 try{for(const hidden of [false,true]){const element={surface:'B',hidden,isConnected:true,ownerDocument:doc};await present({element,content,messageId:'B-message',conversationId:'A:T',api:{proposeNativeConversation:()=>assert.fail('B renderer must not call IPC')}});assert.equal((await api.call('propose',{tool:'Example',messageId:'B-message',conversationId:'A:T',payload:{}})).code,'MAIN_CHAT_REQUIRED');}
 assert.equal(calls.filter(x=>x==='propose').length,0);
 assert.equal((await api.call('propose',{tool:'Example',messageId:'A-message',conversationId:'A:T',payload:{}})).ok,true);
 // An identically labelled connected node outside primary root must not acknowledge.
 assert.equal((await api.call('presented',{planId:'plan-A'})).code,'PRESENTATION_MISMATCH');doc.plans.push({isConnected:true,textContent:'exact',dataset:{nativePlanId:'plan-A'}});assert.equal((await api.call('presented',{planId:'plan-A'})).ok,true);
 doc.activeElement={surface:'B'};api.wc.emit('before-input-event',{}, {type:'keyDown',key:'Enter'});assert.equal((await api.call('prepare',{text:'可以',conversationId:'B:T'})).code,'NATIVE_SOURCE_REQUIRED');
 assert.equal(calls.filter(x=>x==='execute').length,0);
 }finally{api.wc.emit('destroyed');}
});
test('actual projection and renderer distinguish no chart, queued recovery, invalid projection and success',async()=>{
 const port=transport('http://127.0.0.1');for(const [chart,expected,forbidden] of [[undefined,/已完成操作/,/图表|恢复/],[{projection:{create:{manifest:{id:'c'}},version:[1,1],data:{}}},/正在恢复/,null],[{projection:{create:{manifest:{id:'c'}},version:[]}},/图表刷新未完成/,/正在恢复/],[{ok:true},/图表已更新/,/正在恢复/],[{ok:false,code:'CHART_REFRESH_PENDING',retryPending:true},/图表刷新未完成/,/正在恢复/]]){
  const result=await port.project({ok:true,committed:true,operationId:'op',...(chart?{chart}:{})});let text;await send({prepareNativeConversation:async()=>({handled:true,sourceId:'s'}),executeNativeConversation:async()=>result},null,{renderMessage:async r=>text=r.content});assert.match(text,expected);if(forbidden)assert.doesNotMatch(text,forbidden);
 }
 await port.retryProjections();
});
