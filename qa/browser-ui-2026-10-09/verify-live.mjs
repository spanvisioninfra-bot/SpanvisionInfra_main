import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {moduleUrl} from '../../suite-hub/src/module-url.js';

const out=path.dirname(fileURLToPath(import.meta.url));
const manifest=JSON.parse(await fs.readFile(new URL('../../deployment/production.json',import.meta.url),'utf8'));
const brand=JSON.parse(await fs.readFile(new URL('../../branding/brand.json',import.meta.url),'utf8'));
const stylesheet=await fs.readFile(new URL('../../deployment/browser-ui/workspace-ui.css',import.meta.url));
const digest=createHash('sha256').update(stylesheet).digest('hex');
const platform=process.argv[2]||'vercel';
const file=path.join(out,'live-results.json');
let report;
try{report=JSON.parse(await fs.readFile(file,'utf8'));}catch{report={checks:[]};}
report.verifiedAt=new Date().toISOString();report.stylesheetSha256=digest;
const targets=[...(platform==='vercel'?[{id:'hub',url:'https://spanvision-infra.vercel.app/',platform}]:[]),...manifest.modules.filter(module=>module.platform===platform)];
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
  for(const tool of targets){
    const url=tool.id==='hub'?tool.url:moduleUrl(brand.modules.find(module=>module.id===tool.id),tool,'dark','spanvision-infra.vercel.app');
    const result={tool:tool.id,platform,url,modes:[]};
    const context=await browser.newContext({viewport:{width:1440,height:980},reducedMotion:'reduce'});
    const page=await context.newPage();
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    try{
      await page.goto(url,{waitUntil:'domcontentloaded',timeout:90000});
      await page.locator('#sv-workspace-ui').waitFor({state:'attached',timeout:30000});
      await page.waitForFunction(()=>!!window.SpanvisionAppearance,{timeout:20000});
      const cssUrl=await page.locator('#sv-workspace-ui').evaluate(link=>link.href);
      const response=await page.request.get(cssUrl);
      assert.equal(response.status(),200,'Workspace stylesheet must be served');
      assert.equal(createHash('sha256').update(await response.body()).digest('hex'),digest,'Live stylesheet must match the reviewed source');
      assert(cssUrl.includes(`?v=${digest.slice(0,12)}`),'Stylesheet URL must be versioned');
      for(const font of ['Inter-Regular.woff2','SpaceGrotesk-Medium.woff2']){
        const fontResponse=await page.request.get(new URL(font,cssUrl).href);
        assert.equal(fontResponse.status(),200,`${font} must be served locally`);
      }
      const loaded=await page.evaluate(async()=>{
        const ui=await document.fonts.load('400 14px "Spanvision Sans"');
        const display=await document.fonts.load('500 28px "Spanvision Display"');
        return {ui:ui.length>0&&ui.every(font=>font.status==='loaded'),display:display.length>0&&display.every(font=>font.status==='loaded')};
      });
      assert(loaded.ui&&loaded.display,'Both custom font families must load');
      const select=page.locator('.sv-appearance-control select').first();
      await select.waitFor({state:'visible',timeout:20000});
      for(const mode of ['light','dark']){
        await select.selectOption(mode);
        await page.waitForFunction(mode=>document.documentElement.dataset.svMode===mode,mode);
        await page.waitForTimeout(400);
        const data=await page.evaluate(()=>({font:getComputedStyle(document.body).fontFamily,mode:document.documentElement.dataset.svMode,buttons:document.querySelectorAll('button').length,canvases:[...document.querySelectorAll('canvas')].map(canvas=>({width:canvas.getBoundingClientRect().width,height:canvas.getBoundingClientRect().height}))}));
        assert(data.font.includes('Spanvision Sans'));
        assert.equal(data.mode,mode);
        result.modes.push({mode,...data});
        await page.screenshot({path:path.join(out,`live-${tool.id}-${mode}.png`)});
      }
      if(tool.id==='hub'){
        await page.setViewportSize({width:390,height:844});
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'Main site must fit mobile');
        result.mobileFits=true;
      }
      assert.deepEqual(errors,[]);
      result.fonts=loaded;result.stylesheet=cssUrl;result.passed=true;
    }catch(error){result.passed=false;result.error=error.message;}
    finally{result.errors=errors;await context.close();}
    report.checks=report.checks.filter(check=>check.tool!==tool.id);report.checks.push(result);
    report.passed=report.checks.length===17&&report.checks.every(check=>check.passed);
    await fs.writeFile(file,JSON.stringify(report,null,2));
    console.log(`${tool.id}: ${result.passed?'PASS':result.error}`);
  }
  if(report.checks.some(check=>!check.passed))process.exitCode=1;
}finally{await browser.close();}
