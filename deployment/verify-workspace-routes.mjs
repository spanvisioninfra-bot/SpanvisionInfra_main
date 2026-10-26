// Test packaged editors with controlled access and local static files only.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const root=path.resolve(import.meta.dirname,'..');
const brand=JSON.parse(await fs.readFile(path.join(root,'branding/brand.json')));
const output=path.join(root,'qa/deployment/output/workspace-routes-2026-10-26');
await fs.mkdir(path.join(output,'temp'),{recursive:true});
const mime={'.html':'text/html','.js':'application/javascript','.mjs':'application/javascript','.css':'text/css','.wasm':'application/wasm','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.woff2':'font/woff2','.ico':'image/x-icon'};
const origin='https://tool.example';
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader'],env:{...process.env,TEMP:path.join(output,'temp'),TMP:path.join(output,'temp')}});
const results=[];
const selected=(process.env.TOOL_ROUTE_IDS||'').split(',').filter(Boolean);
try{
  for(const tool of brand.modules.filter(tool=>!selected.length||selected.includes(tool.id)))for(const mode of ['dark','light']){
    const directory=path.join(root,'qa/deployment/output',tool.id,'.vercel/output/static');
    const context=await browser.newContext({viewport:{width:1440,height:950},reducedMotion:'reduce'});
    await context.addCookies([{name:'sv-appearance',value:mode,url:origin,secure:true,sameSite:'Lax'}]);
    const page=await context.newPage(),errors=[],missing=[];
    page.setDefaultTimeout(25000);page.on('pageerror',error=>errors.push(error.message));
    await context.route('**/*',async route=>{
      const url=new URL(route.request().url());
      if(url.origin!==origin)return route.abort();
      if(url.pathname==='/__spanvision/session')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({allowed:true,tool:tool.id,expiresAt:new Date(Date.now()+3600000).toISOString(),features:{ai:{available:false,status:'coming_soon'}}})});
      if(url.pathname.startsWith('/api/')){
        if(url.pathname==='/api/info')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({version:'1.0',cloud:true,output_dir:'Browser download',building_source:'3DBAG (regional)'})});
        if(url.pathname==='/api/ping')return route.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'});
        return route.fulfill({status:503,contentType:'application/json',body:'{"error":"Isolated URL check","detail":"Isolated URL check"}'});
      }
      let pathname=decodeURIComponent(url.pathname);
      if(tool.id==='stl')pathname=pathname.replace(/^\/static\//,'/');
      if(pathname==='/'||!path.extname(pathname))pathname=tool.id==='cad'?'/app/index.html':'/index.html';
      const file=path.resolve(directory,'.'+pathname);
      if(!file.startsWith(directory+path.sep))return route.fulfill({status:403,body:''});
      try{return route.fulfill({status:200,contentType:mime[path.extname(file)]||'application/octet-stream',body:await fs.readFile(file)});}
      catch{if(/\.(?:js|mjs|css|wasm)$/.test(pathname))missing.push(pathname);return route.fulfill({status:404,body:'Not found'});}
    });
    const ready=async()=>{
      await page.waitForFunction(()=>location.pathname==='/workspace'&&!location.search&&!location.hash);
      await page.waitForFunction(()=>document.documentElement.dataset.svMode===document.cookie.match(/(?:^|; )sv-appearance=(light|dark)/)?.[1]);
      if(tool.id==='cad'){
        await page.locator('canvas').first().waitFor();
        await page.locator('#loading').waitFor({state:'hidden',timeout:45000});
      }else if(tool.id==='cad2d'){
        await page.locator('.web-editor canvas').first().waitFor();
        assert.equal(await page.locator('.web-start-overlay').count(),0);
      }else if(tool.id==='speech')await page.locator('#speech-sidebar').waitFor();
      else if(tool.id==='bim')await page.locator('.app-shell').waitFor();
      else if(tool.id==='stl')await page.locator('.leaflet-container').waitFor();
      else if(tool.id==='fem')await page.locator('.fem-canvas-svg').waitFor();
      else if(tool.id==='pointcloud')await page.locator('.workspace-shell').waitFor();
      else await page.waitForFunction(()=>document.querySelector('#root,#app')?.childElementCount>0||document.body.innerText.length>250);
    };
    try{
      const legacy=tool.id==='cad'?'/app/':tool.id==='bim'?'/viewer':'/';
      await page.goto(origin+legacy+'?appearance='+mode+'&launch=workspace',{waitUntil:'domcontentloaded'});
      await ready();
      assert.equal(await page.locator('html').getAttribute('data-sv-mode'),mode);
      await page.reload();await ready();
      if(tool.id==='cad'){
        const state=await page.evaluate(async()=>{
          const bindings=window.wasmBindings,ticket=bindings.ocs_control_submit(JSON.stringify({op:'state'}));
          const end=Date.now()+5000;
          while(Date.now()<end){const response=bindings.ocs_control_take(ticket);if(response)return JSON.parse(response);await new Promise(resolve=>setTimeout(resolve,25));}
          throw new Error('CAD state did not respond');
        });
        assert.equal(state.ok,true);assert(state.documents.some(document=>document.id===state.document_id&&!document.start));
      }
      if(tool.id==='speech'){
        await page.evaluate(()=>{window.routeDocument='preserved';});
        await page.getByRole('button',{name:'Settings',exact:true}).click();
        await page.waitForURL(url=>url.pathname==='/settings'&&!url.hash);
        await page.goBack();await page.waitForURL(url=>url.pathname==='/workspace');
        assert.equal(await page.evaluate(()=>window.routeDocument),'preserved');
        await page.goto(origin+'/#transcribe');await page.waitForURL(url=>url.pathname==='/transcribe'&&!url.hash);
        await page.reload();await page.waitForURL(url=>url.pathname==='/transcribe'&&!url.hash);
      }
      assert.deepEqual(missing,[],tool.id+' assets must resolve at the clean URL');
      assert.deepEqual(errors,[],tool.id+' must not raise an uncaught error');
      if(['cad','cad2d','speech','stl'].includes(tool.id))await page.screenshot({path:path.join(output,tool.id+'-'+mode+'.png'),animations:'disabled'});
      results.push({tool:tool.id,mode,passed:true});console.log(tool.id+'/'+mode+': passed');
    }catch(error){
      results.push({tool:tool.id,mode,passed:false,error:error.message,errors,missing});console.log(tool.id+'/'+mode+': FAILED '+error.message.slice(0,240));
      await page.screenshot({path:path.join(output,tool.id+'-'+mode+'-failure.png')}).catch(()=>{});
    }finally{await context.close();}
  }
}finally{await browser.close();await fs.writeFile(path.join(output,'results.json'),JSON.stringify(results,null,2)+'\n');}
assert(results.every(result=>result.passed),'See workspace route results for failed checks');
