'use strict';
// Reuses JSO's existing request authenticator. No account creation, role mapping or disk storage.
class OwnerSession {
 #credential=null; #identity=null; #generation=0;
 constructor({jsoUrl,ownerSubjectId,resourceId,fetchImpl=fetch,credential=null}) {
  const url=new URL(jsoUrl);if(url.protocol!=='http:'||!['127.0.0.1','[::1]'].includes(url.hostname)||url.username||url.password||url.search||url.hash)throw Error('JSO_LOCAL_ONLY');
  this.url=url;this.subjectId=ownerSubjectId;this.resourceId=resourceId;this.fetch=fetchImpl;
  // Compatibility with existing isolated fixtures; interactive login never persists this value.
  if(credential)this.#credential=credential;
 }
 status(){return {configured:true,authenticated:!!this.#identity,subjectId:this.#identity?.subjectId??null,resourceId:this.resourceId,expectedSubjectId:this.subjectId};}
 logout(){this.#generation++;this.#credential=null;this.#identity=null;return this.status();}
 async #probe(credential){
  const r=await this.fetch(new URL('/api/v2/agent/owner-session',this.url),{redirect:'error',signal:AbortSignal.timeout(10000),headers:{authorization:'Bearer '+credential}});
  const identity=await r.json();
  if(!r.ok||!identity.ok||identity.role!=='administrator'||identity.subjectId!==this.subjectId||!Array.isArray(identity.resourceIds)||!identity.resourceIds.includes(this.resourceId))throw Error('JSO_OWNER_IDENTITY_OR_SCOPE_REJECTED');
  return {subjectId:identity.subjectId,resourceIds:[...identity.resourceIds]};
 }
 async login(credential){
  this.logout();const generation=this.#generation;
  if(typeof credential!=='string'||!/^[\x21-\x7e]{32,4096}$/.test(credential))return {ok:false,code:'JSO_OWNER_CREDENTIAL_INVALID'};
  try{const identity=await this.#probe(credential);if(generation!==this.#generation)return {ok:false,code:'JSO_OWNER_LOGIN_CANCELLED'};this.#credential=credential;this.#identity=identity;return {ok:true,status:this.status()};}
  catch{return {ok:false,code:'JSO_OWNER_IDENTITY_OR_SCOPE_REJECTED'};}
 }
 async verify(){
  const credential=this.#credential,generation=this.#generation;if(!credential)return false;
  try{const identity=await this.#probe(credential);if(generation!==this.#generation)return false;this.#identity=identity;return true;}
  catch{if(generation===this.#generation)this.logout();return false;}
 }
 async delegate(body){
  if(!await this.verify())return {ok:false,code:'OWNER_SESSION_REQUIRED'};
  const generation=this.#generation,credential=this.#credential;
  try{const r=await this.fetch(new URL('/api/v2/agent/owner-delegation',this.url),{method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),headers:{authorization:'Bearer '+credential,'content-type':'application/json'},body:JSON.stringify(body)});const result=await r.json();if(generation!==this.#generation)return {ok:false,code:'OWNER_SESSION_REQUIRED'};if(r.status===401||r.status===403)this.logout();return result;}
  catch{return {ok:false,code:'AUTHORIZATION_UNAVAILABLE'};}
 }
}
module.exports={OwnerSession};
