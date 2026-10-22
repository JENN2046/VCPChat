'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
const {identity,fail}=require('./protocol');

// Non-secret opt-in file; the existing desktop key remains in its existing
// settings authority and is never copied into CLI arguments or this file.
async function dailyConnection({appDataRoot,readSettings}){
 const root=path.resolve(appDataRoot),file=path.join(root,'.native-sync','connection.json');
 try{const dir=await fs.lstat(path.dirname(file));if(dir.isSymbolicLink())throw fail('DAILY_CONNECTION_ALIAS');}catch(e){if(e.code==='ENOENT')return null;throw e;}
 let config;try{const s=await fs.lstat(file);if(s.isSymbolicLink()||s.nlink>1)throw fail('DAILY_CONNECTION_ALIAS');config=JSON.parse(await fs.readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}
 if(config.enabled!==true)return null;
 if(Object.keys(config).some(k=>!['version','enabled','historySelectionApproved','deviceId','topics','transportUrl','credentialSource','serverUrl','approvedHistory'].includes(k)))throw fail('UNEXPECTED_DAILY_CONNECTION_FIELD');
 if(config.version!==1||config.historySelectionApproved!==true||typeof config.deviceId!=='string'||!Array.isArray(config.topics)||!config.topics.length||config.topics.length>8)throw fail('INVALID_DAILY_CONNECTION');
 let endpoint;try{endpoint=new URL(config.transportUrl);}catch{throw fail('PROTECTED_DESKTOP_TRANSPORT_REQUIRED');}
 if(endpoint.protocol!=='http:'||endpoint.hostname!=='127.0.0.1'||!endpoint.port||endpoint.pathname!=='/'||endpoint.username||endpoint.password||endpoint.search||endpoint.hash)throw fail('PROTECTED_DESKTOP_TRANSPORT_REQUIRED');
 if(config.credentialSource!=='existing-vcp-settings'||'token' in config||'apiKey' in config)throw fail('NO_CREDENTIALS_IN_CONNECTION_FILE');
 for(const d of config.topics)identity({ownerType:d.itemType||'agent',ownerId:d.itemId,topicId:d.topicId,msgId:'_'});
 if(typeof readSettings!=='function')throw fail('DESKTOP_SETTINGS_AUTHORITY_REQUIRED');
 const settings=await readSettings();
 if(typeof settings.vcpApiKey!=='string'||!settings.vcpApiKey)throw fail('EXISTING_DESKTOP_KEY_REQUIRED');
 const backend=new URL(config.serverUrl),configured=new URL(settings.vcpServerUrl);
 if(!['http:','https:'].includes(backend.protocol)||backend.username||backend.password||backend.search||backend.hash||backend.pathname!=='/'||configured.username||configured.password||configured.origin!==backend.origin)throw fail('DESKTOP_BACKEND_IDENTITY_MISMATCH');
 return {url:endpoint.origin,deviceId:config.deviceId,topics:config.topics,token:settings.vcpApiKey,approvedHistory:config.approvedHistory};
}
module.exports={dailyConnection};
