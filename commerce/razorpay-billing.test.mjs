import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createHmac} from 'node:crypto';
import {createHandler} from './server.mjs';
import {selection} from './catalog.mjs';

const user={id:'12345678-1234-4234-8234-123456789abc',email:'billing@example.test',email_confirmed_at:'2026-01-01T00:00:00Z',user_metadata:{full_name:'Billing Check'}};
async function fixture(t,{env:extra={},alterPlan,alterSubscription,beforeCreate,cancelFailure=false}={}){
  const providerPlans=new Map(),subscriptions=new Map(),records=new Map(),events=new Set(),calls=[];
  let lock=null,leaseSequence=0;
  const env={SUPABASE_URL:'https://billing.supabase.co',SUPABASE_PUBLISHABLE_KEY:'public',SUPABASE_SERVICE_ROLE_KEY:'private-fixture',SESSION_SECRET:'private-fixture-session-at-least-32-characters',PRICING_APPROVED:'true',BILLING_PROVIDER_IN:'razorpay',BILLING_PROVIDER_GLOBAL:'razorpay',RAZORPAY_KEY_ID:'rzp_test_fixture',RAZORPAY_KEY_SECRET:'private-fixture-key',RAZORPAY_WEBHOOK_SECRET:'private-fixture-webhook'};
  for(const region of ['IN','US','GB'])for(const plan of ['studio','team'])for(const interval of ['monthly','annual']){
    const choice=selection(plan,region,interval),id='plan_'+choice.key.replaceAll('_','');
    env['RAZORPAY_PLAN_'+choice.key]=id;providerPlans.set(id,{id,item:{amount:choice.amount,currency:choice.region.currency},period:interval==='annual'?'yearly':'monthly',interval:1});
  }
  Object.assign(env,extra);
  const fetcher=async(url,options={})=>{
    calls.push({url,method:options.method||'GET'});const parsed=new URL(url),body=options.body?JSON.parse(options.body):null;
    if(parsed.hostname==='api.razorpay.com'){
      if(parsed.pathname.startsWith('/v1/plans/')){const value=structuredClone(providerPlans.get(parsed.pathname.split('/').at(-1)));alterPlan?.(value);return Response.json(value);}
      if(parsed.pathname==='/v1/subscriptions'&&options.method==='POST'){
        await beforeCreate?.();
        const value={...body,id:'sub_'+(subscriptions.size+1),status:'created',short_url:'https://rzp.io/rzp/billingfixture'+(subscriptions.size+1),paid_count:0,auth_attempts:0,current_end:null};
        alterSubscription?.(value);subscriptions.set(value.id,value);return Response.json(value);
      }
      if(parsed.pathname.endsWith('/cancel')){
        if(cancelFailure)return Response.json({error:{description:'Simulated provider failure'}},{status:500});
        const value=subscriptions.get(parsed.pathname.split('/').at(-2));value.status='cancelled';return Response.json(value);
      }
      if(parsed.pathname.startsWith('/v1/subscriptions/'))return Response.json(subscriptions.get(parsed.pathname.split('/').at(-1)));
      throw Error('Unexpected provider request');
    }
    if(url.endsWith('/user'))return Response.json(user);
    if(url.includes('grant_type=password'))return Response.json({access_token:'private-access',refresh_token:'private-refresh'});
    const table=parsed.pathname.split('/rest/v1/')[1];
    if(table==='rpc/claim_billing_checkout'){
      if(lock)return Response.json({claimed:false,...lock});
      lock={user_id:body.account_id,plan_key:body.selected_plan,expires_at:new Date(Date.now()+3900000+(leaseSequence++)).toISOString(),checkout_url:null};
      return Response.json({claimed:true});
    }
    if(table==='rpc/apply_billing_subscription'){records.set(body.record.provider_subscription_id,body.record);return Response.json({saved:true});}
    if(table==='billing_subscriptions'){
      if(options.method==='POST'){records.set(body.provider_subscription_id,body);return Response.json([body]);}
      const selected=parsed.searchParams.get('provider_subscription_id')?.slice(3);
      const owner=parsed.searchParams.get('user_id')?.slice(3);
      return Response.json([...records.values()].filter(record=>(!owner||record.user_id===owner)&&(!selected||record.provider_subscription_id===selected)&&(!parsed.searchParams.has('status')||['active','trialing','authenticated','pending','created','past_due','halted'].includes(record.status))));
    }
    if(table==='billing_events'){
      if(options.method==='POST'){events.add(body.event_id);return Response.json([body]);}
      return Response.json(events.has(parsed.searchParams.get('event_id')?.slice(3))?[{event_id:'known'}]:[]);
    }
    if(table==='billing_checkout_locks'){
      if(options.method==='PATCH'){Object.assign(lock,body);return Response.json([lock]);}
      if(options.method==='DELETE'){
        const matches=lock&&['user_id','plan_key','expires_at'].every(key=>parsed.searchParams.get(key)==='eq.'+lock[key]);
        if(matches)lock=null;return Response.json([]);
      }
      return Response.json(lock?[{...lock}]:[]);
    }
    if(table==='account_plan_overrides')return Response.json([]);
    throw Error('Unexpected account request: '+parsed.pathname);
  };
  const server=http.createServer(createHandler({env,fetcher}));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;env.SITE_URL=origin;
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  let cookie;
  async function post(route,body,headers={}){return fetch(origin+route,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{}),...headers},body:JSON.stringify(body)});}
  const login=await post('/api/account/sign-in',{email:user.email,password:'fixture-password'});assert.equal(login.status,200);cookie=login.headers.get('set-cookie').split(';')[0];
  const get=route=>fetch(origin+route,{headers:{Cookie:cookie}});
  const checkout=(plan='studio',region='IN',interval='monthly')=>post('/api/billing/checkout',{plan,region,interval,amount:1,user_id:'forged-user'});
  async function hook(name,id,subscriptionId,headers={}){
    const body={event:name,payload:{subscription:{entity:{id:subscriptionId,status:'forged-browser-status'}}}},raw=JSON.stringify(body);
    return post('/api/billing/webhook/razorpay',body,{'x-razorpay-event-id':id,'x-razorpay-signature':createHmac('sha256',env.RAZORPAY_WEBHOOK_SECRET).update(raw).digest('hex'),...headers});
  }
  return {env,calls,records,subscriptions,providerPlans,events,get,post,checkout,hook,lock:()=>lock};
}

