'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),https=require('node:https'),http=require('node:http'),net=require('node:net'),crypto=require('node:crypto');
const {spawn,execFileSync}=require('node:child_process');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(fn,label,ms=20000){const end=Date.now()+ms;let last;while(Date.now()<end){try{const v=await fn();if(v)return v;}catch(e){last=e;}await pause(80);}throw Error(label+' timed out'+(last?': '+last.message:''));}
async function freePort(){const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;}
async function gateway(root,target){
 const folder=path.join(root,'tls');await fs.mkdir(folder,{recursive:true});
 const keyFile=path.join(folder,'server.key'),certFile=path.join(folder,'server.crt');
 execFileSync('C:/Program Files/Git/usr/bin/openssl.exe',['req','-x509','-newkey','rsa:2048','-nodes','-days','1','-keyout',keyFile,'-out',certFile,'-subj','/CN=localhost','-addext','subjectAltName=IP:127.0.0.1,DNS:localhost','-addext','basicConstraints=critical,CA:FALSE','-addext','keyUsage=critical,digitalSignature,keyEncipherment','-addext','extendedKeyUsage=serverAuth'],{windowsHide:true,stdio:'ignore'});
 // The fresh TLS key is consumed only by this loopback server; never exported.
 const certificate=await fs.readFile(certFile);
 const spki=crypto.createHash('sha256').update(new crypto.X509Certificate(certificate).publicKey.export({type:'spki',format:'der'})).digest('base64');
 const server=https.createServer({key:await fs.readFile(keyFile),cert:certificate,minVersion:'TLSv1.2'},(req,res)=>{
  const url=target();if(!url){res.writeHead(503,{'Content-Type':'application/json'});return res.end('{"error":{"code":"UPSTREAM_OFFLINE"}}');}
  const upstream=http.request(url+req.url,{method:req.method,headers:{...req.headers,'x-forwarded-proto':'https','x-forwarded-for':'127.0.0.1'}},reply=>{res.writeHead(reply.statusCode,reply.headers);reply.pipe(res);});
  upstream.on('error',()=>{if(!res.headersSent)res.writeHead(503,{'Content-Type':'application/json'});res.end('{"error":{"code":"UPSTREAM_OFFLINE"}}');});req.pipe(upstream);
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`https://127.0.0.1:${server.address().port}`;let closed=false;
 return {origin,spki,certificateFingerprint:new crypto.X509Certificate(certificate).fingerprint256,
  async request(route,{body,admin=false,headers={}}={}){return new Promise((resolve,reject)=>{const q=https.request(origin+route,{method:body?'POST':'GET',ca:certificate,headers:{Origin:origin,...(admin?{Authorization:'Bearer isolated-poc-token'}:{}),...(body?{'Content-Type':'application/json'}:{}),...headers}},res=>{let text='';res.setEncoding('utf8');res.on('data',b=>text+=b);res.on('end',()=>{let value;try{value=JSON.parse(text);}catch{value={};}resolve({status:res.statusCode,body:value});});});q.on('error',reject);q.end(body?JSON.stringify(body):undefined);});},
  async close(){if(closed)return;closed=true;server.closeAllConnections();await new Promise(r=>server.close(r));}
 };
}
class MobileBrowser {
 static async open({root,origin,spki,CDP,records}){
  const port=await freePort();const profile=path.join(root,'mobile-browser-profile');
  const args=['--headless=new','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-default-apps',`--user-data-dir=${profile}`,`--ignore-certificate-errors-spki-list=${spki}`,`--remote-debugging-port=${port}`,'--remote-debugging-address=127.0.0.1','about:blank'];
  const child=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',args,{windowsHide:true,stdio:['ignore','ignore','ignore']});
  const record={pid:child.pid,viewport:{width:390,height:844},trust:'only this experiment certificate SPKI; no system trust change',exitCode:null};records.push(record);child.on('exit',code=>record.exitCode=code);
  const version=await wait(()=>fetch(`http://127.0.0.1:${port}/json/version`).then(r=>r.json()),'isolated Chrome inspector');
  const browser=new CDP(version.webSocketDebuggerUrl);const created=await browser.send('Target.createTarget',{url:'about:blank'});
  const target=await wait(async()=>(await fetch(`http://127.0.0.1:${port}/json/list`).then(r=>r.json())).find(t=>t.id===created.targetId),'PWA target');
  const page=new CDP(target.webSocketDebuggerUrl);await page.send('Runtime.enable');await page.send('Page.enable');
  await page.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await page.send('Emulation.setTouchEmulationEnabled',{enabled:true});await page.send('Page.navigate',{url:origin+'/mobile/'});
  await wait(()=>page.evaluate("Boolean(document.querySelector('#pair-code')||document.querySelector('#message-text'))"),'Vue mobile PWA');return new MobileBrowser({child,record,page,browser,root});
 }
 constructor(value){Object.assign(this,value);}
 async screenshot(name){const r=await this.page.send('Page.captureScreenshot',{format:'png'});await fs.writeFile(path.join(this.root,name+'.png'),Buffer.from(r.data,'base64'));}
 async close(){if(this.child.exitCode===null){try{await this.browser.send('Browser.close');}catch{}}await wait(()=>this.child.exitCode!==null,'Chrome graceful exit');this.page.close();this.browser.close();if(this.child.exitCode!==0)throw Error('Chrome exit '+this.child.exitCode);}
}
module.exports={gateway,MobileBrowser,wait};
