// Isolated production UI checks. All payment requests and Checkout are simulated.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {plans,regions,trialPolicy} from '../commerce/catalog.mjs';

const root=path.resolve(import.meta.dirname,'..');
const production=path.join(root,'suite-hub/dist');
const output=path.join(root,'qa/deployment/output/public-payment-browser');
const origin='https://www.spanvisioninfra.com',api='/api/billing/payment-test/';
await fs.mkdir(path.join(output,'temp'),{recursive:true});
const sdk=`window.Razorpay=class {
  constructor(options){this.options=options;window.checkoutOptions=options;}
  on(){} close(){this.dialog?.remove();}
  open(){window.checkoutOpened=true;const d=this.dialog=document.createElement('div');
    d.setAttribute('role','dialog');d.setAttribute('aria-label','Simulated Razorpay');
    d.style.cssText='position:fixed;inset:15%;background:white;color:black;z-index:99999;padding:20px';
    const pay=document.createElement('button');pay.textContent='Simulate payment';
    pay.onclick=()=>{this.close();this.options.handler({razorpay_order_id:this.options.order_id,razorpay_payment_id:'pay_browser',razorpay_signature:'a'.repeat(64)});};
    const cancel=document.createElement('button');cancel.textContent='Cancel checkout';
    cancel.onclick=()=>{this.close();this.options.modal.ondismiss();};d.append(pay,cancel);document.body.append(d);
  }
};`;
const browser=await chromium.launch({channel:'msedge',headless:true,env:{...process.env,TEMP:path.join(output,'temp'),TMP:path.join(output,'temp')}});
const reports=[];
try{
  for(const [mode,width] of [['dark',1440],['light',320]]){
    for(const scenario of ['disabled','success','cancel','pending','refunded','verify-error','order-error','script-error','recover','existing-paid','existing-pending','amount-mismatch']){
      const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});
      const page=await context.newPage(),orders=[],verifies=[],statuses=[],errors=[],prohibited=[];
      let sdkLoads=0;
      page.on('pageerror',error=>errors.push(error.message));
      await context.route('**/*',async route=>{
        const url=new URL(route.request().url());
        if(url.hostname==='checkout.razorpay.com'){
          sdkLoads++;
          return scenario==='script-error'?route.abort():route.fulfill({contentType:'application/javascript',body:sdk});
        }
        if(url.origin!==origin){if(url.hostname.endsWith('razorpay.com'))prohibited.push(url.hostname);return route.abort();}
        const data={verified:true,status:'captured',paymentId:'pay_browser',orderId:'order_browser',amount:100,currency:'INR'};
        if(url.pathname===api+'config')return route.fulfill({json:{enabled:scenario!=='disabled',amount:100,currency:'INR',live:true}});
        if(url.pathname===api+'order'){
          orders.push(route.request().postDataJSON());
          if(scenario==='order-error')return route.fulfill({status:429,json:{error:'The payment test is busy. Please try again later.'}});
          return route.fulfill({json:{...data,verified:scenario==='existing-paid',status:scenario==='existing-paid'?'captured':scenario==='existing-pending'?'authorized':'unpaid',amount:scenario==='amount-mismatch'?200:100,keyId:'rzp_live_browserfixture',live:true}});
        }
        if(url.pathname===api+'verify'){
          verifies.push(route.request().postDataJSON());
          if(scenario==='verify-error')return route.fulfill({status:502,json:{error:'Payment status could not be reached.'}});
          return route.fulfill({json:{...data,verified:!['pending','refunded'].includes(scenario),status:scenario==='pending'?'authorized':scenario==='refunded'?'refunded':'captured'}});
        }
        if(url.pathname===api+'status'){
          statuses.push(route.request().postDataJSON());
          return route.fulfill({json:data});
        }
        if(url.pathname.startsWith('/api/local-payment/')){prohibited.push(url.pathname);return route.abort();}
        if(url.pathname==='/api/account/config')return route.fulfill({json:{authAvailable:false,databaseAvailable:false,pricingApproved:true,plans,regions,trialPolicy,checkoutAvailable:{IN:false,US:false,GB:false}}});
        if(url.pathname==='/api/account/session')return route.fulfill({json:{user:null}});
        if(url.pathname==='/api/account/tool-status')return route.fulfill({json:{trial:{status:'not_started'}}});
        if(url.pathname.startsWith('/api/'))return route.fulfill({status:503,json:{error:'Isolated browser check'}});
        const pathname=url.pathname==='/pricing'?'/index.html':url.pathname;
        const file=path.resolve(production,'.'+pathname);assert(file.startsWith(production+path.sep));
        try{return route.fulfill({contentType:({'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'})[path.extname(file)]||'application/octet-stream',body:await fs.readFile(file)});}
        catch{return route.fulfill({status:404,body:'Not found'});}
      });
      const configured=page.waitForResponse(response=>response.url()===origin+api+'config');
      await page.goto(origin+'/pricing?appearance='+mode);await configured;
      await page.locator('.price-card').last().waitFor();
      assert.equal(await page.locator('.price-card').count(),3);
      assert.match(await page.locator('.price-card').nth(0).innerText(),/Explorer trial/);
      assert.match(await page.locator('.price-card').nth(1).innerText(),/Studio/);
      assert.match(await page.locator('.price-card').nth(2).innerText(),/Team/);
      assert.equal(orders.length,0);assert.equal(sdkLoads,0);
      const panel=page.locator('.local-payment-test');
      if(scenario==='disabled')assert.equal(await panel.count(),0);
      else{
        await panel.getByRole('heading',{name:'Try a ₹1 payment'}).waitFor();
        assert.match(await panel.innerText(),/real ₹1/);assert.match(await panel.innerText(),/does not start a subscription/);
        await panel.scrollIntoViewIfNeeded();
        assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Pricing must fit the viewport');
        if(scenario==='success')await page.screenshot({path:path.join(output,mode+'-pricing.png')});
        if(scenario==='recover'){
          await panel.getByRole('button',{name:'Check payment status'}).click();
          await panel.getByRole('button',{name:'Payment verified'}).waitFor();
          assert.equal(orders.length,0);assert.equal(sdkLoads,0);assert.deepEqual(statuses,[{}]);
        }else{
          await panel.getByRole('button',{name:'Pay ₹1 · live test'}).click();
          if(['order-error','script-error','amount-mismatch'].includes(scenario)){
            await panel.getByRole('alert').waitFor();assert.equal(verifies.length,0);
            assert.equal(await page.evaluate(()=>!!window.checkoutOpened),false);
            assert(await panel.getByRole('button',{name:'Pay ₹1 · live test'}).isEnabled());
          }else if(scenario.startsWith('existing-')){
            if(scenario==='existing-paid')await panel.getByRole('button',{name:'Payment verified'}).waitFor();
            else{await panel.getByText(/capture is pending/).waitFor();assert(await panel.getByRole('button',{name:'Pay ₹1 · live test'}).isDisabled());}
            assert.equal(await page.evaluate(()=>!!window.checkoutOpened),false);assert.equal(orders.length,1);
          }else{
            const dialog=page.getByRole('dialog',{name:'Simulated Razorpay'});await dialog.waitFor();
            const options=await page.evaluate(()=>({amount:window.checkoutOptions.amount,currency:window.checkoutOptions.currency,order:window.checkoutOptions.order_id,key:window.checkoutOptions.key}));
            assert.deepEqual(options,{amount:100,currency:'INR',order:'order_browser',key:'rzp_live_browserfixture'});
            if(scenario==='cancel'){
              await dialog.getByRole('button',{name:'Cancel checkout'}).click();await panel.getByText(/Checkout closed/).waitFor();
              assert.equal(verifies.length,0);assert(await panel.getByRole('button',{name:'Pay ₹1 · live test'}).isEnabled());
            }else{
              await dialog.getByRole('button',{name:'Simulate payment'}).click();
              if(scenario==='success')await panel.getByRole('button',{name:'Payment verified'}).waitFor();
              else{
                if(scenario==='verify-error')await panel.getByRole('alert').waitFor();
                else await panel.getByText(scenario==='pending'?/capture is pending/:/refunded or reversed/).waitFor();
                assert(await panel.getByRole('button',{name:'Pay ₹1 · live test'}).isDisabled());
                await panel.getByRole('button',{name:'Check payment status'}).click();
                await panel.getByRole('button',{name:'Payment verified'}).waitFor();assert.deepEqual(statuses,[{}]);
              }
              assert.equal(verifies.length,1);assert.equal(verifies[0].razorpay_order_id,'order_browser');
            }
          }
          assert(orders.every(value=>JSON.stringify(value)==='{}'));
          assert.equal(orders.length,scenario==='script-error'?0:1);
        }
      }
      assert.deepEqual(prohibited,[]);assert.deepEqual(errors,[]);
      reports.push({mode,width,scenario,passed:true});console.log(mode+'/'+scenario+': passed');await context.close();
    }
  }
  for(const name of await fs.readdir(path.join(production,'assets')))if(/\.(?:js|css)$/.test(name)){
    const text=await fs.readFile(path.join(production,'assets',name),'utf8');
    assert(!text.includes('/api/local-payment/'));assert(!text.includes('LOCAL_RAZORPAY_KEY_SECRET'));
  }
}finally{
  await browser.close();await fs.writeFile(path.join(output,'results.json'),JSON.stringify(reports,null,2));
}
