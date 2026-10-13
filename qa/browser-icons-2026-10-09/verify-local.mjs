import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {root,brand} from '../../branding/common.mjs';
import {brandBrowserHtml,installBrowserIdentity} from '../../deployment/browser-identity.mjs';

const out = path.dirname(fileURLToPath(import.meta.url));
const checks=[];
for(const module of brand.modules) {
  const render=['bim','stl'].includes(module.id);
  const folder=render?path.join(out,module.id):path.join(root,'qa/deployment/output',module.id,'.vercel/output/static');
  if(render) {
    await fs.mkdir(folder,{recursive:true});
    await fs.copyFile(path.join(root,module.directory,module.id==='stl'?'web/index.html':module.dist+'/index.html'),path.join(folder,'index.html'));
    await installBrowserIdentity(folder,{prefix:module.id==='stl'?'/static/__spanvision-brand/':'/__spanvision-brand/'});
  }
  const html=await fs.readFile(path.join(folder,module.id==='cad'?'app/index.html':'index.html'),'utf8');
  assert(html.includes('id="sv-tool-favicon"'));
  const links=html.match(/<link\b[^>]*\brel=["'](?:icon|shortcut icon)["'][^>]*>/gi)||[];
  assert.equal(links.length,2,module.id+' contains legacy or duplicate icons');
  assert(links.every(link=>link.includes('__spanvision-brand/company-dark')));
  for(const name of ['company-dark.svg','company-light.svg','company-dark-32.png','company-light-32.png','company-favicon.js'])await fs.access(path.join(folder,'__spanvision-brand',name));
  checks.push({tool:module.id,packaged:true,platform:render?'render-prepared':'vercel',passed:true});
}
const fixture=brandBrowserHtml('<!DOCTYPE html><html data-sv-mode="dark"><head><title>Company icon check</title><link rel="shortcut icon" href="old-gw.ico"><link rel="icon" href="old-gw.svg"><style>body{font:16px system-ui;background:#202020;color:white;padding:40px}img{width:64px;height:64px;margin:15px}</style></head><body><h1>Spanvision Infra</h1><img src="/__spanvision-brand/company-dark.svg"><img src="/__spanvision-brand/company-light.svg"></body></html>');
assert.equal(brandBrowserHtml(fixture),fixture,'Repeated packaging must be idempotent');
assert(!fixture.includes('old-gw'));
const server=http.createServer(async(req,res)=>{
  try{
    const pathname=new URL(req.url,'http://localhost').pathname;
    if(pathname==='/'){res.writeHead(200,{'Content-Type':'text/html'}).end(fixture);return;}
    const name=path.basename(pathname);
    const content=await fs.readFile(path.join(root,'deployment/browser-icons',name));
    res.writeHead(200,{'Content-Type':name.endsWith('.js')?'text/javascript':name.endsWith('.svg')?'image/svg+xml':'image/png'}).end(content);
  }catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
  const page=await browser.newPage({viewport:{width:640,height:320}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  for(const mode of ['dark','light','dark']) {
    await page.evaluate(mode=>document.documentElement.dataset.svMode=mode,mode);
    await page.waitForFunction(mode=>document.getElementById('sv-tool-favicon').href.endsWith(`company-${mode}.svg`),mode);
    for(const id of ['sv-tool-favicon','sv-tool-favicon-png','sv-tool-touch-icon']) {
      const response=await page.request.get(new URL(await page.locator('#'+id).getAttribute('href'),page.url()).href);
      assert(response.ok());
    }
  }
  await page.locator('img').first().evaluate(image=>image.decode());
  await page.locator('img').last().evaluate(image=>image.decode());
  await page.screenshot({path:path.join(out,'company-icons.png')});
  assert.deepEqual(errors,[]);
  checks.push({themeSwitching:true,legacyRemoved:true,idempotent:true,imagesDecoded:true,errors,passed:true});
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
await fs.writeFile(path.join(out,'local-results.json'),JSON.stringify({verifiedAt:new Date().toISOString(),checks,passed:true},null,2));
console.log(`${checks.length} browser identity checks passed.`);
