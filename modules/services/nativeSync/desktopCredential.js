'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const {durableJson}=require('./durableJson'),{fail,wireTopic}=require('./protocol');
const registerScript='/home/admin/VCPKF/vcp/versions/vcptoolbox-daily-r10/scripts/register-native-sync-desktop.cjs';
function registerOverSsh(grant){
 return new Promise((resolve,reject)=>{
  const child=spawn('ssh',['-vv','-T','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','SendEnv=-*','-o','ConnectTimeout=12','wp08','node',registerScript],{windowsHide:true,stdio:['pipe','pipe','ignore']});
  let out='',settled=false;
  const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);error?reject(error):resolve(value);};
  const timer=setTimeout(()=>{child.kill();finish(fail('SYNC_GRANT_REGISTRATION_UNAVAILABLE'));},20000);
  child.stdin.on('error',()=>{});child.on('error',()=>finish(fail('SYNC_GRANT_REGISTRATION_UNAVAILABLE')));
  child.stdout.on('data',b=>{out+=b;if(Buffer.byteLength(out)>4096){child.kill();finish(fail('INVALID_SYNC_GRANT_RESPONSE'));}});
  child.on('close',code=>{if(code!==0)return finish(fail('SYNC_GRANT_REGISTRATION_UNAVAILABLE'));try{const result=JSON.parse(out);if(result.registered!==true||result.deviceId!==grant.deviceId||!Number.isSafeInteger(result.expires)||result.expires<=Date.now())throw Error();finish(null,result);}catch{finish(fail('INVALID_SYNC_GRANT_RESPONSE'));}});
  child.stdin.end(JSON.stringify(grant));
 });
}
async function desktopCredential({appDataRoot,connection,safeStorage,register=registerOverSsh}){
 if(connection.credentialSource!=='desktop-sync-session'||connection.serverUrl!=='http://wp10.unicorn.org.cn:13546'||connection.ssh?.alias!=='wp08'||connection.ssh.remotePort!==8888)throw fail('UNAPPROVED_SYNC_AUTHORITY');
 if(!safeStorage?.isEncryptionAvailable()||safeStorage.getSelectedStorageBackend?.()==='basic_text')throw fail('OS_CREDENTIAL_ENCRYPTION_REQUIRED');
 const dir=path.join(appDataRoot,'.native-sync'),file=path.join(dir,'device-session.sealed.json');
 const stat=await fs.lstat(dir);if(stat.isSymbolicLink()||!stat.isDirectory())throw fail('SYNC_CREDENTIAL_ALIAS');
 const binding=JSON.stringify({serverUrl:connection.serverUrl,deviceId:connection.deviceId,topics:connection.topics.map(wireTopic)});
 let token;
 try{
  const stat=await fs.lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||stat.size>16384)throw fail('SYNC_CREDENTIAL_ALIAS');
  const row=JSON.parse(await fs.readFile(file,'utf8'));if(row.version!==1||row.binding!==binding||typeof row.sealed!=='string')throw fail('SYNC_CREDENTIAL_BINDING_CHANGED');
  token=safeStorage.decryptString(Buffer.from(row.sealed,'base64'));
 }catch(e){if(e.code!=='ENOENT')throw fail(e.code?.startsWith('SYNC_')?e.code:'SYNC_CREDENTIAL_UNAVAILABLE');
  token='vcp_sync_'+crypto.randomBytes(32).toString('base64url');
  // Persist the encrypted token before registration so a lost SSH ACK/restart
  // re-registers the same device identity instead of losing its credential.
  await durableJson(file,{version:1,binding,sealed:safeStorage.encryptString(token).toString('base64')});
 }
 if(!/^vcp_sync_[a-zA-Z0-9_-]{43}$/.test(token))throw fail('SYNC_CREDENTIAL_UNAVAILABLE');
 await register({deviceId:connection.deviceId,topics:connection.topics.map(wireTopic),token});
 return token;
}
module.exports={desktopCredential,registerOverSsh};
