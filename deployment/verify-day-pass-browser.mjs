// Production build, isolated origins. Every provider/account response is simulated.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {plans,regions,trialPolicy,dayPassPolicy} from '../commerce/catalog.mjs';
const root=path.resolve(import.meta.dirname,'..'),build=path.join(root,'suite-hub/dist'),output=path.join(root,'qa/deployment/output/day-pass-browser');
const origin='https://www.spanvisioninfra.com',api='/api/billing/day-pass/';
await fs.mkdir(path.join(output,'temp'),{recursive:true});
const sdk=`window.Razorpay=class{
 constructor(options){this.options=options;window.dayPassCheckout=options;} on(){} close(){this.dialog?.remove();}
 open(){const d=this.dialog=document.createElement('div');d.setAttribute('role','dialog');d.setAttribute('aria-label','Simulated Razorpay');d.style.cssText='position:fixed;inset:15%;z-index:999999;background:white;color:black;padding:24px';
 const pay=document.createElement('button');pay.textContent='Simulate payment';pay.onclick=()=>{this.close();this.options.handler({razorpay_order_id:this.options.order_id,razorpay_payment_id:'pay_fixture',razorpay_signature:'a'.repeat(64)});};
 const cancel=document.createElement('button');cancel.textContent='Close checkout';cancel.onclick=()=>{this.close();this.options.modal.ondismiss();};d.append(pay,cancel);document.body.append(d);}
};`;
const browser=await chromium.launch({channel:'msedge',headless:true,env:{...process.env,TEMP:path.join(output,'temp'),TMP:path.join(output,'temp')}}),reports=[];
const scenarios=['disabled','guest','trial','admin','success','cancel','pending','verify-error','order-error','script-error','refunded','used','active','status-recovery','amount-mismatch'];
try{
  const allCases=[...scenarios.map(scenario=>({surface:'pricing',scenario})),...['tools','account'].flatMap(surface=>['success','active'].map(scenario=>({surface,scenario})))];
  const cases=process.argv.includes('--account-only')?allCases.filter(item=>item.surface==='account'):allCases;
  for(const [mode,width] of [['dark',1440],['light',320]])for(const {surface,scenario} of cases){
    const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'}),page=await context.newPage();
    const writes=[],errors=[],prohibited=[];let sdkLoads=0,statusChecks=0,activated=false;
    const active={status:'active',policy:dayPassPolicy,hasCheckout:true,activatedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+86400000).toISOString()};
    page.on('pageerror',error=>errors.push(error.message));
    await context.route('**/*',async route=>{
      const url=new URL(route.request().url());
      if(url.hostname==='checkout.razorpay.com'){sdkLoads++;return scenario==='script-error'?route.abort():route.fulfill({contentType:'application/javascript',body:sdk});}
      if(url.origin!==origin){prohibited.push(url.hostname);return route.abort();}
      const initial={status:scenario==='trial'?'not_eligible':scenario==='refunded'?'refunded':scenario==='used'?'used':['pending','status-recovery'].includes(scenario)?'pending':'eligible',policy:dayPassPolicy,hasCheckout:['pending','status-recovery'].includes(scenario),canPurchase:!['trial','used','refunded'].includes(scenario)};
      if(url.pathname==='/api/account/config')return route.fulfill({json:{authAvailable:true,databaseAvailable:true,dayPassAvailable:scenario!=='disabled',pricingApproved:true,plans,regions,trialPolicy,checkoutAvailable:{IN:true,US:true,GB:true}}});
      if(url.pathname==='/api/account/session')return route.fulfill({json:{user:scenario==='guest'?null:{id:'fixture',email:'fixture@example.test',name:'Engineer',emailVerified:true,role:scenario==='admin'?'super_admin':'member'}}});
      if(url.pathname==='/api/account/tool-status')return route.fulfill({json:{trial:{status:scenario==='trial'?'available':'expired',day:1,remaining:3},access:{plan:scenario==='admin'?'team':'explorer',source:activated||scenario==='active'?'day_pass':'free'}}});
      if(url.pathname==='/api/billing/status')return route.fulfill({json:{subscriptions:[],access:{plan:'explorer',source:'free'}}});
      if(url.pathname==='/api/billing/payment-test/config')return route.fulfill({json:{enabled:false}});
      if(url.pathname===api+'status'){
        if(route.request().method()==='POST'){statusChecks++;if(scenario==='pending')return route.fulfill({json:{...initial,paymentStatus:'authorized'}});activated=true;return route.fulfill({json:{...active,paymentStatus:'captured'}});}
        return route.fulfill({json:scenario==='active'?active:initial});
      }
      if(url.pathname===api+'order'){
        writes.push(route.request().postDataJSON());
        if(scenario==='order-error')return route.fulfill({status:502,json:{error:'Check payment status before paying again.'}});
        return route.fulfill({json:{...initial,status:'pending',hasCheckout:true,orderId:'order_fixture',keyId:'rzp_live_fixture',amount:scenario==='amount-mismatch'?200:100,currency:'INR',paymentStatus:'unpaid'}});
      }
      if(url.pathname===api+'verify'){
        if(scenario==='verify-error')return route.fulfill({status:502,json:{error:'Payment confirmation is delayed.'}});
        activated=true;return route.fulfill({json:{...active,paymentStatus:'captured'}});
      }
      if(url.pathname.startsWith('/api/'))return route.fulfill({status:503,json:{error:'Isolated browser fixture'}});
      const file=path.resolve(build,'.'+(['/pricing','/tools','/account','/login'].includes(url.pathname)?'/index.html':url.pathname));assert(file.startsWith(build+path.sep));
      try{return route.fulfill({contentType:({'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'})[path.extname(file)]||'application/octet-stream',body:await fs.readFile(file)});}catch{return route.fulfill({status:404,body:'Missing fixture asset'});}
    });
    await page.goto(origin+'/'+surface+'?appearance='+mode);
    if(surface==='pricing')await page.locator('.price-card').last().waitFor();else await page.locator(surface==='tools'?'#tools-title':'.online-account h1').waitFor();
    await page.waitForLoadState('networkidle');
    const card=page.getByRole('complementary',{name:'One-day tool access'});
    if(['disabled','trial','admin'].includes(scenario)){assert.equal(await card.count(),0);assert.equal(writes.length,0);assert.equal(sdkLoads,0);}
    else{
      await card.waitFor();await card.scrollIntoViewIfNeeded();
      assert.match(await card.innerText(),/One pass per account/);assert.match(await card.innerText(),/No automatic renewal/);
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No page overflow at '+width);
      if(scenario==='guest'){await card.getByRole('link',{name:/Sign in/}).click();await page.waitForURL('**/login');assert.equal(writes.length,0);}
      else if(['active','status-recovery'].includes(scenario)){await card.getByRole('heading',{name:'Your day pass is active'}).waitFor();assert.equal(sdkLoads,0);assert.equal(writes.length,0);}
      else if(['used','refunded'].includes(scenario)){assert.equal(await card.getByRole('button',{name:/Get 24/}).count(),0);assert.equal(writes.length,0);}
      else if(scenario==='pending'){assert(await card.getByRole('button',{name:'Payment pending'}).isDisabled());assert.equal(writes.length,0);assert.equal(sdkLoads,0);}
      else{
        if(scenario==='success')await card.screenshot({path:path.join(output,mode+'-'+width+'-'+surface+'-offer.png')});
        await card.getByRole('button',{name:'Get 24-hour access · ₹1'}).click();
        if(['order-error','script-error','amount-mismatch'].includes(scenario)){
          await card.getByRole('alert').waitFor();assert.equal(await page.getByRole('dialog',{name:'Simulated Razorpay'}).count(),0);
        }else{
          const dialog=page.getByRole('dialog',{name:'Simulated Razorpay'});await dialog.waitFor();
          assert.deepEqual(await page.evaluate(()=>({amount:window.dayPassCheckout.amount,currency:window.dayPassCheckout.currency,order:window.dayPassCheckout.order_id})),{amount:100,currency:'INR',order:'order_fixture'});
          if(scenario==='cancel'){
            await dialog.getByRole('button',{name:'Close checkout'}).click();await card.getByText(/Checkout closed/).waitFor();assert(await card.getByRole('button',{name:'Resume ₹1 checkout'}).isEnabled());
          }else{
            await dialog.getByRole('button',{name:'Simulate payment'}).click();
            if(scenario==='verify-error'){await card.getByRole('alert').waitFor();assert(await card.getByRole('button',{name:'Payment pending'}).isDisabled());await card.getByRole('button',{name:'Check payment status'}).click();}
            await card.getByRole('heading',{name:'Your day pass is active'}).waitFor();assert(await card.getByRole('link',{name:'Open the tools →'}).isVisible());
            if(scenario==='success')await card.screenshot({path:path.join(output,mode+'-'+width+'-'+surface+'-active.png')});
          }
        }
        assert.equal(writes.length,scenario==='script-error'?0:1);for(const body of writes)assert.deepEqual(body,{});
      }
    }
    if(surface==='account'&&(scenario==='active'||activated)){
      assert.equal(await page.getByText('Your trial has ended',{exact:true}).count(),0);
      assert.match(await page.locator('.account-access-plan').innerText(),/One-day pass/);
    }
    assert.deepEqual(errors,[]);assert.deepEqual(prohibited,[]);reports.push({mode,width,surface,scenario,orders:writes.length,sdkLoads,statusChecks,passed:true});await context.close();
  }
  await fs.writeFile(path.join(output,process.argv.includes('--account-only')?'account-results.json':'results.json'),JSON.stringify(reports,null,2));console.log(JSON.stringify({passed:reports.length,output,realPayments:0}));
}finally{await browser.close();}
