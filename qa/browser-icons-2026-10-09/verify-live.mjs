import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {moduleUrl} from '../../suite-hub/src/module-url.js';
const out=path.dirname(fileURLToPath(import.meta.url));
const manifest=JSON.parse(await fs.readFile(new URL('../../deployment/production.json',import.meta.url),'utf8'));
const brand=JSON.parse(await fs.readFile(new URL('../../branding/brand.json',import.meta.url),'utf8'));
const platform=process.argv[2]||'vercel';
const file=path.join(out,'live-results.json');
let report;
try{report=JSON.parse(await fs.readFile(file,'utf8'));}catch{report={checks:[]};}
report.verifiedAt=new Date().toISOString();
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
  for(const deployment of manifest.modules.filter(module=>module.platform===platform)){
    const module=brand.modules.find(module=>module.id===deployment.id);
    const result={tool:module.id,platform,url:moduleUrl(module,deployment,'dark','spanvision-infra.vercel.app'),checks:[]};
    const context=await browser.newContext({viewport:{width:1360,height:900}});
    const page=await context.newPage();
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    try{
      await page.goto(result.url,{waitUntil:'domcontentloaded',timeout:60000});
      await page.locator('#sv-tool-favicon').waitFor({state:'attached',timeout:20000});
      await page.waitForFunction(()=>!!window.SpanvisionAppearance,{timeout:20000});
      for(const mode of ['dark','light']){
        await page.evaluate(mode=>window.SpanvisionAppearance.setMode(mode),mode);
        await page.waitForFunction(mode=>document.getElementById('sv-tool-favicon').href.endsWith(`company-${mode}.svg`),mode,{timeout:10000});
        const href=await page.locator('#sv-tool-favicon').evaluate(link=>link.href);
        const response=await page.request.get(href);
        assert.equal(response.status(),200);
        assert((await response.text()).includes('mask="url(#curved-s)"'));
        const png=await page.request.get(await page.locator('#sv-tool-favicon-png').evaluate(link=>link.href));
        assert.equal(png.status(),200);
        await page.evaluate(async href=>{const icon=new Image();icon.src=href;await icon.decode();if(icon.naturalWidth===0)throw new Error('Company icon cannot render');},href);
        result.checks.push({mode,href,svg:true,pngFallback:true,decoded:true,passed:true});
      }
      const hrefs=await page.locator('link[rel="icon"],link[rel="shortcut icon"]').evaluateAll(links=>links.map(link=>link.href));
      assert.equal(hrefs.length,2);
      assert(hrefs.every(href=>href.includes('/__spanvision-brand/company-light')));
      assert.deepEqual(errors,[]);
      result.legacyRemoved=true;result.errors=errors;result.passed=true;
    }catch(error){result.passed=false;result.error=error.message;result.errors=errors;}
    finally{await context.close();}
    report.checks=report.checks.filter(check=>check.tool!==module.id);report.checks.push(result);
    report.passed=report.checks.length===16&&report.checks.every(check=>check.passed);
    await fs.writeFile(file,JSON.stringify(report,null,2));
    console.log(`${module.id}: ${result.passed?'PASS':result.error}`);
  }
  if(report.checks.some(check=>!check.passed))process.exitCode=1;
}finally{await browser.close();}
