import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';

// Keep the existing browser-check entry point compatible with the static cover.
const url=process.env.BRIDGE_URL||'http://127.0.0.1:4230/';
const output=path.resolve(process.env.BRIDGE_QA_OUTPUT||'test-results/cover');
await mkdir(output,{recursive:true});
const source=await readFile(new URL('../public/bridge-steel-cover.png',import.meta.url));
const wideSource=await readFile(new URL('../public/bridge-steel-cover-wide.png',import.meta.url));
const digest=value=>createHash('sha256').update(value).digest('hex');
const browser=await chromium.launch({channel:'chrome',headless:true});
const checks=[],layouts=[],errors=[],requests=[];
const record=label=>{checks.push(label);console.log('PASS '+label);};
try {
  const context=await browser.newContext({viewport:{width:1440,height:960},reducedMotion:'reduce'});
  await context.addInitScript(()=>{
    window.coverWebglCalls=0;
    const original=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(type,...args){
      if(type.startsWith('webgl')){window.coverWebglCalls++;return null;}
      return original.call(this,type,...args);
    };
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
  const open=async theme=>{
    await page.goto(url+'?appearance='+theme+'&preview=bridge-wide',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>{const image=document.querySelector('.landing-cover-image');return image?.complete&&image.naturalWidth>0;});
  };
  await open('dark');
  for(const [file,bytes] of [['bridge-steel-cover.png',source],['bridge-steel-cover-wide.png',wideSource]]) {
    const response=await page.request.get(url+file);assert.equal(response.status(),200);
    assert.equal(digest(await response.body()),digest(bytes));
  }
  record('The browser receives the landscape cover and preserved portrait artwork');

  for(const width of [320,390,820,1440,1920])for(const theme of ['dark','light']) {
    await page.setViewportSize({width,height:width<768?844:960});await open(theme);
    const expectedSource=width<768?source:wideSource;
    assert.deepEqual(await page.locator('.landing-cover-image').evaluate(i=>[i.naturalWidth,i.naturalHeight]),[expectedSource.readUInt32BE(16),expectedSource.readUInt32BE(20)]);
    const layout=await page.evaluate(()=>{
      const box=s=>document.querySelector(s).getBoundingClientRect();
      const hero=box('.company-intro'),account=box('.home-account-access'),summary=box('.intro-summary');
      const image=document.querySelector('.landing-cover-image');
      const bounds=image.getBoundingClientRect(),style=getComputedStyle(image);
      const x=bounds.width/image.naturalWidth,y=bounds.height/image.naturalHeight;
      const scale=style.objectFit==='cover'?Math.max(x,y):style.objectFit==='none'?1:style.objectFit==='scale-down'?Math.min(1,x,y):Math.min(x,y);
      const fullImageVisible=scale*image.naturalWidth<=bounds.width+.5&&scale*image.naturalHeight<=bounds.height+.5&&bounds.left>=hero.left-.5&&bounds.right<=hero.right+.5&&bounds.top>=hero.top-.5&&bounds.bottom<=hero.bottom+.5;
      return {gap:account.top-hero.bottom,overflow:document.documentElement.scrollWidth>innerWidth+1,summaryInside:summary.bottom<hero.bottom,fullImageVisible,artworkWidth:scale*image.naturalWidth,heroWidth:hero.width,source:image.currentSrc,filter:style.filter,mode:document.documentElement.dataset.svMode,webgl:window.coverWebglCalls,canvases:document.querySelectorAll('.company-intro canvas').length};
    });
    assert.equal(layout.gap,0);assert.equal(layout.overflow,false);assert.equal(layout.summaryInside,true);
    assert.equal(layout.fullImageVisible,true,'The entire artwork must fit inside the hero without clipping');
    if(width>=768)assert.ok(Math.abs(layout.artworkWidth-layout.heroWidth)<2,'The landscape artwork must fill the desktop hero width');
    assert.equal(layout.mode,theme);assert.equal(layout.webgl,0);assert.equal(layout.canvases,0);
    assert.equal(layout.filter==='none',theme==='dark');
    layouts.push({width,theme,...layout});
    if(width===390||width===1440||width===1920)await page.screenshot({path:path.join(output,'home-'+width+'-'+theme+'.png')});
  }
  assert.ok(!requests.some(r=>r.includes('/BridgeScene')||r.includes('three.module')));
  record('Static cover works without WebGL or a 3D download');
  record('The landscape cover fills desktop width and the full artwork fits both themes at 320, 390, 820, 1440 and 1920 pixels without clipping, section gaps or horizontal overflow');

  await page.setViewportSize({width:1440,height:960});await open('dark');
  await page.getByRole('link',{name:'Explore all tools',exact:true}).click();
  await page.waitForFunction(()=>document.querySelectorAll('.module-card').length===16);
  assert.equal(await page.locator('.landing-cover-image').count(),0);
  await page.getByRole('link',{name:'Home',exact:true}).click();await page.waitForSelector('.landing-cover-image');
  await page.getByRole('button',{name:'Explore scan & OCR',exact:true}).click();assert.equal(await page.locator('dialog[open]').count(),1);await page.keyboard.press('Escape');
  record('Tool navigation, all 16 tools and the scan/OCR dialog still work');
  await page.mouse.move(1100,500);await page.mouse.wheel(0,450);await page.waitForTimeout(200);
  assert.ok(await page.evaluate(()=>scrollY>100));record('The image cover does not intercept page scrolling');

  await page.route('**/bridge-steel-cover*.png',route=>route.abort());
  await page.goto(url+'?appearance=dark&preview=cover-missing',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelector('.landing-cover-image')?.style.visibility==='hidden');
  assert.equal(await page.locator('#home-heading').isVisible(),true);
  assert.equal(await page.getByRole('link',{name:'Explore all tools',exact:true}).isVisible(),true);
  record('If the image fails to load, the headline and actions remain available');
  assert.deepEqual(errors,[]);record('No uncaught JavaScript errors');
  await writeFile(path.join(output,'results.json'),JSON.stringify({date:new Date().toISOString(),url,checks,layouts,errors},null,2));
  await context.close();
}finally{await browser.close();}
