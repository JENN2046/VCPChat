'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),net=require('node:net'),crypto=require('node:crypto');
const {FullToolboxTransport,exportSource}=require('./native-sync-r6-transport.cjs');
const {gateway}=require('./native-sync-r7-browser.cjs');
class MobileTransport extends FullToolboxTransport {
 static async prepare({localRoot}){
  const remote=new MobileTransport(localRoot,{kind:'native-sync-r7',entry:'server.js'});remote.enabled=true;remote.gateway=await gateway(localRoot,()=>remote.url);
  const meta=JSON.parse(await fs.readFile(path.resolve(__dirname,'../../../artifacts/native-sync-r7/FRONTEND_BUILD.json'),'utf8'));const extraFiles=[];
  async function add(folder){for(const item of await fs.readdir(folder,{withFileTypes:true})){const file=path.join(folder,item.name);if(item.isDirectory())await add(file);else{const bytes=await fs.readFile(file);extraFiles.push({name:'Plugin/NativeSync/mobile-dist/'+path.relative(meta.dist,file).replaceAll('\\','/'),sha256:crypto.createHash('sha256').update(bytes).digest('hex'),base64:bytes.toString('base64')});}}}
  await add(meta.dist);remote.evidence.bootstrap=await exportSource(remote.remoteRoot,{kind:'native-sync-r7',sourceRoot:path.resolve(__dirname,process.argv.includes('--r8-toolbox')?'../../vcptoolbox-sync-coexist-r8':'../../vcptoolbox-mobile-pwa-r7'),mobileOrigin:remote.gateway.origin,extraFiles});
  remote.evidence.mobile={origin:remote.gateway.origin,certificateFingerprint:remote.gateway.certificateFingerprint,browser:'isolated Chrome desktop mobile viewport',android:'NOT RUN'};
  const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));remote.localPort=s.address().port;await new Promise(r=>s.close(r));remote.url=`http://127.0.0.1:${remote.localPort}`;return remote;
 }
 async close(){try{await super.close();}finally{await this.gateway?.close();}}
 async snapshot(label){
  const result=await super.snapshot(label);
  if(label==='r7-execution-state'){
   const trace=(this.evidence.mobile.stateTrace??=[]),states=(result.mobile?.executions||[]).map(x=>({id:x.id,state:x.state,attempts:x.attempts}));
   if(JSON.stringify(trace.at(-1)?.executions)!==JSON.stringify(states))trace.push({at:Date.now(),executions:states});
   this.evidence.snapshots=this.evidence.snapshots.filter(x=>x.requestId!==result.requestId);
   this.server.record.events=this.server.record.events.filter(x=>x.requestId!==result.requestId);
  }
  return result;
 }
}
module.exports={prepare:options=>MobileTransport.prepare(options)};
