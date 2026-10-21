import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import {pathToFileURL} from 'node:url';
import {createHandler} from './server.mjs';
import {createNeonStore} from './neon-store.mjs';
import {neonUser} from './neon-auth.mjs';

if(!process.env.PGLITE_MODULE)throw new Error('Set PGLITE_MODULE to an isolated @electric-sql/pglite/dist/index.js runtime.');
const {PGlite}=await import(pathToFileURL(process.env.PGLITE_MODULE));
const administrator={id:'admin_test_012345',email:'spanvisioninfra.admin@gmail.com',name:'Admin',emailVerified:true,
  createdAt:'2026-10-14T00:00:00Z',updatedAt:'2026-10-14T00:00:00Z'};
const member={...administrator,id:'member_test_012345',email:'member@example.test',name:'Member'};
const schema=await fs.readFile(new URL('neon-schema.sql',import.meta.url),'utf8');

test('Neon migration, least-privilege access, checkout leases, subscription ordering and atomic audits',async()=>{
  const db=new PGlite();
  try{
    await db.exec('create role authenticated; create role spanvision_app login;');
    await db.exec(schema);await db.exec(schema);
    await db.exec('grant spanvision_commerce_server to spanvision_app; set role spanvision_app;');
    const query=async(sql,params)=>(await db.query(sql,params)).rows;
    const store=createNeonStore(query,{SUPER_ADMIN_USER_ID:administrator.id});
    await store.syncAccount(neonUser(administrator));await store.syncAccount(neonUser(member));
    const permissions=(await query(`select
      has_schema_privilege('authenticated','spanvision_commerce','usage') as client_schema,
      has_function_privilege('authenticated','spanvision_commerce.admin_set_plan_access(text,text,text,timestamptz,text,text)','execute') as client_rpc,
      has_table_privilege('spanvision_app','spanvision_commerce.account_plan_audit','insert') as direct_audit_write,
      has_table_privilege('spanvision_app','spanvision_commerce.account_plan_overrides','insert') as direct_grant_write`))[0];
    assert.deepEqual(permissions,{client_schema:false,client_rpc:false,direct_audit_write:false,direct_grant_write:false});
    const rpc=(body)=>store.request('rpc/admin_set_plan_access',{method:'POST',body:JSON.stringify(body)});
    const request={actor:administrator.id,target:member.id,requested_plan:'team',expires:null,note:'Initial team access'};
    await rpc(request);
    assert.equal((await store.request(`account_plan_overrides?user_id=eq.${member.id}&select=plan_id`))[0].plan_id,'team');
    let audit=await store.request(`account_plan_audit?user_id=eq.${member.id}&select=action,before_state,after_state&order=created_at.desc&limit=20`);
    assert.equal(audit.length,1);assert.equal(audit[0].before_state,null);assert.equal(audit[0].after_state.plan_id,'team');
    await rpc({...request,requested_plan:null,note:'Restore subscription access'});
    assert.deepEqual(await store.request(`account_plan_overrides?user_id=eq.${member.id}&select=plan_id`),[]);
    await assert.rejects(rpc({...request,actor:member.id}),/Super-admin/);
    await assert.rejects(rpc({...request,target:administrator.id}),/every plan/);
    await assert.rejects(rpc({...request,requested_plan:'wrong'}),/Invalid plan/);
    const incorrectlyPinned=createNeonStore(query,{SUPER_ADMIN_USER_ID:member.id});
    await assert.rejects(incorrectlyPinned.request('rpc/admin_set_plan_access',{method:'POST',body:JSON.stringify(request)}),/Super-admin/);
    await db.query('update spanvision_commerce.accounts set email_verified=false where id=$1',[administrator.id]);
    await assert.rejects(rpc(request),/Super-admin/);await store.syncAccount(neonUser(administrator));
    await db.exec('reset role;');
    await db.exec(`create function spanvision_commerce.reject_test_audit() returns trigger language plpgsql as $$ begin raise exception 'Test audit failure'; end $$;
      create trigger reject_test_audit before insert on spanvision_commerce.account_plan_audit for each row execute function spanvision_commerce.reject_test_audit();
      set role spanvision_app;`);
    await assert.rejects(rpc(request),/Test audit failure/);
    assert.deepEqual(await store.request(`account_plan_overrides?user_id=eq.${member.id}&select=plan_id`),[]);
    assert.equal((await store.request(`account_plan_audit?user_id=eq.${member.id}&select=id`)).length,2);
    await db.exec('reset role; drop trigger reject_test_audit on spanvision_commerce.account_plan_audit; set role spanvision_app;');
    const lease=()=>store.request('rpc/claim_billing_checkout',{method:'POST',body:JSON.stringify({account_id:member.id,selected_plan:'STUDIO_MONTHLY_USD'})});
    assert.deepEqual(await lease(),{claimed:true});assert.equal((await lease()).claimed,false);
    await store.request('billing_checkout_locks?user_id=eq.'+member.id,{method:'PATCH',body:JSON.stringify({checkout_url:'https://checkout.stripe.com/test'})});
    assert.equal((await lease()).checkout_url,'https://checkout.stripe.com/test');
    const subscription={provider:'stripe',provider_subscription_id:'sub_test',user_id:member.id,plan_key:'STUDIO_MONTHLY_USD',status:'active',
      current_period_end:'2026-12-01T00:00:00Z',observed_at:'2026-10-14T10:00:00Z'};
    const apply=record=>store.request('rpc/apply_billing_subscription',{method:'POST',body:JSON.stringify({record})});
    await apply(subscription);await apply({...subscription,status:'canceled',observed_at:'2026-10-14T09:00:00Z'});
    assert.equal((await store.request('billing_subscriptions?provider_subscription_id=eq.sub_test&select=status'))[0].status,'active');
    await store.request('billing_events?on_conflict=provider,event_id',{method:'POST',headers:{Prefer:'resolution=ignore-duplicates'},body:JSON.stringify({provider:'stripe',event_id:'evt_test'})});
    await store.request('billing_events?on_conflict=provider,event_id',{method:'POST',headers:{Prefer:'resolution=ignore-duplicates'},body:JSON.stringify({provider:'stripe',event_id:'evt_test'})});
    assert.equal((await store.request('billing_events?provider=eq.stripe&event_id=eq.evt_test&select=event_id')).length,1);
    await db.exec('reset role; set role authenticated;');
    await assert.rejects(db.query('select * from spanvision_commerce.accounts'),/permission denied/);
    await assert.rejects(rpc(request),/permission denied/);
  }finally{await db.close();}
});

