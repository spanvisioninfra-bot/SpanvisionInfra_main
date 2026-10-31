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
  const internationalScenarios=['us','gb'].flatMap(region=>['studio','team'].flatMap(plan=>['monthly','annual'].map(interval=>`${plan}-${interval}-${region}`)));
  const recoveryScenarios=['pending-resume-us','pending-replace-us','pending-payment-us'];
  const scenarios=process.argv.includes('--recovery-only')?recoveryScenarios:['studio-monthly','team-monthly','studio-annual','team-annual','unsupported-us','unsupported-gb','missing-annual','guest',...internationalScenarios,...recoveryScenarios];
  for(const [theme,width] of [['dark',1440],['light',320]])for(const scenario of scenarios){
    const context=await browser.newContext({viewport:{width,height:width===320&&scenario.startsWith('pending-')?700:1000},reducedMotion:'reduce'}),page=await context.newPage(),bodies=[],errors=[],cancellations=[],requests=[];
    const internationalReady=internationalScenarios.includes(scenario)||scenario.startsWith('pending-');
    const checkoutAvailability=Object.fromEntries(plans.filter(plan=>plan.id!=='explorer').flatMap(plan=>regions.flatMap(region=>['monthly','annual'].map(interval=>{const choice=selection(plan.id,region.id,interval);return [choice.key,(region.id==='IN'||internationalReady)&&!(scenario==='missing-annual'&&choice.key==='TEAM_ANNUAL_INR')];}))));
    page.on('pageerror',error=>errors.push(error.message));
    await context.route('**/*',async route=>{
      const url=new URL(route.request().url());
      if(url.origin==='https://rzp.io')return route.fulfill({contentType:'text/html',body:'<h1>Simulated hosted subscription checkout</h1>'});
      if(url.origin!==origin)return route.abort();
      if(url.pathname==='/api/account/config')return route.fulfill({json:{authAvailable:true,databaseAvailable:true,pricingApproved:true,plans,regions,trialPolicy,checkoutAvailability,checkoutAvailable:{IN:true,US:internationalReady,GB:internationalReady}}});
      if(url.pathname==='/api/account/session')return route.fulfill({json:{user:scenario==='guest'?null:{id:'fixture-user',email:'fixture@example.test',name:'Engineer',emailVerified:true,role:'member'}}});
      if(url.pathname==='/api/billing/payment-test/config')return route.fulfill({json:{enabled:false}});
      if(url.pathname==='/api/account/tool-status')return route.fulfill({json:{trial:{status:'not_started'}}});
      if(url.pathname==='/api/billing/checkout'){
        bodies.push(route.request().postDataJSON());requests.push('checkout');
        if(scenario.startsWith('pending-')&&bodies.length===1)return route.fulfill({status:409,json:{error:'An unpaid Studio checkout at ₹999 / month is already open. Resume it or replace it with the selected plan.',pendingCheckout:{subscriptionId:'sub_previous',planKey:'STUDIO_MONTHLY_INR',price:'₹999 / month',url:'https://rzp.io/rzp/previousfixture',canReplace:scenario!=='pending-payment-us'}}});
        return route.fulfill({json:{provider:'razorpay',url:'https://rzp.io/rzp/verifiedfixture'}});
      }
      if(url.pathname==='/api/billing/checkout/cancel'){cancellations.push(route.request().postDataJSON());requests.push('cancel');return route.fulfill({json:{cancelled:true}});}
      if(url.pathname.startsWith('/api/'))return route.fulfill({status:503,json:{error:'Isolated browser check'}});
      const file=path.resolve(build,'.'+(['/', '/pricing','/signup'].includes(url.pathname)?'/index.html':url.pathname));assert(file.startsWith(build+path.sep));
      try{return route.fulfill({contentType:({'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'})[path.extname(file)]||'application/octet-stream',body:await fs.readFile(file)});}
      catch{return route.fulfill({status:404,body:'Not found'});}
    });
    const session=page.waitForResponse(response=>response.url().endsWith('/api/account/session'));
    await page.goto(origin+'/pricing?appearance='+theme);await session;await page.locator('.price-card').last().waitFor();
    const plan=scenario.startsWith('team')||scenario==='missing-annual'?'team':'studio',interval=scenario.includes('annual')?'annual':'monthly';
    if(interval==='annual')await page.getByRole('button',{name:/Annually/}).click();
    const region=scenario.endsWith('-us')?'US':scenario.endsWith('-gb')?'GB':'IN';
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
        await dialog.getByRole('button',{name:'Continue to secure checkout'}).click();
        if(scenario.startsWith('pending-')){
          await dialog.getByRole('alert').waitFor();assert.equal(cancellations.length,0);
          const resume=dialog.getByRole('link',{name:'Resume ₹999 / month checkout'});await resume.waitFor();
          assert.equal(await dialog.evaluate(element=>element.scrollWidth<=element.clientWidth),true);
          assert.equal(await resume.evaluate(element=>element.scrollWidth<=element.clientWidth),true,'Resume text and icon fit inside the action');
          if(scenario==='pending-payment-us')assert.equal(await dialog.getByRole('button',{name:'Payment in progress'}).isDisabled(),true);
          else if(scenario==='pending-resume-us'){await resume.click();await page.waitForURL('https://rzp.io/rzp/previousfixture');assert.equal(cancellations.length,0);}
          else{
            await page.screenshot({path:path.join(output,theme+'-checkout-recovery.png')});
            await dialog.getByRole('button',{name:'Replace unpaid checkout'}).click();await page.waitForURL('https://rzp.io/rzp/verifiedfixture');
            assert.deepEqual(cancellations,[{subscriptionId:'sub_previous'}]);assert.deepEqual(requests,['checkout','cancel','checkout']);
          }
          assert.deepEqual(bodies,Array.from({length:scenario==='pending-replace-us'?2:1},()=>({plan,region,interval})));
        }else{
          await page.waitForURL('https://rzp.io/rzp/verifiedfixture');assert.deepEqual(bodies,[{plan,region,interval}]);
        }
      }
    }
    assert.deepEqual(errors,[]);reports.push({theme,width,scenario,passed:true});console.log(theme+'/'+scenario+': passed');await context.close();
  }
}finally{await browser.close();await fs.writeFile(path.join(output,process.argv.includes('--recovery-only')?'recovery-results.json':'results.json'),JSON.stringify(reports,null,2));}