test('every supported plan and currency uses the exact server price and records account ownership',async t=>{
  for(const region of ['IN','US','GB'])for(const plan of ['studio','team'])for(const interval of ['monthly','annual']){
    const f=await fixture(t),choice=selection(plan,region,interval),response=await f.checkout(plan,region,interval);
    assert.equal(response.status,200,choice.key);assert.equal((await response.json()).provider,'razorpay');
    const subscription=[...f.subscriptions.values()][0],record=[...f.records.values()][0];
    assert.equal(subscription.plan_id,f.env['RAZORPAY_PLAN_'+choice.key]);assert.equal(subscription.quantity,1);assert.equal(subscription.total_count,interval==='annual'?10:120);
    assert.equal(subscription.notes.user_id,user.id);assert.equal(record.user_id,user.id);assert.equal(record.plan_key,choice.key);assert.equal(record.status,'created');
    const status=await (await f.get('/api/billing/status')).json();assert.equal(status.access.plan,'explorer');
  }
});
test('availability is exact for the selected plan, region and billing cycle',async t=>{
  const f=await fixture(t,{env:{RAZORPAY_PLAN_TEAM_ANNUAL_INR:'',RAZORPAY_PLAN_STUDIO_MONTHLY_USD:''}});
  const config=await (await f.get('/api/account/config')).json();
  assert.equal(config.checkoutAvailability.STUDIO_MONTHLY_INR,true);assert.equal(config.checkoutAvailability.TEAM_ANNUAL_INR,false);assert.equal(config.checkoutAvailability.STUDIO_MONTHLY_USD,false);assert.equal(config.checkoutAvailability.TEAM_MONTHLY_USD,true);
  assert.equal((await f.checkout('team','IN','annual')).status,503);assert.equal(f.subscriptions.size,0);
  const disabled=await fixture(t,{env:{RAZORPAY_WEBHOOK_SECRET:''}});assert.equal((await disabled.checkout()).status,503);assert.equal(disabled.subscriptions.size,0);
});
test('wrong provider prices or subscription responses cannot open or record a checkout',async t=>{
  for(const mutate of [plan=>plan.item.amount=100,plan=>plan.item.currency='USD',plan=>plan.period='yearly',plan=>plan.interval=2,plan=>plan.id='plan_other']){
    const f=await fixture(t,{alterPlan:mutate});assert.equal((await f.checkout()).status,503);assert.equal(f.subscriptions.size,0);
  }
  for(const mutate of [sub=>sub.plan_id='plan_other',sub=>sub.quantity=2,sub=>sub.status='active']){
    const f=await fixture(t,{alterSubscription:mutate});assert.equal((await f.checkout()).status,502);assert.equal(f.records.size,0);
  }
});
test('signed provider events grant access after a paid first cycle, then revoke it on cancellation',async t=>{
  const f=await fixture(t);assert.equal((await f.checkout('team')).status,200);const subscription=[...f.subscriptions.values()][0];
  subscription.status='authenticated';assert.equal((await f.hook('subscription.authenticated','event_auth',subscription.id)).status,200);
  assert.equal((await (await f.get('/api/billing/status')).json()).access.plan,'explorer');
  subscription.status='active';subscription.current_end=Math.floor(Date.now()/1000)+86400;subscription.paid_count=0;
  assert.equal((await f.hook('subscription.activated','event_unpaid',subscription.id)).status,200);assert.equal(f.records.get(subscription.id).status,'pending');
  assert.equal((await (await f.get('/api/billing/status')).json()).access.plan,'explorer');
  subscription.paid_count=1;assert.equal((await f.hook('subscription.charged','event_paid',subscription.id)).status,200);
  const paid=await (await f.get('/api/billing/status')).json();assert.equal(paid.access.plan,'team');assert.equal(paid.access.source,'subscription');assert(paid.access.expiresAt);
  const count=f.calls.length;assert.equal((await f.hook('subscription.charged','event_paid',subscription.id)).status,200);assert.equal(f.calls.length,count+1,'duplicate event only checks its saved receipt');
  subscription.status='cancelled';assert.equal((await f.hook('subscription.cancelled','event_cancelled',subscription.id)).status,200);
  assert.equal((await (await f.get('/api/billing/status')).json()).access.plan,'explorer');
  assert.equal((await f.hook('subscription.charged','event_old_payload',subscription.id)).status,200);assert.equal(f.records.get(subscription.id).status,'cancelled','stale event fetches the current provider state');
});
test('invalid signatures, mismatched plans and missing paid periods cannot grant access',async t=>{
  const f=await fixture(t);await f.checkout();const subscription=[...f.subscriptions.values()][0];subscription.status='active';subscription.paid_count=1;subscription.current_end=Math.floor(Date.now()/1000)+86400;
  const before=f.calls.length;assert.equal((await f.hook('subscription.charged','event_bad',subscription.id,{'x-razorpay-signature':'wrong'})).status,400);assert.equal(f.calls.length,before);
  const plan=subscription.plan_id;subscription.plan_id='plan_foreign';assert.equal((await f.hook('subscription.charged','event_wrong_plan',subscription.id)).status,409);assert(!f.events.has('event_wrong_plan'));
  subscription.plan_id=plan;subscription.current_end=null;assert.equal((await f.hook('subscription.charged','event_missing_period',subscription.id)).status,200);assert.equal(f.records.get(subscription.id).status,'pending');
  assert.equal((await (await f.get('/api/billing/status')).json()).access.plan,'explorer');
});
test('an expired unpaid hosted checkout can be replaced without cancelling or charging a subscription',async t=>{
  const f=await fixture(t);await f.checkout();const previous=[...f.subscriptions.values()][0];
  const retry=await f.checkout();assert.equal(retry.status,200);assert.equal((await retry.json()).reused,true);assert.equal(f.subscriptions.size,1);
  previous.status='expired';assert.equal((await f.checkout()).status,200);assert.equal(f.subscriptions.size,2);assert.equal(f.records.get(previous.id).status,'expired');
  assert.equal((await (await f.get('/api/billing/status')).json()).access.plan,'explorer');
  assert(!f.calls.some(call=>call.url.includes('/cancel')||call.url.includes('/capture')));
});

