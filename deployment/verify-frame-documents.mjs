import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const root = path.resolve(import.meta.dirname,'..');
const folder = path.join(root,'qa/readiness/frame-documents');
const checks = [], errors = [], dialogs = [], promptAnswers = [];
const browser = await chromium.launch({channel:'msedge',headless:true});
try {
  const context = await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
  const page = await context.newPage(); page.setDefaultTimeout(20000);
  page.on('pageerror',error => errors.push(error.message));
  page.on('dialog',async dialog => {
    if (promptAnswers.length) { await dialog.accept(promptAnswers.shift()); }
    else { dialogs.push(dialog.message()); await dialog.dismiss(); }
  });
  const observe = () => page.evaluate(async()=>JSON.parse((await import('/wasm/ofs_wasm.js')).get_project()));
  await page.goto(process.env.FRAME_TEST_URL || 'http://127.0.0.1:4294/?appearance=dark');
  await page.getByRole('button',{name:'Empty',exact:true}).waitFor();
  await page.locator('.ribbon-tabs').getByRole('button',{name:'IFC / Export',exact:true}).click();
  let downloads = 0; page.on('download',() => downloads++);
  await page.getByRole('button',{name:'Schedule PDF',exact:true}).click();
  await page.getByText('Add a frame before exporting its schedule.',{exact:false}).last().waitFor();
  assert.equal(downloads,0);
  checks.push('Empty schedule export gives an actionable error and creates no blank file');
  const choosing = page.waitForEvent('filechooser'); await page.keyboard.press('Control+o');
  await (await choosing).setFiles(path.join(folder,'project.ofs'));
  await page.waitForFunction(async()=>JSON.parse((await import('/wasm/ofs_wasm.js')).get_project()).kozijnen.length===78);
  await page.locator('.ribbon-tabs').getByRole('button',{name:'IFC / Export',exact:true}).click();
  const download = async (button,name,kind) => {
    const [file] = await Promise.all([page.waitForEvent('download'), button.click()]);
    assert.equal(await file.failure(),null);
    await file.saveAs(path.join(folder,name));
    const bytes = await fs.readFile(path.join(folder,name));
    assert.equal(bytes.subarray(0,kind==='pdf'?5:2).toString(),kind==='pdf'?'%PDF-':'PK');
    checks.push(`${name}: actual UI button creates a ${kind.toUpperCase()} download`);
  };
  await download(page.getByRole('button',{name:'Schedule PDF',exact:true}),'browser-schedule.pdf','pdf');
  await download(page.getByRole('button',{name:'Schedule Excel',exact:true}),'browser-schedule.xlsx','xlsx');
  // Open a normal eight-frame batch through the real file picker. This is a
  // document fixture, never a test-only state injection into the app engine.
  const project = JSON.parse(await fs.readFile(path.join(folder,'project.ofs'),'utf8'));
  project.kozijnen = project.kozijnen.slice(0,8);
  const smallPath = path.join(folder,'project-eight.ofs');
  await fs.writeFile(smallPath,JSON.stringify(project));
  const smaller = page.waitForEvent('filechooser'); await page.keyboard.press('Control+o');
  await (await smaller).setFiles(smallPath);
  await page.waitForFunction(async()=>JSON.parse((await import('/wasm/ofs_wasm.js')).get_project()).kozijnen.length===8);
  await page.locator('.ribbon-tabs').getByRole('button',{name:'IFC / Export',exact:true}).click();
  await download(page.getByRole('button',{name:'Drawing PDF',exact:true}),'browser-workshop.pdf','pdf');
  await page.locator('.ribbon-tabs').getByRole('button',{name:'Production',exact:true}).click();
  await download(page.getByRole('button',{name:'PDF',exact:true}),'browser-production.pdf','pdf');
  await download(page.getByRole('button',{name:'Excel',exact:true}),'browser-production.xlsx','xlsx');
  await download(page.getByRole('button',{name:'Labels PDF',exact:true}),'browser-labels.pdf','pdf');
  await page.locator('.workspace-tabs').getByRole('button',{name:'Quotations',exact:true}).click();
  await page.getByRole('button',{name:'+ New quotation',exact:true}).click();
  await page.waitForFunction(async()=>JSON.parse((await import('/wasm/ofs_wasm.js')).get_project()).quotations.length===1);
  const draftState = await observe();
  const draft = draftState.quotations[0];
  assert.deepEqual(draft.kozijnMarks,project.kozijnen.slice(0,8).map(frame=>frame.mark));
  const subtotal = await page.evaluate(async()=>{
    const engine = await import('/wasm/ofs_wasm.js'), project = JSON.parse(engine.get_project());
    return project.kozijnen.reduce((sum,frame)=>sum+JSON.parse(engine.execute_project_command('get_cost_estimate',JSON.stringify({id:frame.id}))).totalCost,0);
  });
  assert.ok(Math.abs(draft.totalInclBtw-subtotal*1.21)<1e-8,'Draft matches the actual frame estimates and default tax');
  await page.getByRole('combobox',{name:'Change status'}).selectOption('sent');
  await page.waitForFunction(async()=>JSON.parse((await import('/wasm/ofs_wasm.js')).get_project()).quotations[0].status==='sent');
  promptAnswers.push('Invalid amount','12oops');
  await page.getByRole('button',{name:'New revision',exact:true}).click();
  await page.getByText('Invalid total amount',{exact:false}).last().waitFor();
  assert.equal((await observe()).quotations.length,1);
  promptAnswers.push('Reviewed local estimate',String(draft.totalInclBtw+100));
  await page.getByRole('button',{name:'New revision',exact:true}).click();
  await page.waitForFunction(async()=>JSON.parse((await import('/wasm/ofs_wasm.js')).get_project()).quotations.length===2);
  assert.equal((await observe()).quotations[1].totalInclBtw,draft.totalInclBtw+100);
  checks.push('Quotation drafts use actual project prices, status changes persist, invalid revisions preserve data and valid revisions increment the version');
  await download(page.getByRole('button',{name:'Export PDF',exact:true}),'browser-estimate.pdf','pdf');
  assert.equal((await observe()).kozijnen.length,8);
  assert.deepEqual(dialogs,[],'Browser document exports must not show desktop path prompts');
  assert.deepEqual(errors,[],'No unhandled errors during document export');
  checks.push('All seven browser document formats complete without desktop prompts or unhandled errors');
  await context.close();
  await fs.writeFile(path.join(root,'qa/readiness/frame-document-downloads.json'),JSON.stringify({status:'passed',checks,errors,referenceEstimateTotal:draft.totalInclBtw},null,2));
  console.log(JSON.stringify({status:'passed',checks},null,2));
} catch(error) {
  await fs.writeFile(path.join(root,'qa/readiness/frame-document-downloads.json'),JSON.stringify({status:'failed',checks,errors,error:String(error)},null,2));
  throw error;
} finally { await browser.close(); }
