import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {guard,safeNext,verify} from './tool-access-edge.js';
import {packageToolAccess} from './package-tool-access.mjs';

const origin='https://www.spanvisioninfra.com',env={SPANVISION_ACCOUNT_ORIGIN:origin};
const request=(path='/',options={})=>new Request('https://tool.example'+path,options);
const allowed=async()=>Response.json({allowed:true,tool:'cad',userId:'member',expiresAt:new Date(Date.now()+60000).toISOString()});

test('direct pages, JS/WASM assets and backend requests require access',async()=>{
  for(const route of ['/','/assets/app.js','/app/engine.wasm','/api/toetsing','/_spanvision_gate']){
    const response=await guard(request(route),{tool:'cad',env,fetcher:()=>{throw new Error('No token must not call the account service');}});
    assert.equal(response.status,401,route);
    assert.equal(response.headers.get('x-middleware-next'),null);
  }
  const redirect=await guard(request('/app/',{headers:{Accept:'text/html'}}),{tool:'cad',env});
  assert.equal(redirect.status,303);assert(redirect.headers.get('location').startsWith(origin+'/launch.html?tool=cad'));
});

test('form handoff sets an HttpOnly host cookie and only redirects within the tool',async()=>{
  const ticket='isolated-test-form-ticket';
  const response=await guard(request('/__spanvision/access',{method:'POST',headers:{Origin:origin,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({ticket,next:'/app/?appearance=light#drawing'})}),{tool:'cad',env,fetcher:allowed});
  assert.equal(response.status,303);assert.equal(response.headers.get('location'),'https://tool.example/app/?appearance=light#drawing');
  const cookie=response.headers.get('set-cookie');
  for(const attribute of ['__Host-sv-tool=','HttpOnly','Secure','SameSite=Lax','Path=/'])assert(cookie.includes(attribute));
  const opened=await guard(request('/assets/app.js',{headers:{Cookie:cookie.split(';')[0]}}),{tool:'cad',env,fetcher:allowed});
  assert.equal(opened.headers.get('x-middleware-next'),'1');
  assert.equal(opened.headers.get('cache-control'),'private, no-store');
  const csrf=await guard(request('/__spanvision/access',{method:'POST',headers:{Origin:'https://untrusted.test','Content-Type':'application/x-www-form-urlencoded'},body:'ticket=x'}),{tool:'cad',env,fetcher:allowed});
  assert.equal(csrf.status,403);
  for(const value of ['https://evil.test','//evil.test','/\\evil.test','/\nevil','/__spanvision/access'])assert.equal(safeNext(value),'/');
});

test('invalid, expired and unavailable grants fail closed; heartbeat is private',async()=>{
  for(const status of [401,402,503]){
    const response=await guard(request('/__spanvision/session',{headers:{Cookie:'__Host-sv-tool=test-'+status}}),{tool:'cad',env,fetcher:async()=>new Response('{}',{status})});
    assert.equal(response.status,status);assert.equal(response.headers.get('x-middleware-next'),null);
  }
  const failure=await guard(request('/',{headers:{Cookie:'__Host-sv-tool=network-failure'}}),{tool:'cad',env,fetcher:async()=>{throw new Error('offline');}});
  assert.equal(failure.status,503);
  const invalid=await verify('wrong-audience','pdf',origin,allowed);assert.equal(invalid.allowed,false);
  const expired=await verify('expired','cad',origin,async()=>Response.json({allowed:true,tool:'cad',expiresAt:'2000-01-01'}));assert.equal(expired.allowed,false);
});

test('private middleware packaging contains no account secrets and covers every request',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'spanvision-access-test-'));
  try{
    const route=await packageToolAccess(directory,'pdf');
    assert.deepEqual(route,{src:'/.*',middlewarePath:'_spanvision_gate',continue:true});
    const config=JSON.parse(await fs.readFile(path.join(directory,'functions/_spanvision_gate.func/.vc-config.json')));
    assert.equal(config.runtime,'edge');assert.deepEqual(config.envVarsInUse,['SPANVISION_ACCOUNT_ORIGIN']);
    assert.equal((await fs.readFile(path.join(directory,'functions/_spanvision_gate.func/tool-id.js'),'utf8')).trim(),'export const toolId="pdf";');
    const code=await fs.readFile(path.join(directory,'functions/_spanvision_gate.func/index.js'),'utf8');assert(!code.includes('SESSION_SECRET'));assert(!code.includes('DATABASE_URL'));
  }finally{
    if(path.dirname(directory)!==path.resolve(os.tmpdir())||!path.basename(directory).startsWith('spanvision-access-test-'))throw new Error('Unsafe test cleanup path');
    await fs.rm(directory,{recursive:true,force:true});
  }
});
