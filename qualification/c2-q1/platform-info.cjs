'use strict';
const fs=require('node:fs'),cp=require('node:child_process'),os=require('node:os'),path=require('node:path');
const out={platform:process.platform,arch:process.arch,osRelease:os.release(),node:process.version,productionSigning:false,productionEligible:false,observations:[]};
function record(command,args){const r=cp.spawnSync(command,args,{encoding:'utf8',timeout:30000});out.observations.push({command,args,status:r.status,error:r.error?.code,stdout:r.stdout,stderr:r.stderr});}
if(process.platform==='darwin'){
 const d=fs.readdirSync('artifact').find(n=>n==='mac'||n.startsWith('mac-')),a=path.resolve('artifact',d,'VCPQualificationQ1.app');
 record('/usr/bin/sw_vers',[]);record('/usr/bin/codesign',['--verify','--deep','--strict','--verbose=2',a]);record('/usr/bin/codesign',['--display','--verbose=4',a]);
 record('/usr/bin/codesign',['--display','--verbose=4',path.join(a,'Contents/Resources/app.asar.unpacked/native/build/Release/qualification_provider.node')]);
 out.limitation='Ad-hoc development signing only; no Team ID, release identity, notarization or production installation ACL qualification.';
}else if(process.platform==='win32'){
 record('powershell.exe',['-NoProfile','-NonInteractive','-Command',"Get-AuthenticodeSignature -LiteralPath 'artifact/win-unpacked/VCPQualificationQ1.exe' | Select-Object Status,StatusMessage | ConvertTo-Json -Compress"]);
 out.limitation='No production signing credential or production installation ACL used. Hosted Windows Server runtime is not a qualified user desktop deployment.';
}
fs.mkdirSync('evidence',{recursive:true});fs.writeFileSync('evidence/PLATFORM_INFO.json',JSON.stringify(out,null,2));
