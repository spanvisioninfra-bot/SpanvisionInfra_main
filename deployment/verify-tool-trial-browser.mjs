// Controlled responses only: no production login, database write or payment.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {plans,regions} from '../commerce/catalog.mjs';

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
    for(const scenario of ['anonymous','daily_limit','daily_limit_second','expired','allowed','retry','account','pricing']){
      const context=await browser.newContext({viewport:{width,height:950},reducedMotion:'reduce'});
      const page=await context.newPage(),errors=[],launches=[],handoffs=[];
      page.on('pageerror',error=>errors.push(error.message));
      await page.route('**/*',async route=>{
        const url=new URL(route.request().url());
        if(url.origin==='https://spanvision-frame.vercel.app'){
          handoffs.push({url:url.href,method:route.request().method(),body:new URLSearchParams(route.request().postData()||'')});
          return route.fulfill({status:200,contentType:'text/html',body:'<h1>Tool launched</h1>'});
        }
        if(url.origin!==origin)return route.abort();
        let data;
        if(url.pathname==='/__suite/status')data=manifest;
        else if(url.pathname==='/api/account/config')data={authAvailable:true,authProvider:'neon',databaseAvailable:true,pricingApproved:true,plans,regions,checkoutAvailable:{IN:true,US:true,GB:true}};
        else if(url.pathname==='/api/account/session')data={user:scenario==='anonymous'?null:user};
        else if(url.pathname==='/api/account/tool-launch'){
          launches.push(route.request().postDataJSON());
          if(scenario==='anonymous')return route.fulfill({status:401,contentType:'application/json',body:JSON.stringify({error:'Please sign in to continue.'})});
          if(scenario==='retry'&&launches.length===1)return route.abort();
          data=['allowed','retry'].includes(scenario)?{allowed:true,ticket:'isolated-browser-ticket',expiresAt:new Date(Date.now()+60000).toISOString()}:{allowed:false,trial:{status:scenario==='daily_limit_second'?'daily_limit':scenario,day:scenario==='daily_limit_second'?2:1,nextResetAt:new Date(Date.now()+3600000).toISOString()}};
        }else if(url.pathname==='/api/billing/status')data={subscriptions:[],access:{plan:'explorer',source:'free'}};
        else if(url.pathname==='/api/account/tool-status')data={access:{plan:'explorer'},trial:{status:'available',remaining:1,day:1,expiresAt:new Date(Date.now()+3600000).toISOString()}};
        else if(url.pathname.startsWith('/api/'))throw new Error('Unexpected test endpoint: '+url.pathname);
        if(data)return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
        const pathname=url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname),file=path.resolve(dist,'.'+pathname);
        if(!file.startsWith(dist+path.sep))return route.fulfill({status:403,body:''});
        try{return route.fulfill({status:200,contentType:mime[path.extname(file)]||'application/octet-stream',body:await fs.readFile(file)});}
        catch{return route.fulfill({status:404,body:'Not found'});}
      });
      try{
        const start=scenario==='account'?'/?appearance='+mode+'#account':scenario==='pricing'?'/?appearance='+mode+'#pricing':'/launch.html?tool=frame&appearance='+mode;
        await page.goto(origin+start);
        if(scenario==='anonymous'){
          await page.getByText('Please sign in to continue.',{exact:true}).waitFor();
          assert(await page.locator('#splash-account').isVisible());assert.equal(handoffs.length,0);
          assert((await page.locator('#splash-account').getAttribute('href')).includes('returnTool=frame'));
        }else if(['daily_limit','daily_limit_second','expired'].includes(scenario)){
          await page.locator('.tool-splash[data-state=error]').waitFor();
          assert(await page.locator('#splash-plans').isVisible());
          assert.match(await page.locator('#splash-status').innerText(),scenario==='expired'?/trial has ended/:/3 trial launches/);
          if(scenario==='daily_limit_second')assert(!(await page.locator('#splash-status').innerText()).includes('next trial day'));
          assert.equal(handoffs.length,0);
        }else if(['allowed','retry'].includes(scenario)){
          if(scenario==='retry'){await page.locator('.tool-splash[data-state=error]').waitFor();await page.locator('#splash-retry').click();}
          await page.getByRole('heading',{name:'Tool launched'}).waitFor();
          assert.equal(handoffs.length,1);assert.equal(handoffs[0].method,'POST');
          assert.equal(handoffs[0].body.get('ticket'),'isolated-browser-ticket');
          assert(handoffs[0].body.get('next').includes('appearance='+mode));
          assert(!handoffs[0].url.includes('ticket'));
          assert.equal(new Set(launches.map(item=>item.requestId)).size,1,'retry keeps its idempotency key');
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
