import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {plans,regions} from '../../commerce/catalog.mjs';
const origin=process.env.PREVIEW_URL||'http://127.0.0.1:4231';
const out=path.dirname(fileURLToPath(import.meta.url));
const report={verifiedAt:new Date().toISOString(),origin,checks:[],passed:false};
const browser=await chromium.launch({channel:'chrome',headless:true});
async function check(name,callback){try{await callback();report.checks.push({name,passed:true});console.log(name+': PASS');}catch(error){report.checks.push({name,passed:false,error:error.message});console.log(name+': '+error.message);}}
try{
  await check('Real preview: themes, pricing regions, annual totals, plan dialog and anonymous tools',async()=>{
    const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
    const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    try{
      await page.goto(origin,{waitUntil:'networkidle'});
      assert.equal(await page.locator('html').getAttribute('data-sv-mode'),'dark');
      await page.locator('.skip-link').focus();await page.keyboard.press('Enter');
      assert.equal(await page.locator('#main-content').evaluate(el=>el===document.activeElement),true);
      assert.equal(await page.locator('.marketing-home').count(),1);
      assert.equal(await page.locator('h1').innerText(),'Spanvision Infra');
      assert.equal(await page.locator('.company-architecture').count(),1);
      assert.equal(await page.locator('.module-card').count(),0,'Home should open before the toolkit');
      await page.locator('.home-account-actions').getByRole('link',{name:'Sign in',exact:true}).click();
      await page.getByRole('heading',{name:'Welcome back.'}).waitFor();
      await page.locator('nav[aria-label="Main navigation"]').getByText('FAQ',{exact:true}).click();
      await page.getByRole('heading',{name:'Frequently asked questions.'}).waitFor();
      await page.getByText('How do I open a tool?',{exact:true}).click();
      assert.match(await page.locator('.faq-list details').last().innerText(),/splash screen/);
      await page.locator('nav[aria-label="Main navigation"]').getByText('Pricing',{exact:true}).click();
      for(const [id,text] of [['IN','₹999'],['US','$19'],['GB','£15']]){
        await page.locator('.region-selector select').selectOption(id);
        assert.equal(await page.locator('.price-card.featured .plan-price strong').innerText(),text);
      }
      await page.getByRole('button',{name:/Annually/}).click();
      assert.equal(await page.locator('.price-card.featured .plan-price strong').innerText(),'£150');
      const preview=page.locator('.price-card.featured').getByRole('button',{name:/Preview this plan/});
      await preview.click();await page.locator('.checkout-dialog').waitFor({state:'visible'});
      assert.match(await page.locator('.checkout-dialog').innerText(),/No payment will be taken/);
      await page.keyboard.press('Escape');assert(await preview.evaluate(el=>el===document.activeElement));
      for(const mode of ['light','dark']){
        await page.locator('#sv-color-mode').selectOption(mode);
        assert.equal(await page.locator('html').getAttribute('data-sv-mode'),mode);
        await page.screenshot({path:path.join(out,`pricing-${mode}.png`),fullPage:true});
      }
      await page.locator('nav[aria-label="Main navigation"]').getByText('Tools',{exact:true}).click();
      await page.locator('.module-card').last().waitFor({state:'visible'});
      assert.equal(await page.locator('.module-card').count(),16);
      await page.locator('nav[aria-label="Main navigation"]').getByText('Home',{exact:true}).click();
      await page.getByText('Can I explore without an account?',{exact:true}).click();
      assert.equal(await page.locator('.faq-list details').first().getAttribute('open'),'');
      assert.deepEqual(errors,[]);
      await page.screenshot({path:path.join(out,'home-preserved-dark.png')});
    }finally{await context.close();}
  });
  await check('Real preview: sign-up validation and honest unconfigured-account response',async()=>{
    const context=await browser.newContext();const page=await context.newPage();
    try{
      await page.goto(origin+'/#signup',{waitUntil:'networkidle'});
      let submissions=0;page.on('request',request=>{if(request.method()==='POST'&&request.url().includes('/api/account/'))submissions++;});
      const submit=page.getByRole('button',{name:/Online accounts unavailable/});
      await submit.waitFor();assert(await submit.isDisabled());
      await page.getByRole('textbox',{name:'Full name'}).fill('Preview Engineer');
      await page.getByRole('textbox',{name:'Email address'}).fill('preview@example.test');
      await page.locator('input[name="password"]').fill('strong-test-password');
      await page.locator('input[name="confirm"]').fill('strong-test-password');
      await page.locator('form.identity-form').evaluate(form=>form.requestSubmit());
      assert.equal(submissions,0,'Unconfigured authentication must not submit credentials');
      assert(await page.getByRole('link',{name:/Create local profile/}).isVisible());
      await page.getByRole('button',{name:'Show password'}).click();
      assert.equal(await page.locator('input[name="password"]').getAttribute('type'),'text');
      await page.getByRole('button',{name:'Hide password'}).click();
      assert.equal(await page.locator('input[name="password"]').getAttribute('type'),'password');
    }finally{await context.close();}
  });
  await check('Mobile widths: home, pricing, sign-in and sign-up in both themes',async()=>{
    const context=await browser.newContext({reducedMotion:'reduce'});const page=await context.newPage();
    try{
      for(const width of [320,390]){
        await page.setViewportSize({width,height:844});
        for(const route of ['landing','modules','pricing','faq','login','signup']){
          await page.goto(origin+'/#'+route,{waitUntil:'networkidle'});
          for(const mode of ['dark','light']){
            await page.locator('#sv-color-mode').selectOption(mode);
            assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`${route} ${mode} overflows at ${width}px`);
          }
        }
      }
      await page.screenshot({path:path.join(out,'signup-mobile-light.png'),fullPage:true});
    }finally{await context.close();}
  });
  await check('UI contract with mocked provider: sign-up verification, sign-in, recovery and sign-out',async()=>{
    const context=await browser.newContext({reducedMotion:'reduce'});const page=await context.newPage();let signedIn=false;
    await page.route('**/api/account/**',async route=>{
      const endpoint=new URL(route.request().url()).pathname.split('/').at(-1);
      const user={id:'12345678-1234-4234-8234-123456789abc',name:'Test Engineer',email:'engineer@example.test'};
      let body;
      if(endpoint==='config')body={authAvailable:true,pricingApproved:false,plans,regions};
      else if(endpoint==='session')body={user:signedIn?user:null};
      else if(endpoint==='sign-up')body={verifyEmail:true};
      else if(endpoint==='verify'){signedIn=true;body={signedIn:true,recovery:route.request().postDataJSON().type==='recovery'};}
      else if(endpoint==='sign-in'){signedIn=true;body={signedIn:true};}
      else if(endpoint==='sign-out'){signedIn=false;body={signedOut:true};}
      else body={sent:true,updated:true};
      await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
    });
    await page.route('**/api/billing/status',route=>route.fulfill({status:200,contentType:'application/json',body:'{"subscriptions":[]}'}));
    try{
      await page.goto(origin+'/#signup',{waitUntil:'networkidle'});
      await page.locator('input[name="name"]').fill('Test Engineer');await page.locator('input[name="email"]').fill('engineer@example.test');
      for(const name of ['password','confirm'])await page.locator(`input[name="${name}"]`).fill('strong-test-password');
      await page.getByRole('button',{name:/Create account/}).click();await page.waitForURL('**/#verify');
      await page.locator('input[name="code"]').fill('123456');await page.getByRole('button',{name:/Verify email/}).click();
      await page.waitForURL('**/#account');await page.getByRole('heading',{name:'Hello, Test Engineer.'}).waitFor();
      await page.getByRole('button',{name:'Sign out',exact:true}).click();await page.waitForURL('**/#login');
      await page.locator('input[name="email"]').fill('engineer@example.test');await page.locator('input[name="password"]').fill('strong-test-password');
      await page.locator('.identity-form').getByRole('button',{name:/^Sign in/}).click();await page.waitForURL('**/#account');
      await page.getByRole('button',{name:'Sign out',exact:true}).click();await page.waitForURL('**/#login');
      await page.getByText('Forgot password?',{exact:true}).click();await page.waitForURL('**/#forgot');
      await page.locator('input[name="email"]').fill('engineer@example.test');await page.getByRole('button',{name:/Send reset code/}).click();
      await page.waitForURL('**/#verify');await page.locator('input[name="code"]').fill('654321');await page.getByRole('button',{name:/Verify email/}).click();
      await page.waitForURL('**/#reset');for(const name of ['password','confirm'])await page.locator(`input[name="${name}"]`).fill('new-strong-password');
      await page.getByRole('button',{name:/Update password/}).click();await page.waitForURL('**/#account');
      assert.equal(await page.evaluate(()=>Object.keys(localStorage).some(key=>key.includes('token'))),false);
    }finally{await context.close();}
  });
  report.passed=report.checks.every(check=>check.passed);
  await fs.writeFile(path.join(out,process.env.REPORT_NAME||'results.json'),JSON.stringify(report,null,2));
  if(!report.passed)process.exitCode=1;
}finally{await browser.close();}
