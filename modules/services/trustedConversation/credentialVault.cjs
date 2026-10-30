'use strict';
const fs=require('node:fs');
const captured=new WeakMap();
const canonical='JSO_OWNER_SESSION_AUTHORIZATION';
const valid=value=>typeof value==='string'&&/^Bearer [\x21-\x7e]{32,4096}$/.test(value);
function ownerNames(env){
 const names=new Set([canonical]);
 try{
  const binding=JSON.parse(fs.readFileSync(env.VCPCHAT_NATIVE_TOOL_BINDING_FILE,'utf8'));
  if(binding&&typeof binding==='object'&&!Array.isArray(binding)&&/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(binding.applicationAuthorizationEnv||''))names.add(binding.applicationAuthorizationEnv);
 }catch{}
 return names;
}
// Called before main.js imports any services that can spawn child processes.
// The value stays in this module's process-local closure, never an exported object.
function captureFromEnvironment(env=process.env){
 const values=captured.get(env)||new Map();
 for(const name of ownerNames(env)){
  if(valid(env[name])){values.set(name,env[name]);delete env[name];}
 }
 captured.set(env,values);
}
function authorizationFor(binding,env){return captured.get(env)?.get(binding.applicationAuthorizationEnv)??env[binding.applicationAuthorizationEnv];}
// A launcher's doctor may spawn version probes before Electron starts. Those
// probes do not need the Owner credential; retain it only for the real main.
function withoutOwnerCredentials(env){
 const clean={...env};for(const name of ownerNames(env))if(valid(clean[name]))delete clean[name];return clean;
}
module.exports={captureFromEnvironment,authorizationFor,withoutOwnerCredentials};
