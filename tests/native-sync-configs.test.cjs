'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {publishExecutionConfigs}=require('../modules/services/nativeSync/executionConfigs');
test('explicit publisher projects native Agent DTO and current version without credentials or paths',async()=>{
 let submission;const topics=[{itemType:'agent',itemId:'agent',topicId:'topic'}];
 await publishExecutionConfigs({topics,readAgentConfig:async()=>({name:'Test',systemPrompt:'synthetic prompt',model:'synthetic-model',temperature:'0.8',contextTokenLimit:'10000',maxOutputTokens:'100',topics:[{id:'topic'}],apiKey:'never publish',privatePath:'never publish'}),send:async(route,options)=>{
  if(!options)return {topics:[{ownerType:'agent',ownerId:'agent',topicId:'topic',configVersion:7}]};submission=options.body;return {topics:[]};
 }});
 assert.equal(submission.topics[0].expectedVersion,7);assert.equal(submission.topics[0].config.temperature,0.8);
 assert.equal(JSON.stringify(submission).includes('never publish'),false);
});
test('publisher rejects a topic absent from desktop Agent before posting',async()=>{
 let posted=false;await assert.rejects(()=>publishExecutionConfigs({topics:[{itemId:'agent',topicId:'missing'}],readAgentConfig:async()=>({topics:[]}),send:async(_,o)=>{if(o)posted=true;return {topics:[]};}}),e=>e.code==='SELECTED_TOPIC_NOT_IN_AGENT');assert.equal(posted,false);
});
