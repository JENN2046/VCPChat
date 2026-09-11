 'use strict';
const {EventEmitter}=require('node:events');
const {keyIdentity,reconcile}=require('./trustedClientIdentityDescriptor');
const ROOT='/human-client/v1/vcp-chat';const WS_PATH='/VCPlog/vcp-chat-approval';
const segment=x=>{if(typeof x!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(x))throw Error('IDENTITY_INVALID');return x;};
function origin(x){const u=new URL(x);if(u.origin!==x||u.protocol!=='https:')throw Error('ORIGIN_INVALID');return x;}
class TrustedClientSession extends EventEmitter {
    #provider;#fetch;#WebSocket;#host;#admin;#descriptor;#session;#socket;#generation=0;#timer;#epoch=0;#channelExpires=0;#channelReady=false;
    enrollment='UNENROLLED';admission='UNKNOWN';state='DISCONNECTED';recovery='UNENROLLED';
    constructor({provider,hostOrigin,adminOrigin,fetchImpl=globalThis.fetch,WebSocketImpl}) {super();this.#provider=provider;this.#host=origin(hostOrigin);this.#admin=origin(adminOrigin);this.#fetch=fetchImpl;this.#WebSocket=WebSocketImpl;}
    get generation(){return this.#generation;}
    status(){return Object.freeze({enrollment:this.enrollment,admission:this.admission,session:this.state,recovery:this.recovery,generation:this.#generation});}
    async #http(path,body,method='POST') {
        const r=await this.#fetch(this.#host+path,{method,redirect:'error',credentials:'omit',headers:{'Content-Type':'application/json'},...(method==='POST'?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(10000)});
        const raw=await r.text();if(Buffer.byteLength(raw)>65536)throw Error('RESPONSE_TOO_LARGE');const data=JSON.parse(raw);if(!r.ok)throw Error(typeof data.error==='string'?data.error:'HOST_REJECTED');return data;
    }
    #check(epoch){if(epoch!==this.#epoch)throw Error('OBSOLETE_CONNECTION');}
    #expected(purpose,path,extra={}) {return {purpose,method:'POST',path,trustedHostOrigin:this.#host,surface:'vcp_chat',...extra};}
    async beginEnrollment() {
        const epoch=++this.#epoch;
        if(this.#provider.getIdentity()||this.#provider.readDescriptor())throw Error('RECOVERY_REQUIRED');
        const key=await this.#provider.createIdentity();this.#check(epoch);
        const start=await this.#http(ROOT+'/enrollments',{protocolVersion:1,publicKeySpki:key.publicKeySpki});this.#check(epoch);
        if(start.browserEnrollmentUrl!==this.#admin+'/admin_api/human-client/enrollments/'+segment(start.enrollmentId))throw Error('ORIGIN_INVALID');
        this.enrollment='PENDING_ENROLLMENT';
        // Caller is native menu/service only. It may open this exact validated URL; no approval POST.
        return Object.freeze({browserEnrollmentUrl:start.browserEnrollmentUrl,complete:async()=>{
            this.#check(epoch);const status=await this.#http(ROOT+'/enrollments/'+start.enrollmentId,undefined,'GET');this.#check(epoch);
            if(status.state!=='APPROVED_WAITING_PROOF')throw Error('ENROLLMENT_NOT_APPROVED');
            const proof=await this.#provider.signHumanClientProtocolProof(start.proof,this.#expected('enrollment-claim',ROOT+'/enrollments/'+start.enrollmentId+'/claim',{enrollmentId:start.enrollmentId,publicKeyFingerprint:keyIdentity(key.publicKeySpki).publicKeyFingerprint}));this.#check(epoch);
            const claimed=await this.#http(ROOT+'/enrollments/'+start.enrollmentId+'/claim',proof);this.#check(epoch);
            const descriptor={schemaVersion:1,hostAuthorityId:start.proof.boundFields.hostAuthorityId,clientEnrollmentId:segment(claimed.clientEnrollmentId),...keyIdentity(key.publicKeySpki),providerType:key.providerType,providerKeyId:key.providerKeyId,implementationProfileId:claimed.implementationProfileId};
            this.#provider.writeDescriptor(descriptor);this.#descriptor=Object.freeze(descriptor);this.enrollment='ENROLLED';return this.status();
        }});
    }
    async reconnect() {
        this.disconnect();const epoch=this.#epoch;
        const key=this.#provider.getIdentity(),d=this.#provider.readDescriptor();
        const recovered=reconcile(key,d,{implementationProfileId:'vcp_chat.c2',hostAuthorityId:d?.hostAuthorityId});
        this.recovery=recovered.state;if(recovered.state!=='ENROLLED')throw Error(recovered.state);this.enrollment='ENROLLED';this.#descriptor=recovered.descriptor;this.state='AUTHENTICATING';
        const cid=segment(d.clientEnrollmentId),path=ROOT+'/clients/'+cid;
        const challenge=await this.#http(path+'/session-challenges',{});this.#check(epoch);
        const proof=await this.#provider.signHumanClientProtocolProof(challenge,this.#expected('session-authenticate',path+'/sessions',{clientEnrollmentId:cid,hostAuthorityId:d.hostAuthorityId,publicKeyFingerprint:d.publicKeyFingerprint}));this.#check(epoch);
        const s=await this.#http(path+'/sessions',proof);this.#check(epoch);
        this.admission=s.currentAdmission;this.state=s.sessionState||'DISCONNECTED';
        if(s.clientEnrollmentId!==cid || this.admission!=='ADMITTED' || s.productionAdmission!=='ADMITTED' || this.state!=='AUTHENTICATED') {this.state='DISCONNECTED';throw Error('CLIENT_NOT_AUTHORIZED');}
        this.#session={...s,hostBootId:challenge.boundFields.hostBootId};
        const sp=ROOT+'/sessions/'+segment(s.sessionId);
        const nonce=await this.#http(sp+'/nonces',{purpose:'capability-mint'});this.#check(epoch);
        const cp=await this.#provider.signHumanClientProtocolProof(nonce,this.#expected('capability-mint',sp+'/capability',{sessionId:s.sessionId,hostBootId:this.#session.hostBootId,hostAuthorityId:d.hostAuthorityId,publicKeyFingerprint:d.publicKeyFingerprint}));this.#check(epoch);
        const cap=await this.#http(sp+'/capability',cp);this.#check(epoch);
        const url=this.#host.replace('https:','wss:')+WS_PATH;if(cap.websocketUrl!==url)throw Error('ROUTE_INVALID');
        const ws=new this.#WebSocket(url,{headers:{'X-VCP-Human-Capability':cap.capability},maxPayload:1048576,perMessageDeflate:false});
        const generation=++this.#generation;this.#socket=ws;let ready=false,proofPhase='WAITING';
        const current=()=>this.#epoch===epoch&&this.#socket===ws&&this.#generation===generation;
        this.#timer=setTimeout(()=>{if(current()&&!ready)this.disconnect();},10000);this.#timer.unref?.();
        ws.on('message',async bytes=>{
            if(!current())return;
            try {
                const msg=JSON.parse(bytes.toString());
                if(!ready&&msg.type==='human_channel_challenge') {
                    if(proofPhase!=='WAITING')throw Error('CHANNEL_PROOF_DUPLICATE');proofPhase='SIGNING';
                    const expected={...this.#expected('channel-upgrade',WS_PATH,{sessionId:s.sessionId,hostBootId:this.#session.hostBootId,hostAuthorityId:d.hostAuthorityId,publicKeyFingerprint:d.publicKeyFingerprint}),method:'GET',capabilityDigest:require('node:crypto').createHash('sha256').update(cap.capability).digest('hex')};
                    const answer=await this.#provider.signHumanClientProtocolProof(msg.data,expected);if(!current())return;
                    proofPhase='SENT';ws.send(JSON.stringify({type:'human_channel_proof',data:answer}));return;
                }
                if(!ready&&proofPhase==='SENT'&&msg.type==='human_channel_ready'&&msg.data?.protocolVersion===1&&msg.data.clientSurface==='vcp_chat'){ready=true;this.#channelReady=true;this.#channelExpires=Math.min(Date.now()+900000,s.expiresAt);clearTimeout(this.#timer);this.emit('connected',generation);return;}
                if(!ready)throw Error('CHANNEL_NOT_READY');
                this.emit('message',msg,generation);
            }catch{if(current())this.disconnect();}
        });
        ws.on('close',()=>{if(current())this.disconnect();});ws.on('error',()=>{if(current())this.disconnect();});
    }
    async selfRevoke(){
        const epoch=this.#epoch,s=this.#session,d=this.#descriptor;if(!this.valid())throw Error('SESSION_UNKNOWN');
        const path=ROOT+'/sessions/'+segment(s.sessionId);
        const nonce=await this.#http(path+'/nonces',{purpose:'self-revoke'});this.#check(epoch);
        const proof=await this.#provider.signHumanClientProtocolProof(nonce,this.#expected('self-revoke',path+'/revoke',{sessionId:s.sessionId,hostBootId:s.hostBootId,hostAuthorityId:d.hostAuthorityId,publicKeyFingerprint:d.publicKeyFingerprint}));this.#check(epoch);
        const result=await this.#http(path+'/revoke',proof);this.#check(epoch);this.enrollment=result.enrollmentState||'REVOKED';this.disconnect();return this.status();
    }
    valid(){return this.#channelReady&&this.#channelExpires>Date.now()&&this.state==='AUTHENTICATED'&&this.admission==='ADMITTED'&&this.#session?.expiresAt>Date.now()&&this.#socket?.readyState===1;}
    send(type,data,generation,onFirstSend=()=>{}){if(!this.valid()||generation!==this.#generation)throw Error('CHANNEL_UNAVAILABLE');const frame=JSON.stringify({type,data});onFirstSend();this.#socket.send(frame);}
    disconnect(){const ws=this.#socket,g=this.#generation;this.#epoch++;this.#socket=null;clearTimeout(this.#timer);this.#session=null;this.#channelReady=false;this.#channelExpires=0;this.state='DISCONNECTED';this.admission='UNKNOWN';try{ws?.close();}catch{}this.emit('disconnected',g);}
}
module.exports={TrustedClientSession,ROOT,WS_PATH};
