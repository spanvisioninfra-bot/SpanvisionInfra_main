import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHandler,openSession,sealSession} from './server.mjs';
import {neonAuthUrl,neonUser} from './neon-auth.mjs';
import {createNeonStore} from './neon-store.mjs';
import {packageCommerce} from '../deployment/package-commerce.mjs';

const authUrl='https://ep-example.neonauth.c-3.ap-southeast-1.aws.neon.tech/neondb/auth';
const administrator={id:'admin_0123456789',email:'spanvisioninfra.admin@gmail.com',name:'Administrator',emailVerified:true,
  createdAt:'2026-10-14T00:00:00Z',updatedAt:'2026-10-14T00:00:00Z'};
const member={...administrator,id:'member_0123456789',email:'member@example.test',name:'Engineer'};
const sessionCredential='__Secure-neon-auth.session_token=signed-private-cookie';
const defaults={NEON_AUTH_BASE_URL:authUrl,SESSION_SECRET:'test-neon-secret-with-at-least-32-characters',SUPER_ADMIN_USER_ID:administrator.id};
const successfulLogin=record=>Response.json({token:'private-provider-token',user:record},{headers:{'Set-Cookie':`${sessionCredential}; HttpOnly; Secure; Path=/`}});

async function fixture(t,{env={},providerUser=administrator,fetcher,store}={}){
  const settings={...defaults,...env},calls=[];
  const provider=fetcher||(async(url,options)=>{
    calls.push({url,options});
    if(url.endsWith('/sign-in/email'))return successfulLogin(providerUser);
    if(url.includes('/get-session'))return Response.json({session:{id:'private-session',userId:providerUser.id},user:providerUser});
    if(url.endsWith('/sign-out'))return Response.json({success:true});
    throw new Error('Unexpected provider request: '+url);
  });
  const server=http.createServer(createHandler({env:settings,fetcher:provider,store}));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`;settings.SITE_URL=origin;
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const get=(route,headers={})=>fetch(origin+route,{headers});
  const post=(route,body,headers={})=>fetch(origin+route,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
  const login=async()=>{const response=await post('/api/account/sign-in',{email:providerUser.email,password:'test-private-password'});assert.equal(response.status,200);return response.headers.get('set-cookie').split(';')[0];};
  return {get,post,login,settings,calls,origin};
}

test('public Auth URL is accepted; malformed or credential-bearing URLs fail closed',async t=>{
  assert.equal(neonAuthUrl({VITE_NEON_AUTH_URL:authUrl+'/'}),authUrl);
  for(const url of ['http://ep-example.neonauth.neon.tech/neondb/auth','https://evil.example/neondb/auth',
    'https://ep-example.neonauth.neon.tech.evil.test/neondb/auth',authUrl+'?password=secret','https://user:secret@ep-example.neonauth.neon.tech/neondb/auth']){
    assert.equal(neonAuthUrl({NEON_AUTH_BASE_URL:url}),null);
  }
  const {get}=await fixture(t,{env:{VITE_NEON_AUTH_URL:authUrl,NEON_AUTH_BASE_URL:'',DATABASE_URL:'postgresql://app:private@ep-example.neon.tech/neondb?sslmode=require'}});
  const config=await (await get('/api/account/config')).json();
  assert.equal(config.authAvailable,true);assert.equal(config.authProvider,'neon');assert.equal(config.databaseAvailable,true);
  assert(!JSON.stringify(config).includes('private'));assert.equal(config.checkoutAvailable.IN,false);
});

test('invalid Neon selection cannot fall back to legacy credentials',async t=>{
  const {get,post}=await fixture(t,{env:{NEON_AUTH_BASE_URL:'https://wrong.example/auth',SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'key'}});
  assert.equal((await (await get('/api/account/config')).json()).authAvailable,false);
  assert.equal((await post('/api/account/sign-in',{email:member.email,password:'test-password'})).status,503);
});

test('backend chooses the admin destination only for the exact verified pinned identity',async t=>{
  for(const [providerUser,env,destination] of [
    [administrator,{},'/admin'],[member,{},'/account'],
    [{...member,role:'super_admin'}, {}, '/account'],
    [administrator,{SUPER_ADMIN_USER_ID:''},'/account'],
    [administrator,{SUPER_ADMIN_USER_ID:'different-user'},'/account'],
  ]){
    const f=await fixture(t,{providerUser,env});
    const response=await f.post('/api/account/sign-in',{email:providerUser.email,password:'test-private-password',redirectTo:'#admin',role:'super_admin'});
    assert.equal(response.status,200);const body=await response.json();assert.equal(body.redirectTo,destination);
    assert.equal(body.user.role,destination==='/admin'?'super_admin':'member');
    assert(!JSON.stringify(body).includes('private-provider-token'));
  }
});

test('signup requires verification and forwards only allowed provider fields',async t=>{
  let payload;
  const {post}=await fixture(t,{fetcher:async(url,options)=>{
    assert(url.endsWith('/sign-up/email'));payload=JSON.parse(options.body);
    return successfulLogin({...member,emailVerified:false});
  }});
  const response=await post('/api/account/sign-up',{email:member.email,name:'Engineer',password:'a-private-password',role:'super_admin'});
  assert.equal(response.status,200);assert.deepEqual(await response.json(),{signedIn:false,verifyEmail:true});
  assert.equal(response.headers.get('set-cookie'),null);
  assert.deepEqual(payload,{email:member.email,name:'Engineer',password:'a-private-password'});
});

test('registration enforces the shared 8–128 password limits before reaching Neon',async t=>{
  const sent=[];
  const f=await fixture(t,{fetcher:async(url,options)=>{
    assert(url.endsWith('/sign-up/email'));sent.push(JSON.parse(options.body));
    return successfulLogin({...member,emailVerified:false});
  }});
  assert.deepEqual((await (await f.get('/api/account/config')).json()).passwordPolicy,{minLength:8,maxLength:128});
  for(const value of ['abcdefg','a'.repeat(129),null]){
    const response=await f.post('/api/account/sign-up',{email:member.email,name:'Engineer',password:value});
    assert.equal(response.status,400);assert.match((await response.json()).error,/between 8 and 128/);
  }
  assert.equal(sent.length,0);
  for(const value of ['Ax7!pqR2','a'.repeat(128)]){
    const response=await f.post('/api/account/sign-up',{email:member.email,name:'Engineer',password:value});
    assert.equal(response.status,200);assert.equal((await response.json()).verifyEmail,true);
    assert.equal(sent.at(-1).password,value);
  }
});

test('password reset accepts eight characters only after code verification and preserves recovery on rejected lengths',async t=>{
  const sent=[];
  const f=await fixture(t,{fetcher:async(url,options)=>{
    sent.push({url,body:JSON.parse(options.body)});return Response.json({success:true});
  }});
  assert.equal((await f.post('/api/account/password',{password:'Ax7!pqR2'})).status,401);assert.equal(sent.length,0);
  const verified=await f.post('/api/account/verify',{email:member.email,code:'123456',type:'recovery'});
  assert.equal(verified.status,200);const cookie=verified.headers.get('set-cookie').split(';')[0];sent.length=0;
  for(const value of ['abcdefg','a'.repeat(129)]){
    const response=await f.post('/api/account/password',{password:value},{Cookie:cookie});
    assert.equal(response.status,400);assert.match((await response.json()).error,/between 8 and 128/);
    assert.equal(response.headers.get('set-cookie'),null);
  }
  assert.equal(sent.length,0);
  const response=await f.post('/api/account/password',{password:'Ax7!pqR2'},{Cookie:cookie});
  assert.deepEqual(await response.json(),{updated:true,signInRequired:true});assert.match(response.headers.get('set-cookie'),/Max-Age=0/);
  assert.equal(sent.length,1);assert(sent[0].url.endsWith('/email-otp/reset-password'));
  assert.deepEqual(sent[0].body,{email:member.email,otp:'123456',password:'Ax7!pqR2'});
});

test('Neon sign-in preserves HttpOnly encryption and revalidates the pinned admin with the provider',async t=>{
  const f=await fixture(t),cookie=await f.login();
  assert(!cookie.includes('private-provider-token'));assert(!cookie.includes('signed-private-cookie'));
  const decoded=openSession(cookie.slice(cookie.indexOf('=')+1),f.settings.SESSION_SECRET);
  assert.equal(decoded.provider,'neon');assert.equal(JSON.parse(decoded.access).cookie,sessionCredential);
  const response=await f.get('/api/account/session',{Cookie:cookie}),value=await response.json();
  assert.equal(value.user.role,'super_admin');assert.equal(value.user.emailVerified,true);assert(value.user.permissions.includes('plans:all'));
  assert(!JSON.stringify(value).includes('private'));
  const call=f.calls.find(call=>call.url.includes('/get-session'));
  assert(call.url.endsWith('get-session?disableCookieCache=true'));
  assert.equal(call.options.headers.Cookie,sessionCredential);assert.equal(call.options.headers.Origin,f.origin);
  const billing=await (await f.get('/api/billing/status',{Cookie:cookie})).json();assert.equal(billing.access.source,'super_admin');
  const config=await (await f.get('/api/commerce?__route=account/config')).json();assert.equal(config.authProvider,'neon');
});

test('unverified identities, forged metadata, different user IDs and cross-origin requests cannot become admin',async t=>{
  for(const record of [{...administrator,emailVerified:false},{...administrator,id:member.id},{...member,role:'admin',user_metadata:{role:'super_admin'}}]){
    const f=await fixture(t,{providerUser:record});
    const login=await f.post('/api/account/sign-in',{email:record.email,password:'test-password'});
    if(!record.emailVerified){assert.equal(login.status,403);assert.equal(login.headers.get('set-cookie'),null);continue;}
    const cookie=login.headers.get('set-cookie').split(';')[0];
    assert.equal((await (await f.get('/api/account/session',{Cookie:cookie})).json()).user.role,'member');
    assert.equal((await f.get('/api/admin/users',{Cookie:cookie})).status,403);
  }
  const f=await fixture(t);
  assert.equal((await f.post('/api/account/sign-in',{email:member.email,password:'test-password'},{Origin:'https://evil.test'})).status,403);
  assert.equal(f.calls.length,0);
});

test('revoked provider sessions are cleared; expired and legacy cookies do not authorize Neon',async t=>{
  let revoked=false;
  const f=await fixture(t,{fetcher:async url=>{
    if(url.endsWith('/sign-in/email'))return successfulLogin(administrator);
    if(url.includes('/get-session'))return Response.json(revoked?null:{session:{userId:administrator.id},user:administrator});
    throw new Error('Unexpected request');
  }}),cookie=await f.login();revoked=true;
  const response=await f.get('/api/account/session',{Cookie:cookie});
  assert.deepEqual(await response.json(),{user:null});assert.match(response.headers.get('set-cookie'),/Max-Age=0/);
  const legacy=sealSession({access:'legacy-token',refresh:'legacy-refresh',validUntil:Date.now()+60000},f.settings.SESSION_SECRET);
  assert.equal((await f.get('/api/admin/users',{Cookie:'sv_account='+legacy})).status,401);
});

test('verification without provider auto-login returns an explicit sign-in step and rejects false verification',async t=>{
  let confirmed=true;
  const f=await fixture(t,{fetcher:async url=>{
    assert(url.endsWith('/email-otp/verify-email'));
    return Response.json({status:true,token:null,user:{...member,emailVerified:confirmed}});
  }});
  const response=await f.post('/api/account/verify',{email:member.email,code:'123456',type:'signup'});
  assert.deepEqual(await response.json(),{verified:true,signInRequired:true});assert.equal(response.headers.get('set-cookie'),null);
  confirmed=false;assert.equal((await f.post('/api/account/verify',{email:member.email,code:'123456',type:'signup'})).status,400);
});

test('recovery code never creates an authenticated session and password reset consumes the provider code',async t=>{
  const calls=[];
  const f=await fixture(t,{fetcher:async(url,options)=>{calls.push({url,body:options.body?JSON.parse(options.body):null});return Response.json({success:true});}});
  assert.equal((await f.post('/api/account/recovery',{email:administrator.email})).status,200);
  const verified=await f.post('/api/account/verify',{email:administrator.email,code:'123456',type:'recovery'});
  const cookie=verified.headers.get('set-cookie').split(';')[0];assert(!cookie.includes('123456'));
  assert.deepEqual(await verified.json(),{signedIn:false,recovery:true});
  const before=calls.length;
  assert.equal((await f.get('/api/admin/users',{Cookie:cookie})).status,401);
  assert.equal((await f.post('/api/billing/checkout',{plan:'team',region:'US',interval:'monthly'},{Cookie:cookie})).status,401);
  assert.equal(calls.length,before);
  const reset=await f.post('/api/account/password',{password:'new-private-password'},{Cookie:cookie});
  assert.deepEqual(await reset.json(),{updated:true,signInRequired:true});assert.match(reset.headers.get('set-cookie'),/Max-Age=0/);
  assert(calls[0].url.endsWith('/email-otp/request-password-reset'));
  assert.deepEqual(calls.at(-1).body,{email:administrator.email,otp:'123456',password:'new-private-password'});
  assert.equal((await f.post('/api/account/password',{password:'new-private-password'})).status,401);
});

test('provider errors and rate limits cannot report sign-in or verification as successful',async t=>{
  const f=await fixture(t,{fetcher:async()=>Response.json({message:'provider-private-error'},{status:429})});
  const response=await f.post('/api/account/sign-in',{email:member.email,password:'test-password'});
  assert.equal(response.status,429);assert(!JSON.stringify(await response.json()).includes('provider-private-error'));
  assert.equal(response.headers.get('set-cookie'),null);
});

test('SQL adapter parameterizes values and rejects uncontrolled table/column/function names',async()=>{
  let last;const store=createNeonStore(async(sql,params)=>{last={sql,params};return [];});
  await store.request('billing_customers?provider=eq.stripe&provider_customer_id=eq.'+encodeURIComponent("x'; drop table accounts;--")+'&select=user_id');
  assert(!last.sql.includes('drop table'));assert.equal(last.params[1],"x'; drop table accounts;--");
  await assert.rejects(store.request('accounts?select=*'),/Unsupported/);
  await assert.rejects(store.request('billing_subscriptions?select=password'),/Unsupported/);
  await assert.rejects(store.request('rpc/arbitrary',{method:'POST',body:'{}'}),/Unsupported/);
  await assert.rejects(store.request('billing_events?provider=eq.stripe',{method:'DELETE'}),/Invalid|Unsupported/);
  await assert.rejects(store.request('billing_checkout_locks?user_id=eq.member',{method:'DELETE'}),/Invalid|Unsupported/);
  await store.request('billing_checkout_locks?user_id=eq.member&plan_key=eq.STUDIO_MONTHLY_INR&expires_at=eq.2026-10-31T10%3A00%3A00Z',{method:'DELETE'});
  assert.match(last.sql,/delete from spanvision_commerce.billing_checkout_locks/);
  assert.deepEqual(last.params,['member','STUDIO_MONTHLY_INR','2026-10-31T10:00:00Z']);
});

test('resending verification uses the correct OTP purpose and honors provider throttling',async t=>{
  const calls=[];let throttled=false;
  const f=await fixture(t,{fetcher:async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return Response.json({success:!throttled},{status:throttled?429:200});}});
  assert.equal((await f.post('/api/account/resend-verification',{email:member.email,type:'signup'})).status,200);
  assert(calls[0].url.endsWith('/email-otp/send-verification-otp'));assert.equal(calls[0].body.type,'email-verification');
  assert.equal((await f.post('/api/account/resend-verification',{email:member.email,type:'recovery'})).status,200);
  assert(calls[1].url.endsWith('/email-otp/request-password-reset'));
  throttled=true;assert.equal((await f.post('/api/account/resend-verification',{email:member.email,type:'signup'})).status,429);
  const before=calls.length;
  assert.equal((await f.post('/api/account/resend-verification',{email:member.email,type:'sign-in'})).status,400);
  assert.equal(calls.length,before);
});

test('sign-out revokes the provider cookie without requiring an available database',async t=>{
  const store={syncAccount:async()=>{throw new Error('Database offline');}};
  const f=await fixture(t,{env:{DATABASE_URL:'postgresql://app:private@ep-example.neon.tech/neondb'},store}),cookie=await f.login();
  const response=await f.post('/api/account/sign-out',{}, {Cookie:cookie});
  assert.deepEqual(await response.json(),{signedOut:true});assert.match(response.headers.get('set-cookie'),/Max-Age=0/);
  assert(f.calls.some(call=>call.url.endsWith('/sign-out')));assert(!f.calls.some(call=>call.url.includes('/get-session')));
});

test('packaged Vercel function includes its Neon modules and standalone driver',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'spanvision-neon-package-'));
  try{
    await packageCommerce(directory);
    const bundled=path.join(directory,'functions/api/commerce.func');
    const handler=await import(pathToFileURL(path.join(bundled,'server.mjs')));assert.equal(typeof handler.createHandler,'function');
    const driver=await import(pathToFileURL(path.join(bundled,'node_modules/@neondatabase/serverless/index.mjs')));assert.equal(typeof driver.neon,'function');
    assert.equal((await fs.readFile(path.join(bundled,'neon-auth.mjs'),'utf8')).includes('Neon Auth URL'),true);
  }finally{
    const absolute=path.resolve(directory),temp=path.resolve(os.tmpdir());
    if(path.dirname(absolute)!==temp||!path.basename(absolute).startsWith('spanvision-neon-package-'))throw new Error('Unsafe test cleanup path');
    await fs.rm(absolute,{recursive:true,force:true});
  }
});
