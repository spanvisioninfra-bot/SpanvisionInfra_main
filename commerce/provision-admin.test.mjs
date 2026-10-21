import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {provisionAdmin} from './provision-admin.mjs';

const env={NEON_AUTH_BASE_URL:'https://ep-example.neonauth.c-3.ap-southeast-1.aws.neon.tech/neondb/auth',SITE_URL:'https://www.spanvisioninfra.com'};
const user={id:'admin_0123456789',email:'spanvisioninfra.admin@gmail.com',emailVerified:false};
async function privateFile(t){
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'spanvision-admin-test-'));
  t.after(async()=>{
    if(path.dirname(path.resolve(directory))!==path.resolve(os.tmpdir())||!path.basename(directory).startsWith('spanvision-admin-test-'))throw new Error('Unsafe test cleanup');
    await fs.rm(directory,{recursive:true,force:true});
  });
  return path.join(directory,'credentials.json');
}

test('operator provisioning writes a strong private password once and never prints it in its result',async t=>{
  const file=await privateFile(t);let payload,calls=0;
  const fetcher=async(url,options)=>{calls++;assert(url.endsWith('/sign-up/email'));payload=JSON.parse(options.body);return Response.json({user,token:null});};
  const result=await provisionAdmin({env,file,fetcher});
  assert.equal(result.email,user.email);assert.equal(result.verificationRequired,true);assert.equal(result.status,'verification_pending');
  const saved=JSON.parse(await fs.readFile(file,'utf8'));assert(saved.password.length>=32);assert.equal(payload.password,saved.password);
  assert(!JSON.stringify(result).includes(saved.password));assert(!Object.hasOwn(result,'password'));
  await provisionAdmin({env,file,fetcher});assert.equal(calls,1);assert.equal(JSON.parse(await fs.readFile(file,'utf8')).password,saved.password);
});

test('a pending account becomes ready only after email verification and real password authentication',async t=>{
  const file=await privateFile(t),calls=[];
  const fetcher=async(url,options)=>{
    calls.push({url,body:options.body?JSON.parse(options.body):null});
    if(url.endsWith('/sign-up/email'))return Response.json({user,token:null});
    if(url.endsWith('/email-otp/verify-email'))return Response.json({status:true,user:{...user,emailVerified:true},token:null});
    if(url.endsWith('/sign-in/email'))return Response.json({user:{...user,emailVerified:true},token:'provider-token'});
    if(url.endsWith('/sign-out'))return Response.json({success:true});
    throw new Error('Unexpected request');
  };
  await provisionAdmin({env,file,fetcher});
  const result=await provisionAdmin({env,file,fetcher,mode:'verify',code:'123456'});
  assert.equal(result.status,'ready');assert.equal(result.verificationRequired,false);assert.equal(result.userId,user.id);
  assert(calls.some(call=>call.url.endsWith('/sign-out')));
  assert(!JSON.stringify(result).includes('provider-token'));assert(!Object.hasOwn(result,'password'));
  assert.equal(JSON.parse(await fs.readFile(file,'utf8')).status,'ready');
});

test('expired codes and successful HTTP responses with failed verification cannot activate credentials',async t=>{
  const file=await privateFile(t);let success=false;
  const fetcher=async url=>url.endsWith('/sign-up/email')?Response.json({user,token:null}):Response.json({status:success});
  await provisionAdmin({env,file,fetcher});
  await assert.rejects(provisionAdmin({env,file,fetcher,mode:'verify',code:'123456'}),/rejected or expired/);
  assert.equal(JSON.parse(await fs.readFile(file,'utf8')).status,'verification_pending');
  await assert.rejects(provisionAdmin({env,file,fetcher,mode:'verify',code:'abc'}),/digit email code/);
});

test('existing accounts require an owner email reset and are never silently overwritten',async t=>{
  const file=await privateFile(t),calls=[];
  const fetcher=async(url,options)=>{
    calls.push({url,body:JSON.parse(options.body)});
    if(url.endsWith('/sign-up/email'))return Response.json({code:'USER_ALREADY_EXISTS'},{status:422});
    if(url.endsWith('/email-otp/request-password-reset'))return Response.json({success:true});
    throw new Error('Unexpected request');
  };
  await assert.rejects(provisionAdmin({env,file,fetcher}),/already exists/);
  assert.equal(calls.length,1);assert.equal(JSON.parse(await fs.readFile(file,'utf8')).status,'existing_account');
  assert.equal((await provisionAdmin({env,file,fetcher,mode:'reset'})).status,'reset_pending');
  assert(calls.at(-1).url.endsWith('/email-otp/request-password-reset'));
});

test('private files cannot be saved in the checkout or reused for a different project',async t=>{
  await assert.rejects(provisionAdmin({env,file:fileURLToPath(new URL('admin-credentials.json',import.meta.url))}),/outside the Git checkout/);
  const file=await privateFile(t),fetcher=async()=>Response.json({user,token:null});
  await provisionAdmin({env,file,fetcher});
  await assert.rejects(provisionAdmin({env:{...env,NEON_AUTH_BASE_URL:env.NEON_AUTH_BASE_URL.replace('ep-example','ep-another')},file,fetcher}),/different account or project/);
});
