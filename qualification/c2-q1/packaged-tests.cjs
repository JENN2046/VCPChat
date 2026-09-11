'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {getCurrentFuseWire,FuseV1Options}=require('@electron/fuses');
const dir=process.platform==='win32'?'artifact/win-unpacked':process.platform==='darwin'?'artifact/mac-arm64':'artifact/linux-unpacked';
const appdir=process.platform==='darwin'?dir+'/VCPQualificationQ1.app':dir;
const exe=process.platform==='win32'?'VCPQualificationQ1.exe':process.platform==='darwin'?'Contents/MacOS/VCPQualificationQ1':'vcpchat-qualification-only-q1';
const resources=process.platform==='darwin'?'Contents/Resources':'resources';
const records=[];
function execute(root,mode,label){const output=path.resolve('evidence/'+label);fs.mkdirSync(output,{recursive:true});const command=path.resolve(root,exe),env={...process.env,Q1_OUTPUT:output,Q1_MODE:mode};const run=cp.spawnSync(command,[],{env,encoding:'utf8',timeout:60000});fs.writeFileSync(output+'/process.log',(run.stdout||'')+'\n'+(run.stderr||''));const report=fs.existsSync(output+'/RUNTIME_REPORT.json')?JSON.parse(fs.readFileSync(output+'/RUNTIME_REPORT.json')):null;return {status:run.status,error:run.error?.message,report};}
(async()=>{
 assert(fs.existsSync(path.join(appdir,exe)),appdir+'/'+exe);
 const fuses=await getCurrentFuseWire(path.join(appdir,exe));
 for(const k of ['RunAsNode','EnableNodeOptionsEnvironmentVariable','EnableNodeCliInspectArguments'])assert.equal(fuses[FuseV1Options[k]],48,k);
 assert.equal(fuses[FuseV1Options.OnlyLoadAppFromAsar],49);
 if(process.platform!=='linux')assert.equal(fuses[FuseV1Options.EnableEmbeddedAsarIntegrityValidation],49);
 for(const mode of ['TARGET','SOFTWARE_DIAGNOSTIC']){const r=execute(appdir,mode,'packaged-'+mode);records.push({case:mode,...r});assert.equal(r.status,0,JSON.stringify(r));assert.equal(r.report.result,'PASS_BOUNDED_PACKAGED_COMPONENT_TESTS');}
 for(const what of ['native','asar']){
  const copy=path.resolve('tamper-'+what);fs.cpSync(appdir,copy,{recursive:true});const p=path.join(copy,resources,what==='native'?'app.asar.unpacked/native/build/Release/qualification_provider.node':'app.asar');const fd=fs.openSync(p,'r+');const pos=what==='asar'?Math.max(100,fs.statSync(p).size-500):0;const b=Buffer.alloc(1);fs.readSync(fd,b,0,1,pos);b[0]^=1;fs.writeSync(fd,b,0,1,pos);fs.closeSync(fd);const r=execute(copy,'TARGET','tamper-'+what);records.push({case:'tamper-'+what,...r});assert(r.status!==0||r.report?.result!=='PASS_BOUNDED_PACKAGED_COMPONENT_TESTS');fs.rmSync(copy,{recursive:true,force:true});
 }
 fs.writeFileSync('evidence/PACKAGED_REPORT.json',JSON.stringify({platform:process.platform,arch:process.arch,scope:'Bounded qualification app with frozen C2 components; whole VCPChat runtime UNPROVEN',fuses,records,productionEligible:false,productionSigning:false,OS_installation_ACL:'UNPROVEN'},null,2));
 const asar=path.join(appdir,resources,'app.asar'),native=path.join(appdir,resources,'app.asar.unpacked/native/build/Release/qualification_provider.node');
 fs.writeFileSync('evidence/ARTIFACT_HASHES.json',JSON.stringify([asar,native,path.join(appdir,exe)].map(p=>({path:p,size:fs.statSync(p).size,sha256:crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')})),null,2));
})().catch(e=>{fs.writeFileSync('evidence/PACKAGED_FAILURE.json',JSON.stringify({error:e.stack,records},null,2));console.error(e.stack);process.exitCode=1;});
