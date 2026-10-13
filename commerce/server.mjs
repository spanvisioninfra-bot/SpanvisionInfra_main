import {createCipheriv,createDecipheriv,createHash,createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {plans,regions,selection} from './catalog.mjs';
import {publicUser,planAccess,SUPER_ADMIN_EMAIL} from './access.mjs';

const cookieName='sv_account';
class RequestError extends Error {constructor(status,message){super(message);this.status=status;}}
const fail=(status,message)=>{throw new RequestError(status,message);};
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const providerId=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,180}$/.test(value);
const scalar=value=>typeof value==='string'?value:'';
function configured(env){return !!(env.SUPABASE_URL&&env.SUPABASE_PUBLISHABLE_KEY&&env.SESSION_SECRET?.length>=32&&env.SITE_URL);}
function site(env){
  let url;try{url=new URL(env.SITE_URL);}catch{fail(503,'Account setup is in progress. Please try again later.');}
  if(url.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(url.hostname))fail(503,'Account setup is in progress. Please try again later.');
  return url.origin;
}
function authBase(env){
  if(!configured(env))fail(503,'Account setup is in progress. You can still open the tools without signing in.');
  const url=new URL(env.SUPABASE_URL);
  if(url.protocol!=='https:'||url.username||url.password)fail(503,'Account setup is in progress.');
  return url.origin;
}
export function sealSession(value,secret){
  if(!secret||secret.length<32)fail(503,'Account setup is in progress.');
  const iv=randomBytes(12),key=createHash('sha256').update(secret).digest();
  const cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from(cookieName));
  const encrypted=Buffer.concat([cipher.update(JSON.stringify(value)),cipher.final()]);
  return Buffer.concat([iv,cipher.getAuthTag(),encrypted]).toString('base64url');
}
export function openSession(value,secret){
  try{
    if(!secret||secret.length<32||!value||value.length>3800)return null;
    const bytes=Buffer.from(value,'base64url');
    const decipher=createDecipheriv('aes-256-gcm',createHash('sha256').update(secret).digest(),bytes.subarray(0,12));
    decipher.setAAD(Buffer.from(cookieName));decipher.setAuthTag(bytes.subarray(12,28));
    const parsed=JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()]).toString());
    return parsed.validUntil>Date.now()&&typeof parsed.access==='string'&&typeof parsed.refresh==='string'?parsed:null;
  }catch{return null;}
}
function setCookie(res,value,env,clear=false){
  const secure=new URL(site(env)).protocol==='https:';
  res.setHeader('Set-Cookie',`${cookieName}=${clear?'':sealSession(value,env.SESSION_SECRET)}; Path=/api; HttpOnly; SameSite=Lax; Max-Age=${clear?0:604800}${secure?'; Secure':''}`);
}
function saveSession(res,data,env,recovery=false){
  if(!data.access_token||!data.refresh_token)fail(502,'Sign-in could not be completed. Please try again.');
  const session={access:data.access_token,refresh:data.refresh_token,recovery,validUntil:Date.now()+604800000};
  setCookie(res,session,env);return session;
}
async function upstream(url,options,fetcher){
  let response;try{response=await fetcher(url,{...options,signal:AbortSignal.timeout(12000)});}catch{fail(502,'The account or payment service is temporarily unavailable. Please try again.');}
  if(response.status===204)return {response,data:null};
  let data;try{data=await response.json();}catch{fail(502,'The account or payment service returned an unexpected response.');}
  return {response,data};
}
async function auth(env,endpoint,body,fetcher,token){
  const headers={apikey:env.SUPABASE_PUBLISHABLE_KEY,'Content-Type':'application/json'};
  if(token)headers.Authorization=`Bearer ${token}`;
  return upstream(`${authBase(env)}/auth/v1/${endpoint}`,{method:body===undefined?'GET':'POST',headers,...(body===undefined?{}:{body:JSON.stringify(body)})},fetcher);
}
async function identity(req,res,env,fetcher,optional=false){
  const value=scalar(req.headers.cookie).split(';').map(item=>item.trim()).find(item=>item.startsWith(`${cookieName}=`))?.slice(cookieName.length+1);
  let session=openSession(value,env.SESSION_SECRET);
  if(!session){if(optional)return null;fail(401,'Please sign in to continue.');}
  let result=await auth(env,'user',undefined,fetcher,session.access);
  if(result.response.status===401||result.response.status===403){
    const renewed=await auth(env,'token?grant_type=refresh_token',{refresh_token:session.refresh},fetcher);
    if(!renewed.response.ok){setCookie(res,null,env,true);if(optional)return null;fail(401,'Your session has expired. Please sign in again.');}
    session=saveSession(res,renewed.data,env,session.recovery);
    result=await auth(env,'user',undefined,fetcher,session.access);
  }
  if(!result.response.ok||!uuid(result.data.id)){if(result.response.status>=500)fail(502,'Sign-in is temporarily unavailable.');fail(401,'Please sign in again.');}
  return {session,user:publicUser(result.data,env)};
}
function email(value){const address=scalar(value).trim().toLowerCase();if(address.length>254||!/^\S+@\S+\.\S+$/.test(address))fail(400,'Enter a valid email address.');return address;}
function password(value){if(typeof value!=='string'||value.length<12||value.length>128)fail(400,'Use a password between 12 and 128 characters.');return value;}
async function rawBody(req,limit){
  let size=0;const chunks=[];
  for await(const chunk of req){const bytes=Buffer.from(chunk);size+=bytes.length;if(size>limit)fail(413,'Request is too large.');chunks.push(bytes);}
  return Buffer.concat(chunks);
}
function jsonBody(raw){try{const data=JSON.parse(raw.toString());if(!data||typeof data!=='object'||Array.isArray(data))throw new Error();return data;}catch{fail(400,'Send a valid request.');}}
async function db(env,resource,fetcher,options={}){
  if(!env.SUPABASE_SERVICE_ROLE_KEY)fail(503,'Billing setup is in progress.');
  const {response,data}=await upstream(`${authBase(env)}/rest/v1/${resource}`,{...options,headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:`Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,'Content-Type':'application/json',...options.headers}},fetcher);
  if(!response.ok)fail(502,'Billing could not be saved. Please try again later.');return data;
}
async function adminAuth(env,resource,fetcher){
  if(!env.SUPABASE_SERVICE_ROLE_KEY)fail(503,'Admin setup is in progress.');
  const result=await upstream(`${authBase(env)}/auth/v1/admin/${resource}`,{headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:`Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`}},fetcher);
  if(result.response.status===404)fail(404,'User not found.');
  if(!result.response.ok)fail(502,'User information is temporarily unavailable.');
  return result;
}
function adminUser(record,env){
  return {...publicUser(record,env),createdAt:record.created_at||null,lastSignInAt:record.last_sign_in_at||null};
}
async function planRecords(userIds,env,fetcher){
  const filter=userIds.length===1?`eq.${userIds[0]}`:`in.(${userIds.join(',')})`;
  const [subscriptions,overrides]=await Promise.all([
    db(env,`billing_subscriptions?user_id=${filter}&select=user_id,provider,plan_key,status,current_period_end&order=observed_at.desc`,fetcher),
    db(env,`account_plan_overrides?user_id=${filter}&select=user_id,plan_id,expires_at,reason,updated_at`,fetcher)
  ]);
  if(!Array.isArray(subscriptions)||!Array.isArray(overrides))fail(502,'Plan information is temporarily unavailable.');
  return {subscriptions,overrides};
}
async function adminRoute(route,method,url,body,current,env,fetcher){
  if(current.session.recovery)fail(403,'Set your new password before opening admin controls.');
  if(current.user.role!=='super_admin')fail(403,'Super-admin access is required.');
  if(route==='/api/admin/users'&&method==='GET'){
    const page=Number(url.searchParams.get('page')||1),perPage=50;
    if(!Number.isInteger(page)||page<1||page>100000)fail(400,'Choose a valid user page.');
    const response=await adminAuth(env,`users?page=${page}&per_page=${perPage}`,fetcher);
    const records=response.data.users;
    if(!Array.isArray(records)||records.length>perPage||records.some(record=>!uuid(record.id)))fail(502,'User information is temporarily unavailable.');
    const data=records.length?await planRecords(records.map(record=>record.id),env,fetcher):{subscriptions:[],overrides:[]};
    const rawTotal=response.response.headers.get('x-total-count');
    const total=rawTotal!==null&&/^\d+$/.test(rawTotal)?Number(rawTotal):null;
    const users=records.map(record=>{
      const user=adminUser(record,env),subscriptions=data.subscriptions.filter(row=>row.user_id===user.id),override=data.overrides.find(row=>row.user_id===user.id)||null;
      return {...user,subscriptions,override,access:planAccess(user,subscriptions,override)};
    });
    return {users,page,perPage,total,hasNext:total!==null?page*perPage<total:records.length===perPage};
  }
  if(route==='/api/admin/user'&&method==='GET'){
    const id=url.searchParams.get('user');if(!uuid(id))fail(400,'Choose a valid user.');
    const response=await adminAuth(env,`users/${id}`,fetcher),record=response.data;
    if(record.id!==id)fail(502,'User information could not be verified.');
    const data=await planRecords([id],env,fetcher),user=adminUser(record,env),override=data.overrides[0]||null;
    const audit=await db(env,`account_plan_audit?user_id=eq.${id}&select=id,actor_id,action,before_state,after_state,reason,created_at&order=created_at.desc&limit=20`,fetcher);
    return {user,subscriptions:data.subscriptions,override,access:planAccess(user,data.subscriptions,override),audit};
  }
  if(route==='/api/admin/plan'&&method==='POST'){
    if(!uuid(body.userId))fail(400,'Choose a valid user.');
    if(body.plan!==null&&!plans.some(plan=>plan.id===body.plan))fail(400,'Choose a valid plan.');
    const reason=scalar(body.reason).trim();if(reason.length<3||reason.length>500)fail(400,'Add a reason between 3 and 500 characters.');
    let expires=null;
    if(body.expiresAt!==null&&body.expiresAt!==undefined&&body.expiresAt!==''){
      const epoch=typeof body.expiresAt==='string'?Date.parse(body.expiresAt):NaN;
      if(!Number.isFinite(epoch)||epoch<=Date.now())fail(400,'Choose a future expiry date.');expires=new Date(epoch).toISOString();
    }
    if(body.plan===null&&expires)fail(400,'Clearing a plan does not need an expiry date.');
    const response=await adminAuth(env,`users/${body.userId}`,fetcher),record=response.data;
    if(record.id!==body.userId)fail(502,'User information could not be verified.');
    if(scalar(record.email).trim().toLowerCase()===SUPER_ADMIN_EMAIL)fail(409,'The super admin already has access to every plan.');
    await db(env,'rpc/admin_set_plan_access',fetcher,{method:'POST',body:JSON.stringify({actor:current.user.id,target:body.userId,requested_plan:body.plan,expires,note:reason})});
    return {saved:true};
  }
  fail(404,'Endpoint not found.');
}
async function stripe(env,endpoint,body,fetcher,idempotencyKey){
  const headers={Authorization:`Bearer ${env.STRIPE_SECRET_KEY}`};
  if(body)headers['Content-Type']='application/x-www-form-urlencoded';
  if(idempotencyKey)headers['Idempotency-Key']=idempotencyKey;
  const {response,data}=await upstream(`https://api.stripe.com/v1/${endpoint}`,{method:body?'POST':'GET',headers,...(body?{body:new URLSearchParams(body).toString()}:{})},fetcher);
  if(!response.ok)fail(502,'Checkout is temporarily unavailable. Please try again.');return data;
}
async function razorpay(env,endpoint,body,fetcher){
  const {response,data}=await upstream(`https://api.razorpay.com/v1/${endpoint}`,{method:body?'POST':'GET',headers:{Authorization:`Basic ${Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString('base64')}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})},fetcher);
  if(!response.ok)fail(502,'Checkout is temporarily unavailable. Please try again.');return data;
}
function providerFor(env,region){return region==='IN'?(env.BILLING_PROVIDER_IN||'razorpay'):(env.BILLING_PROVIDER_GLOBAL||'stripe');}
function billingReady(env,choice){
  const provider=providerFor(env,choice.region.id);
  if(!configured(env)||!env.SUPABASE_SERVICE_ROLE_KEY)return false;
  return provider==='stripe'?!!(env.STRIPE_SECRET_KEY&&env.STRIPE_WEBHOOK_SECRET&&env[`STRIPE_PRICE_${choice.key}`]):provider==='razorpay'?!!(env.RAZORPAY_KEY_ID&&env.RAZORPAY_KEY_SECRET&&env.RAZORPAY_WEBHOOK_SECRET&&env[`RAZORPAY_PLAN_${choice.key}`]):false;
}
export function sameSignature(expected,received){
  return typeof received==='string'&&/^[a-f0-9]{64}$/i.test(received)&&timingSafeEqual(Buffer.from(expected,'hex'),Buffer.from(received,'hex'));
}
export function verifyWebhook(provider,raw,headers,secret,now=Date.now()){
  if(!secret)return false;
  if(provider==='razorpay')return sameSignature(createHmac('sha256',secret).update(raw).digest('hex'),headers['x-razorpay-signature']);
  const fields=scalar(headers['stripe-signature']).split(',').map(field=>field.split('='));
  const timestamp=fields.find(([key])=>key==='t')?.[1];
  if(!/^\d+$/.test(timestamp||'')||Math.abs(now/1000-Number(timestamp))>300)return false;
  const expected=createHmac('sha256',secret).update(`${timestamp}.`).update(raw).digest('hex');
  return fields.some(([key,value])=>key==='v1'&&sameSignature(expected,value));
}
async function applyWebhook(provider,raw,req,env,fetcher){
  const secret=provider==='stripe'?env.STRIPE_WEBHOOK_SECRET:env.RAZORPAY_WEBHOOK_SECRET;
  if(!verifyWebhook(provider,raw,req.headers,secret))fail(400,'Webhook signature is invalid.');
  const event=jsonBody(raw);
  const id=provider==='stripe'?event.id:req.headers['x-razorpay-event-id'];
  if(!providerId(id))fail(400,'Webhook event ID is missing.');
  const receipts=await db(env,`billing_events?provider=eq.${provider}&event_id=eq.${id}&select=event_id`,fetcher);
  if(receipts.length)return {received:true};
  let subscriptionId;
  if(provider==='stripe'){
    if(event.type==='checkout.session.completed')subscriptionId=event.data?.object?.subscription;
    else if(scalar(event.type).startsWith('customer.subscription.'))subscriptionId=event.data?.object?.id;
  }else if(scalar(event.event).startsWith('subscription.'))subscriptionId=event.payload?.subscription?.entity?.id;
  if(subscriptionId&&providerId(subscriptionId)){
    // Fetch current provider state: do not grant access from browser redirects or stale webhook payloads.
    const observedAt=new Date().toISOString();
    const subscription=provider==='stripe'?await stripe(env,`subscriptions/${subscriptionId}`,undefined,fetcher):await razorpay(env,`subscriptions/${subscriptionId}`,undefined,fetcher);
    const existing=await db(env,`billing_subscriptions?provider=eq.${provider}&provider_subscription_id=eq.${subscriptionId}&select=user_id,plan_key`,fetcher);
    let owner=existing[0];
    if(!owner&&provider==='stripe'&&providerId(subscription.customer)){
      const customers=await db(env,`billing_customers?provider=eq.stripe&provider_customer_id=eq.${subscription.customer}&select=user_id`,fetcher);
      const key=scalar(subscription.metadata?.plan_key);
      const match=/^(STUDIO|TEAM)_(MONTHLY|ANNUAL)_(INR|USD|GBP)$/.test(key);
      if(customers[0]&&match)owner={user_id:customers[0].user_id,plan_key:key};
    }
    if(!owner||!uuid(owner.user_id))fail(409,'Subscription ownership has not been recorded yet.');
    const epoch=provider==='stripe'?(subscription.items?.data?.[0]?.current_period_end||subscription.current_period_end):subscription.current_end;
    const record={provider,provider_subscription_id:subscriptionId,user_id:owner.user_id,plan_key:owner.plan_key,status:subscription.status,current_period_end:epoch?new Date(epoch*1000).toISOString():null,observed_at:observedAt};
    await db(env,'rpc/apply_billing_subscription',fetcher,{method:'POST',body:JSON.stringify({record})});
  }
  await db(env,'billing_events?on_conflict=provider,event_id',fetcher,{method:'POST',headers:{Prefer:'resolution=ignore-duplicates,return=representation'},body:JSON.stringify({provider,event_id:id})});
  return {received:true};
}
async function createCheckout(user,choice,env,fetcher){
  if(env.PRICING_APPROVED!=='true')fail(409,'These are draft prices. Payments are not open yet.');
  if(choice.plan.id==='explorer')fail(400,'The Explorer workspace is free.');
  if(!billingReady(env,choice))fail(503,'Payments for this region are not available yet.');
  const active=await db(env,`billing_subscriptions?user_id=eq.${user.id}&status=in.(active,trialing,authenticated,pending,created,past_due,halted)&select=provider_subscription_id&limit=1`,fetcher);
  if(active.length)fail(409,'You already have a subscription or checkout in progress. Open billing before starting another.');
  const provider=providerFor(env,choice.region.id),origin=site(env);
  if(provider==='stripe'){
    const priceId=env[`STRIPE_PRICE_${choice.key}`];
    if(!providerId(priceId))fail(503,'This plan is not ready for checkout.');
    const price=await stripe(env,`prices/${priceId}`,undefined,fetcher);
    if(!price.active||price.unit_amount!==choice.amount||price.currency!==choice.region.currency.toLowerCase()||price.recurring?.interval!==(choice.interval==='annual'?'year':'month')||(price.recurring?.interval_count||1)!==1)fail(503,'The checkout price needs review.');
    const existing=await db(env,`billing_customers?user_id=eq.${user.id}&provider=eq.stripe&select=provider_customer_id`,fetcher);
    let customer=existing[0]?.provider_customer_id;
    if(!customer){
      const created=await stripe(env,'customers',{email:user.email,'metadata[user_id]':user.id},fetcher,`spanvision-customer-${user.id}`);
      customer=created.id;
      await db(env,'billing_customers?on_conflict=user_id,provider',fetcher,{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify({user_id:user.id,provider:'stripe',provider_customer_id:customer})});
    }
    const session=await stripe(env,'checkout/sessions',{mode:'subscription',customer,expires_at:String(Math.floor(Date.now()/1000)+3600),'line_items[0][price]':priceId,'line_items[0][quantity]':'1','subscription_data[metadata][plan_key]':choice.key,success_url:`${origin}/?checkout=returned#account`,cancel_url:`${origin}/?checkout=cancelled#pricing`},fetcher);
    const url=new URL(session.url);if(url.protocol!=='https:'||url.hostname!=='checkout.stripe.com')fail(502,'Checkout link could not be verified.');
    return {url:url.href,provider};
  }
  const planId=env[`RAZORPAY_PLAN_${choice.key}`];if(!providerId(planId))fail(503,'This plan is not ready for checkout.');
  const plan=await razorpay(env,`plans/${planId}`,undefined,fetcher);
  if(plan.item?.amount!==choice.amount||plan.item?.currency!==choice.region.currency||plan.period!==(choice.interval==='annual'?'yearly':'monthly')||plan.interval!==1)fail(503,'The checkout price needs review.');
  const subscription=await razorpay(env,'subscriptions',{plan_id:planId,total_count:choice.interval==='annual'?10:120,quantity:1,customer_notify:1,expire_by:Math.floor(Date.now()/1000)+3600,notes:{user_id:user.id,plan_key:choice.key}},fetcher);
  await db(env,'billing_subscriptions?on_conflict=provider,provider_subscription_id',fetcher,{method:'POST',headers:{Prefer:'resolution=ignore-duplicates,return=representation'},body:JSON.stringify({provider,provider_subscription_id:subscription.id,user_id:user.id,plan_key:choice.key,status:subscription.status,observed_at:new Date().toISOString()})});
  const url=new URL(subscription.short_url);if(url.protocol!=='https:'||!['rzp.io','razorpay.com'].includes(url.hostname))fail(502,'Checkout link could not be verified.');
  return {url:url.href,provider};
}
async function checkout(user,choice,env,fetcher){
  if(env.PRICING_APPROVED!=='true')fail(409,'These are draft prices. Payments are not open yet.');
  if(choice.plan.id==='explorer')fail(400,'The Explorer workspace is free.');
  if(!billingReady(env,choice))fail(503,'Payments for this region are not available yet.');
  const lock=await db(env,'rpc/claim_billing_checkout',fetcher,{method:'POST',body:JSON.stringify({account_id:user.id,selected_plan:choice.key})});
  if(!lock.claimed){
    if(lock.checkout_url&&lock.plan_key===choice.key){
      const url=new URL(lock.checkout_url);if(url.protocol!=='https:'||!['checkout.stripe.com','rzp.io','razorpay.com'].includes(url.hostname))fail(502,'Checkout link could not be verified.');
      return {url:url.href,provider:providerFor(env,choice.region.id)};
    }
    fail(409,'A checkout is already in progress. Please wait before opening another plan.');
  }
  try{
    const result=await createCheckout(user,choice,env,fetcher);
    await db(env,'billing_checkout_locks?user_id=eq.'+user.id,fetcher,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({checkout_url:result.url})});
    return result;
  }catch(error){
    // Retain the short lease after an ambiguous provider failure to avoid a duplicate subscription.
    throw error;
  }
}

export function createHandler({env=process.env,fetcher=fetch}={}){
  return async function handler(req,res){
    res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
    try{
      const url=new URL(req.url,'http://localhost'),method=req.method;
      const route=url.pathname==='/api/commerce'&&/^(account|billing|admin)(\/|$)/.test(url.searchParams.get('__route')||'')?`/api/${url.searchParams.get('__route')}`:url.pathname;
      let result;
      if(route==='/api/account/config'&&method==='GET'){
        const ready=configured(env);
        result={authAvailable:ready,pricingApproved:env.PRICING_APPROVED==='true',plans,regions,checkoutAvailable:Object.fromEntries(regions.map(region=>[region.id,env.PRICING_APPROVED==='true'&&billingReady(env,selection('studio',region.id,'monthly'))]))};
      }else if(route.startsWith('/api/billing/webhook/')&&method==='POST'){
        const provider=route.split('/').at(-1);if(!['stripe','razorpay'].includes(provider))fail(404,'Endpoint not found.');
        result=await applyWebhook(provider,await rawBody(req,524288),req,env,fetcher);
      }else{
        if(!['GET','POST'].includes(method))fail(405,'Method not allowed.');
        if(method==='POST'&&req.headers.origin!==site(env))fail(403,'Open this page on the Spanvision Infra website and try again.');
        if(method==='POST'&&!scalar(req.headers['content-type']).startsWith('application/json'))fail(415,'Send a JSON request.');
        const body=method==='POST'?jsonBody(await rawBody(req,16384)):{};
        if(route==='/api/account/session'&&method==='GET'){
          result={user:configured(env)?(await identity(req,res,env,fetcher,true))?.user||null:null};
        }else if(route.startsWith('/api/admin/')){
          result=await adminRoute(route,method,url,body,await identity(req,res,env,fetcher),env,fetcher);
        }else if(route==='/api/account/sign-in'&&method==='POST'){
          const response=await auth(env,'token?grant_type=password',{email:email(body.email),password:scalar(body.password)},fetcher);
          if(!response.response.ok)fail(response.response.status===429?429:400,'Sign-in failed. Check your email, password and email verification.');
          saveSession(res,response.data,env);result={signedIn:true};
        }else if(route==='/api/account/sign-up'&&method==='POST'){
          const name=scalar(body.name).trim();if(!name||name.length>80)fail(400,'Enter your name (up to 80 characters).');
          const response=await auth(env,'signup',{email:email(body.email),password:password(body.password),data:{full_name:name}},fetcher);
          if(!response.response.ok)fail(response.response.status===429?429:400,'Account creation could not be completed. Please try again or sign in.');
          if(response.data.access_token)saveSession(res,response.data,env);
          result={signedIn:!!response.data.access_token,verifyEmail:!response.data.access_token};
        }else if(route==='/api/account/recovery'&&method==='POST'){
          const response=await auth(env,'recover',{email:email(body.email)},fetcher);
          if(!response.response.ok)fail(response.response.status===429?429:502,'A reset email could not be sent. Please try again later.');
          result={sent:true};
        }else if(route==='/api/account/verify'&&method==='POST'){
          if(!['signup','recovery'].includes(body.type)||!/^\d{6,8}$/.test(scalar(body.code)))fail(400,'Enter the verification code from your email.');
          const response=await auth(env,'verify',{email:email(body.email),token:body.code,type:body.type},fetcher);
          if(!response.response.ok)fail(400,'That code is invalid or has expired. Request a new email and try again.');
          saveSession(res,response.data,env,body.type==='recovery');result={signedIn:true,recovery:body.type==='recovery'};
        }else if(route==='/api/account/password'&&method==='POST'){
          const current=await identity(req,res,env,fetcher);
          const {response}=await upstream(`${authBase(env)}/auth/v1/user`,{method:'PUT',headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY,Authorization:`Bearer ${current.session.access}`,'Content-Type':'application/json'},body:JSON.stringify({password:password(body.password)})},fetcher);
          if(!response.ok)fail(400,'Password could not be updated. Try a stronger password.');
          setCookie(res,{...current.session,recovery:false},env);result={updated:true};
        }else if(route==='/api/account/sign-out'&&method==='POST'){
          const current=await identity(req,res,env,fetcher,true);
          try{if(current)await auth(env,'logout?scope=local',{},fetcher,current.session.access);}finally{setCookie(res,null,env,true);}
          result={signedOut:true};
        }else if(route==='/api/billing/status'&&method==='GET'){
          const current=await identity(req,res,env,fetcher);
          const data=env.SUPABASE_SERVICE_ROLE_KEY?await planRecords([current.user.id],env,fetcher):{subscriptions:[],overrides:[]};
          result={subscriptions:data.subscriptions,access:planAccess(current.user,data.subscriptions,data.overrides[0])};
        }else if(route==='/api/billing/checkout'&&method==='POST'){
          const current=await identity(req,res,env,fetcher);if(current.session.recovery)fail(403,'Set your new password before opening checkout.');
          if(current.user.role==='super_admin')fail(409,'Your super-admin account already has access to every plan.');
          const choice=selection(body.plan,body.region,body.interval);if(!choice)fail(400,'Choose a valid plan, region and billing cycle.');
          result=await checkout(current.user,choice,env,fetcher);
        }else if(route==='/api/billing/portal'&&method==='POST'){
          const current=await identity(req,res,env,fetcher);if(current.session.recovery)fail(403,'Set your new password before opening billing.');
          const customers=await db(env,`billing_customers?user_id=eq.${current.user.id}&provider=eq.stripe&select=provider_customer_id`,fetcher);
          if(!customers[0])fail(409,'There is no Stripe billing account to manage yet.');
          const portal=await stripe(env,'billing_portal/sessions',{customer:customers[0].provider_customer_id,return_url:`${site(env)}/#account`},fetcher);
          const url=new URL(portal.url);if(url.protocol!=='https:'||url.hostname!=='billing.stripe.com')fail(502,'Billing link could not be verified.');
          result={url:url.href};
        }else fail(404,'Endpoint not found.');
      }
      res.statusCode=200;res.end(JSON.stringify(result));
    }catch(error){res.statusCode=error instanceof RequestError?error.status:500;res.end(JSON.stringify({error:error instanceof RequestError?error.message:'The request could not be completed. Please try again.'}));}
  };
}
export default createHandler();
