'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),net=require('node:net'),crypto=require('node:crypto'),{spawn,execFileSync}=require('node:child_process');
const {FullToolboxTransport,exportSource}=require('./native-sync-r6-transport.cjs');
const {gateway}=require('./native-sync-r7-browser.cjs');
class ModelTransport extends FullToolboxTransport{
 static async prepare({localRoot}){
  const remote=new ModelTransport(localRoot,{kind:'native-sync-r7',entry:'server.js',preload:'native-sync-r9-relay-preload.mjs'});remote.enabled=true;remote.publicMode=process.argv.includes('--r9-android');try{remote.gateway=await gateway(localRoot,()=>remote.url);
  const meta=JSON.parse(await fs.readFile(path.resolve(__dirname,'../../../artifacts/native-sync-r7/FRONTEND_BUILD.json'),'utf8')),extraFiles=[];
  for(const file of meta.files){let bytes=await fs.readFile(path.join(meta.dist,file.name));if(crypto.createHash('sha256').update(bytes).digest('hex')!==file.sha256)throw Error('R9_PWA_HASH_MISMATCH');if(process.argv.includes('--r9-install-recovery')&&file.name==='manifest.webmanifest'){const manifest=JSON.parse(bytes);manifest.name='VCP R9 验收';manifest.short_name='VCP R9';bytes=Buffer.from(JSON.stringify(manifest));remote.evidence.installManifest={name:manifest.name,shortName:manifest.short_name,originalSha256:file.sha256,servedSha256:crypto.createHash('sha256').update(bytes).digest('hex'),scope:'test-only display-name overlay; no product manifest or private config changed'};}extraFiles.push({name:'Plugin/NativeSync/mobile-dist/'+file.name,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),base64:bytes.toString('base64')});}
  const exportProfile={kind:'native-sync-r7',sourceRoot:path.resolve(__dirname,'../../vcptoolbox-android-r9'),mobileOrigin:remote.gateway.origin,mobileModel:'doubao-seed-2.0-mini',r9Public:remote.publicMode,extraFiles};
  for(let attempt=0;;attempt++){try{remote.evidence.bootstrap=await exportSource(remote.remoteRoot,exportProfile);break;}catch(e){if(attempt>=4||!/255|4294967295|Connection.*closed/i.test(e.message))throw e;await new Promise(r=>setTimeout(r,1200));}}
  const local=net.createServer();await new Promise(r=>local.listen(0,'127.0.0.1',r));remote.localPort=local.address().port;await new Promise(r=>local.close(r));remote.url=`http://127.0.0.1:${remote.localPort}`;
  if(remote.publicMode){remote.mobileProxy=await require('./native-sync-r9-mobile-proxy.cjs').create(()=>remote.url);remote.remotePort=remote.evidence.bootstrap.fixedServerPort;}
  return remote;}catch(e){await remote.close().catch(()=>{});throw e;}
 }
 static async resume({localRoot}){const remote=new ModelTransport(localRoot,{kind:'native-sync-r7',entry:'server.js',preload:'native-sync-r9-relay-preload.mjs'});remote.enabled=true;remote.publicMode=false;remote.gateway=await gateway(localRoot,()=>remote.url);const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));remote.localPort=s.address().port;await new Promise(r=>s.close(r));remote.url=`http://127.0.0.1:${remote.localPort}`;
 const program="from pathlib import Path; p=Path('"+remote.remoteRoot+"/source/config.env'); rows=p.read_text().splitlines(); p.write_text('\\n'.join('NativeMobileOrigin="+remote.gateway.origin+"' if x.startswith('NativeMobileOrigin=') else x for x in rows)+'\\n'); print('R9_ISOLATED_MOBILE_ORIGIN_UPDATED')";
 for(let n=0;;n++){try{const q="'"+program.replaceAll("'","'\\''")+"'";execFileSync('ssh',['-o','BatchMode=yes','-o','ConnectTimeout=10','wp08','python3 -c '+q],{windowsHide:true,stdio:['ignore','pipe','pipe'],timeout:15000});break;}catch(e){if(n>=4)throw e;await new Promise(r=>setTimeout(r,800));}}
 remote.publicMode=process.argv.includes('--r9-android');if(remote.publicMode){remote.mobileProxy=await require('./native-sync-r9-mobile-proxy.cjs').create(()=>remote.url);let port;for(let n=0;;n++){try{port=Number(execFileSync('ssh',['-o','BatchMode=yes','-o','ConnectTimeout=10','wp08','python3 -c '+"'import json; print(json.load(open(\""+remote.remoteRoot+"/r7-fixture-config.json\"))[\"port\"])'"],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe'],timeout:15000}).trim());break;}catch(e){if(n>=4)throw e;}}if(!Number.isInteger(port)||port<1024||port>65535)throw Error('R9_RESUME_PORT_INVALID');remote.remotePort=port;}return remote;}
 async start(){if(!this.publicMode)return super.start();await this.connectPublic();await this.startServer();await this.awaitCondition(async()=>{try{return (await fetch(this.url+'/api/v1/sync/status',{headers:{Authorization:'Bearer isolated-poc-token'}})).status===200;}catch{return false;}},'public-mode private sync forward');return this;}
 async connectPublic(){for(let n=0;;n++){try{return await this._connectPublicOnce();}catch(e){if(n>=4||!/R9_PUBLIC_SSH_EXIT_(255|4294967295)/.test(e.message))throw e;this.tunnel=null;await new Promise(r=>setTimeout(r,900));}}}
 async _connectPublicOnce(){
  const args=['-o','BatchMode=yes','-o','ConnectTimeout=10','-o','ServerAliveInterval=5','-o','ServerAliveCountMax=2','-o','ExitOnForwardFailure=yes','-o','LogLevel=VERBOSE','-L',`127.0.0.1:${this.localPort}:127.0.0.1:${this.remotePort}`,'-R',`127.0.0.1:0:127.0.0.1:${this.mobileProxy.localPort}`,'wp08',`python3 -u ${this.remoteRoot}/source/scripts/native-sync-r9-tunnel.py ${this.remoteRoot}`];
  const child=spawn('ssh',args,{windowsHide:true,stdio:['pipe','pipe','pipe']}),record={pid:child.pid,args,exitCode:null,events:[],intentionalDisconnect:false};this.tunnel={child,record};this.evidence.tunnels.push(record);let buffer='';
  let errors='';child.stderr.on('data',b=>{errors=(errors+b.toString()).slice(-3000);const m=errors.match(/Allocated port (\d+)/);if(m&&!record.reversePort){record.reversePort=Number(m[1]);child.stdin.write(JSON.stringify({reversePort:record.reversePort})+'\n');}});child.stdin.on('error',()=>{});
  child.stdout.on('data',b=>{buffer+=b;while(buffer.includes('\n')){const i=buffer.indexOf('\n'),line=buffer.slice(0,i);buffer=buffer.slice(i+1);if(line.trim()){const event=JSON.parse(line);record.events.push(event);if(event.event==='public-origin'){this.mobileOrigin=event.origin;this.mobileProxy.setOrigin(event.origin);this.evidence.publicOrigin=event.origin;}}}});
  child.on('exit',(code,signal)=>{record.exitCode=code;record.signal=signal;record.exited=true;});
  await this.awaitCondition(()=>{if(record.exited)throw Error('R9_PUBLIC_SSH_EXIT_'+record.exitCode);if(record.events.some(x=>x.event==='public-failed'))throw Error('R9_PUBLIC_TUNNEL_FAILED');return this.mobileOrigin&&record.events.some(x=>x.event==='public-connected');},'Ubuntu public protected tunnel',80000);
 }
 async disconnect(){if(!this.publicMode)return super.disconnect();if(!this.tunnel)return;this.tunnel.record.intentionalDisconnect=true;this.tunnel.child.stdin.write('stop\n');await this.awaitCondition(()=>this.tunnel.record.exited,'public tunnel shutdown',20000);this.tunnel=null;}
 async restartServerAndReconnect(){if(!this.publicMode)return super.restartServerAndReconnect();await this.stopServer();await this.startServer();}
 async startServer(){
  for(let attempt=0;;attempt++){
   try{return await super.startServer();}catch(e){
    if(attempt>=4||![255,4294967295].includes(this.server?.record.exitCode))throw e;
    const code="from pathlib import Path; import json,os,signal,time; root=Path('"+this.remoteRoot+"'); pids=[json.loads(f.read_text())['pid'] for f in root.glob('host-start-*.json')]; [(os.kill(p,signal.SIGTERM)) for p in pids if Path('/proc/'+str(p)+'/cwd').exists() and Path('/proc/'+str(p)+'/cwd').resolve()==root/'source']; time.sleep(1); print('OWNED_EXPERIMENT_HOSTS_DRAINED')";
    let verified=false;for(let n=0;n<5;n++){try{const q="'"+code.replaceAll("'","'\\''")+"'";const out=execFileSync('ssh',['-o','BatchMode=yes','-o','ConnectTimeout=10','wp08','python3 -c '+q],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe'],timeout:15000});verified=out.includes('OWNED_EXPERIMENT_HOSTS_DRAINED');if(verified)break;}catch{}await new Promise(r=>setTimeout(r,1000));}
    if(!verified)throw Error('R9_OWNED_HOST_CLEANUP_UNVERIFIED');this.server=null;
   }
  }
 }
 async connect(){for(let attempt=0;;attempt++){try{return await super.connect();}catch(e){if(attempt>=4||![255,4294967295].includes(this.tunnel?.record.exitCode))throw e;this.tunnel=null;await new Promise(r=>setTimeout(r,1000));}}}
 async providerSnapshot(){const requestId=Date.now().toString();this.server.child.stdin.write('r9-provider:'+requestId+'\n');return this.awaitCondition(()=>this.server.record.events.find(x=>x.event==='r9-provider'&&x.requestId===requestId),'provider transport projection');}
 async failNext(){const n=this.server.record.events.length;this.server.child.stdin.write('r9-fail-next\n');await this.awaitCondition(()=>this.server.record.events.slice(n).find(x=>x.event==='r9-fault-armed'),'provider fault armed');}
 async close(){try{if(this.server?.child.exitCode===null)this.evidence.provider=await this.providerSnapshot();await super.close();}finally{await this.gateway?.close();await this.mobileProxy?.close();}}
}
module.exports={ModelTransport,prepare:x=>ModelTransport.prepare(x),resume:x=>ModelTransport.resume(x)};
