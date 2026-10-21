import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {readLocalEnvironment} from './local-env.mjs';
import {createHandler} from './server.mjs';

async function fixture(t){
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'spanvision-env-'));
  t.after(async()=>{
    if(path.dirname(path.resolve(directory))!==path.resolve(os.tmpdir())||!path.basename(directory).startsWith('spanvision-env-'))throw new Error('Unsafe fixture cleanup path');
    await fs.rm(directory,{recursive:true,force:true});
  });
  const file=path.join(directory,'.env');
  await fs.writeFile(file,[
    '# This is an isolated test fixture, never a production connection.',
    'NEON_AUTH_BASE_URL=https://ep-example.neonauth.c-3.ap-southeast-1.aws.neon.tech/neondb/auth',
    'DATABASE_URL="postgresql://app:test-password@ep-example.neon.tech/neondb?sslmode=require"',
    'SESSION_SECRET="isolated-secret-32-characters-or-longer"',
    'SITE_URL=http://127.0.0.1:4230',
    'PRICING_APPROVED=false',
    'QUOTED_VALUE="a value with # inside"',
  ].join('\n'),{mode:0o600});
  return {file,directory};
}

test('local settings support quoted values, respect explicit environment variables and never mutate process.env',async t=>{
  const {file}=await fixture(t),before={...process.env};
  const environment={SESSION_SECRET:'terminal-overrides-the-file',PORT:'49123'};
  const settings=readLocalEnvironment({file,environment});
  assert.equal(settings.SESSION_SECRET,environment.SESSION_SECRET);
  assert.equal(settings.PORT,'49123');assert.equal(settings.QUOTED_VALUE,'a value with # inside');
  assert(settings.DATABASE_URL.endsWith('?sslmode=require'));
  assert.deepEqual(environment,{SESSION_SECRET:'terminal-overrides-the-file',PORT:'49123'});
  assert.deepEqual({...process.env},before);
});

test('missing local settings are optional while unreadable files fail without displaying their contents',async t=>{
  const {directory}=await fixture(t),environment={SITE_URL:'https://example.test'};
  const settings=readLocalEnvironment({file:path.join(directory,'missing.env'),environment});
  assert.deepEqual(settings,environment);assert.notEqual(settings,environment);
  assert.throws(()=>readLocalEnvironment({file:directory,environment}),/Local account settings could not be read/);
});

test('environment-loaded account APIs expose availability without passwords, connection strings or session secrets',async t=>{
  const {file}=await fixture(t);const env=readLocalEnvironment({file,environment:{}});
  const server=http.createServer(createHandler({env,fetcher:async()=>{throw new Error('Configuration must not contact the provider');}}));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const response=await fetch(`http://127.0.0.1:${server.address().port}/api/account/config`);
  assert.equal(response.status,200);const data=await response.json();
  assert.equal(data.authAvailable,true);assert.equal(data.databaseAvailable,true);assert.equal(data.authProvider,'neon');
  assert.equal(data.pricingApproved,false);
  const publicText=JSON.stringify(data);
  for(const secret of [env.DATABASE_URL,env.SESSION_SECRET,'test-password'])assert.equal(publicText.includes(secret),false);
  assert.equal(Object.hasOwn(data,'DATABASE_URL'),false);assert.equal(Object.hasOwn(data,'SESSION_SECRET'),false);
});
