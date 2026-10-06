import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';

const out = path.resolve('qa/readiness/field-recovery.json');
const fixture = path.resolve('qa/field/legacy-project.json');
const browser = await chromium.launch({channel:'msedge',headless:true});
const checks=[], errors=[];
try {
  const page = await browser.newPage(); page.setDefaultTimeout(15000);
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.FIELD_TEST_URL || 'http://127.0.0.1:4245/');
  await page.waitForFunction(()=>window.app);
  await page.evaluate(()=>window.app.ready);
  await page.locator('#load-json-input').setInputFiles(fixture);
  await page.waitForFunction(()=>window.app.project.number==='SV-024');
  const snapshot=async()=>createHash('sha256').update(await page.evaluate(()=>{
    const app=window.app;
    return JSON.stringify({project:app.project,contacts:app.contacts,floorPlans:app.floorPlans,tickets:app.tickets,inspections:app.inspections,handovers:app.handovers},(key,value)=>{
      if(value && typeof value==='object' && !Array.isArray(value)) return Object.fromEntries(Object.keys(value).filter(name=>name!=='blobRef').sort().map(name=>[name,value[name]]));
      return value;
    });
  })).digest('hex');
  const before=await snapshot();
  const errorMessage=await page.evaluate(()=>window.app.t('msg_load_error'));
  const successMessage=await page.evaluate(()=>window.app.t('msg_loaded'));
  await page.locator('#load-json-input').setInputFiles([]);
  assert.equal(await snapshot(),before);
  checks.push('Cancelled file selection preserves the active project');
  for(const [name,text] of [
    ['malformed.json','{broken'],
    ['wrong-array.json',JSON.stringify({version:'2.0',project:{name:'Should never replace active project'},contacts:42})],
    ['null-entry.json',JSON.stringify({version:'2.0',project:{name:'Should never replace active project'},tickets:[null]})],
    ['wrong-root.json','[]']
  ]) {
    await page.evaluate(()=>document.querySelectorAll('.notification').forEach(el=>el.remove()));
    await page.locator('#load-json-input').setInputFiles({name,mimeType:'application/json',buffer:Buffer.from(text)});
    await page.locator('.notification').filter({hasText:errorMessage}).waitFor();
    assert.equal(await snapshot(),before,`${name} must preserve all active project data`);
    checks.push(`${name}: clear error and unchanged project`);
  }
  await page.locator('#load-json-input').setInputFiles(fixture);
  await page.locator('.notification').filter({hasText:successMessage}).waitFor();
  assert.equal(await snapshot(),before);
  await page.reload(); await page.waitForFunction(()=>window.app); await page.evaluate(()=>window.app.ready);
  assert.equal(await snapshot(),before);
  checks.push('Valid retry and reload retain the project and actual embedded media');
  assert.deepEqual(errors,[]);
  await fs.writeFile(out,JSON.stringify({passed:true,checkedAt:new Date().toISOString(),checks,errors},null,2));
  console.log(JSON.stringify({passed:true,checks},null,2));
} catch(error) {
  console.error(error);
  await fs.writeFile(out,JSON.stringify({passed:false,checkedAt:new Date().toISOString(),checks,errors,error:String(error)},null,2));
  throw error;
} finally { await browser.close(); }
