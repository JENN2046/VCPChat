const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../modules/chatManager.js'),'utf8');
const start=source.indexOf('        if (!content && attachedFiles.length === 0) return;');
const end=source.indexOf('        const uiAttachments = [];',start);
const AsyncFunction=Object.getPrototypeOf(async()=>{}).constructor;
const run=new AsyncFunction('handled','url','type',`
 const itemSelectionGeneration=0,topicSelectionGeneration=0,input={};const calls=[];const content='调整',attachedFiles=[],currentSelectedItem={id:'A',type},currentTopicId='T',globalSettings={vcpServerUrl:url},request=null,sendContext={agentId:'A',topicId:'T'},pendingSendContexts=new Set(),isContextCompacting=()=>false;
 const uiHelper={showToastNotification:()=>calls.push('blocked'),openModal:()=>calls.push('settings')},setNextUiEmptyStateActive=()=>calls.push('hide-empty'),electronAPI={prepareNativeConversation:async()=>{calls.push('prepare');return {handled};}};
 async function preflight(){${source.slice(start,end)}return 'continue';}finally{pendingSendContexts.delete(sendSignature);}}
 const result=await preflight();return {result,calls};`);
test('native handled send needs no ordinary VCP URL',async()=>assert.deepEqual(await run(true,'','agent'),{result:'continue',calls:['prepare','hide-empty']}));
test('unhandled ordinary send still requires VCP URL',async()=>assert.deepEqual(await run(false,'','agent'),{result:undefined,calls:['prepare','blocked','settings']}));
test('configured ordinary send remains available',async()=>assert.deepEqual(await run(false,'http://127.0.0.1:1','agent'),{result:'continue',calls:['prepare','hide-empty']}));
test('unconfigured group keeps original URL requirement',async()=>assert.deepEqual(await run(false,'','group'),{result:undefined,calls:['blocked','settings']}));
