const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const source=fs.readFileSync(path.join(__dirname,'../modules/messageRenderer.js'),'utf8'),ps=fs.readFileSync(path.join(__dirname,'../modules/renderer/nativeConversationPresentation.js'),'utf8');
const AsyncFunction=Object.getPrototypeOf(async()=>{}).constructor;
function extract(name){const start=source.indexOf('async function '+name+'('),end=source.indexOf('\n}',start);assert.ok(start>=0&&end>start);return source.slice(start,end+2);}
const postStart=source.indexOf('        const runPostRenderProcessing = async'),postEnd=source.indexOf('\n        };',postStart);
const makePost=new Function('isRenderSessionActive','renderSessionId','messageItem','contentDiv','renderPostProcessedHtml','finalHtml','message','globalSettings','isInitialLoad','presentNativeProposal','mainRendererReferences','nativeHistoryConversationId',source.slice(postStart,postEnd)+'\n};return runPostRenderProcessing;');
const deferredStart=source.indexOf('function processDeferredMessageElement('),deferredEnd=source.indexOf('\n}',deferredStart);
const modes=['renderMessageBatch','renderHistoryLegacy','renderOlderMessagesInBatches'];
for(const mode of modes)for(const scenario of ['main','B','revoked-before-mount','revoked-during-process','user'])test(mode+' historical mount: '+scenario,async()=>{
 const dom=new JSDOM('<div id="chatMessages"></div><div id="panelB"></div>');const doc=dom.window.document,root=doc.getElementById(scenario==='B'?'panelB':'chatMessages');let active=true,invalidates=0,proposes=0,presented=0,processing=[];
 const present=new Function(ps.replaceAll('export async function','async function')+';return presentNativeProposal')();
 const refs={chatMessagesDiv:root,electronAPI:{proposeNativeConversation:async()=>{proposes++;throw Error('history cannot propose')},presentNativeConversation:async()=>{presented++;throw Error('history cannot acknowledge')},invalidateNativeConversation:async()=>{invalidates++;return {ok:true}}},uiHelper:{scrollToBottom(){}},messageCommands:{syncNextUiEmptyStateWithMessages(){}}};
 const input='{"tool":"Example","payload":{}}',content='```vcp-tool-proposal\n'+input+'\n```';
 const process=new Function('isRenderSessionActive','visibilityOptimizer','shouldRunHeavyForMessage',source.slice(deferredStart,deferredEnd+2)+';return processDeferredMessageElement')(()=>active,{observeMessage(){}},()=>true);
 async function renderMessage(message){const el=doc.createElement('div');el.className='message-item';el.dataset.messageId=message.id;const inner=doc.createElement('div');inner.className='md-content';inner.innerHTML='<pre><code></code></pre>';inner.querySelector('code').textContent=input;el.append(inner);assert.equal(el.isConnected,false);
  const post=makePost(()=>active,1,el,inner,async()=>{if(scenario==='revoked-during-process')active=false;},'',message,{},true,present,refs,'A:T');el._vcp_process=()=>{const job=post();processing.push(job);return job};return el;}
 const owner={animationFrame:async(r,fn)=>{if(scenario==='revoked-before-mount')active=false;return fn()},idle:async(r,fn)=>{if(scenario==='revoked-before-mount')active=false;return fn()}};
 const fn=new Function('mainRendererReferences','renderMessage','getActiveRenderSessionId','isRenderSessionActive','renderTaskOwner','processDeferredMessageElement',extract(mode)+';return '+mode)(refs,renderMessage,()=>1,()=>active,owner,process);
 try{const messages=[{id:'M',role:scenario==='user'?'user':'assistant',content}];if(mode==='renderOlderMessagesInBatches')await fn(messages,10,0,1,{});else if(mode==='renderMessageBatch')await fn(messages,false,1,{});else await fn(messages,1,{});await Promise.all(processing);
 assert.equal(proposes,0);assert.equal(presented,0);assert.equal(root.querySelectorAll('[data-native-plan-id]').length,0);
 if(scenario==='main'){assert.equal(invalidates,1);assert.match(root.textContent,/历史方案已失效/);assert.doesNotMatch(root.textContent,/"tool"/);}else{assert.equal(invalidates,0);assert.doesNotMatch(root.textContent,/历史方案已失效/);}
 }finally{dom.window.close();}
});
