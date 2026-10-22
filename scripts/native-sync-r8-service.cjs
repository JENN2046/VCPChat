'use strict';
// A bounded acceptance host for the original MobileSync service, inside the
// actual Electron main process. It does not replace CDS, plugin or Queue code.
const fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http');
exports.start=async function({chatDataService:cds,historyMutationQueue:queue,appDataRoot}) {
 const express=require('express'),plugin=require('../VCPDistributedServer/Plugin/VCPMobileSync');
 await cds.startShadowMode();if(!cds.isAvailable)throw Error('R8_CDS_REQUIRED');
 const app=express(),token='r8-synthetic-mobile-only';
 const mobile=await plugin.registerRoutes(app,{MobileSyncToken:token,MobileSyncPort:0,MobileSyncBindHost:'127.0.0.1',MobileSyncUseCentralIndex:true},path.resolve(__dirname,'../VCPDistributedServer'),{chatDataService:cds,historyMutationQueue:queue,appDataRoot});
 if(mobile?.backendMode!=='cds')throw Error('R8_MOBILE_CDS_REQUIRED');
 if(!require('../VCPDistributedServer/Plugin/VCPMobileSync/core/db').getDb())throw Error('R8_MOBILE_COMPATIBILITY_DB_REQUIRED');
 const child=cds.lifecycle.process;child.once('exit',(code,signal)=>require('node:fs').writeFileSync(path.join(appDataRoot,`R8_CDS_EXIT_${child.pid}.json`),JSON.stringify({pid:child.pid,code,signal})));
 app.use('/__r8',express.json(),(req,res,next)=>req.headers.authorization===`Bearer ${token}`?next():res.sendStatus(401));
 app.get('/__r8/status',async(_req,res)=>res.json({cds:await cds.status(),pid:cds.lifecycle.process.pid,port:cds.lifecycle.handshake.port,queue:queue.syncPolicy?.diagnostics()||null}));
 app.post('/__r8/reconcile',async(_req,res)=>{try{res.json(await cds.client.reconcile());}catch(e){res.status(409).json({code:e.code});}});
 app.post('/__r8/search',async(req,res)=>res.json(await cds.searchMessages(req.body)));
 const server=http.createServer(app);await new Promise((r,j)=>server.once('error',j).listen(0,'127.0.0.1',r));
 await fs.writeFile(path.join(appDataRoot,'R8_SERVICE_READY.json'),JSON.stringify({...mobile,httpPort:server.address().port,cdsPid:cds.lifecycle.process.pid,protocol:cds.lifecycle.handshake.protocolVersion,schema:cds.lifecycle.handshake.schemaVersion}));
 return {async close(){await plugin.shutdown();server.closeIdleConnections();await new Promise(r=>server.close(r));await fs.writeFile(path.join(appDataRoot,'R8_SERVICE_STOPPED.json'),JSON.stringify({mobileClosed:true,httpClosed:true,at:Date.now()}));}};
};
