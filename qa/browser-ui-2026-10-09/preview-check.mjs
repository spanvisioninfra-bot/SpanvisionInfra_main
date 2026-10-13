import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {moduleUrl} from '../../suite-hub/src/module-url.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const out=path.dirname(fileURLToPath(import.meta.url));
const modules=JSON.parse(await fs.readFile(path.join(root,'deployment/production.json'),'utf8')).modules;
const brand=JSON.parse(await fs.readFile(path.join(root,'branding/brand.json'),'utf8'));
const report={verifiedAt:new Date().toISOString(),preview:true,checks:[]};
const assets=path.join(root,'deployment/browser-ui');
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
  for(const tool of [{id:'hub',url:'https://spanvision-infra.vercel.app/'},...modules]){
    const context=await browser.newContext({viewport:{width:1440,height:980},reducedMotion:'reduce'});
    const page=await context.newPage();
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/__spanvision-ui/**',async route=>{
      const name=path.basename(new URL(route.request().url()).pathname);
      const content=await fs.readFile(path.join(assets,name));
      await route.fulfill({status:200,contentType:name.endsWith('.css')?'text/css':name.endsWith('.woff2')?'font/woff2':'text/plain',body:content});
    });
    const result={tool:tool.id,modes:[],errors};
    try{
      const url=tool.id==='hub'?tool.url:moduleUrl(brand.modules.find(module=>module.id===tool.id),tool,'dark','spanvision-infra.vercel.app');
      await page.goto(url,{waitUntil:'domcontentloaded',timeout:90000});
      await page.waitForFunction(()=>!!window.SpanvisionAppearance,{timeout:20000});
      await page.waitForTimeout(1500);
      const before=await page.evaluate(()=>({font:getComputedStyle(document.body).fontFamily,width:innerWidth,height:innerHeight,canvases:[...document.querySelectorAll('canvas')].map(canvas=>({width:canvas.getBoundingClientRect().width,height:canvas.getBoundingClientRect().height}))}));
      await page.evaluate(()=>{
        const link=document.createElement('link');link.rel='stylesheet';link.id='sv-workspace-ui';link.href='/__spanvision-ui/workspace-ui.css';document.head.append(link);
      });
      await page.waitForFunction(()=>getComputedStyle(document.body).fontFamily.includes('Spanvision Sans'));
      await page.evaluate(()=>Promise.all([document.fonts.load('400 14px "Spanvision Sans"'),document.fonts.load('500 28px "Spanvision Display"')]));
      for(const mode of ['dark','light']){
        await page.evaluate(mode=>window.SpanvisionAppearance.setMode(mode),mode);
        await page.waitForTimeout(600);
        const data=await page.evaluate(()=>({font:getComputedStyle(document.body).fontFamily,uiFontReady:document.fonts.check('400 14px "Spanvision Sans"'),headingFontReady:document.fonts.check('500 28px "Spanvision Display"'),bodyWidth:document.body.scrollWidth,viewportWidth:innerWidth,buttons:document.querySelectorAll('button').length,canvases:[...document.querySelectorAll('canvas')].map(canvas=>({width:canvas.getBoundingClientRect().width,height:canvas.getBoundingClientRect().height}))}));
        assert(data.font.includes('Spanvision Sans'));
        assert(data.uiFontReady&&data.headingFontReady);
        for(let i=0;i<before.canvases.length;i++){
          if(before.canvases[i].width>0&&before.canvases[i].height>0){
            assert(data.canvases[i]?.width>0&&data.canvases[i]?.height>0,'Visible drawing canvas must remain visible');
          }
        }
        await page.screenshot({path:path.join(out,`${tool.id}-${mode}.png`)});
        result.modes.push({mode,...data});
      }
      if(tool.id==='hub'){
        await page.setViewportSize({width:390,height:844});
        await page.waitForTimeout(300);
        const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
        assert.equal(overflow,false,'Main site must fit a mobile viewport');
        await page.screenshot({path:path.join(out,'hub-mobile-light.png')});
        result.mobileFits=true;
      }
      assert.deepEqual(errors,[]);
      result.before=before;result.passed=true;
    }catch(error){result.passed=false;result.error=error.message;}
    finally{await context.close();}
    report.checks.push(result);await fs.writeFile(path.join(out,'preview-results.json'),JSON.stringify(report,null,2));
    console.log(`${tool.id}: ${result.passed?'PASS':result.error}`);
  }
  report.passed=report.checks.every(check=>check.passed);
  await fs.writeFile(path.join(out,'preview-results.json'),JSON.stringify(report,null,2));
  if(!report.passed)process.exitCode=1;
}finally{await browser.close();}
