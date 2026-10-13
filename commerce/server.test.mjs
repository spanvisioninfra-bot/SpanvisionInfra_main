import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createHmac} from 'node:crypto';
import {createHandler,sealSession,openSession,verifyWebhook} from './server.mjs';
import {selection} from './catalog.mjs';
import {publicUser,planAccess,SUPER_ADMIN_EMAIL} from './access.mjs';

const user={id:'12345678-1234-4234-8234-123456789abc',email:'sample@example.test',user_metadata:{full_name:'Sample Engineer'}};
const secrets={SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'public-key',SUPABASE_SERVICE_ROLE_KEY:'private-key',SESSION_SECRET:'test-session-secret-32-characters-minimum',PRICING_APPROVED:'false',SUPER_ADMIN_USER_ID:'22345678-1234-4234-8234-123456789abc'};
async function fixture(t,{env=secrets,fetcher=async url=>{if(url.endsWith('/user'))return Response.json(user);if(url.includes('grant_type=password'))return Response.json({access_token:'private-access-token',refresh_token:'private-refresh-token'});return Response.json({});}}={}){
  const configured={...env};
  const handler=createHandler({env:configured,fetcher});const server=http.createServer(handler);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`;configured.SITE_URL=origin;
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const get=(route,headers={})=>fetch(origin+route,{headers});
  const post=(route,body,headers={})=>fetch(origin+route,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
  return {origin,get,post};
}
test('regional draft prices and annual totals are deterministic',()=>{
  assert.equal(selection('studio','IN','monthly').amount,99900);
  assert.equal(selection('studio','US','annual').amount,19000);
  assert.equal(selection('studio','GB','monthly').amount,1500);
  assert.equal(selection('studio','EU','monthly'),null);
});
test('session ciphertext cannot expose or accept modified credentials',()=>{
  const session={access:'private-access-token',refresh:'private-refresh-token',validUntil:Date.now()+60000};
  const encoded=sealSession(session,secrets.SESSION_SECRET);
  assert(!encoded.includes(session.access));assert.deepEqual(openSession(encoded,secrets.SESSION_SECRET),session);
  const bytes=Buffer.from(encoded,'base64url');bytes[40]^=1;
  assert.equal(openSession(bytes.toString('base64url'),secrets.SESSION_SECRET),null);
  assert.equal(openSession(encoded,'another-secret-with-32-characters'),null);
  assert.equal(openSession(sealSession({...session,validUntil:1},secrets.SESSION_SECRET),secrets.SESSION_SECRET),null);
});
test('public configuration omits secrets and checkout stays disabled',async t=>{
  const {get}=await fixture(t);const response=await get('/api/account/config');const data=await response.json();
  assert.equal(data.authAvailable,true);assert.equal(data.pricingApproved,false);assert.equal(data.checkoutAvailable.IN,false);
  assert(!JSON.stringify(data).includes('private'));assert.equal(response.headers.get('cache-control'),'no-store');
});
test('accounts fail clearly when provider configuration is absent',async t=>{
  const {get,post}=await fixture(t,{env:{}});
  assert.equal((await (await get('/api/account/config')).json()).authAvailable,false);
  const response=await post('/api/account/sign-in',{email:user.email,password:'anything'});
  assert.equal(response.status,503);assert.match((await response.json()).error,/setup is in progress/);
});
test('cross-site sign-in is rejected before any provider call',async t=>{
  let called=false;const {post}=await fixture(t,{fetcher:async()=>{called=true;return Response.json({});}});
  assert.equal((await post('/api/account/sign-in',{},{Origin:'https://untrusted.example'})).status,403);assert.equal(called,false);
});
test('sign-in stores encrypted HttpOnly cookie and only returns a public user',async t=>{
  const {post,get}=await fixture(t);const response=await post('/api/account/sign-in',{email:user.email,password:'a-long-password'});
  assert.equal(response.status,200);const cookie=response.headers.get('set-cookie');assert.match(cookie,/HttpOnly/);assert.match(cookie,/SameSite=Lax/);
  const body=await response.text();assert(!body.includes('token'));
  const result=await get('/api/account/session',{Cookie:cookie.split(';')[0]});const account=await result.json();
  assert.equal(account.user.name,'Sample Engineer');assert.equal(account.user.id,user.id);assert(!JSON.stringify(account).includes('token'));
});
test('invalid login and malformed requests are not reported as success',async t=>{
  const {post}=await fixture(t,{fetcher:async()=>Response.json({error:'invalid_grant'},{status:400})});
  assert.equal((await post('/api/account/sign-in',{email:user.email,password:'wrong'})).status,400);
  assert.equal((await post('/api/account/sign-up',{email:user.email,name:'Engineer',password:'short'})).status,400);
});
test('anonymous checkout and draft pricing cannot call a payment provider',async t=>{
  const {post}=await fixture(t);
  assert.equal((await post('/api/billing/checkout',{plan:'studio',region:'IN',interval:'monthly'})).status,401);
  const login=await post('/api/account/sign-in',{email:user.email,password:'a-long-password'});
  const response=await post('/api/billing/checkout',{plan:'studio',region:'IN',interval:'monthly',amount:1},{Cookie:login.headers.get('set-cookie').split(';')[0]});
  assert.equal(response.status,409);assert.match((await response.json()).error,/draft prices/);
});
test('Vercel rewrite reaches the account configuration handler',async t=>{
  const {get}=await fixture(t);assert.equal((await get('/api/commerce?__route=account/config')).status,200);
  assert.equal((await get('/api/commerce?__route=other/config')).status,404);
});
test('webhook validation uses raw bytes, timing-safe signatures and Stripe freshness',()=>{
  const raw=Buffer.from('{"id":"evt_1", "value":1}'),secret='webhook-secret',now=Date.now(),timestamp=Math.floor(now/1000);
  const stripe=createHmac('sha256',secret).update(`${timestamp}.`).update(raw).digest('hex');
  assert(verifyWebhook('stripe',raw,{'stripe-signature':`t=${timestamp},v1=${stripe}`},secret,now));
  assert(!verifyWebhook('stripe',raw,{'stripe-signature':`t=${timestamp},v1=${stripe}`},secret,now+301000));
  const razorpay=createHmac('sha256',secret).update(raw).digest('hex');
  assert(verifyWebhook('razorpay',raw,{'x-razorpay-signature':razorpay},secret));
  assert(!verifyWebhook('razorpay',Buffer.from('{"id":"evt_1","value":1}'),{'x-razorpay-signature':razorpay},secret));
  assert(!verifyWebhook('razorpay',raw,{'x-razorpay-signature':'wrong'},secret));
});
test('approved Stripe checkout validates server price and ignores a forged browser amount',async t=>{
  const calls=[];
  const env={...secrets,PRICING_APPROVED:'true',STRIPE_SECRET_KEY:'stripe-private',STRIPE_WEBHOOK_SECRET:'stripe-hook',STRIPE_PRICE_STUDIO_MONTHLY_USD:'price_test'};
  const fetcher=async(url,options)=>{
    calls.push({url,body:options.body});
    if(url.endsWith('/user'))return Response.json(user);
    if(url.includes('grant_type=password'))return Response.json({access_token:'access',refresh_token:'refresh'});
    if(url.includes('claim_billing_checkout'))return Response.json({claimed:true});
    if(url.includes('/prices/'))return Response.json({active:true,unit_amount:1900,currency:'usd',recurring:{interval:'month',interval_count:1}});
    if(url.endsWith('/customers'))return Response.json({id:'cus_test'});
    if(url.endsWith('/checkout/sessions'))return Response.json({url:'https://checkout.stripe.com/c/pay/test'});
    return Response.json([]);
  };
  const {post}=await fixture(t,{env,fetcher});
  const login=await post('/api/account/sign-in',{email:user.email,password:'test-password'});
  const response=await post('/api/billing/checkout',{plan:'studio',region:'US',interval:'monthly',amount:1},{Cookie:login.headers.get('set-cookie').split(';')[0]});
  assert.equal(response.status,200);assert.equal((await response.json()).provider,'stripe');
  const checkout=calls.find(call=>call.url.endsWith('/checkout/sessions'));
  const payload=new URLSearchParams(checkout.body);assert.equal(payload.get('line_items[0][price]'),'price_test');assert.equal(payload.get('amount'),null);
});
test('approved Razorpay checkout validates plan and records ownership before returning a link',async t=>{
  const calls=[];const env={...secrets,PRICING_APPROVED:'true',RAZORPAY_KEY_ID:'rzp_test',RAZORPAY_KEY_SECRET:'private',RAZORPAY_WEBHOOK_SECRET:'hook',RAZORPAY_PLAN_STUDIO_MONTHLY_INR:'plan_test'};
  const fetcher=async(url,options)=>{
    calls.push({url,body:options.body});
    if(url.endsWith('/user'))return Response.json(user);
    if(url.includes('grant_type=password'))return Response.json({access_token:'access',refresh_token:'refresh'});
    if(url.includes('claim_billing_checkout'))return Response.json({claimed:true});
    if(url.includes('/plans/'))return Response.json({item:{amount:99900,currency:'INR'},period:'monthly',interval:1});
    if(url.endsWith('/subscriptions'))return Response.json({id:'sub_test',status:'created',short_url:'https://rzp.io/rzp/test'});
    return Response.json([]);
  };
  const {post}=await fixture(t,{env,fetcher});const login=await post('/api/account/sign-in',{email:user.email,password:'test-password'});
  const response=await post('/api/billing/checkout',{plan:'studio',region:'IN',interval:'monthly'},{Cookie:login.headers.get('set-cookie').split(';')[0]});
  assert.equal(response.status,200);assert.equal((await response.json()).provider,'razorpay');
  const saved=calls.find(call=>call.url.includes('billing_subscriptions')&&call.body);
  assert.equal(JSON.parse(saved.body).user_id,user.id);assert.equal(JSON.parse(saved.body).status,'created');
});
test('wrong provider amount is rejected without creating a paid checkout',async t=>{
  let paymentCreated=false;
  const env={...secrets,PRICING_APPROVED:'true',STRIPE_SECRET_KEY:'stripe-private',STRIPE_WEBHOOK_SECRET:'stripe-hook',STRIPE_PRICE_STUDIO_MONTHLY_USD:'price_test'};
  const fetcher=async url=>{
    if(url.endsWith('/user'))return Response.json(user);
    if(url.includes('grant_type=password'))return Response.json({access_token:'access',refresh_token:'refresh'});
    if(url.includes('claim_billing_checkout'))return Response.json({claimed:true});
    if(url.includes('/prices/'))return Response.json({active:true,unit_amount:1,currency:'usd',recurring:{interval:'month'}});
    if(url.endsWith('/checkout/sessions'))paymentCreated=true;
    return Response.json([]);
  };
  const {post}=await fixture(t,{env,fetcher});const login=await post('/api/account/sign-in',{email:user.email,password:'test-password'});
  const response=await post('/api/billing/checkout',{plan:'studio',region:'US',interval:'monthly'},{Cookie:login.headers.get('set-cookie').split(';')[0]});
  assert.equal(response.status,503);assert.equal(paymentCreated,false);
});
test('webhook with invalid signature does not query the database',async t=>{
  let called=false;const {post}=await fixture(t,{env:{...secrets,STRIPE_WEBHOOK_SECRET:'hook'},fetcher:async()=>{called=true;return Response.json([]);}});
  const response=await post('/api/billing/webhook/stripe',{id:'evt_test'},{'stripe-signature':'invalid'});
  assert.equal(response.status,400);assert.equal(called,false);
});
test('sign-out handles provider HTTP 204 and clears the cookie',async t=>{
  const fetcher=async url=>url.includes('logout')?new Response(null,{status:204}):url.endsWith('/user')?Response.json(user):Response.json({access_token:'access',refresh_token:'refresh'});
  const {post}=await fixture(t,{fetcher});const login=await post('/api/account/sign-in',{email:user.email,password:'test-password'});
  const result=await post('/api/account/sign-out',{},{Cookie:login.headers.get('set-cookie').split(';')[0]});
  assert.equal(result.status,200);assert.match(result.headers.get('set-cookie'),/Max-Age=0/);
});

const administrator={...user,id:'22345678-1234-4234-8234-123456789abc',email:SUPER_ADMIN_EMAIL,email_confirmed_at:'2026-10-01T00:00:00Z',user_metadata:{full_name:'Spanvision Admin'}};
const sessionCookie=(extra={})=>'sv_account='+sealSession({access:'test-access',refresh:'test-refresh',validUntil:Date.now()+60000,...extra},secrets.SESSION_SECRET);

test('super admin requires the exact verified provider identity; metadata cannot grant a role',()=>{
  assert.equal(publicUser(administrator).role,'member','Admin access stays disabled until the account UUID is pinned');
  assert.equal(publicUser(administrator,secrets).role,'super_admin');
  assert.equal(publicUser({...administrator,email:SUPER_ADMIN_EMAIL.toUpperCase()},secrets).role,'super_admin');
  assert.equal(publicUser({...administrator,email_confirmed_at:null},secrets).role,'member');
  assert.equal(publicUser({...administrator,email_confirmed_at:'invalid'},secrets).role,'member');
  assert.equal(publicUser({...administrator,is_anonymous:true},secrets).role,'member');
  assert.equal(publicUser({...administrator,email:'spanvisioninfra.admin+fake@gmail.com'},secrets).role,'member');
  assert.equal(publicUser({...administrator,email:'someone@example.test',user_metadata:{role:'super_admin',email:SUPER_ADMIN_EMAIL}},secrets).role,'member');
  assert.equal(publicUser(administrator,{SUPER_ADMIN_USER_ID:user.id}).role,'member');
  assert.equal(publicUser(administrator,{SUPER_ADMIN_USER_ID:administrator.id}).role,'super_admin');
});

test('plan access includes every level for super admin and respects grant/subscription expiry',()=>{
  const now=Date.parse('2026-10-10T00:00:00Z'),member=publicUser(user);
  assert.deepEqual(planAccess(publicUser(administrator,secrets)).plans,['explorer','studio','team']);
  assert.equal(planAccess(member,[{plan_key:'TEAM_MONTHLY_USD',status:'pending'}],null,now).plan,'explorer');
  assert.equal(planAccess(member,[{plan_key:'TEAM_MONTHLY_USD',status:'active',current_period_end:'2026-10-01'}],null,now).plan,'explorer');
  const subscription={plan_key:'STUDIO_MONTHLY_USD',status:'active',current_period_end:'2026-11-01'};
  assert.equal(planAccess(member,[subscription],{plan_id:'team',expires_at:'2026-10-01'},now).plan,'studio');
  assert.equal(planAccess(member,[subscription],{plan_id:'team',expires_at:'invalid'},now).plan,'studio');
  assert.equal(planAccess(member,[subscription],{plan_id:'team',expires_at:'2026-12-01'},now).source,'admin');
  assert.equal(planAccess(member,[subscription],{plan_id:'explorer',expires_at:null},now).plan,'explorer');
});

test('anonymous admin requests cannot read users or update plans',async t=>{
  let calls=0;const {get,post}=await fixture(t,{fetcher:async()=>{calls++;return Response.json({});}});
  assert.equal((await get('/api/admin/users')).status,401);
  assert.equal((await post('/api/admin/plan',{userId:user.id,plan:'team',reason:'Attempt'})).status,401);
  assert.equal(calls,0);
});

test('ordinary users and forged metadata cannot use admin endpoints',async t=>{
  let privateCalls=0;
  const fetcher=async url=>{
    if(url.endsWith('/auth/v1/user'))return Response.json({...user,email_confirmed_at:'2026-10-01',user_metadata:{role:'super_admin'}});
    privateCalls++;return Response.json([]);
  };
  const {get,post}=await fixture(t,{fetcher}),headers={Cookie:sessionCookie({role:'super_admin',email:SUPER_ADMIN_EMAIL})};
  assert.equal((await get('/api/admin/users?email='+SUPER_ADMIN_EMAIL,headers)).status,403);
  assert.equal((await get('/api/admin/user?user='+administrator.id,headers)).status,403);
  assert.equal((await post('/api/admin/plan',{userId:user.id,plan:'team',reason:'Attempt',role:'super_admin'},headers)).status,403);
  assert.equal(privateCalls,0);
});

test('unverified administrator and recovery sessions cannot reach private admin APIs',async t=>{
  for(const recovery of [false,true]){
    let privateCalls=0;
    const {get}=await fixture(t,{fetcher:async url=>{
      if(url.endsWith('/auth/v1/user'))return Response.json(recovery?administrator:{...administrator,email_confirmed_at:null});
      privateCalls++;return Response.json([]);
    }});
    assert.equal((await get('/api/admin/users',{Cookie:sessionCookie({recovery})})).status,403);assert.equal(privateCalls,0);
  }
});

test('verified admin session exposes role and permissions without provider secrets',async t=>{
  const {get}=await fixture(t,{fetcher:async()=>Response.json({...administrator,app_metadata:{private:'do-not-return'},identities:[{secret:'do-not-return'}]})});
  const response=await get('/api/account/session',{Cookie:sessionCookie()});const data=await response.json();
  assert.equal(data.user.role,'super_admin');assert(data.user.permissions.includes('plans:all'));assert(!JSON.stringify(data).includes('do-not-return'));
});

test('admin user listing is paginated, sanitized and includes plan access',async t=>{
  const fetcher=async url=>{
    if(url.endsWith('/auth/v1/user'))return Response.json(administrator);
    if(url.includes('/admin/users?')){
      assert.match(url,/page=2&per_page=50/);
      return Response.json({users:[{...user,email_confirmed_at:'2026-10-01',app_metadata:{secret:'hidden'}},administrator]},{headers:{'x-total-count':'101'}});
    }
    if(url.includes('/billing_subscriptions?'))return Response.json([{user_id:user.id,provider:'stripe',plan_key:'STUDIO_MONTHLY_USD',status:'active',current_period_end:'2030-01-01'}]);
    if(url.includes('/account_plan_overrides?'))return Response.json([{user_id:user.id,plan_id:'team',expires_at:null,reason:'Team evaluation'}]);
    throw new Error('Unexpected provider call');
  };
  const {get}=await fixture(t,{fetcher});const response=await get('/api/admin/users?page=2',{Cookie:sessionCookie()});const data=await response.json();
  assert.equal(response.status,200);assert.equal(data.page,2);assert.equal(data.total,101);assert.equal(data.hasNext,true);
  assert.equal(data.users[0].access.plan,'team');assert.equal(data.users[1].access.source,'super_admin');assert(!JSON.stringify(data).includes('hidden'));
});

test('admin plan grants and clearing call the atomic audit RPC without changing payment billing',async t=>{
  const mutations=[];
  const fetcher=async(url,options)=>{
    if(url.endsWith('/auth/v1/user'))return Response.json(administrator);
    if(url.endsWith('/admin/users/'+user.id))return Response.json(user);
    if(url.endsWith('/rpc/admin_set_plan_access')){mutations.push(JSON.parse(options.body));return Response.json({saved:true});}
    throw new Error('Unexpected provider call');
  };
  const {post}=await fixture(t,{fetcher}),headers={Cookie:sessionCookie()};
  assert.equal((await post('/api/admin/plan',{userId:user.id,plan:'team',reason:' Team access approved ',expiresAt:'2030-01-01T00:00:00Z'},headers)).status,200);
  assert.equal((await post('/api/admin/plan',{userId:user.id,plan:null,reason:'Restore subscription access'},headers)).status,200);
  assert.deepEqual(mutations[0],{actor:administrator.id,target:user.id,requested_plan:'team',expires:'2030-01-01T00:00:00.000Z',note:'Team access approved'});
  assert.equal(mutations[1].requested_plan,null);assert.equal(mutations[1].expires,null);
});

test('invalid plan updates and cross-origin admin requests cannot mutate data',async t=>{
  let privateCalls=0;
  const {post}=await fixture(t,{fetcher:async url=>{if(url.endsWith('/auth/v1/user'))return Response.json(administrator);privateCalls++;return Response.json({});}});
  const headers={Cookie:sessionCookie()},valid={userId:user.id,plan:'team',reason:'Approved access'};
  for(const changes of [{userId:'invalid'},{plan:'super_admin'},{reason:''},{expiresAt:'2020-01-01'},{expiresAt:'invalid'},{plan:null,expiresAt:'2030-01-01'}]){
    assert.equal((await post('/api/admin/plan',{...valid,...changes},headers)).status,400);
  }
  assert.equal((await post('/api/admin/plan',valid,{...headers,Origin:'https://untrusted.example'})).status,403);assert.equal(privateCalls,0);
});

test('the admin cannot override their own all-plan access or report a failed write as saved',async t=>{
  let writes=0;
  const fetcher=async url=>{
    if(url.endsWith('/auth/v1/user')||url.endsWith('/admin/users/'+administrator.id))return Response.json(administrator);
    if(url.endsWith('/admin/users/'+user.id))return Response.json(user);
    writes++;return Response.json({error:'Database unavailable'},{status:500});
  };
  const {post}=await fixture(t,{fetcher}),headers={Cookie:sessionCookie()};
  assert.equal((await post('/api/admin/plan',{userId:administrator.id,plan:'explorer',reason:'Attempt'},headers)).status,409);assert.equal(writes,0);
  const response=await post('/api/admin/plan',{userId:user.id,plan:'team',reason:'Approved access'},headers);
  assert.equal(response.status,502);assert.equal((await response.json()).saved,undefined);assert.equal(writes,1);
});

test('admin routes survive Vercel rewriting and super admin does not need paid checkout',async t=>{
  const {get,post}=await fixture(t,{fetcher:async url=>url.endsWith('/auth/v1/user')?Response.json(administrator):Response.json({users:[]})});
  assert.equal((await get('/api/commerce?__route=admin/users',{Cookie:sessionCookie()})).status,200);
  const checkout=await post('/api/billing/checkout',{plan:'team',region:'IN',interval:'monthly'},{Cookie:sessionCookie()});
  assert.equal(checkout.status,409);assert.match((await checkout.json()).error,/already has access/);
});
