'use strict';
const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);
// Optional local diagnostics, never an admission receipt or a source of authority.
// Only fixed fields are written: no credential, server payload, subject or business data.
function createSessionStatus({binding,env,clock=()=>new Date()}){
 const file=env.VCPCHAT_NATIVE_SESSION_STATUS_FILE,operationId=env.VCPCHAT_NATIVE_SESSION_OPERATION_ID;
 if(typeof file!=='string'||!path.isAbsolute(file)||path.extname(file)!=='.json'||!uuid(operationId)||!uuid(binding.clientInstanceId))return ()=>{};
 return (action,ok)=>{
  if(!['status','recover'].includes(action))return;
  let temp;
  try{
   if(!fs.lstatSync(path.dirname(file)).isDirectory())return;
   if(fs.existsSync(file)){
    if(!fs.lstatSync(file).isFile()||fs.lstatSync(file).isSymbolicLink())return;
    const old=JSON.parse(fs.readFileSync(file,'utf8'));
    if(old.protocol!=='vcpchat-native-session-status-v1'||old.operationId!==operationId)return;
   }
   const record={protocol:'vcpchat-native-session-status-v1',operationId,clientInstanceId:binding.clientInstanceId,
    mainPid:process.pid,transport:binding.transport==='vcp-websocket'?'vcp-websocket':'loopback-http',
    checkedAt:clock().toISOString(),request:action,state:ok?'OWNER_SESSION_VERIFIED':'UNAVAILABLE'};
   temp=file+'.'+randomUUID()+'.tmp';
   const fd=fs.openSync(temp,'wx',0o600);
   try{fs.writeFileSync(fd,JSON.stringify(record)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
   fs.renameSync(temp,file);temp=null;
  }catch{
   // Losing optional diagnostics must not change transport success or error identity.
  }finally{if(temp)try{fs.unlinkSync(temp);}catch{}}
 };
}
module.exports={createSessionStatus};
