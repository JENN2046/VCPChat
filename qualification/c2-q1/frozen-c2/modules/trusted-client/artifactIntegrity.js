 'use strict';
const {createHash}=require('node:crypto');const fs=require('node:fs');const path=require('node:path');
function checkFiles(root,manifest){
    if(!manifest||!Array.isArray(manifest.files)||!manifest.files.length)return false;
    try{return manifest.files.every(x=>typeof x.path==='string'&&!path.isAbsolute(x.path)&&!x.path.split(/[\\/]/).includes('..')&&/^[a-f0-9]{64}$/.test(x.sha256)&&createHash('sha256').update(fs.readFileSync(path.join(root,x.path))).digest('hex')===x.sha256);}catch{return false;}
}
function productionEligibility(evidence){
    // Values must come from a reviewed native/packaged attestation adapter, not client settings.
    return evidence?.platformSigning==='PASS'&&evidence?.asarIntegrity==='PASS'&&evidence?.nativeIntegrity==='PASS'&&evidence?.debugFuses==='PASS'&&evidence?.KeyExtractionProtection==='NON_EXPORTABLE'&&evidence?.KeyInvocationIsolation==='ISOLATED'&&evidence?.hostAdmission==='ADMITTED'&&['OS_ISOLATED','USER_PRESENCE_VERIFIED'].includes(evidence?.HumanInputProvenance);
}
module.exports={checkFiles,productionEligibility};