test('Neon HTTP account/admin routes work with real SQL storage and keep grants separate from billing',async t=>{
  const db=new PGlite();
  let server;
  try{
    await db.exec(schema);await db.exec('set role spanvision_commerce_server;');
    const env={NEON_AUTH_BASE_URL:'https://ep-example.neonauth.c-3.ap-southeast-1.aws.neon.tech/neondb/auth',
      DATABASE_URL:'postgresql://app:private@ep-example.neon.tech/neondb?sslmode=require',SESSION_SECRET:'test-secret-longer-than-32-characters',SUPER_ADMIN_USER_ID:administrator.id};
    const store=createNeonStore(async(sql,params)=>(await db.query(sql,params)).rows,env);
    await store.syncAccount(neonUser(member));
    const provider=async url=>{
      if(url.endsWith('/sign-in/email'))return Response.json({user:administrator,token:'secret-provider-token'},
        {headers:{'Set-Cookie':'__Secure-neon-auth.session_token=secret-provider-cookie; Secure; HttpOnly'}});
      if(url.includes('/get-session'))return Response.json({session:{userId:administrator.id},user:administrator});
      throw new Error('Unexpected provider request');
    };
    server=http.createServer(createHandler({env,fetcher:provider,store}));
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const origin=`http://127.0.0.1:${server.address().port}`;env.SITE_URL=origin;
    const post=(route,body,cookie)=>fetch(origin+route,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(body)});
    const login=await post('/api/account/sign-in',{email:administrator.email,password:'a-private-password'});
    assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0];
    const get=route=>fetch(origin+route,{headers:{Cookie:cookie}});
    const users=await (await get('/api/admin/users')).json();assert.equal(users.users.length,2);assert.equal(users.total,2);
    assert(!JSON.stringify(users).includes('secret-provider'));
    assert.equal((await post('/api/admin/plan',{userId:member.id,plan:'studio',reason:'Manual account access'},cookie)).status,200);
    let details=await (await get('/api/admin/user?user='+member.id)).json();
    assert.equal(details.access.plan,'studio');assert.equal(details.audit.length,1);assert.deepEqual(details.subscriptions,[]);
    assert.equal((await post('/api/admin/plan',{userId:member.id,plan:null,reason:'Restore free plan'},cookie)).status,200);
    details=await (await get('/api/admin/user?user='+member.id)).json();assert.equal(details.access.plan,'explorer');assert.equal(details.audit.length,2);
    assert.equal((await post('/api/admin/plan',{userId:member.id+"';drop",plan:'team',reason:'Invalid target'},cookie)).status,400);
    assert.equal((await post('/api/admin/plan',{userId:administrator.id,plan:'explorer',reason:'Attempt downgrade'},cookie)).status,409);
  }finally{if(server)await new Promise(resolve=>server.close(resolve));await db.close();}
});
