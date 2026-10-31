// Production-build UI checks; all account and payment providers are simulated.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {plans,regions,trialPolicy,selection} from '../commerce/catalog.mjs';
const root=path.resolve(import.meta.dirname,'..'),build=path.join(root,'suite-hub/dist');
const output=path.join(root,'qa/deployment/output/plan-checkout-browser'),origin='https://www.spanvisioninfra.com';
await fs.mkdir(path.join(output,'temp'),{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true,env:{...process.env,TEMP:path.join(output,'temp'),TMP:path.join(output,'temp')}}),reports=[];
try{
  for(const [theme,width] of [['dark',1440],['light',320]])for(const scenario of ['studio-monthly','team-monthly','studio-annual','team-annual','unsupported-us','unsupported-gb','missing-annual','guest']){
    const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'}),page=await context.newPage(),bodies=[],errors=[];
    const checkoutAvailability=Object.fromEntries(plans.filter(plan=>plan.id!=='explorer').flatMap(plan=>regions.flatMap(region=>['monthly','annual'].map(interval=>{const choice=selection(plan.id,region.id,interval);return [choice.key,region.id==='IN'&&!(scenario==='missing-annual'&&choice.key==='TEAM_ANNUAL_INR')];}))));
    page.on('pageerror',error=>errors.push(error.message));
    await context.route('**/*',async route=>{
      const url=new URL(route.request().url());
      if(url.origin==='https://rzp.io')return route.fulfill({contentType:'text/html',body:'<h1>Simulated hosted subscription checkout</h1>'});
      if(url.origin!==origin)return route.abort();
      if(url.pathname==='/api/account/config')return route.fulfill({json:{authAvailable:true,databaseAvailable:true,pricingApproved:true,plans,regions,trialPolicy,checkoutAvailability,checkoutAvailable:{IN:true,US:false,GB:false}}});
      if(url.pathname==='/api/account/session')return route.fulfill({json:{user:scenario==='guest'?null:{id:'fixture-user',email:'fixture@example.test',name:'Engineer',emailVerified:true,role:'member'}}});
      if(url.pathname==='/api/billing/payment-test/config')return route.fulfill({json:{enabled:false}});
      if(url.pathname==='/api/account/tool-status')return route.fulfill({json:{trial:{status:'not_started'}}});
      if(url.pathname==='/api/billing/checkout'){
        bodies.push(route.request().postDataJSON());return route.fulfill({json:{provider:'razorpay',url:'https://rzp.io/rzp/verifiedfixture'}});
      }
      if(url.pathname.startsWith('/api/'))return route.fulfill({status:503,json:{error:'Isolated browser check'}});
      const file=path.resolve(build,'.'+(['/', '/pricing','/signup'].includes(url.pathname)?'/index.html':url.pathname));assert(file.startsWith(build+path.sep));
      try{return route.fulfill({contentType:({'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'})[path.extname(file)]||'application/octet-stream',body:await fs.readFile(file)});}
      catch{return route.fulfill({status:404,body:'Not found'});}
    });
    const session=page.waitForResponse(response=>response.url().endsWith('/api/account/session'));
    await page.goto(origin+'/pricing?appearance='+theme);await session;await page.locator('.price-card').last().waitFor();
    const plan=scenario.startsWith('team')||scenario==='missing-annual'?'team':'studio',interval=scenario.includes('annual')?'annual':'monthly';
    if(interval==='annual')await page.getByRole('button',{name:/Annually/}).click();
    const region=scenario==='unsupported-us'?'US':scenario==='unsupported-gb'?'GB':'IN';
    if(region!=='IN')await page.getByLabel('Billing region').selectOption(region);
    const card=page.locator('.price-card').filter({has:page.getByRole('heading',{name:plan==='team'?'Team':'Studio',exact:true})});
    await card.getByRole('button',{name:'Choose this plan'}).click();
    const dialog=page.getByRole('dialog');await dialog.waitFor();
    assert.match(await dialog.innerText(),new RegExp(selection(plan,region,interval).region.label));
    const fits=await dialog.evaluate(element=>{const box=element.getBoundingClientRect();return box.left>=0&&box.right<=innerWidth+1&&box.top>=0&&box.bottom<=innerHeight+1;});assert(fits,'Checkout summary must fit the viewport');
    if(scenario.startsWith('unsupported')||scenario==='missing-annual'){
      await dialog.getByText(/not available for this plan/).waitFor();assert(await dialog.getByRole('button',{name:'Checkout unavailable'}).isDisabled());assert.equal(bodies.length,0);
    }else{
      assert.match(await dialog.innerText(),/Recurring (monthly|annual) billing/);
      if(scenario==='guest'){
        await dialog.getByRole('button',{name:'Create an account to continue'}).click();await page.waitForURL('**/signup');assert.equal(bodies.length,0);
      }else{
        if(scenario==='studio-monthly')await page.screenshot({path:path.join(output,theme+'-plan-summary.png')});
        await dialog.getByRole('button',{name:'Continue to secure checkout'}).click();await page.waitForURL('https://rzp.io/rzp/verifiedfixture');
        assert.deepEqual(bodies,[{plan,region,interval}]);
      }
    }
    assert.deepEqual(errors,[]);reports.push({theme,width,scenario,passed:true});console.log(theme+'/'+scenario+': passed');await context.close();
  }
}finally{await browser.close();await fs.writeFile(path.join(output,'results.json'),JSON.stringify(reports,null,2));}
