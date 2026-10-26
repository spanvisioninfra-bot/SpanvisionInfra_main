// Isolated responses only: no real accounts, email, payments or trial usage.
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {plans,regions,trialPolicy} from '../commerce/catalog.mjs';

const root=path.resolve(import.meta.dirname,'..'),dist=path.join(root,'suite-hub/dist');
const output=path.join(root,'qa/deployment/output/hub-routing-2026-10-26');
await fs.mkdir(path.join(output,'temp'),{recursive:true});
const manifest=JSON.parse(await fs.readFile(path.join(root,'deployment/production.json')));
const origin='https://hub.example.test';
const member={id:'routing_member',email:'member@example.test',name:'Routing Member',emailVerified:true,role:'member'};
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'};
// A native middle-click can bypass interception for the first document request.
// Serve that case over real loopback HTTP rather than reaching the live website.
const staticServer=http.createServer(async(request,response)=>{
  const url=new URL(request.url,'http://127.0.0.1');
  let data;
  if(url.pathname==='/__suite/status')data=manifest;
  else if(url.pathname==='/api/account/config')data={authAvailable:false,pricingApproved:false,plans,regions,trialPolicy};
  else if(url.pathname.startsWith('/api/'))data={user:null};
  if(data){response.setHeader('Content-Type','application/json');response.end(JSON.stringify(data));return;}
  const file=path.resolve(dist,'.'+(url.pathname==='/'||!path.extname(url.pathname)?'/index.html':decodeURIComponent(url.pathname)));
  if(!file.startsWith(dist+path.sep)){response.writeHead(403);response.end();return;}
  try{const body=await fs.readFile(file);response.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');response.end(body);}
  catch{response.writeHead(404);response.end();}
});
await new Promise(resolve=>staticServer.listen(0,'127.0.0.1',resolve));
const staticOrigin='http://127.0.0.1:'+staticServer.address().port;
const browser=await chromium.launch({channel:'msedge',headless:true,env:{...process.env,TEMP:path.join(output,'temp'),TMP:path.join(output,'temp')}});
const reports=[];
try{
  for(const [mode,width]of [['dark',1440],['light',390]]){
    const context=await browser.newContext({viewport:{width,height:950},reducedMotion:'reduce'});
    const page=await context.newPage(),errors=[],handoffs=[],launches=[];
    page.setDefaultTimeout(12000);page.on('pageerror',error=>errors.push(error.message));
    let user=null;
    await context.route('**/*',async route=>{
      const request=route.request(),url=new URL(request.url());
      if(url.origin===staticOrigin)return route.continue();
      if(url.origin!==origin){
        if(url.pathname==='/__spanvision/access'){
          handoffs.push({method:request.method(),body:new URLSearchParams(request.postData()||'')});
          return route.fulfill({status:200,contentType:'text/html',body:'<h1>Tool opened</h1>'});
        }
        return route.abort();
      }
      let data;
      if(url.pathname==='/__suite/status')data=manifest;
      else if(url.pathname==='/api/account/config')data={authAvailable:true,authProvider:'neon',databaseAvailable:true,pricingApproved:true,plans,regions,trialPolicy};
      else if(url.pathname==='/api/account/session')data={user};
      else if(url.pathname==='/api/account/tool-status')data={access:{plan:user?.role==='super_admin'?'team':'explorer'},trial:{status:'not_started'}};
      else if(url.pathname==='/api/billing/status')data={subscriptions:[],access:{plan:'explorer',source:'free'}};
      else if(url.pathname==='/api/admin/users')data={users:[],page:1,hasNext:false,total:0};
      else if(url.pathname==='/api/account/sign-in'){
        const body=request.postDataJSON();
        user=body.email==='admin@example.test'?{...member,role:'super_admin'}:member;
        data={signedIn:true,redirectTo:user.role==='super_admin'?'/admin':'/account'};
      }else if(url.pathname==='/api/account/sign-up')data={verifyEmail:true};
      else if(url.pathname==='/api/account/recovery')data={sent:true};
      else if(url.pathname==='/api/account/verify'){
        if(request.postDataJSON().type==='recovery')data={recovery:true};
        else {user=member;data={signedIn:true,redirectTo:'/account'};}
      }else if(url.pathname==='/api/account/password'){user=member;data={signedIn:true,redirectTo:'/account'};}
      else if(url.pathname==='/api/account/sign-out'){user=null;data={signedOut:true};}
      else if(url.pathname==='/api/account/tool-launch'){
        launches.push(request.postDataJSON());
        if(!user)return route.fulfill({status:401,contentType:'application/json',body:JSON.stringify({error:'Please sign in to continue.'})});
        data={allowed:true,ticket:'isolated-routing-ticket',expiresAt:new Date(Date.now()+60000).toISOString()};
      }else if(url.pathname.startsWith('/api/'))throw new Error('Unexpected test API: '+url.pathname);
      if(data)return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
      const pathname=url.pathname.startsWith('/launch/')?'/launch.html':url.pathname==='/'||!path.extname(url.pathname)?'/index.html':decodeURIComponent(url.pathname);
      const file=path.resolve(dist,'.'+pathname);
      if(!file.startsWith(dist+path.sep))return route.fulfill({status:403,body:''});
      try{return route.fulfill({status:200,contentType:mime[path.extname(file)]||'application/octet-stream',body:await fs.readFile(file)});}
      catch{return route.fulfill({status:404,body:'Not found'});}
    });
    const record=name=>{reports.push({mode,width,check:name,passed:true});console.log(mode+'/'+name+': passed');};
    const at=async pathname=>{await page.waitForURL(url=>url.pathname===pathname&&!url.hash);};
    const headerLink=name=>page.locator('header nav').getByRole('link',{name,exact:true});
    const fillLogin=async(email='member@example.test')=>{
      await page.getByLabel('Email address',{exact:true}).fill(email);
      await page.locator('.identity-form input[name="password"]').fill('Fixture-Secure-Password-2026!');
      await page.locator('.identity-form').getByRole('button',{name:'Sign in',exact:false}).click();
    };
    try{
      await page.goto(origin+'/?appearance='+mode);
      await page.locator('#home-heading').waitFor();
      await page.evaluate(()=>{window.routingDocument='same-document';});
      for(const [name,pathname,selector]of [['Tools','/tools','.module-grid'],['Pricing','/pricing','.pricing-section'],['FAQ','/faq','.faq-section']]){
        assert.equal(await headerLink(name).getAttribute('href'),pathname);
        await headerLink(name).click();await at(pathname);await page.locator(selector).waitFor();
        assert.equal(await headerLink(name).getAttribute('aria-current'),'page');
        assert.equal(await page.evaluate(()=>window.routingDocument),'same-document');
        assert.equal(await page.evaluate(()=>document.activeElement.id),'main-content');
        assert.equal(await page.evaluate(()=>Math.round(scrollY)),0);
      }
      const length=await page.evaluate(()=>history.length);await headerLink('FAQ').click();assert.equal(await page.evaluate(()=>history.length),length);
      await page.goBack();await at('/pricing');await page.goBack();await at('/tools');await page.goForward();await at('/pricing');
      assert.equal(await page.evaluate(()=>window.routingDocument),'same-document');
      await page.reload();await page.locator('.pricing-grid').waitFor();assert.equal(await page.locator('html').getAttribute('data-sv-mode'),mode);
      record('navigation-without-reload-history-refresh-focus-and-theme');

      for(const [pathname,selector]of [
        ['/','.company-intro'],['/tools','.module-grid'],['/pricing','.pricing-section'],['/faq','.faq-section'],
        ['/login','.identity-form'],['/signup','.identity-form'],['/forgot-password','.identity-form'],['/verify-email','.identity-form'],
        ['/reset-password','.identity-form'],['/account','.signed-out-card'],['/profile','.profile-header'],['/admin','.signed-out-card'],
      ]){
        await page.goto(origin+pathname);await at(pathname);await page.locator(selector).waitFor();
        await page.reload();await page.locator(selector).waitFor();await at(pathname);
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
      }
      record('all-direct-page-links-and-reloads');

      for(const [suffix,pathname]of [
        ['/?checkout=returned#account','/account'],['/?appearance='+mode+'#faq','/faq'],['/#modules','/tools'],['/#suggestions','/tools'],
        ['/#reset','/reset-password'],['/faq/','/faq'],['/modules','/tools'],['/home','/'],
      ]){
        await page.goto(origin+suffix);await at(pathname);
        if(suffix.includes('checkout='))assert.equal(new URL(page.url()).searchParams.get('checkout'),'returned');
        if(suffix.includes('appearance='))assert.equal(new URL(page.url()).searchParams.get('appearance'),mode);
      }
      await page.goto(origin+'/missing-page');await page.getByRole('heading',{name:'Page not found.'}).waitFor();
      await page.getByRole('link',{name:'Back to overview'}).click();await at('/');
      record('legacy-bookmarks-aliases-and-unknown-pages');

      await page.goto(origin+'/signup');
      await page.getByLabel('Full name',{exact:true}).fill('Routing Member');
      await page.getByLabel('Email address',{exact:true}).fill(member.email);
      await page.locator('.identity-form input[name="password"]').fill('Fixture-Secure-Password-2026!');
      await page.getByLabel('Confirm password',{exact:true}).fill('Fixture-Secure-Password-2026!');
      await page.locator('.identity-form').getByRole('button',{name:'Create account',exact:false}).click();await at('/verify-email');
      assert.equal(await page.getByLabel('Email address',{exact:true}).inputValue(),member.email);
      await page.getByLabel('Email code').fill('123456');
      await page.locator('.identity-form').getByRole('button',{name:'Verify email',exact:false}).click();await at('/account');
      await page.getByRole('button',{name:'Sign out',exact:true}).click();await at('/login');
      record('signup-verification-and-signout');

      await page.getByRole('link',{name:'Forgot password?'}).click();await at('/forgot-password');
      await page.getByLabel('Email address',{exact:true}).fill(member.email);
      await page.locator('.identity-form').getByRole('button',{name:'Send reset code',exact:false}).click();await at('/verify-email');
      assert.equal(await page.getByLabel('Email address',{exact:true}).inputValue(),member.email);
      assert.equal(await page.getByLabel('Verification purpose').inputValue(),'recovery');
      await page.getByLabel('Email code').fill('123456');
      await page.locator('.identity-form').getByRole('button',{name:'Verify email',exact:false}).click();await at('/reset-password');
      await page.locator('.identity-form input[name="password"]').fill('Fixture-Secure-Password-2026!');
      await page.getByLabel('Confirm password',{exact:true}).fill('Fixture-Secure-Password-2026!');
      await page.locator('.identity-form').getByRole('button',{name:'Update password',exact:false}).click();await at('/account');
      await page.getByRole('button',{name:'Sign out',exact:true}).click();await at('/login');
      record('password-recovery-retains-form-context');

      await fillLogin('admin@example.test');await at('/admin');await page.getByRole('heading',{name:'Users & plan access.'}).waitFor();
      await page.locator('header').getByRole('link',{name:'My account',exact:true}).click();await at('/account');
      await page.getByRole('button',{name:'Sign out',exact:true}).click();await at('/login');
      record('admin-redirect-and-account-links');

      await page.goto(staticOrigin+'/');
      const [tab]=await Promise.all([context.waitForEvent('page'),headerLink('Tools').click({button:'middle'})]);
      tab.on('pageerror',error=>errors.push(error.message));
      await tab.bringToFront();await tab.waitForLoadState('domcontentloaded');
      await tab.locator('.module-grid').waitFor({timeout:12000});
      assert.equal(new URL(tab.url()).pathname,'/tools');
      assert.equal(new URL(page.url()).pathname,'/');await tab.close();
      await page.bringToFront();
      await page.locator('.skip-link').focus();await page.keyboard.press('Enter');
      assert.equal(await page.evaluate(()=>document.activeElement.id),'main-content');assert.equal(new URL(page.url()).hash,'');
      record('new-tab-and-skip-link');

      await page.goto(origin+'/launch.html?tool=frame&appearance='+mode);
      await page.locator('#splash-account').waitFor({state:'visible'});
      assert.equal(await page.locator('#splash-account').getAttribute('href'),'/login?returnTool=frame');
      await page.locator('#splash-account').click();await at('/login');
      await page.locator('.identity-switch').getByRole('link',{name:'Create an account'}).click();await at('/signup');
      assert.equal(new URL(page.url()).searchParams.get('returnTool'),'frame');
      await page.locator('.identity-switch').getByRole('link',{name:'Sign in',exact:true}).click();await at('/login');
      await fillLogin();await page.getByRole('heading',{name:'Tool opened'}).waitFor();
      assert.equal(handoffs.length,1);assert.equal(handoffs[0].method,'POST');assert.equal(handoffs[0].body.get('ticket'),'isolated-routing-ticket');
      assert.equal(launches.length,2,'only the explicit anonymous and signed-in launches reach the tool launcher');
      record('sign-in-returns-to-requested-tool');

      await page.goto(origin+'/faq');await page.locator('.faq-list').waitFor();
      for(const detail of await page.locator('.faq-list details').all()){
        await detail.locator('summary').click();assert(await detail.locator('p').isVisible());
      }
      assert.deepEqual(errors,[]);
      await page.screenshot({path:path.join(output,mode+'-faq.png'),animations:'disabled'});
      record('faq-answers-and-no-uncaught-errors');
    }finally{await context.close();}
  }
}finally{await browser.close();await new Promise(resolve=>staticServer.close(resolve));await fs.writeFile(path.join(output,'results.json'),JSON.stringify(reports,null,2)+'\n');}
