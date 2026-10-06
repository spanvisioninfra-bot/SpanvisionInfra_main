import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import {chromium} from 'playwright';
const root=path.resolve(import.meta.dirname,'../..'),out=path.resolve(process.env.FIELD_QA_OUT || import.meta.dirname);
fs.mkdirSync(out,{recursive:true});
const records=[],errors=[],upstreamRequests=[];
const record=(name,detail={})=>{records.push({name,...detail});console.log(name+' '+JSON.stringify(detail));};
const floor=await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="900" height="540"><rect width="900" height="540" fill="white"/><g stroke="#242424" stroke-width="5" fill="none"><path d="M80 60H800V440H80zM80 230H330V60M330 350H800M590 60V350M470 350V440"/><rect x="130" y="90" width="140" height="85"/><rect x="635" y="110" width="110" height="170"/></g><g fill="#555" font-family="Arial" font-size="18"><text x="140" y="210">PROJECT OFFICE</text><text x="395" y="220">OPEN WORKSPACE</text><text x="640" y="320">MEETING ROOM</text><text x="80" y="495">FW / GROUND FLOOR · 1:100</text></g><g stroke="#3681bc" stroke-width="2"><path d="M80 460H800M80 450V470M800 450V470"/></g><ellipse cx="690" cy="190" rx="78" ry="118" fill="none" stroke="#c44e4e" stroke-width="3" stroke-dasharray="8 5"/></svg>`)).png().toBuffer();
fs.writeFileSync(path.join(out,'sample-floorplan.png'),floor);
const floorData='data:image/png;base64,'+floor.toString('base64');
const photoData='data:image/png;base64,'+(await sharp({create:{width:32,height:32,channels:3,background:'#c27638'}}).png().toBuffer()).toString('base64');
const legacy={version:'2.0',project:{name:'Spanvision Site Review',number:'SV-024',client:'Customer brand retained',address:'14 Field Avenue',postalCode:'12345',city:'Site City',surveyor:'Alex Morgan',surveyDate:'2026-10-03',notes:'Customer document text retained'},contacts:[],floorPlans:[{id:'floor-1',name:'Ground floor',data:floorData,type:'image/png'}],tickets:[{id:'ticket-1',floorPlanId:'floor-1',label:'Review glazing',description:'Check alignment at the meeting room',category:'Bouwkundig',priority:'high',severity:'cosmetic',status:'open',assignedTo:'Alex Morgan',deadline:'2026-10-10',x:76,y:35,photos:[{id:'photo-1',data:photoData,capturedAt:'2026-10-03T08:00:00Z',gps:{lat:52.37,lon:4.89}}],comments:[],history:[],createdAt:'2026-10-03T08:00:00Z'}],inspections:[],handovers:[],activityLog:[]};
fs.writeFileSync(path.join(out,'legacy-project.json'),JSON.stringify(legacy,null,2));
const browser=await chromium.launch({channel:'msedge',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'en-US',acceptDownloads:true});
const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{if(request.url().includes('api.github.com/repos/OpenAEC'))upstreamRequests.push(request.url());});
page.setDefaultTimeout(10000);
async function ready(){await page.waitForFunction(()=>window.app);await page.evaluate(()=>window.app.ready);}
async function tab(name){await page.evaluate(name=>window.app.switchTab(name),name);await page.waitForFunction(name=>document.querySelector(`[data-tab="${name}"]`).classList.contains('active'),name);}
async function layout(name,width){
 await page.evaluate(()=>{document.querySelector('.main-content').scrollTop=0;document.querySelectorAll('.notification').forEach(el=>el.remove());});
 const result=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,offscreen:[...document.querySelectorAll('.main-content button,.main-content input,.main-content select,.main-content textarea')].filter(el=>{const r=el.getBoundingClientRect();return r.width>0&&r.height>0&&(r.left< -1||r.right>innerWidth+1);}).map(el=>el.id||el.className)}));
 assert.equal(result.overflow,false,`${name}/${width}: page overflow`);assert.deepEqual(result.offscreen,[],`${name}/${width}: clipped controls`);
 const visible=await page.locator('body').innerText();assert.ok(!/Open Field Studio|OpenAEC|Open PDF Studio/.test(visible),`${name}: upstream presentation leaked`);
 await page.screenshot({path:path.join(out,`field-${name}-${width}.png`),animations:'disabled'});record('field-layout',{name,width});
}
try {
 await page.goto('http://127.0.0.1:4245/');await ready();
 assert.equal(await page.locator('html').getAttribute('data-theme'),'spanvision-mono');
 assert.equal(await page.locator('body').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(0, 0, 0)');
 assert.equal(await page.locator('#canvas-container').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(27, 27, 27)');
 await page.locator('#load-json-input').setInputFiles(path.join(out,'legacy-project.json'));
 await page.waitForFunction(()=>window.app.project.number==='SV-024');
 await page.evaluate(async()=>{await window.app._blobDb();await new Promise(resolve=>{const tx=window.app._blobDbP;tx.then(db=>{const transaction=db.transaction('blobs','readonly');transaction.objectStore('blobs').getAll();transaction.oncomplete=resolve;});});});
 await page.reload();await ready();
 const restored=await page.evaluate(()=>({name:window.app.project.name,floor:window.app.floorPlans[0].data,photo:window.app.tickets[0].photos[0].data}));
 assert.equal(restored.name,legacy.project.name);assert.equal(restored.floor,floorData);assert.equal(restored.photo,photoData);record('legacy-import-and-media-reload');
 await tab('opname');await page.locator('#active-floor').selectOption('floor-1');
 await page.evaluate(()=>window.app.openPointModal('ticket-1'));
 await page.locator('#point-label').fill('Glazing checked');await page.locator('#point-status').selectOption('completed');
 const saveButton=page.locator('#point-form button[type="submit"]');
 if(await saveButton.count())await saveButton.click();else await page.evaluate(()=>window.app.savePoint());
 assert.equal(await page.evaluate(()=>window.app.tickets[0].label),'Glazing checked');record('ticket-edit');
 await tab('inspectie');await page.locator('#new-inspection-btn').click();await page.locator('#insp-name').fill('Site quality review');await page.locator('#insp-inspector').fill('Alex Morgan');
 await page.locator('#start-inspection-btn').click();assert.equal(await page.evaluate(()=>window.app.inspections.length),1);
 await page.evaluate(()=>{const app=window.app;const inspection=app.inspections[0];inspection.items[0].result='ok';app.saveToLocalStorage();});
 await page.locator('#finish-inspection-btn').click();await page.locator('#sign-name').fill('Alex Morgan');
 const signature=await page.locator('#signature-canvas').boundingBox();await page.mouse.move(signature.x+20,signature.y+40);await page.mouse.down();await page.mouse.move(signature.x+100,signature.y+65,{steps:6});await page.mouse.up();
 await page.evaluate(()=>window.app.signInspection());assert.equal(await page.evaluate(()=>window.app.inspections[0].status),'signed');record('inspection-and-signature');
 await tab('oplevering');await page.locator('#new-handover-btn').click();await page.locator('#ho-notes').fill('Signed site handover preview');await page.evaluate(()=>window.app.startHandover());
 await page.evaluate(()=>window.app.setHandoverVerdict(0,'approved'));await page.locator('#finish-handover-btn').click();await page.locator('#add-ho-signature').click();await page.locator('.ho-sig-name').fill('Alex Morgan');await page.locator('.ho-sig-role').fill('Inspecteur');await page.locator('#ho-verdict').selectOption('approved');
 const handoverCanvas=page.locator('.ho-sig-canvas');await handoverCanvas.scrollIntoViewIfNeeded();const handoverSignature=await handoverCanvas.boundingBox();await page.mouse.move(handoverSignature.x+20,handoverSignature.y+40);await page.mouse.down();await page.mouse.move(handoverSignature.x+100,handoverSignature.y+65,{steps:6});await page.mouse.up();await page.locator('#confirm-ho-sign').click();
 assert.equal(await page.evaluate(()=>window.app.handovers[0].status),'completed');assert.equal(await page.evaluate(()=>window.app.tickets[0].status),'verified');record('handover-with-signature');
 const report=await page.evaluate(()=>window.app.generateFullReport());assert.ok(report.includes('Field Workspace')&&report.includes('Spanvision Infra'));assert.ok(!report.includes('Open Field Studio'));assert.ok(report.includes(photoData));fs.writeFileSync(path.join(out,'sample-report.html'),report);
 const handover=await page.evaluate(()=>window.app.generateHandoverReport(window.app.handovers[0].id));assert.ok(handover.includes('Field Workspace'));assert.ok(handover.includes('data:image/png'));fs.writeFileSync(path.join(out,'sample-handover.html'),handover);record('branded-reports-preserve-media');
 const reportPage=await context.newPage();for(const [name,html] of [['report',report],['handover',handover]]){await reportPage.setContent(html);await reportPage.screenshot({path:path.join(out,`generated-${name}-1440.png`),fullPage:true,animations:'disabled'});assert.ok(!/Open Field Studio|OpenAEC/.test(await reportPage.locator('body').innerText()));}await reportPage.close();record('rendered-report-brand-audit');
 await tab('export');await page.evaluate(()=>{window.showSaveFilePicker=undefined;});
 const downloaded=page.waitForEvent('download');await page.locator('#save-json').click();const download=await downloaded;await download.saveAs(path.join(out,'roundtrip-project.json'));const roundtrip=JSON.parse(fs.readFileSync(path.join(out,'roundtrip-project.json'),'utf8'));assert.equal(roundtrip.version,'2.0');assert.equal(roundtrip.floorPlans[0].data,floorData);assert.equal(roundtrip.inspections[0].status,'signed');assert.ok(download.suggestedFilename().endsWith('_fw.json'));record('json-roundtrip');
 const bcfDownloaded=page.waitForEvent('download');await page.locator('#export-bcf').click();const bcf=await bcfDownloaded;await bcf.saveAs(path.join(out,'sample.bcfzip'));assert.ok(fs.statSync(path.join(out,'sample.bcfzip')).size>100);record('bcf-export');
 const fallbackBCF=await page.evaluate(async()=>{const app=window.app,project=app.project,save=app.saveWithPicker;let text;try{app.project={...project,name:'',surveyor:''};app.saveWithPicker=async blob=>{text=await blob.text();};await app.exportBCF();return text;}finally{app.project=project;app.saveWithPicker=save;}});assert.ok(fallbackBCF.includes('Field Workspace Project')&&fallbackBCF.includes('fieldworkspace@local'));assert.ok(!/OFS Project|openfieldstudio@local/.test(fallbackBCF));record('bcf-fallback-brand-audit');
 await page.route('https://field-connector.example/**',route=>route.fulfill({status:201,contentType:'application/json',body:'{"id":"mock-dossier"}'}));
 const backend=await page.evaluate(async()=>{const app=window.app,ho=app.handovers[0],payload=app._buildErpnextPayload(ho);const browser=await app._httpJson('https://field-connector.example/project',payload,'token sample:sample');let captured;window.__tauriHttpFetch=async(url,options)=>{captured={url,options};return new Response('{"id":"native-mock"}',{status:201,headers:{'Content-Type':'application/json'}});};const native=await app._httpJson('https://field-connector.example/project',payload,'token sample:sample');delete window.__tauriHttpFetch;return {browser,native,captured,payload};});
 assert.equal(backend.browser.ref,'mock-dossier');assert.equal(backend.native.ref,'native-mock');assert.equal(backend.captured.options.headers.Authorization,'token sample:sample');assert.ok('custom_ofs_verdict' in backend.payload);record('connector-browser-and-native-bridge');
 await tab('ifc');await page.evaluate(async base64=>{const bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));await window.app.loadIfcFile(new File([bytes],'sample.ifc'));},fs.readFileSync(path.join(root,'ifc-view/demo/Spanvision-IFC-View-Demo.ifc')).toString('base64'));
 assert.ok(await page.locator('#ifc-canvas-container canvas').count(),'IFC model did not render');const ifcStatus=await page.locator('#ifc-status').innerText();assert.ok(ifcStatus.includes('sample.ifc'),'IFC status: '+ifcStatus);record('lazy-ifc-render',{status:ifcStatus});
 for(const width of [320,390,820,1440]) {
  await page.setViewportSize({width,height:1000});
  for(const name of ['project','plattegrond','opname','ifc','inspectie','oplevering','dashboard','export','koppelingen','handleiding']) {await tab(name);if(name==='opname')await page.locator('#active-floor').selectOption('floor-1');await layout(name,width);}
  await page.locator('#field-about').click();const box=await page.locator('#field-notices').boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width+1);await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>document.activeElement.id),'field-about');
  await page.evaluate(()=>window.app.openPointModal('ticket-1'));await page.locator('#point-label').waitFor({state:'visible'});const modal=await page.locator('#point-modal .modal-content').boundingBox();assert.ok(modal&&modal.x>=0&&modal.x+modal.width<=width+1);await page.locator('#save-point').focus();await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.closest('[role="dialog"]')?.id),'point-modal');await page.screenshot({path:path.join(out,`field-ticket-dialog-${width}.png`),animations:'disabled'});await page.evaluate(()=>window.app.closePointModal());record('dialogs',{width});
 }
 await tab('project');await page.locator('#project-name').focus();await page.waitForFunction(()=>getComputedStyle(document.getElementById('project-name')).borderColor==='rgba(255, 255, 255, 0.58)');record('focus-visible');
 const about=page.locator('#field-about');await page.mouse.move(0,0);await page.waitForFunction(()=>!document.getElementById('field-about').matches(':hover') && document.getElementById('field-about').getAnimations().length===0);const beforeHover=await about.evaluate(el=>getComputedStyle(el).backgroundColor);await about.hover();await page.waitForFunction(()=>getComputedStyle(document.getElementById('field-about')).backgroundColor==='rgb(51, 51, 51)');assert.notEqual(await about.evaluate(el=>getComputedStyle(el).backgroundColor),beforeHover);const states=await page.evaluate(()=>{const active=document.querySelector('.nav-btn.active'),inactive=document.querySelector('.nav-btn:not(.active)');const disabled=document.createElement('button');disabled.disabled=true;document.body.appendChild(disabled);const result={active:getComputedStyle(active).backgroundColor,inactive:getComputedStyle(inactive).color,disabled:Number(getComputedStyle(disabled).opacity)};disabled.remove();return result;});assert.equal(states.active,'rgb(32, 32, 32)');assert.equal(states.inactive,'rgb(153, 153, 153)');assert.equal(states.disabled,.45);record('hover-selected-and-disabled-contrast');
 await page.locator('#theme-toggle').click();assert.equal(await page.locator('html').getAttribute('data-theme'),'light');await page.reload();await ready();assert.equal(await page.locator('html').getAttribute('data-theme'),'light');
 await page.evaluate(()=>{window.SpanvisionAppearance.setMode('dark');localStorage.setItem('ofs_canvas_background','#424242');});await page.reload();await ready();assert.equal(await page.locator('html').getAttribute('data-sv-mode'),'dark');assert.equal(await page.locator('#canvas-container').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(66, 66, 66)');record('saved-theme-and-canvas-preferences');
 for(const lang of ['nl','en','de','fr']){await page.evaluate(lang=>window.app.setLanguage(lang),lang);assert.equal(await page.locator('html').getAttribute('lang'),'en');assert.equal(await page.evaluate(()=>window.app.lang),'en');}record('English-only language preference compatibility');
 const hub=await context.newPage();
 for(const width of [320,390,820,1440]){
  await hub.setViewportSize({width,height:1000});
  for(const route of ['landing','modules','suggestions','login','signup','account']){await hub.goto('http://127.0.0.1:4230/#'+route);await hub.locator('main').waitFor();assert.equal(await hub.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await hub.screenshot({path:path.join(out,`hub-${route}-${width}.png`),animations:'disabled',fullPage:route==='landing'});record('hub-layout',{route,width});}
  await hub.goto('http://127.0.0.1:4230/#landing');await hub.getByRole('button',{name:'Explore scan & OCR',exact:true}).click();await hub.getByRole('dialog').waitFor();const scan=await hub.getByRole('dialog').boundingBox();assert.ok(scan.x>=0&&scan.x+scan.width<=width+1);await hub.screenshot({path:path.join(out,`hub-scan-${width}.png`),animations:'disabled'});await hub.keyboard.press('Escape');record('hub-scan',{width});
 }
 await hub.goto('http://127.0.0.1:4230/#modules');const card=hub.locator('[data-module="field"]');await card.getByRole('link',{name:'Open Field Workspace',exact:false}).waitFor({timeout:10000});assert.ok((await card.innerText()).includes('Ready to open'));record('field-launcher-ready');
 assert.deepEqual(upstreamRequests,[]);assert.deepEqual(errors,[]);record('no-upstream-update-requests-or-page-errors');
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({status:'passed',records,errors,upstreamRequests},null,2)+'\n');
} catch(error) {fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({status:'failed',records,errors,error:error.stack},null,2)+'\n');throw error;} finally {await browser.close();}
