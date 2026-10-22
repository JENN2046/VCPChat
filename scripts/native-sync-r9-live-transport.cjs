'use strict';
// Attach a fresh test coordinator to the already running, owned lab origin.
// Never creates a second sync implementation or reads credentials/cookies.
const path=require('node:path'),{execFileSync}=require('node:child_process');
const {ModelTransport}=require('./native-sync-r9-model-transport.cjs');
const {gateway}=require('./native-sync-r7-browser.cjs');
const quote=x=>"'"+x.replaceAll("'","'\\''")+"'";
function python(program){for(let n=0;;n++){try{return JSON.parse(execFileSync('ssh',['-o','BatchMode=yes','-o','ConnectTimeout=10','wp08','python3 -c '+quote(program)],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe'],timeout:15000}));}catch(e){if(n>=4)throw e;}}}
class LiveTransport extends ModelTransport{
 static async attach({localRoot,url,origin}){
  if(path.dirname(path.resolve(localRoot))!==path.resolve(__dirname,'../../../artifacts/native-sync-r9')||!/^run-\d+$/.test(path.basename(localRoot)))throw Error('R9_LIVE_ROOT_REQUIRED');
  const u=new URL(url);if(u.protocol!=='http:'||u.hostname!=='127.0.0.1'||!u.port||u.username||u.password||u.pathname!=='/'||u.search||u.hash)throw Error('R9_LIVE_LOOPBACK_REQUIRED');
  if(!/^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/.test(origin))throw Error('R9_LIVE_ORIGIN_REQUIRED');
  const remote=new LiveTransport(localRoot,{kind:'native-sync-r7',entry:'server.js',preload:'native-sync-r9-relay-preload.mjs'});remote.enabled=true;remote.publicMode=true;remote.url=u.origin;remote.mobileOrigin=origin;remote.borrowed=true;
  remote.gateway=await gateway(path.join(localRoot,'live-coordinator-'+Date.now()),()=>remote.url);
  const view=remote.readView();if(view.liveHosts.length!==1)throw Error('R9_ONE_OWNED_HOST_REQUIRED');remote.originalPid=view.liveHosts[0];remote.remotePort=view.port;
  remote.evidence.liveAttachment={origin,privateUrl:u.origin,originalPid:remote.originalPid,scope:'borrowed existing trusted SSH/HTTPS forwards; independently read-only SQLite projections before host restart'};return remote;
 }
 readView(){return python(`from pathlib import Path
import json,sqlite3
r=Path(${JSON.stringify(this.remoteRoot)})
assert r.parent==Path('/home/admin/VCPKF/vcp/artifacts/native-sync-r7') and r.name.startswith('run-') and r.name[4:].isdigit()
c=sqlite3.connect((r/'data/native-sync/central.sqlite').as_uri()+'?mode=ro',uri=True)
jobs=[dict(zip(['id','topicKey','state','attempts','cancelRequested','replyMessageId'],x)) for x in c.execute('SELECT id,topic_key,state,attempts,cancel_requested,reply_message_id FROM mobile_executions ORDER BY created_at')]
entries=[dict(zip(['ownerType','ownerId','topicId','msgId','hash','deleted','seq'],x)) for x in c.execute('SELECT owner_type,owner_id,topic_id,msg_id,hash,deleted,last_seq FROM messages ORDER BY last_seq')]
metrics={'headSeq':c.execute('SELECT coalesce(max(seq),0) FROM journal').fetchone()[0],'journalRows':c.execute('SELECT count(*) FROM journal').fetchone()[0],'appliedOps':c.execute('SELECT count(*) FROM applied_ops').fetchone()[0],'liveMessages':sum(not x['deleted'] for x in entries)}
live=[];ready=None
for f in r.glob('host-start-*.json'):
 x=json.loads(f.read_text());p=Path('/proc')/str(x['pid'])/'cwd'
 if p.exists() and p.resolve()==r/'source':live.append(x['pid']);ready=x
ledger=json.loads((r/'PROVIDER_TRANSPORT_RECORDS.json').read_text())
print(json.dumps({'liveHosts':live,'port':json.loads((r/'r7-fixture-config.json').read_text())['port'],'ready':True,'syncDataCreated':True,'lifecycle':ready['lifecycle'] if ready else None,'metrics':metrics,'entries':entries,'mobile':{'executions':jobs,'sessionCount':c.execute('SELECT count(*) FROM mobile_sessions').fetchone()[0]},'provider':{'model':ledger['model'],'calls':len(ledger['calls']),'active':sum(x['state']=='running' for x in jobs),'records':ledger['calls']}}))`);}
 async start(){await this.awaitCondition(async()=>{try{return (await fetch(this.url+'/api/v1/sync/status',{headers:{Authorization:'Bearer isolated-poc-token'},signal:AbortSignal.timeout(5000)})).status===200;}catch{return false;}},'existing owned full ToolBox host');return this;}
 async snapshot(label){if(this.server)return super.snapshot(label);const r=this.readView();delete r.provider;delete r.port;r.label=label;r.projection='independent SQLite mode=ro and owned startup receipt';this.evidence.snapshots.push(r);return r;}
 async providerSnapshot(){return this.server?super.providerSnapshot():this.readView().provider;}
 async disconnect(){/* Forward/connector lifetime belongs to the original coordinator. */}
 async stopServer(){
  if(this.server)return super.stopServer();if(this.originalStopped)return;
  python(`from pathlib import Path
import json
r=Path(${JSON.stringify(this.remoteRoot)});p=${Number(this.originalPid)}
assert (Path('/proc')/str(p)/'cwd').resolve()==r/'source'
with open('/proc/'+str(p)+'/fd/0','w') as s:s.write('stop\\n');s.flush()
print(json.dumps({'ownedGracefulStopRequested':p}))`);
  await this.awaitCondition(()=>{const x=python(`from pathlib import Path
import json
r=Path(${JSON.stringify(this.remoteRoot)});f=r/'host-exit-${Number(this.originalPid)}.json'
print(f.read_text() if f.exists() else '{}')`);if(x.exitCode===undefined)return false;if(x.exitCode!==0||x.pluginReadyAfterShutdown||x.lifecycle.shutdowns!==1)throw Error('R9_OWNED_SHUTDOWN_FAILED');this.evidence.originalHostShutdown={pid:x.pid,exitCode:x.exitCode,lifecycle:x.lifecycle};return true;},'original full host graceful shutdown',30000);this.originalStopped=true;
 }
 async close(){try{if(this.server){this.evidence.provider=await this.providerSnapshot();await super.close();}}finally{await this.gateway?.close();}}
}
module.exports={attach:x=>LiveTransport.attach(x)};
