 'use strict';
const {randomUUID}=require('node:crypto');
const {createApprovalProtocol,approvalMessage}=require('./approvalDelivery');
const {projection}=require('./humanSafeCanonicalDisplay');
const sensitive=require('./sensitiveAuthorityClassifier');
const {HumanInteractionEligibility}=require('./humanInteractionEligibility');
const {HumanInputProvenance}=require('./humanInputProvenance');
class TrustedClientNativeService {
    #session;#boundary;#view=null;#pendingDecision=null;#protocol;#eligibility;#provenance;#integrity;#lock;#requestGeneration=0;#power;#listeners=[];#lastRequest=null;#deadlineTimer;
    constructor({session,boundary,attestor=null,integrity=()=>false,lockState=()=> 'UNKNOWN',powerMonitor}) {
        this.#session=session;this.#boundary=boundary;this.#integrity=integrity;this.#lock=lockState;this.#power=powerMonitor;
        this.#eligibility=new HumanInteractionEligibility();this.#provenance=new HumanInputProvenance(attestor);
        this.#protocol=createApprovalProtocol((type,data)=>{
            if(type==='tool_approval_response') {
                const ctx=this.#pendingDecision;
                if(!ctx || !this.#current(ctx) || data.requestId!==ctx.requestId || data.approved!==(ctx.decision==='ALLOW') || data.argsDigest!==ctx.record.argsDigest || !this.#provenance.consume(ctx.evidence,ctx))return false;
                // No await, timer or queue between final context validation and first send.
                try{this.#session.send(type,data,ctx.socketGeneration,()=>{ctx.stage='FIRST_SEND_ATTEMPTED';ctx.invoked=true;});ctx.stage='SENDING';return true;}
                catch{ctx.stage=ctx.invoked?'DELIVERY_UNKNOWN':'DISCARDED';return false;}
            }
            try{this.#session.send(type,data,this.#session.generation);return true;}catch{return false;}
        });
        session.on('connected',g=>{this.invalidate();this.#protocol.connected(g);});
        session.on('disconnected',g=>{this.invalidate();this.#protocol.disconnected(g);});
        session.on('message',(message,g)=>{
            if(g!==this.#session.generation)return;
            if(['tool_approval_snapshot','tool_approval_terminal','tool_approval_ack'].includes(message.type))this.invalidate();
            this.#protocol.ingest(message.type,message.data,g);this.#requestGeneration++;
            this.#publishStatus();
        });
        for(const event of ['lock-screen','suspend','unlock-screen','resume']) {
            const fn=()=>{this.invalidate();this.#protocol.sync();};powerMonitor?.on(event,fn);this.#listeners.push([event,fn]);
        }
    }
    get status(){return Object.freeze({...this.#session.status(),ready:this.#protocol.ready.value,needsReconnect:this.#protocol.needsReconnect.value,eligibility:this.#eligibility.state});}
    invalidate(){clearTimeout(this.#deadlineTimer);this.#view=null;this.#eligibility.invalidate();this.#boundary?.invalidate();}
    #publishStatus(){if(this.#lastRequest){const r=this.#protocol.records.get(this.#lastRequest);if(r)this.#boundary.present({statusOnly:true,message:approvalMessage(r)});}}
    async presentNext(){
        await this.#boundary.open();
        const r=[...this.#protocol.records.values()].find(r=>sensitive(r)&&this.#protocol.canRespond(r,false));
        if(!r || !this.#session.valid() || !this.#integrity()) {this.invalidate();return false;}
        const w=this.#boundary.window;
        if(this.#eligibility.reconcile({lockState:this.#lock(),freshSync:this.#protocol.ready.value,visible:w.isVisible(),focused:w.isFocused(),integrity:this.#integrity()})!=='ELIGIBLE')return false;
        const view={requestId:r.requestId,record:r,viewGeneration:randomUUID(),windowGeneration:this.#boundary.generation,requestGeneration:this.#requestGeneration,socketGeneration:this.#session.generation,eligibilityEpoch:this.#eligibility.epoch,stage:'PRESENTED',display:projection(r)};
        this.#view=view;this.#lastRequest=r.requestId;clearTimeout(this.#deadlineTimer);
        this.#deadlineTimer=setInterval(()=>{if(this.#view===view&&(!this.#protocol.deadlineValid(r)||!this.#session.valid()||!this.#integrity()))this.invalidate();},100);this.#deadlineTimer.unref?.();
        this.#boundary.present({viewGeneration:view.viewGeneration,...view.display,message:approvalMessage(r)});return true;
    }
    #current(ctx){
        const v=this.#view;
        return v && v===ctx.view && v.record===ctx.record && this.#protocol.records.get(ctx.requestId)===ctx.record &&
            this.#requestGeneration===ctx.requestGeneration && this.#session.generation===ctx.socketGeneration &&
            this.#eligibility.epoch===ctx.eligibilityEpoch && this.#eligibility.state==='ELIGIBLE' && this.#lock()==='UNLOCKED' &&
            this.#session.valid() && this.#integrity() && !ctx.record.hostTerminal && this.#protocol.deadlineValid(ctx.record) &&
            this.#boundary.valid(ctx.event,ctx.windowGeneration) && this.#provenance.valid(ctx.evidence,ctx);
    }
    async submit(event,input){
        const v=this.#view;
        if(!v || v.stage!=='PRESENTED' || !input || Object.keys(input).sort().join(',')!=='decision,viewGeneration' ||
            !['ALLOW','DENY'].includes(input.decision) || input.viewGeneration!==v.viewGeneration ||
            !this.#boundary.valid(event,v.windowGeneration) || !this.#protocol.canRespond(v.record,input.decision==='ALLOW') ||
            (input.decision==='ALLOW'&&!v.display.allow) || this.#eligibility.state!=='ELIGIBLE')return {accepted:false};
        v.stage='HUMAN_DECIDED';
        const ctx={...v,view:v,event,decision:input.decision,evidence:null,invoked:false};
        ctx.evidence=await this.#provenance.capture(ctx);
        if(!this.#current(ctx)){this.invalidate();return {accepted:false,stage:'DISCARDED'};}
        ctx.stage='DECISION_BOUND';
        const frame=Object.freeze({requestId:v.requestId,approved:input.decision==='ALLOW',protocolVersion:1,argsDigest:v.record.argsDigest});
        ctx.stage='FRAME_PREPARED';
        if(!this.#current(ctx)){this.invalidate();return {accepted:false,stage:'DISCARDED'};}
        this.#pendingDecision=ctx;
        this.#protocol.respond(frame.requestId,frame.approved);
        this.#pendingDecision=null;this.#view=null;
        this.#boundary.present({statusOnly:true,message:ctx.stage==='SENDING'?'正在提交审批，等待 Host 确认。':ctx.stage==='DELIVERY_UNKNOWN'?'投递结果未知，不会自动重发。':'未发送，需重新展示并由人工操作。'});
        return {accepted:false,stage:ctx.stage}; // Local send is never Host acceptance.
    }
    sync(){this.invalidate();this.#protocol.sync();}
    dispose(){this.invalidate();for(const [event,fn] of this.#listeners)this.#power?.removeListener(event,fn);this.#session.disconnect();this.#boundary.destroy();}
}
module.exports={TrustedClientNativeService};
