import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {issueToolTicket,readToolTicket,toolIds} from './tool-trial.mjs';
import {planAccess} from './access.mjs';
import {trialPolicy,trialToolIds,trialComingSoonTools} from './catalog.mjs';
import {backendServices} from '../deployment/backend-services.mjs';

const secret='isolated-trial-test-secret-at-least-32-characters';
const member='member_trial_01',now=Date.now();

test('tickets reject tampering, expiry, wrong keys and expose no authentication credentials',()=>{
  const grant={allowed:true,grantId:randomUUID(),expiresAt:new Date(now+10000).toISOString()};
  const ticket=issueToolTicket(grant,{id:member},'cad',secret);
  assert.equal(readToolTicket(ticket,secret,now).tool,'cad');
  assert.equal(readToolTicket(ticket,secret+'wrong',now),null);
  assert.equal(readToolTicket(ticket+'x',secret,now),null);
  assert.equal(readToolTicket(ticket,secret,now+20000),null);
  assert.equal(readToolTicket(ticket.split('.')[0]+'.bad',secret,now),null);
  assert(!ticket.includes(secret));
  assert.throws(()=>issueToolTicket(grant,{id:member},'forged',secret));
});

test('ticket tool IDs cover the complete platform and only 13 tools are enabled for trials',async()=>{
  const brand=JSON.parse(await fs.readFile(new URL('../branding/brand.json',import.meta.url)));
  assert.deepEqual([...toolIds].sort(),brand.modules.map(item=>item.id).sort());
  assert.equal(trialToolIds.length,13);
  assert.deepEqual([...trialComingSoonTools].sort(),Object.keys(backendServices).sort());
  assert.equal(trialPolicy.dailyLimit,3);
  assert.equal(trialPolicy.hours,48);
  assert.equal(new Set([...trialToolIds,...trialComingSoonTools]).size,toolIds.length);
  assert(trialToolIds.every(id=>!trialComingSoonTools.includes(id)));
});

test('unpaid provider states cannot bypass the trial as paid access',()=>{
  const subscription={plan_key:'STUDIO_MONTHLY_USD',current_period_end:new Date(now+86400000).toISOString()};
  for(const status of ['trialing','authenticated','pending','past_due','canceled'])assert.equal(planAccess({role:'member'},[{...subscription,status}],null,now).plan,'explorer');
  assert.equal(planAccess({role:'member'},[{...subscription,status:'active'}],null,now).plan,'studio');
});

