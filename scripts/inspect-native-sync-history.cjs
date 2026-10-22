'use strict';
// Explicit selection only. Produces counts/fingerprints, never message bodies,
// prompts, credential fields, or a copy of the user's Agent configuration.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {identity,canonicalMessage,messageHash}=require('../modules/services/nativeSync/protocol');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
async function plain(root,file){
 const relative=path.relative(root,file);if(relative.startsWith('..')||path.isAbsolute(relative))throw Error('HISTORY_PATH_ESCAPE');
 let current=root;for(const part of ['',...relative.split(path.sep)]){if(part)current=path.join(current,part);const s=await fs.lstat(current);if(s.isSymbolicLink()||(s.isFile()&&s.nlink>1))throw Error('HISTORY_PATH_ALIAS');}
 return fs.readFile(file);
}
async function inspect(appDataRoot,selection){
 const root=path.resolve(appDataRoot);if(!Array.isArray(selection)||!selection.length||selection.length>8)throw Error('EXPLICIT_TOPIC_SELECTION_REQUIRED');
 const result=[];
 for(const d of selection){
  identity({ownerType:d.itemType||'agent',ownerId:d.itemId,topicId:d.topicId,msgId:'_'});if((d.itemType||'agent')!=='agent')throw Error('AGENT_SELECTION_REQUIRED');
  const config=JSON.parse(await plain(root,path.join(root,'Agents',d.itemId,'config.json')));
  const topic=config.topics?.find(t=>t.id===d.topicId);if(!topic)throw Error('SELECTED_TOPIC_NOT_IN_AGENT');
  const bytes=await plain(root,path.join(root,'UserData',d.itemId,'topics',d.topicId,'history.json'));
  const history=JSON.parse(bytes);if(!Array.isArray(history))throw Error('HISTORY_ARRAY_REQUIRED');
  const ids=new Set(),fingerprints=[];let canonicalChanged=0,nonText=0,attachmentMessages=0,contentPreserved=true,timestampsPreserved=true;
  for(const message of history){
   if(typeof message.id!=='string'||!message.id||ids.has(message.id))throw Error('MISSING_OR_DUPLICATE_MESSAGE_ID');ids.add(message.id);
   const canonical=canonicalMessage(message,d.topicId);if(canonical.id!==message.id)throw Error('CANONICAL_ID_CHANGED');
   if(JSON.stringify(message)!==JSON.stringify(canonical))canonicalChanged++;
   contentPreserved&&=canonical.content===message.content;timestampsPreserved&&=canonical.timestamp===message.timestamp;
   if(typeof message.content!=='string')nonText++;
   if(Array.isArray(message.attachments)&&message.attachments.length)attachmentMessages++;
   fingerprints.push({id:message.id,hash:messageHash(message)});
  }
  if(!contentPreserved||!timestampsPreserved)throw Error('CANONICAL_CONTENT_OR_TIMESTAMP_CHANGED');
  const executionSettings={};for(const [key,min,max] of [['contextTokenLimit',1,2000000],['temperature',0,2],['maxOutputTokens',1,131072]])if(config[key]!=null&&config[key]!==''){const n=Number(config[key]);if(!Number.isFinite(n)||n<min||n>max)throw Error('INVALID_AGENT_EXECUTION_SETTING');executionSettings[key]=n;}
  result.push({itemId:d.itemId,itemType:'agent',topicId:d.topicId,agentName:config.name||d.itemId,topicName:topic.name||d.topicId,model:config.model||null,executionSettings,messageCount:history.length,rawFileSha256:sha(bytes),orderedMessageSha256:sha(JSON.stringify(fingerprints)),canonicalRepresentationDifferences:canonicalChanged,contentPreserved,timestampsPreserved,nonTextMessages:nonText,attachmentMessages});
 }
 return {result:'READ_ONLY_HISTORY_PREFLIGHT_PASS',topics:result,selectedTopicsOnly:true,historyWritten:false,centralImportPerformed:false,qualification:'Fingerprints cover selected local source only. Remote conflict checks, backup and authorized first import remain required.'};
}
module.exports={inspect};
if(require.main===module){
 const option=name=>process.argv.find(a=>a.startsWith('--'+name+'='))?.slice(name.length+3);
 (async()=>{const root=option('app-data'),file=option('selection');if(!root||!file)throw Error('APP_DATA_AND_SELECTION_REQUIRED');const result=await inspect(root,JSON.parse(await fs.readFile(file,'utf8')));process.stdout.write(JSON.stringify(result,null,2)+'\n');})().catch(e=>{process.stderr.write(JSON.stringify({result:'BLOCKED',code:e.code||e.message})+'\n');process.exitCode=1;});
}