test('changing currency offers a resumable checkout and replaces it only after explicit cancellation',async t=>{
  const f=await fixture(t);assert.equal((await f.checkout()).status,200);
  const previous=[...f.subscriptions.values()][0];
  const conflict=await f.checkout('studio','US');assert.equal(conflict.status,409);
  const body=await conflict.json();assert.equal(body.pendingCheckout.subscriptionId,previous.id);assert.equal(body.pendingCheckout.canReplace,true);assert.equal(body.pendingCheckout.price,'₹999 / month');
  assert.equal(body.pendingCheckout.url,previous.short_url);assert.equal(previous.status,'created');
  assert(!f.calls.some(call=>call.url.endsWith('/cancel')));
  assert.equal((await f.post('/api/billing/checkout/cancel',{subscriptionId:previous.id})).status,200);
  assert.equal(previous.status,'cancelled');assert.equal(f.lock(),null);
  assert.equal((await f.checkout('studio','US')).status,200);assert.equal(f.subscriptions.size,2);
  assert.equal([...f.subscriptions.values()][1].plan_id,f.env.RAZORPAY_PLAN_STUDIO_MONTHLY_USD);
  assert(!f.calls.some(call=>call.url.includes('/capture')));
});

test('checkout cancellation is account-bound, same-origin and rejects every payment or mandate state',async t=>{
  const f=await fixture(t);await f.checkout();const previous=[...f.subscriptions.values()][0];
  assert.equal((await f.post('/api/billing/checkout/cancel',{subscriptionId:'sub_foreign'})).status,404);
  f.records.get(previous.id).user_id='foreign-user';assert.equal((await f.post('/api/billing/checkout/cancel',{subscriptionId:previous.id})).status,404);f.records.get(previous.id).user_id=user.id;
  assert.equal((await f.post('/api/billing/checkout/cancel',{subscriptionId:previous.id},{Origin:'https://evil.test'})).status,403);
  for(const state of [{status:'authenticated',paid_count:0,auth_attempts:1},{status:'active',paid_count:1,auth_attempts:1},{status:'created',paid_count:0,auth_attempts:1},{status:'created',paid_count:1,auth_attempts:0}]){
    Object.assign(previous,state);assert.equal((await f.post('/api/billing/checkout/cancel',{subscriptionId:previous.id})).status,409);
  }
  assert(!f.calls.some(call=>call.url.endsWith('/cancel')));assert(f.lock());
  Object.assign(previous,{status:'created',paid_count:0,auth_attempts:1});
  const conflict=await (await f.checkout('studio','GB')).json();assert.equal(conflict.pendingCheckout.canReplace,false);
});

