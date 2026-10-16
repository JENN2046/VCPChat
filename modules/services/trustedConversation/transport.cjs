'use strict';
function validateNativeBinding({binding,env=process.env}){
 const websocket=binding.transport==='vcp-websocket';
 if(websocket&&(typeof binding.clientInstanceId!=='string'||!/^[a-f0-9-]{36}$/.test(binding.clientInstanceId)))throw Error('NATIVE_CLIENT_BINDING_REQUIRED');
 if(typeof binding.toolName!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(binding.toolName))throw Error('NATIVE_LOCAL_BINDING_INVALID');
 const url=websocket?null:new URL(binding.toolboxUrl);
 if(!websocket&&(url.protocol!=='http:'||!['127.0.0.1','[::1]'].includes(url.hostname)||url.username||url.password||url.search||url.hash||!/^\/?$/.test(url.pathname)))throw Error('NATIVE_LOCAL_BINDING_INVALID');
 const key=env[binding.transportTokenEnv],application=env[binding.applicationAuthorizationEnv];if((!websocket&&!key)||!/^Bearer [\x21-\x7e]{32,4096}$/.test(application||''))throw Error('NATIVE_CREDENTIAL_REFERENCE_REQUIRED');
 return {websocket,url,key,application};
}
function createNativeTransport({binding,env=process.env,fetchImpl=fetch,chartService,controller,nativeRequest}){
 const {websocket,url,key,application}=validateNativeBinding({binding,env});
 if(websocket&&typeof nativeRequest!=='function')throw Error('NATIVE_CREDENTIAL_REFERENCE_REQUIRED');
 let sequence=0,chartQueue=Promise.resolve();const projections=new Map();
 async function request(action,payload={}){let value;
 if(websocket)value=await nativeRequest({clientInstanceId:binding.clientInstanceId,toolName:binding.toolName,authorization:application,body:{action,payload}});
 else{const r=await fetchImpl(new URL('/v1/native-conversation/'+binding.toolName,url),{method:'POST',redirect:'error',signal:AbortSignal.timeout(25000),headers:{authorization:'Bearer '+key,'x-vcp-application-authorization':application,'content-type':'application/json'},body:JSON.stringify({action,payload})});if(!Number.isInteger(r.status)||r.status<200||r.status>=300)throw Error('NATIVE_HTTP_FAILURE');value=await r.json();}
 if(!value||typeof value!=='object'||Array.isArray(value)||typeof value.ok!=='boolean'||('handled'in value&&typeof value.handled!=='boolean')||('sequence'in value&&(!Number.isSafeInteger(value.sequence)||value.sequence<0))||(action==='prepare'&&value.ok&&(typeof value.handled!=='boolean'||(value.handled&&(typeof value.sourceId!=='string'||!value.sourceId)))))throw Error('NATIVE_RESPONSE_INVALID');if(Number.isSafeInteger(value.sequence))sequence=Math.max(sequence,value.sequence);return value;}
 async function project(result){const p=result?.chart?.projection;if(!p)return result?.chart?{...result,chart:{...result.chart,retryPending:false}}:result;
  const id=p.create?.manifest?.id;if(typeof id!=='string'||!Array.isArray(p.version)||p.version.length!==2||p.version.some(v=>!Number.isSafeInteger(v)||v<0))return {...result,chart:{ok:false,code:'CHART_PROJECTION_INVALID'}};
  const queued=projections.get(id);if(queued&&p.version.some((v,i)=>v<queued.chart.projection.version[i]))return {...result,chart:{ok:true,discarded:'older-response'}};
  projections.set(id,result);
  const work=async()=>{if(!chartService||!controller)throw Error('CHART_SERVICE_UNAVAILABLE');const id=p.create?.manifest?.id;
   if(typeof id!=='string'||!Array.isArray(p.version)||p.version.length!==2||p.version.some(v=>!Number.isSafeInteger(v)))throw Error('CHART_PROJECTION_INVALID');
   const data={...p.data,_nativeProjectionVersion:p.version};let manifest,prior;try{manifest=await chartService.readManifest(id);prior=await chartService.readData(id);}catch(e){if(!['ENOENT','CHART_NOT_FOUND'].includes(e.code))throw e;await controller.processToolCall({...p.create,initialData:data});return {ok:true};}
   const old=prior._nativeProjectionVersion;if(Array.isArray(old)&&p.version.every((v,i)=>v===old[i]))return {ok:true,discarded:'already-current'};
   if(Array.isArray(old)&&p.version.some((v,i)=>v<old[i]))return {ok:true,discarded:'older-response'};
   await controller.processToolCall({command:'ReplaceData',chartId:id,data,expectedDataRevision:manifest.dataRevision});return {ok:true};};
  const pending=chartQueue.then(work);chartQueue=pending.catch(()=>{});try{const chart=await pending;if(projections.get(id)===result)projections.delete(id);return {...result,chart};}catch{return {...result,chart:{ok:false,code:'CHART_REFRESH_PENDING',retryPending:true}};}
 }
 async function retryProjections(){for(const result of [...projections.values()])await project(result);}
 return {request,project,retryProjections,sequence:()=>sequence,toolName:binding.toolName};
}
module.exports={createNativeTransport,validateNativeBinding};
