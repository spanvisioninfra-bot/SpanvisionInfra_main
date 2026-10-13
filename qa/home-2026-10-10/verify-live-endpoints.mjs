import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin='https://spanvision-infra.vercel.app';
const report={verifiedAt:new Date().toISOString(),origin,checks:[]};
for(const route of ['/','/api/account/config','/api/account/session','/__suite/status']){
  const response=await fetch(origin+route,{signal:AbortSignal.timeout(30000)});
  assert.equal(response.status,200,route);
  if(route!=='/'){
    assert.match(response.headers.get('content-type'),/application\/json/);
    const value=await response.json();
    if(route.endsWith('/config')){
      assert.equal(value.authAvailable,false);assert.equal(value.pricingApproved,false);assert.deepEqual(value.checkoutAvailable,{IN:false,US:false,GB:false});
      report.account={authAvailable:value.authAvailable,pricingApproved:value.pricingApproved,checkoutAvailable:value.checkoutAvailable,plans:value.plans.map(p=>p.name)};
    }
    if(route.endsWith('/session'))assert.equal(value.user,null);
    if(route.endsWith('/status'))assert.equal(value.modules.length,16);
  }
  report.checks.push({route,status:response.status});
}
const signin=await fetch(origin+'/api/account/sign-in',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({email:'preview@example.test',password:'validation-only-password'}),signal:AbortSignal.timeout(30000)});
assert.equal(signin.status,503);assert.match((await signin.json()).error,/setup is in progress/);
report.checks.push({route:'/api/account/sign-in',status:signin.status,expected:'Setup required; no account or payment activated'});
await fs.writeFile(new URL('live-endpoints.json',import.meta.url),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
