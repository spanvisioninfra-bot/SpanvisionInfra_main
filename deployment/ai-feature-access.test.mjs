import test from 'node:test';
import assert from 'node:assert/strict';
import {aiFeatures,toolFeatures,trialPolicy,trialToolIds} from '../commerce/catalog.mjs';
import {getAiFeatureAccess,requireAiFeature,subscribeAiFeature} from './ai-feature-access.mjs';

const context=()=>Object.assign(new EventTarget(),{location:{hostname:'tool.example'}});
const access=(ai,extra={})=>({allowed:true,expiresAt:new Date(Date.now()+60000).toISOString(),features:{ai},...extra});
test('AI policy leaves 13 regular tools and the shared trial allowance available',()=>{
  assert.equal(trialToolIds.length,13);assert.equal(trialPolicy.dailyLimit,3);assert.equal(trialPolicy.hours,48);
  assert.deepEqual(trialPolicy.comingSoonFeatures.ai,Object.keys(aiFeatures));
  for(const tool of Object.keys(aiFeatures)){
    assert.equal(toolFeatures(tool,'trial').ai.available,false,tool);
    assert.equal(toolFeatures(tool,'forged-paid-plan').ai.available,false,tool);
    for(const source of ['subscription','admin','super_admin'])assert.equal(toolFeatures(tool,source).ai.available,true,tool);
  }
  assert.deepEqual(toolFeatures('ifc','trial'),{});
});
test('trial AI actions are rejected using the private session without a launch request',async()=>{
  const calls=[];
  const options={context:context(),fetcher:async(url,options)=>{calls.push({url,options});return Response.json(access(toolFeatures('frame','trial').ai));}};
  await assert.rejects(requireAiFeature(options),/AI features.*Coming soon/);
  assert.equal(calls.length,1);assert.equal(calls[0].url,'/__spanvision/session');
  assert.equal(calls[0].options.cache,'no-store');assert.equal(calls[0].options.credentials,'same-origin');
});
test('paid AI is allowed but missing policy, expired and invalid sessions fail closed',async()=>{
  const env=context();
  await requireAiFeature({context:env,fetcher:async()=>Response.json(access({available:true}))});
  for(const data of [access(undefined),access({available:'true'}),access({available:true},{allowed:false}),access({available:true},{expiresAt:'2000-01-01'})]){
    const result=await getAiFeatureAccess({context:env,fetcher:async()=>Response.json(data)});
    assert.equal(result.available,false);
  }
  for(const fetcher of [async()=>new Response('{}',{status:503}),async()=>{throw new Error('offline');}]){
    await assert.rejects(requireAiFeature({context:env,fetcher}),/could not verify AI access/);
  }
});
test('only local development and native workflows bypass hosted checks',async()=>{
  const noNetwork=()=>{throw new Error('must not contact production');};
  for(const hostname of ['localhost','127.0.0.1','[::1]'])await requireAiFeature({context:{location:{hostname}},fetcher:noNetwork});
  await requireAiFeature({context:{__TAURI_INTERNALS__:{},location:{hostname:'tauri.localhost'}},fetcher:noNetwork});
  await assert.rejects(requireAiFeature({context:{location:{hostname:'localhost.evil.test'}},fetcher:noNetwork}));
});
test('open panels update after verification and ignore older responses and unmounted listeners',async()=>{
  const env=context(),seen=[];let finish;
  const stop=subscribeAiFeature(value=>seen.push(value),{context:env,fetcher:()=>new Promise(resolve=>{finish=resolve;})});
  assert.equal(seen.at(-1).checking,true);
  env.dispatchEvent(new CustomEvent('sv-tool-session',{detail:access({available:false})}));
  assert.equal(seen.at(-1).available,false);
  finish(Response.json(access({available:true})));await new Promise(resolve=>setImmediate(resolve));
  assert.equal(seen.at(-1).available,false,'old request cannot unlock a downgraded panel');
  env.dispatchEvent(new CustomEvent('sv-tool-session',{detail:access({available:true})}));
  assert.equal(seen.at(-1).available,true);
  stop();const count=seen.length;
  env.dispatchEvent(new CustomEvent('sv-tool-session',{detail:access({available:false})}));
  assert.equal(seen.length,count);
});
