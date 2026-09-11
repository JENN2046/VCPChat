 'use strict';
const {spawnSync}=require('node:child_process');const path=require('node:path');
const nodeGyp=require.resolve('node-gyp/bin/node-gyp.js');
const args=[nodeGyp,'rebuild','--directory',path.join(__dirname,'../modules/trusted-client/native')];
if(process.env.C2_NODE_HEADERS)args.push('--nodedir',process.env.C2_NODE_HEADERS);
const r=spawnSync(process.execPath,args,{stdio:'inherit'});process.exit(r.status??1);
