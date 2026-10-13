import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {plans,regions} from '../../commerce/catalog.mjs';
const origin=process.env.PREVIEW_URL||'http://127.0.0.1:4231',out=path.dirname(fileURLToPath(import.meta.url));
const admin={id:'22345678-1234-4234-8234-123456789abc',name:'Spanvision Admin',email:'spanvisioninfra.admin@gmail.com',role:'super_admin',emailVerified:true,permissions:['users:read','plans:write','plans:all']};
const member={id:'12345678-1234-4234-8234-123456789abc',name:'Test Engineer',email:'engineer@example.test',role:'member',emailVerified:true,permissions:[]};
const report={origin,verifiedAt:new Date().toISOString(),checks:[],passed:false};
const browser=await chromium.launch({channel:'chrome',headless:true});
async function check(name,run){try{await run();report.checks.push({name,passed:true});console.log(name+': PASS');}catch(error){report.checks.push({name,passed:false,error:error.message});console.log(name+': '+error.message);}}
async function mock(context,user){
  let override=null,audit=[],writes=[];const access=()=>override?{plan:override.plan_id,source:'admin',plans:['explorer','studio','team'],expiresAt:override.expires_at}:{plan:'studio',source:'subscription',plans:['explorer','studio'],expiresAt:'2030-01-01'};
  const subscription={user_id:member.id,provider:'stripe',plan_key:'STUDIO_MONTHLY_USD',status:'active',current_period_end:'2030-01-01'};
  await context.route('**/api/account/**',async route=>{
    const end=new URL(route.request().url()).pathname.split('/').at(-1);
    await route.fulfill({contentType:'application/json',body:JSON.stringify(end==='config'?{authAvailable:true,pricingApproved:false,plans,regions}:end==='session'?{user}:{signedOut:true})});
  });
  await context.route('**/api/billing/status',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({subscriptions:[],access:{plan:'team',plans:['explorer','studio','team'],source:'super_admin',expiresAt:null}})}));
  await context.route('**/api/admin/**',async route=>{
    if(user.role!=='super_admin'){await route.fulfill({status:403,contentType:'application/json',body:'{"error":"Super-admin access is required."}'});return;}
    const url=new URL(route.request().url());let body;
    if(url.pathname.endsWith('/users'))body={users:[{...member,subscriptions:[subscription],override,access:access()},{...admin,subscriptions:[],override:null,access:{plan:'team',plans:['explorer','studio','team'],source:'super_admin',expiresAt:null}}],page:1,perPage:50,hasNext:false,total:2};
    else if(url.pathname.endsWith('/user'))body={user:member,subscriptions:[subscription],override,access:access(),audit};
    else{
      const value=route.request().postDataJSON();writes.push(value);
      const before=override;override=value.plan?{user_id:member.id,plan_id:value.plan,expires_at:value.expiresAt,reason:value.reason}:null;
      audit=[{id:'audit_'+writes.length,actor_id:admin.id,action:value.plan?'grant':'clear',before_state:before,after_state:override,reason:value.reason,created_at:new Date().toISOString()},...audit];body={saved:true};
    }
    await route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
  });
  return {writes};
}
try{
  await check('Real unconfigured website: admin is hidden and anonymous API access is rejected',async()=>{
    const context=await browser.newContext();const page=await context.newPage();
    try{
      await page.goto(origin+'/#admin',{waitUntil:'networkidle'});
      await page.getByRole('heading',{name:'Super-admin access required.'}).waitFor();
      assert.equal(await page.locator('nav[aria-label="Main navigation"]').getByText('Admin',{exact:true}).count(),0);
      assert.equal((await context.request.get(origin+'/api/admin/users')).status(),401);
    }finally{await context.close();}
  });
  await check('Mocked admin UI: all-plan account, listing, validated grant, audit, clearing and focus',async()=>{
    const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});const provider=await mock(context,admin),page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    try{
      await page.goto(origin+'/#account',{waitUntil:'networkidle'});await page.getByText('Super admin · All plans',{exact:true}).waitFor();
      await page.getByRole('link',{name:/Manage users & plans/}).click();await page.locator('.admin-user').last().waitFor();
      assert.equal(await page.locator('.admin-user').count(),2);
      const view=page.locator('.admin-user').first().getByRole('button',{name:/View plans/});await view.click();await page.locator('.admin-plan-form').waitFor();
      await page.locator('select[name="plan"]').selectOption('team');await page.locator('input[name="expires"]').fill('2030-01-01');
      await page.getByRole('button',{name:/Save plan access/}).click();assert.equal(provider.writes.length,0,'A reason is required');
      await page.locator('textarea[name="reason"]').fill('Team access for evaluation');await page.getByRole('button',{name:/Save plan access/}).click();
      await page.getByText('Plan access saved. Payment-provider billing was not changed.',{exact:true}).waitFor();
      assert.equal(provider.writes[0].userId,member.id);assert.equal(provider.writes[0].plan,'team');assert.equal(provider.writes[0].expiresAt,'2030-01-01T23:59:59.999Z');
      await page.locator('.admin-detail-section').getByText('Team granted',{exact:true}).waitFor();
      await page.locator('select[name="plan"]').selectOption('inherit');await page.locator('textarea[name="reason"]').fill('Restore paid subscription access');await page.getByRole('button',{name:/Save plan access/}).click();
      await page.locator('.admin-detail-section').getByText('Manual grant cleared',{exact:true}).waitFor();assert.equal(provider.writes[1].plan,null);
      await page.keyboard.press('Escape');assert(await view.evaluate(el=>el===document.activeElement));
      await page.getByRole('searchbox',{name:'Search this page'}).fill('not-a-user');assert.equal(await page.locator('.admin-user').count(),0);
      await page.getByRole('searchbox',{name:'Search this page'}).fill('');
      for(const mode of ['dark','light']){await page.locator('#sv-color-mode').selectOption(mode);await page.screenshot({path:path.join(out,`admin-${mode}-mocked.png`),fullPage:true});}
      for(const width of [320,390]){
        await page.setViewportSize({width,height:844});
        for(const mode of ['dark','light']){
          await page.locator('#sv-color-mode').selectOption(mode);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
          await page.locator('.admin-user').first().getByRole('button',{name:/View plans/}).click();await page.locator('.admin-plan-form').waitFor();
          assert.equal(await page.locator('.admin-plan-dialog').evaluate(el=>el.scrollWidth>el.clientWidth+1),false);await page.keyboard.press('Escape');
        }
      }
      await page.screenshot({path:path.join(out,'admin-mobile-mocked.png'),fullPage:true});assert.deepEqual(errors,[]);
    }finally{await context.close();}
  });
  await check('Mocked member UI: direct admin navigation does not request private user data',async()=>{
    const context=await browser.newContext();await mock(context,member);const page=await context.newPage();let privateRequests=0;
    page.on('request',request=>{if(new URL(request.url()).pathname.startsWith('/api/admin/'))privateRequests++;});
    try{
      await page.goto(origin+'/#admin',{waitUntil:'networkidle'});await page.getByRole('heading',{name:'Super-admin access required.'}).waitFor();
      assert.equal(await page.locator('.admin-user').count(),0);assert.equal(privateRequests,0);
    }finally{await context.close();}
  });
  report.passed=report.checks.every(item=>item.passed);await fs.writeFile(path.join(out,process.env.REPORT_NAME||'admin-results.json'),JSON.stringify(report,null,2));
  if(!report.passed)process.exitCode=1;
}finally{await browser.close();}
