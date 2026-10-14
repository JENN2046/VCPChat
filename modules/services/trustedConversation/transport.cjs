'use strict';
function createNativeTransport({binding,env=process.env,fetchImpl=fetch,chartService,controller}){
 const url=new URL(binding.toolboxUrl);if(url.protocol!=='http:'||!['127.0.0.1','[::1]'].includes(url.hostname)||url.username||url.password||url.search||url.hash||!/^\/?$/.test(url.pathname)||!/^[A-Za-z0-9_-]{1,100}$/.test(binding.toolName))throw Error('NATIVE_LOCAL_BINDING_INVALID');
 const key=env[binding.transportTokenEnv],application=env[binding.applicationAuthorizationEnv];if(!key||!/^Bearer [\x21-\x7e]{32,4096}$/.test(application||''))throw Error('NATIVE_CREDENTIAL_REFERENCE_REQUIRED');
 let sequence=0,chartQueue=Promise.resolve();
 async function request(action,payload={}){const r=await fetchImpl(new URL('/v1/native-conversation/'+binding.toolName,url),{method:'POST',redirect:'error',signal:AbortSignal.timeout(25000),headers:{authorization:'Bearer '+key,'x-vcp-application-authorization':application,'content-type':'application/json'},body:JSON.stringify({action,payload})});const value=await r.json();if(Number.isSafeInteger(value.sequence))sequence=Math.max(sequence,value.sequence);return value;}
 async function project(result){const p=result?.chart?.projection;if(!p)return result;
  const work=async()=>{if(!chartService||!controller)throw Error('CHART_SERVICE_UNAVAILABLE');const id=p.create?.manifest?.id;
   if(typeof id!=='string'||!Array.isArray(p.version)||p.version.length!==2||p.version.some(v=>!Number.isSafeInteger(v)))throw Error('CHART_PROJECTION_INVALID');
   const data={...p.data,_nativeProjectionVersion:p.version};let manifest,prior;try{manifest=await chartService.readManifest(id);prior=await chartService.readData(id);}catch(e){if(!['ENOENT','CHART_NOT_FOUND'].includes(e.code))throw e;await controller.processToolCall({...p.create,initialData:data});return {ok:true};}
   const old=prior._nativeProjectionVersion;if(Array.isArray(old)&&p.version.some((v,i)=>v<old[i]))return {ok:true,discarded:'older-response'};
   await controller.processToolCall({command:'ReplaceData',chartId:id,data,expectedDataRevision:manifest.dataRevision});return {ok:true};};
  const pending=chartQueue.then(work);chartQueue=pending.catch(()=>{});try{return {...result,chart:await pending};}catch{return {...result,chart:{ok:false,code:'CHART_REFRESH_PENDING'}};}
 }
 return {request,project,sequence:()=>sequence,toolName:binding.toolName};
}
module.exports={createNativeTransport};
