// Simulated Checkout only: never create Razorpay orders or submit real payments.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {plans,regions,trialPolicy} from '../commerce/catalog.mjs';

const root=path.resolve(import.meta.dirname,'..'),origin='http://127.0.0.1:4230';
const output=path.join(root,'qa/deployment/output/local-payment-2026-10-29');
await fs.mkdir(path.join(output,'temp'),{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true,env:{...process.env,TEMP:path.join(output,'temp'),TMP:path.join(output,'temp')}});
const reports=[];
const sdk=`window.Razorpay=class {constructor(options){this.options=options;window.checkoutOptions=options;}on(){}close(){this.dialog?.remove();}open(){const d=this.dialog=document.createElement('div');d.setAttribute('role','dialog');d.setAttribute('aria-label','Simulated Razorpay');d.style.cssText='position:fixed;inset:20%;background:white;color:black;z-index:99999;padding:20px';const b=document.createElement('button');b.textContent='Simulate payment';b.onclick=()=>{this.close();this.options.handler({razorpay_order_id:this.options.order_id,razorpay_payment_id:'pay_browser',razorpay_signature:'a'.repeat(64)});};const c=document.createElement('button');c.textContent='Cancel checkout';c.onclick=()=>{this.close();this.options.modal.ondismiss();};d.append(b,c);document.body.append(d);}};`;
async function mockAccount(route){
  const url=new URL(route.request().url());
  if(url.pathname==='/api/account/config')return route.fulfill({json:{authAvailable:false,databaseAvailable:false,pricingApproved:true,plans,regions,trialPolicy,checkoutAvailable:{IN:false,US:false,GB:false}}});
  if(url.pathname==='/api/account/session')return route.fulfill({json:{user:null}});
  if(url.pathname==='/api/account/tool-status')return route.fulfill({json:{trial:{status:'not_started'}}});
  if(url.pathname.startsWith('/api/'))return route.fulfill({status:503,json:{error:'Isolated browser check'}});
  return route.continue();
}
try{
  for(const [mode,width] of [['dark',1440],['light',390]])for(const scenario of ['success','cancel','pending','verify-error','order-error','script-error']){
    const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'}),page=await context.newPage(),orders=[],verifies=[],errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await context.route('https://checkout.razorpay.com/**',route=>scenario==='script-error'?route.abort():route.fulfill({contentType:'application/javascript',body:sdk}));
    await context.route('https://api.razorpay.com/**',()=>{throw new Error('Live Razorpay API requests are prohibited in automated checks');});
    await context.route(origin+'/api/**',async route=>{
      const url=new URL(route.request().url());
      if(url.pathname==='/api/local-payment/config')return route.fulfill({json:{enabled:true,amount:100,currency:'INR',live:true}});
      if(url.pathname==='/api/local-payment/order'){
        orders.push(route.request().postDataJSON());
        return scenario==='order-error'?route.fulfill({status:502,json:{error:'Razorpay rejected the local keys. Update the local payment settings.'}}):route.fulfill({json:{keyId:'rzp_live_browserfixture',orderId:'order_browser',amount:100,currency:'INR',live:true}});
      }
      if(url.pathname==='/api/local-payment/verify'){
        verifies.push(route.request().postDataJSON());
        return scenario==='verify-error'?route.fulfill({status:502,json:{error:'Razorpay could not be reached.'}}):route.fulfill({json:{verified:scenario!=='pending',status:scenario==='pending'?'authorized':'captured',paymentId:'pay_browser',amount:100,currency:'INR'}});
      }
      return mockAccount(route);
    });
    await page.goto(origin+'/pricing?appearance='+mode);
    const panel=page.locator('.local-payment-test');await panel.getByRole('heading',{name:'Try a ₹1 payment'}).waitFor();
    assert.equal(await page.locator('.price-card').count(),3);assert.equal(orders.length,0);assert.equal(verifies.length,0);
    assert.match(await panel.innerText(),/real ₹1/);await panel.scrollIntoViewIfNeeded();
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await page.screenshot({path:path.join(output,mode+'-'+scenario+'.png')});
    await panel.getByRole('button',{name:'Pay ₹1 · live test'}).click();
    if(['script-error','order-error'].includes(scenario)){
      await panel.getByRole('alert').waitFor();assert.equal(verifies.length,0);assert.equal(orders.length,scenario==='script-error'?0:1);
      assert(await panel.getByRole('button',{name:'Pay ₹1 · live test'}).isEnabled());
    }else{
      const dialog=page.getByRole('dialog',{name:'Simulated Razorpay'});await dialog.waitFor();
      assert.equal(orders.length,1);assert.deepEqual(orders[0],{});
      const options=await page.evaluate(()=>({amount:window.checkoutOptions.amount,currency:window.checkoutOptions.currency,order:window.checkoutOptions.order_id,key:window.checkoutOptions.key}));
      assert.deepEqual(options,{amount:100,currency:'INR',order:'order_browser',key:'rzp_live_browserfixture'});
      if(scenario==='cancel'){
        await dialog.getByRole('button',{name:'Cancel checkout'}).click();await panel.getByText(/Checkout closed/).waitFor();
        assert.equal(verifies.length,0);assert(await panel.getByRole('button',{name:'Pay ₹1 · live test'}).isEnabled());
      }else{
        await dialog.getByRole('button',{name:'Simulate payment'}).click();
        if(scenario==='success'){await panel.getByRole('button',{name:'Payment verified'}).waitFor();assert(await panel.getByRole('button',{name:'Payment verified'}).isDisabled());}
        else{
          if(scenario==='pending')await panel.getByText(/capture is pending/).waitFor();else await panel.getByRole('alert').waitFor();
          await panel.getByRole('button',{name:'Check payment status'}).click();
          await page.waitForFunction(()=>[...document.querySelectorAll('.local-payment-test button')].some(button=>button.textContent.includes('Check payment status')&&!button.disabled));
          assert.equal(orders.length,1);assert.equal(verifies.length,2);
        }
        assert(verifies.length>=1);assert(verifies.every(item=>item.razorpay_order_id==='order_browser'));
      }
    }
    assert.deepEqual(errors,[]);reports.push({mode,width,scenario,passed:true});console.log(mode+'/'+scenario+': passed');await context.close();
  }
  // A disabled public configuration must leave production pricing unchanged.
  const production=path.join(root,'suite-hub/dist'),prodOrigin='https://www.spanvisioninfra.com',context=await browser.newContext(),page=await context.newPage();
  let localRequests=0,checkoutLoads=0;
  await context.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.hostname.includes('razorpay')){checkoutLoads++;return route.abort();}
    if(url.pathname.startsWith('/api/local-payment/')){localRequests++;return route.fulfill({status:404,body:''});}
    if(url.pathname.startsWith('/api/'))return mockAccount(route);
    if(url.origin!==prodOrigin)return route.abort();
    const pathname=url.pathname==='/pricing'?'/index.html':url.pathname,file=path.resolve(production,'.'+pathname);assert(file.startsWith(production+path.sep));
    try{return route.fulfill({contentType:({'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'})[path.extname(file)]||'application/octet-stream',body:await fs.readFile(file)});}catch{return route.fulfill({status:404,body:'Not found'});}
  });
  await page.goto(prodOrigin+'/pricing');await page.locator('.price-card').last().waitFor();
  assert.equal(await page.locator('.price-card').count(),3);assert.equal(await page.locator('.local-payment-test').count(),0);assert.equal(localRequests,0);assert.equal(checkoutLoads,0);
  const walk=async directory=>(await fs.readdir(directory,{withFileTypes:true})).flatMap(item=>item.isDirectory()?[]:[path.join(directory,item.name)]);
  for(const file of await walk(path.join(production,'assets')))if(/\.(?:js|css)$/.test(file)){
    const text=await fs.readFile(file,'utf8');assert(!text.includes('/api/local-payment/'));
  }
  reports.push({scenario:'production-disabled',passed:true});console.log('Production disabled: no test panel, Checkout loading or local API calls');await context.close();
}finally{await browser.close();await fs.writeFile(path.join(output,'browser-results.json'),JSON.stringify(reports,null,2));}
