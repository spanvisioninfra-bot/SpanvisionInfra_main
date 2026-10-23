import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {createHandler,sealSession} from './server.mjs';
import {createNeonStore} from './neon-store.mjs';
import {issueToolTicket,readToolTicket,toolIds} from './tool-trial.mjs';
import {trialComingSoonTools,trialToolIds} from './catalog.mjs';

const secret='isolated-trial-test-secret-at-least-32-characters';
const admin='admin_trial_01',member='member_trial_01',paid='paid_trial_01',fresh='fresh_trial_01';
const now=Date.now();

test('Neon trial migration and HTTP access enforce shared limits, 24/48h boundaries and paid access',async t=>{
  if(!process.env.PGLITE_MODULE)throw new Error('Set PGLITE_MODULE to the isolated test runtime.');
  const {PGlite}=await import(pathToFileURL(process.env.PGLITE_MODULE));
  const pg=new PGlite();
  let server;
  try{
    await pg.exec(await fs.readFile(new URL('neon-schema.sql',import.meta.url),'utf8'));
    const migration=await fs.readFile(new URL('neon-tool-trial.sql',import.meta.url),'utf8');
    await pg.exec(migration);await pg.exec(migration);
    await pg.exec('create role trial_browser; set role spanvision_commerce_server;');
    const env={NEON_AUTH_BASE_URL:'https://ep-example.neonauth.c-3.ap-southeast-1.aws.neon.tech/neondb/auth',
      DATABASE_URL:'postgresql://app:isolated@ep-example.neon.tech/db',SESSION_SECRET:secret,SUPER_ADMIN_USER_ID:admin,PRICING_APPROVED:'false'};
    const store=createNeonStore(async(sql,params)=>(await pg.query(sql,params)).rows,env);
    const record=id=>({id,email:id===admin?'spanvisioninfra.admin@gmail.com':id+'@example.test',email_confirmed_at:new Date().toISOString(),user_metadata:{full_name:id}});
    for(const id of [admin,member,paid,fresh])await store.syncAccount(record(id));
    const request=(tool='cad',id=randomUUID(),user=member,source='trial')=>store.request('rpc/claim_tool_launch',{method:'POST',body:JSON.stringify({account_id:user,selected_tool:tool,launch_request:id,access_source:source,access_expires:null})});
    const key=randomUUID(),first=await request('cad',key);
    assert.equal(first.trial.remaining,2);assert.equal(first.trial.day,1);
    assert.equal((await request('cad',key)).grantId,first.grantId,'retry must not consume another launch');
    await assert.rejects(request('pdf',key),/another tool/);
    const concurrent=await Promise.all(toolIds.slice(1,9).map(tool=>request(tool)));
    assert.equal(concurrent.filter(item=>item.allowed).length,2,'multiple tools/tabs share the final two launches');
    assert.equal((await request()).trial.status,'daily_limit');
    await pg.query("update spanvision_commerce.tool_trials set started_at=clock_timestamp()-interval '24 hours 1 second' where user_id=$1",[member]);
    const next=await request('geo');assert.equal(next.trial.day,2);assert.equal(next.trial.remaining,2);
    await pg.query("update spanvision_commerce.tool_trials set started_at=clock_timestamp()-interval '48 hours' where user_id=$1",[member]);
    assert.equal((await request()).trial.status,'expired');
    assert.equal((await request('cad',randomUUID(),paid,'subscription')).allowed,true);
    assert.deepEqual(await store.request('tool_trials?user_id=eq.'+paid),[],'paid access does not start the trial');

    const provider=async(url,options)=>{
      if(url.includes('/get-session')){
        const id=[admin,member,paid,fresh].find(id=>options.headers.Cookie?.includes(id+'-token'))||member;
        const user=record(id);
        return Response.json({session:{userId:id},user:{id,email:user.email,emailVerified:true,name:id,updatedAt:new Date().toISOString()}});
      }
      throw new Error('Unexpected provider call: '+url);
    };
    server=http.createServer(createHandler({env,fetcher:provider,store}));
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    env.SITE_URL=`http://127.0.0.1:${server.address().port}`;
    const cookie=(id=member,recovery=false)=>'sv_account='+sealSession({access:JSON.stringify({cookie:'__Secure-neon-auth.session_token='+id+'-token'}),refresh:'managed',provider:'neon',recovery,validUntil:Date.now()+60000},secret);
    const post=(route,body,headers={})=>fetch(env.SITE_URL+'/api/account/'+route,{method:'POST',headers:{Origin:env.SITE_URL,'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
    const launch=(user=member,extra={})=>post('tool-launch',{tool:'cad',requestId:randomUUID(),...extra},{Cookie:cookie(user)});
    assert.equal((await post('tool-launch',{tool:'cad',requestId:randomUUID()})).status,401);
    assert.equal((await post('tool-launch',{tool:'cad',requestId:randomUUID()},{Origin:'https://untrusted.test',Cookie:cookie()})).status,403);
    assert.equal((await post('tool-launch',{tool:'cad',requestId:randomUUID()},{Cookie:cookie(member,true)})).status,403);
    // Trial exclusions run before the allocator: no trial starts and no launch is spent.
    for(const tool of trialComingSoonTools){
      const response=await launch(fresh,{tool,plan:'team',role:'super_admin',access_source:'subscription'});
      assert.equal(response.status,403,tool);assert.match((await response.json()).error,/Coming soon/);
    }
    assert.deepEqual(await store.request('tool_trials?user_id=eq.'+fresh),[]);
    assert.deepEqual(await store.request('tool_launch_grants?user_id=eq.'+fresh),[]);
    const freshStatus=await (await fetch(env.SITE_URL+'/api/account/tool-status',{headers:{Cookie:cookie(fresh)}})).json();
    assert.deepEqual(freshStatus.policy.availableTools,trialToolIds);
    assert.deepEqual(freshStatus.policy.comingSoonTools,trialComingSoonTools);
    const firstTrial=await (await launch(fresh,{tool:'frame'})).json();
    assert.equal(firstTrial.allowed,true);assert.equal(firstTrial.trial.remaining,2);
    assert.equal((await post('tool-verify',{ticket:firstTrial.ticket,tool:'frame'})).status,200);
    for(const tool of trialComingSoonTools)assert.equal((await launch(fresh,{tool})).status,403);
    assert.equal((await store.request('rpc/tool_trial_status',{method:'POST',body:JSON.stringify({account_id:fresh})})).remaining,2);
    // A correctly signed ticket issued before this policy cannot keep a backend trial open.
    const legacy=await request('bim',randomUUID(),fresh);
    const legacyTicket=issueToolTicket(legacy,{id:fresh},'bim',secret);
    const legacyResponse=await post('tool-verify',{ticket:legacyTicket,tool:'bim'});
    assert.equal(legacyResponse.status,402);assert.match((await legacyResponse.json()).error,/Coming soon/);
    const denied=await (await launch(member,{plan:'team',role:'super_admin',remaining:100})).json();assert.equal(denied.allowed,false);
    const privileged=await (await launch(admin)).json();assert.equal(privileged.allowed,true);
    assert.equal(privileged.source,'super_admin');assert(privileged.ticket);
    for(const tool of trialComingSoonTools){
      const grant=await (await launch(admin,{tool})).json();
      assert.equal(grant.allowed,true);assert.equal(grant.source,'super_admin');
      assert.equal((await post('tool-verify',{ticket:grant.ticket,tool})).status,200);
    }
    let verified=await post('tool-verify',{ticket:privileged.ticket,tool:'cad'},{Origin:'https://tool.example'});
    assert.equal(verified.status,200);assert.equal((await verified.json()).userId,admin);
    assert.equal((await post('tool-verify',{ticket:privileged.ticket,tool:'pdf'})).status,401);
    assert.equal((await post('tool-verify',{ticket:privileged.ticket+'x',tool:'cad'})).status,401);
    await pg.query("update spanvision_commerce.tool_launch_grants set expires_at=clock_timestamp()-interval '1 second' where id=$1",[readToolTicket(privileged.ticket,secret).grant]);
    assert.equal((await post('tool-verify',{ticket:privileged.ticket,tool:'cad'})).status,402);
    // Only a verified active subscription unlocks a member after the trial.
    await store.request('rpc/apply_billing_subscription',{method:'POST',body:JSON.stringify({record:{provider:'stripe',provider_subscription_id:'sub_trial',user_id:member,plan_key:'STUDIO_MONTHLY_USD',status:'active',current_period_end:new Date(Date.now()+86400000).toISOString(),observed_at:new Date().toISOString()}})});
    const subscription=await (await launch()).json();assert.equal(subscription.allowed,true);assert.equal(subscription.source,'subscription');
    assert.equal((await post('tool-verify',{ticket:subscription.ticket,tool:'cad'})).status,200);
    for(const tool of trialComingSoonTools){
      const grant=await (await launch(member,{tool})).json();
      assert.equal(grant.allowed,true);assert.equal(grant.source,'subscription');
      assert.equal((await post('tool-verify',{ticket:grant.ticket,tool})).status,200);
    }
    await pg.query("update spanvision_commerce.billing_subscriptions set status='canceled' where user_id=$1",[member]);
    assert.equal((await post('tool-verify',{ticket:subscription.ticket,tool:'cad'})).status,402);
    await pg.exec('reset role; set role trial_browser;');
    await assert.rejects(pg.query('select * from spanvision_commerce.tool_trials'),/permission denied/);
    await assert.rejects(request(),/permission denied/);
  }finally{if(server)await new Promise(resolve=>server.close(resolve));await pg.close();}
});

test('legacy PostgreSQL migration uses restricted server access and the same trial policy',async()=>{
  const {PGlite}=await import(pathToFileURL(process.env.PGLITE_MODULE));
  const pg=new PGlite();
  try{
    const id='12345678-1234-4234-8234-123456789abc';
    await pg.exec(`create role anon; create role authenticated; create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);insert into auth.users values('${id}');`);
    const sql=await fs.readFile(new URL('tool-trial.sql',import.meta.url),'utf8');await pg.exec(sql);await pg.exec(sql);
    await pg.exec('set role service_role;');
    const claim=async()=> (await pg.query('select public.claim_tool_launch($1,$2,$3,$4,$5) as result',[id,'cad',randomUUID(),'trial',null])).rows[0].result;
    assert.equal((await claim()).allowed,true);await claim();await claim();assert.equal((await claim()).allowed,false);
    await pg.exec('reset role;set role authenticated;');await assert.rejects(claim(),/permission denied/);
  }finally{await pg.close();}
});
