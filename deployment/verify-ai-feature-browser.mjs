// Controlled hosted sessions only; never calls a real AI provider or spends a trial launch.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {toolFeatures} from '../commerce/catalog.mjs';
const root=path.resolve(import.meta.dirname,'..');
const output=path.join(root,'qa/deployment/output/ai-features-2026-10-23');
await fs.mkdir(output,{recursive:true});
await fs.mkdir(path.join(output,'temp'),{recursive:true});
const brand=JSON.parse(await fs.readFile(path.join(root,'branding/brand.json')));
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.wasm':'application/wasm','.json':'application/json','.woff2':'font/woff2','.svg':'image/svg+xml','.png':'image/png'};
const browser=await chromium.launch({channel:'msedge',headless:true,env:{...process.env,TEMP:path.join(output,'temp'),TMP:path.join(output,'temp')}});
const results=[];
try{
  for(const tool of ['frame','calc','pdf','speech'])for(const source of ['trial','subscription'])for(const mode of ['dark','light']){
    const module=brand.modules.find(item=>item.id===tool),dist=path.join(root,module.directory,module.dist);
    const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
    const page=await context.newPage(),unexpected=[],errors=[];
    page.setDefaultTimeout(20000);page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/*',async route=>{
      const url=new URL(route.request().url());
      if(url.origin!=='https://tool.example'){
        if(/anthropic|openai|huggingface|11434/.test(url.href))unexpected.push(url.href);
        return route.abort();
      }
      if(url.pathname==='/__spanvision/session')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({allowed:true,expiresAt:new Date(Date.now()+3600000).toISOString(),features:toolFeatures(tool,source)})});
      if(url.pathname.startsWith('/api/')){unexpected.push(url.pathname);return route.fulfill({status:404,body:'No API calls expected'});}
      const file=path.resolve(dist,'.'+(url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname)));
      if(!file.startsWith(dist+path.sep))return route.fulfill({status:403,body:''});
      try{return route.fulfill({status:200,contentType:mime[path.extname(file)]||'application/octet-stream',body:await fs.readFile(file)});}
      catch{return route.fulfill({status:404,body:'Not found'});}
    });
    try{
      await page.goto('https://tool.example/?appearance='+mode+'&launch=workspace');
      let input,send,notice;
      if(tool==='frame'){
        await page.getByRole('button',{name:'AI',exact:true}).click();
        input=page.locator('.ai-assistant textarea');send=page.locator('.ai-assistant .send-btn');notice=page.locator('.ai-assistant [role=status]');
      }else if(tool==='calc'||tool==='pdf'){
        await page.locator('.chat-fab').click();
        input=page.locator('.chat-input');send=page.locator('.chat-send');notice=page.locator('.chat-messages [role=status]');
      }else{
        await page.getByRole('button',{name:'Import audio',exact:false}).first().click();
        send=page.getByRole('button',{name:'Transcribe recording',exact:true});notice=page.locator('dialog[open] [role=status]');
      }
      await send.waitFor();
      if(source==='trial'){
        await notice.filter({hasText:'Coming soon'}).waitFor();
        assert(await send.isDisabled(),tool+' trial AI action must stay disabled');
        if(input)assert(await input.isDisabled());
      }else if(input){
        await input.fill('Test AI availability');assert(await send.isEnabled());
        assert.equal(await notice.filter({hasText:'Coming soon'}).count(),0);
      }else{
        await page.waitForFunction(()=>!document.querySelector('dialog[open] .dialog-actions .btn-primary')?.disabled);
        assert(await send.isEnabled());
      }
      assert.equal(await page.locator('[aria-label="Tool access"]').count(),0,'AI restrictions must not lock the tool');
      assert.deepEqual(unexpected,[],'UI check must not invoke AI providers, load AI models or spend launches');
      assert.deepEqual(errors,[]);
      await page.screenshot({path:path.join(output,`${tool}-${source}-${mode}.png`)});
      results.push({tool,source,mode,passed:true});console.log(`${tool}/${source}/${mode}: passed`);
    }catch(error){
      await page.screenshot({path:path.join(output,`${tool}-${source}-${mode}-failure.png`)});
      console.error({tool,source,mode,errors,body:(await page.locator('body').innerText()).slice(0,2000)});throw error;
    }finally{await context.close();}
  }
}finally{await browser.close();await fs.writeFile(path.join(output,'ai-browser-results.json'),JSON.stringify(results,null,2)+'\n');}