test('validation failures release only their lease and retries can proceed immediately',async t=>{
  let invalid=true;const f=await fixture(t,{alterPlan:plan=>{if(invalid)plan.item.amount=1;}});
  assert.equal((await f.checkout()).status,503);assert.equal(f.lock(),null);assert.equal(f.subscriptions.size,0);
  invalid=false;assert.equal((await f.checkout()).status,200);assert.equal(f.subscriptions.size,1);
});

test('ambiguous provider writes keep their lease and concurrent requests create at most one checkout',async t=>{
  let release,started;const waiting=new Promise(resolve=>{started=resolve;}),hold=new Promise(resolve=>{release=resolve;});
  const f=await fixture(t,{beforeCreate:async()=>{started();await hold;}});
  const first=f.checkout();await waiting;
  assert.equal((await f.checkout()).status,409);assert(f.lock());release();assert.equal((await first).status,200);assert.equal(f.subscriptions.size,1);
  const broken=await fixture(t,{beforeCreate:()=>{throw Error('Unknown provider outcome');}});
  assert.equal((await broken.checkout()).status,502);assert(broken.lock());assert.equal((await broken.checkout()).status,409);
  assert.equal(broken.calls.filter(call=>call.url.endsWith('/v1/subscriptions')&&call.method==='POST').length,1);
});

test('unconfirmed cancellation keeps the old checkout and an expired link can be renewed explicitly',async t=>{
  const failed=await fixture(t,{cancelFailure:true});await failed.checkout();const previous=[...failed.subscriptions.values()][0];
  assert.equal((await failed.post('/api/billing/checkout/cancel',{subscriptionId:previous.id})).status,502);assert(failed.lock());assert.equal(previous.status,'created');
  const f=await fixture(t);await f.checkout();const expired=[...f.subscriptions.values()][0];expired.expire_by=Math.floor(Date.now()/1000)-1;
  const response=await f.checkout();assert.equal(response.status,409);assert.equal((await response.json()).pendingCheckout.expired,true);
  assert.equal((await f.post('/api/billing/checkout/cancel',{subscriptionId:expired.id})).status,200);
  assert.equal((await f.checkout()).status,200);assert.equal(f.subscriptions.size,2);
});
