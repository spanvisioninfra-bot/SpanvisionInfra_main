// Controlled responses only: no production login, database write or payment.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {plans,regions,trialPolicy,trialComingSoonTools} from '../commerce/catalog.mjs';

const root=path.resolve(import.meta.dirname,'..'),dist=path.join(root,'suite-hub/dist');
const output=path.join(root,'qa/deployment/output/tool-trial-2026-10-22');
await fs.mkdir(path.join(output,'temp'),{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true,env:{...process.env,TEMP:path.join(output,'temp'),TMP:path.join(output,'temp')}});
const manifest=JSON.parse(await fs.readFile(path.join(root,'deployment/production.json')));
const origin='https://www.spanvisioninfra.com';
const user={id:'browser_trial_member',email:'member@example.test',name:'Member',emailVerified:true,role:'member'};
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.woff2':'font/woff2'};
const reports=[];
try{
  for(const [mode,width] of [['dark',1440],['light',390]]){
    for(const scenario of ['anonymous','daily_limit','daily_limit_second','expired','allowed','retry','account','pricing','catalog','catalog_guest','catalog_paid','catalog_admin','coming_soon_bim','coming_soon_stl','coming_soon_fem','backend_paid','backend_admin']){
      const context=await browser.newContext({viewport:{width,height:950},reducedMotion:'reduce'});
      const page=await context.newPage(),errors=[],launches=[],handoffs=[],warmups=[];
      const isAdmin=['catalog_admin','backend_admin'].includes(scenario),isPaid=['catalog_paid','backend_paid'].includes(scenario);
      page.on('pageerror',error=>errors.push(error.message));
      await page.route('**/*',async route=>{
        const url=new URL(route.request().url());
        if(['https://spanvision-frame.vercel.app','https://spanvision-fem.vercel.app','https://spanvision-bim.onrender.com','https://spanvision-stl.onrender.com'].includes(url.origin)){
          handoffs.push({url:url.href,method:route.request().method(),body:new URLSearchParams(route.request().postData()||'')});
          return route.fulfill({status:200,contentType:'text/html',body:'<h1>Tool launched</h1>'});
        }
        if(url.origin!==origin)return route.abort();
        let data;
        if(url.pathname==='/__suite/status')data=manifest;
        else if(url.pathname==='/api/account/config')data={authAvailable:true,authProvider:'neon',databaseAvailable:true,pricingApproved:true,trialPolicy,plans,regions,checkoutAvailable:{IN:true,US:true,GB:true}};
        else if(url.pathname.startsWith('/__suite/ready/')){warmups.push(url.pathname);data={status:'ok',app:'spanvision-stl-3d-map-workspace'};}
        else if(url.pathname==='/api/account/session')data={user:['anonymous','catalog_guest'].includes(scenario)?null:{...user,role:isAdmin?'super_admin':'member'}};
        else if(url.pathname==='/api/account/tool-launch'){
          launches.push(route.request().postDataJSON());
          if(scenario==='anonymous')return route.fulfill({status:401,contentType:'application/json',body:JSON.stringify({error:'Please sign in to continue.'})});
          if(scenario==='retry'&&launches.length===1)return route.abort();
          data=['allowed','retry','backend_paid','backend_admin'].includes(scenario)?{allowed:true,ticket:'isolated-browser-ticket',expiresAt:new Date(Date.now()+60000).toISOString()}:{allowed:false,trial:{status:scenario==='daily_limit_second'?'daily_limit':scenario,day:scenario==='daily_limit_second'?2:1,nextResetAt:new Date(Date.now()+3600000).toISOString()}};
        }else if(url.pathname==='/api/billing/status')data={subscriptions:[],access:{plan:'explorer',source:'free'}};
        else if(url.pathname==='/api/account/tool-status')data={policy:trialPolicy,access:{plan:isAdmin?'team':isPaid?'studio':'explorer'},trial:{status:'available',remaining:1,day:1,expiresAt:new Date(Date.now()+3600000).toISOString()}};
        else if(url.pathname.startsWith('/api/'))throw new Error('Unexpected test endpoint: '+url.pathname);
        if(data)return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
        const pathname=url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname),file=path.resolve(dist,'.'+pathname);
        if(!file.startsWith(dist+path.sep))return route.fulfill({status:403,body:''});
        try{return route.fulfill({status:200,contentType:mime[path.extname(file)]||'application/octet-stream',body:await fs.readFile(file)});}
        catch{return route.fulfill({status:404,body:'Not found'});}
      });
      try{
        const tool=scenario.startsWith('coming_soon_')?scenario.slice('coming_soon_'.length):scenario.startsWith('backend_')?'fem':'frame';
        const start=scenario.startsWith('catalog')?'/?appearance='+mode+'#modules':scenario==='account'?'/?appearance='+mode+'#account':scenario==='pricing'?'/?appearance='+mode+'#pricing':'/launch.html?tool='+tool+'&appearance='+mode;
        await page.goto(origin+start);
        if(scenario.startsWith('catalog')){
          await page.locator('.module-card').last().waitFor();
          const cards=page.locator('.module-card');
          assert.equal(await cards.count(),16);
          if(isPaid||isAdmin){
            for(const id of trialComingSoonTools)await page.locator(`[data-module="${id}"] a`).waitFor();
            assert.equal(await cards.getByRole('button',{name:'Coming soon',exact:true}).count(),0);
            assert.equal(await cards.locator('a').count(),16);
          }else{
            await page.locator('[data-module="cad"] a').waitFor();
            assert.equal(await cards.getByRole('button',{name:'Coming soon',exact:true}).count(),3);
            for(const id of trialComingSoonTools){
              const card=page.locator(`[data-module="${id}"]`);
              assert(await card.getByRole('button',{name:'Coming soon',exact:true}).isDisabled());
              assert.equal(await card.locator('a').count(),0);
              assert.match(await card.innerText(),/Not included in the trial/);
            }
            assert.equal(await cards.locator('a').count(),13);
          }
          assert.match(await page.locator('.company-catalog').innerText(),/trial includes 13 tools/);
          assert.equal(launches.length,0);
        }else if(scenario.startsWith('coming_soon_')){
          await page.locator('.tool-splash[data-state=error]').waitFor();
          assert.match(await page.locator('#splash-status').innerText(),/Coming soon.*not included in the trial/);
          assert(await page.locator('#splash-retry').isHidden());
          assert.equal(launches.length,0,'blocked backend must not request a trial launch');
          assert.equal(warmups.length,0,'blocked backend must not be woken up');
          assert.equal(handoffs.length,0);
        }else if(scenario==='anonymous'){
          await page.getByText('Please sign in to continue.',{exact:true}).waitFor();
          assert(await page.locator('#splash-account').isVisible());assert.equal(handoffs.length,0);
          assert((await page.locator('#splash-account').getAttribute('href')).includes('returnTool=frame'));
        }else if(['daily_limit','daily_limit_second','expired'].includes(scenario)){
          await page.locator('.tool-splash[data-state=error]').waitFor();
          assert(await page.locator('#splash-plans').isVisible());
          assert.match(await page.locator('#splash-status').innerText(),scenario==='expired'?/trial has ended/:/3 trial launches/);
          if(scenario==='daily_limit_second')assert(!(await page.locator('#splash-status').innerText()).includes('next trial day'));
          assert.equal(handoffs.length,0);
        }else if(['allowed','retry','backend_paid','backend_admin'].includes(scenario)){
          if(scenario==='retry'){await page.locator('.tool-splash[data-state=error]').waitFor();await page.locator('#splash-retry').click();}
          await page.getByRole('heading',{name:'Tool launched'}).waitFor();
          assert.equal(handoffs.length,1);assert.equal(handoffs[0].method,'POST');
          assert.equal(handoffs[0].body.get('ticket'),'isolated-browser-ticket');
          assert(handoffs[0].body.get('next').includes('appearance='+mode));
          assert(!handoffs[0].url.includes('ticket'));
          assert.equal(new Set(launches.map(item=>item.requestId)).size,1,'retry keeps its idempotency key');
          if(scenario.startsWith('backend_'))assert.equal(warmups.length,1);
        }else if(scenario==='account'){
          await page.getByText('Trial day 1 of 2 · 1 launch remaining',{exact:true}).waitFor();
          assert(!(await page.locator('body').innerText()).includes('remain free to use'));
        }else{
          await page.getByRole('heading',{name:'Explorer trial',exact:true}).waitFor();
          assert(await page.getByText('two-day trial',{exact:true}).isVisible());
          assert(!(await page.locator('body').innerText()).includes('always free'));
          await page.getByRole('button',{name:'Choose this plan'}).first().click();
          assert(await page.getByRole('dialog').isVisible());
          assert.match(await page.getByRole('dialog').innerText(),/Studio, your way/);
        }
        assert.deepEqual(errors,[]);
        await page.screenshot({path:path.join(output,`${mode}-${scenario}.png`)});
        reports.push({mode,width,scenario,passed:true});
        console.log(`${mode}/${scenario}: passed`);
      }finally{await context.close();}
    }
  }
}finally{
  await browser.close();await fs.writeFile(path.join(output,'browser-results.json'),JSON.stringify(reports,null,2)+'\n');
}
