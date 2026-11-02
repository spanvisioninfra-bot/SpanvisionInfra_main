import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import {randomUUID,createHmac} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {createNeonStore} from './neon-store.mjs';
import {createHandler,sealSession} from './server.mjs';
import {trialToolIds,trialComingSoonTools} from './catalog.mjs';

test('₹1 day pass: real SQL, authenticated HTTP, verified payment, one-time 24h access',async t=>{
  assert(process.env.PGLITE_MODULE,'Set PGLITE_MODULE to the isolated PGlite runtime.');
  const {PGlite}=await import(pathToFileURL(process.env.PGLITE_MODULE)),pg=new PGlite();
  const env={NEON_AUTH_BASE_URL:'https://ep-fixture.neonauth.c-3.ap-southeast-1.aws.neon.tech/db/auth',DATABASE_URL:'postgresql://app:fixture@ep-fixture.neon.tech/db',SESSION_SECRET:'isolated-day-pass-session-secret-at-least-32',RAZORPAY_KEY_ID:'rzp_live_fixture',RAZORPAY_KEY_SECRET:'isolated-payment-secret',RAZORPAY_WEBHOOK_SECRET:'isolated-webhook-secret',SUPER_ADMIN_USER_ID:'admin',DAY_PASS_ENABLED:'true'};
  let server,attempts=0,ambiguous=false,corruption=null;
  const users=new Map(),orders=new Map(),payments=new Map(),providerCalls=[];
  const provider=async(url,options={})=>{
    if(url.includes('/get-session')){const id=options.headers.Cookie?.match(/session_token=([^;]+)/)?.[1],user=users.get(id);return Response.json(user?{session:{id:'session',userId:id},user}:{error:'Revoked'},{status:user?200:401});}
    providerCalls.push({url,options});const endpoint=url.replace('https://api.razorpay.com/v1/','');
    assert(!endpoint.startsWith('subscriptions')&&!endpoint.endsWith('/capture'),'Day pass cannot create subscriptions or capture money');
    if(endpoint==='orders'&&options.method==='POST'){
      const body=JSON.parse(options.body);assert.equal(body.amount,100);assert.equal(body.currency,'INR');assert.equal(body.partial_payment,false);assert.equal(body.notes.purpose,'tool_day_pass');
      const order={...body,id:'order_fixture'+(++attempts),status:'created',amount_paid:0,amount_due:100};orders.set(order.id,order);
      if(ambiguous){ambiguous=false;throw new Error('Lost connection after order created');}
      return Response.json(order);
    }
    if(endpoint.startsWith('orders?'))return Response.json({items:[...orders.values()].filter(order=>order.receipt===new URL(url).searchParams.get('receipt'))});
    if(/^orders\/order_\w+\/payments$/.test(endpoint))return Response.json({items:[...payments.values()].filter(payment=>payment.order_id===endpoint.split('/')[1])});
    if(endpoint.startsWith('orders/')){const order=orders.get(endpoint.slice(7));return Response.json(corruption?{...order,...corruption}:order);}
    if(endpoint.startsWith('payments/'))return Response.json(payments.get(endpoint.slice(9)));
    throw new Error('Unexpected provider request '+url);
  };
  try{
    for(const file of ['neon-schema.sql','neon-tool-trial.sql','neon-day-pass.sql','neon-day-pass.sql'])await pg.exec(await fs.readFile(new URL(file,import.meta.url),'utf8'));
    await pg.exec('create role day_pass_browser;set role spanvision_commerce_server;');
    const store=createNeonStore(async(sql,params)=>(await pg.query(sql,params)).rows,env);
    server=http.createServer(createHandler({env,fetcher:provider,store}));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));env.SITE_URL='http://127.0.0.1:'+server.address().port;
    const user=async(id,trial='expired')=>{
      const record={id,email:id==='admin'?'spanvisioninfra.admin@gmail.com':id+'@example.test',name:'Engineer',emailVerified:true,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};users.set(id,record);
      await store.syncAccount({id,email:record.email,email_confirmed_at:record.updatedAt,user_metadata:{full_name:record.name}});
      if(trial!=='not_started')await pg.query("insert into spanvision_commerce.tool_trials(user_id,started_at) values($1,clock_timestamp()-$2::interval)",[id,trial==='expired'?'49 hours':'1 hour']);
      return id;
    };
    const cookie=(id,recovery=false)=>'sv_account='+sealSession({access:JSON.stringify({cookie:'__Secure-neon-auth.session_token='+id}),refresh:'fixture',provider:'neon',recovery,validUntil:Date.now()+3600000},env.SESSION_SECRET);
    const req=(id,path='billing/day-pass/status',body,headers={})=>fetch(env.SITE_URL+'/api/'+path,{method:body===undefined?'GET':'POST',headers:{...(id?{Cookie:cookie(id)}:{}),...(body===undefined?{}:{Origin:env.SITE_URL,'Content-Type':'application/json'}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
    const json=async response=>{assert.equal(response.status,200,await response.clone().text());return response.json();};
    const order=async id=>json(await req(id,'billing/day-pass/order',{}));
    const confirm=(value,payment='pay_'+value.orderId.slice(6))=>({razorpay_order_id:value.orderId,razorpay_payment_id:payment,razorpay_signature:createHmac('sha256',env.RAZORPAY_KEY_SECRET).update(value.orderId+'|'+payment).digest('hex')});
    const pay=(value,status='captured',extra={})=>{
      const proof=confirm(value);payments.set(proof.razorpay_payment_id,{id:proof.razorpay_payment_id,order_id:value.orderId,amount:100,currency:'INR',status,captured:status==='captured',amount_refunded:0,refund_status:null,...extra});
      if(status==='captured')Object.assign(orders.get(value.orderId),{status:'paid',amount_paid:100,amount_due:0});return proof;
    };
    let purchased,ticket;
    await t.test('only verified, signed-in, expired trial accounts are eligible',async()=>{
      assert.equal((await req(null)).status,401);
      for(const state of ['not_started','available']){const id=await user(state,state);assert.equal((await json(await req(id))).status,'not_eligible');assert.equal((await req(id,'billing/day-pass/order',{})).status,409);}
      const id=await user('eligible');assert.equal((await json(await req(id))).canPurchase,true);
      assert.equal((await req(id,'billing/day-pass/order',{}, {Cookie:cookie(id,true)})).status,403);
      users.set(id,{...users.get(id),emailVerified:false});assert.equal((await req(id,'billing/day-pass/order',{})).status,403);users.set(id,{...users.get(id),emailVerified:true});
      const before=attempts;
      assert.equal((await req(id,'billing/day-pass/order',{amount:1,hours:999,role:'super_admin'})).status,400);
      assert.equal((await req(id,'billing/day-pass/order',{}, {Origin:'https://evil.example'})).status,403);assert.equal(attempts,before);
      for(const paidId of ['subscribed','admin']){
        await user(paidId);if(paidId==='subscribed')await store.request('rpc/apply_billing_subscription',{method:'POST',body:JSON.stringify({record:{provider:'stripe',provider_subscription_id:'sub_paid',user_id:paidId,plan_key:'STUDIO_MONTHLY_USD',status:'active',current_period_end:new Date(Date.now()+86400000).toISOString(),observed_at:new Date().toISOString()}})});
        assert.equal((await req(paidId,'billing/day-pass/order',{})).status,409);
      }
    });
    await t.test('concurrent tabs and restarts reuse one account-bound ₹1 order',async()=>{
      const before=attempts,responses=await Promise.all(Array.from({length:5},()=>req('eligible','billing/day-pass/order',{})));
      const successes=[];for(const response of responses){assert([200,409].includes(response.status),await response.clone().text());if(response.ok)successes.push(await response.json());}
      assert.equal(attempts,before+1);assert(successes.length);purchased=successes[0];assert.equal(purchased.amount,100);
      assert.equal((await order('eligible')).orderId,purchased.orderId);assert.equal(attempts,before+1);
      const status=await json(await req('eligible'));assert.equal(status.status,'pending');assert(!JSON.stringify(status).includes('receipt'));assert(!JSON.stringify(status).includes(env.RAZORPAY_KEY_SECRET));
    });
    await t.test('wrong signatures, another account, amounts and authorization do not unlock tools',async()=>{
      const other=await user('another'),otherOrder=await order(other);pay(purchased);
      assert.equal((await req(other,'billing/day-pass/verify',confirm(purchased))).status,400);
      assert.equal((await req('eligible','billing/day-pass/verify',{...confirm(purchased),razorpay_signature:'0'.repeat(64)})).status,400);
      const pending=pay(otherOrder,'authorized');const data=await json(await req(other,'billing/day-pass/verify',pending));assert.equal(data.paymentStatus,'authorized');assert.equal(data.status,'pending');
      assert.equal((await json(await req(other,'account/tool-launch',{tool:'cad',requestId:randomUUID()}))).allowed,false);
      corruption={amount:200};assert.equal((await req('eligible','billing/day-pass/status',{})).status,502);corruption=null;
      for(const bad of [{currency:'USD'},{notes:{purpose:'website_one_rupee_test',user_id:'eligible'}},{notes:{purpose:'tool_day_pass',user_id:other}}]){
        corruption=bad;assert.equal((await req('eligible','billing/day-pass/status',{})).status,502);corruption=null;
      }
    });
    await t.test('captured payment starts exactly 24h once; repeated verification does not renew',async()=>{
      const first=await json(await req('eligible','billing/day-pass/verify',confirm(purchased)));assert.equal(first.status,'active');assert.equal(Date.parse(first.expiresAt)-Date.parse(first.activatedAt),86400000);
      const again=await json(await req('eligible','billing/day-pass/verify',confirm(purchased)));assert.equal(again.expiresAt,first.expiresAt);
      assert.equal((await order('eligible')).status,'active');
    });
    await t.test('all 13 regular tools have unlimited launches, capped at pass expiry; backend and AI stay restricted',async()=>{
      const status=await json(await req('eligible','account/tool-status'));assert.equal(status.access.source,'day_pass');
      for(let index=0;index<26;index++){
        const tool=trialToolIds[index%13],requestId=randomUUID(),grant=await json(await req('eligible','account/tool-launch',{tool,requestId}));assert.equal(grant.allowed,true);assert.equal(grant.source,'day_pass');assert.equal(grant.expiresAt,status.access.expiresAt);
        assert.equal((await json(await req('eligible','account/tool-launch',{tool,requestId}))).grantId,grant.grantId);
        const verified=await json(await req(null,'account/tool-verify',{tool,ticket:grant.ticket}));if(verified.features.ai)assert.equal(verified.features.ai.available,false);ticket=grant.ticket;
      }
      for(const tool of trialComingSoonTools)assert.equal((await req('eligible','account/tool-launch',{tool,requestId:randomUUID(),plan:'team',access_source:'subscription'})).status,403);
      assert.equal((await pg.query("select count(*)::int as total from spanvision_commerce.tool_launch_grants where user_id='eligible' and access_source='trial'")).rows[0].total,0);
    });
    await t.test('expiry invalidates existing sessions and blocks another purchase',async()=>{
      await pg.query("update spanvision_commerce.tool_day_passes set activated_at=now()-interval '24 hours',expires_at=now() where user_id='eligible'");
      assert.equal((await req(null,'account/tool-verify',{tool:trialToolIds[25%13],ticket})).status,402);
      assert.equal((await json(await req('eligible','account/tool-launch',{tool:'cad',requestId:randomUUID()}))).allowed,false);
      assert.equal((await req('eligible','billing/day-pass/order',{})).status,409);
      assert.equal((await json(await req('eligible','billing/day-pass/status',{}))).status,'used');
    });
    await t.test('ambiguous order creation recovers the exact receipt without a second charge/order',async()=>{
      const id=await user('uncertain'),before=attempts;ambiguous=true;assert.equal((await req(id,'billing/day-pass/order',{})).status,502);
      const recovered=await order(id);assert(recovered.orderId);assert.equal(attempts,before+1);
    });
    await t.test('valid webhooks recover abandoned checkout, verify provider state, revoke refunds and cannot reset expiry',async()=>{
      const id=await user('webhook'),value=await order(id),proof=pay(value);
      const send=async(event,signature=true,eventId=randomUUID())=>{
        const raw=JSON.stringify(event),response=await fetch(env.SITE_URL+'/api/billing/webhook/razorpay',{method:'POST',headers:{'x-razorpay-event-id':eventId,'x-razorpay-signature':signature?createHmac('sha256',env.RAZORPAY_WEBHOOK_SECRET).update(raw).digest('hex'):'0'.repeat(64)},body:raw});return response;
      };
      const event={event:'payment.captured',payload:{payment:{entity:{order_id:value.orderId,id:proof.razorpay_payment_id}}}};
      assert.equal((await send(event,false)).status,400);assert.equal((await json(await req(id))).status,'pending');
      await json(await send(event));const first=await json(await req(id));assert.equal(first.status,'active');
      const grant=await json(await req(id,'account/tool-launch',{tool:'cad',requestId:randomUUID()}));assert.equal(grant.allowed,true);
      await json(await send(event));assert.equal((await json(await req(id))).expiresAt,first.expiresAt);
      payments.get(proof.razorpay_payment_id).amount_refunded=100;
      await json(await send({event:'refund.processed',payload:{refund:{entity:{payment_id:proof.razorpay_payment_id}}}}));assert.equal((await json(await req(id))).status,'refunded');
      assert.equal((await req(null,'account/tool-verify',{tool:'cad',ticket:grant.ticket})).status,402);
      payments.get(proof.razorpay_payment_id).amount_refunded=0;await json(await send(event));assert.equal((await json(await req(id))).status,'refunded');
      assert.equal((await req(id,'billing/day-pass/order',{})).status,409);
    });
    await t.test('browser roles cannot read or grant a day pass; default switch hides feature',async()=>{
      const config=await json(await req(null,'account/config'));assert.equal(config.dayPassAvailable,true);assert(!JSON.stringify(config).includes(env.RAZORPAY_KEY_SECRET));
      env.DAY_PASS_ENABLED='false';assert.equal((await json(await req(null,'account/config'))).dayPassAvailable,false);assert.equal((await req('eligible','billing/day-pass/order',{})).status,404);env.DAY_PASS_ENABLED='true';
      await pg.exec('reset role;set role day_pass_browser;');await assert.rejects(pg.query('select * from spanvision_commerce.tool_day_passes'),/permission denied/);await assert.rejects(pg.query("select spanvision_commerce.claim_day_pass_order('eligible')"),/permission denied/);
    });
    assert.equal(providerCalls.filter(call=>call.url.endsWith('/orders')&&call.options.method==='POST').length,attempts);
  }finally{if(server)await new Promise(resolve=>server.close(resolve));await pg.close();}
});

test('legacy day-pass migration is repeatable and keeps authenticated browser roles out',async()=>{
  const {PGlite}=await import(pathToFileURL(process.env.PGLITE_MODULE)),pg=new PGlite();
  const id='12345678-1234-4234-8234-123456789abc';
  try{
    await pg.exec(`create role anon;create role authenticated;create role service_role bypassrls;
      create schema auth;create table auth.users(id uuid primary key,email_confirmed_at timestamptz);insert into auth.users values('${id}',now());
      create table public.billing_subscriptions(user_id uuid,status text,current_period_end timestamptz);
      create table public.account_plan_overrides(user_id uuid,plan_id text,expires_at timestamptz);`);
    for(const file of ['tool-trial.sql','day-pass.sql','day-pass.sql'])await pg.exec(await fs.readFile(new URL(file,import.meta.url),'utf8'));
    await pg.query("insert into public.tool_trials(user_id,started_at) values($1,now()-interval '49 hours')",[id]);
    await pg.exec('set role service_role;');
    const call=async(name,args,params)=>(await pg.query('select public.'+name+'('+args+') as result',params)).rows[0].result;
    assert.equal((await call('claim_day_pass_order','$1',[id])).state,'create');
    await call('save_day_pass_order','$1,$2,$3,$4',[id,'order_legacy','pay_legacy',false]);
    const grant=await call('claim_day_pass_launch','$1,$2,$3',[id,'pdf',randomUUID()]);assert.equal(grant.allowed,true);assert.equal(grant.source,'day_pass');
    assert.equal((await call('claim_day_pass_launch','$1,$2,$3',[id,'bim',randomUUID()])).allowed,false);
    await pg.exec('reset role;set role authenticated;');await assert.rejects(call('day_pass_status','$1',[id]),/permission denied/);
  }finally{await pg.close();}
});
