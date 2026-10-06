import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const root = path.resolve(import.meta.dirname, '..'), out = path.join(root, 'qa/readiness');
const checks = [], errors = [], browser = await chromium.launch({channel:'msedge',headless:true});
try {
  const context = await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(error.message));
  const observeProject = () => page.evaluate(async () => JSON.parse((await import('/wasm/ofs_wasm.js')).get_project()));
  await page.goto(process.env.FRAME_TEST_URL || 'http://127.0.0.1:4294/?appearance=dark');
  await page.getByRole('button',{name:'Empty',exact:true}).click();
  const before = await observeProject();
  assert.equal(before.kozijnen.length,1);
  await page.getByRole('button',{name:'Profile editor',exact:true}).click();
  const params = page.locator('.params-panel');
  await params.getByLabel('Name',{exact:true}).fill('Spanvision custom reference');
  await params.getByLabel('Series',{exact:true}).fill('SV-reference');
  await params.getByRole('button',{name:'Save',exact:true}).click();
  await page.waitForFunction(async () => JSON.parse((await import('/wasm/ofs_wasm.js')).get_project()).customProfiles.length === 1);
  let p = await observeProject();
  assert.equal(p.customProfiles[0].name,'Spanvision custom reference');
  assert.equal(p.customProfiles[0].series,'SV-reference');
  const profileId = p.customProfiles[0].id;
  await params.getByLabel('Series',{exact:true}).fill('SV-updated');
  await params.getByRole('button',{name:'New profile',exact:true}).click();
  const draftPrompt = page.getByRole('dialog',{name:'Unsaved changes'});
  await draftPrompt.getByRole('button',{name:'Cancel',exact:true}).click();
  assert.equal(await params.getByLabel('Series',{exact:true}).inputValue(),'SV-updated');
  await params.getByRole('button',{name:'Save',exact:true}).click();
  await page.waitForFunction(async () => JSON.parse((await import('/wasm/ofs_wasm.js')).get_project()).customProfiles[0]?.series === 'SV-updated');
  p = await observeProject();
  assert.equal(p.customProfiles.length,1); assert.equal(p.customProfiles[0].id,profileId);
  checks.push('Profile editor saves real custom geometry and updates the same profile without duplicating it');
  await params.getByLabel('Series',{exact:true}).fill('SV-saved-with-project');
  await page.locator('.workspace-tabs').getByRole('button',{name:'2D Editor',exact:true}).click();
  const draftSave = page.waitForEvent('download');
  await page.keyboard.press('Control+s');
  await (await draftSave).saveAs(path.join(out,'frame-profile-draft-saved.ofs'));
  assert.equal(JSON.parse(await fs.readFile(path.join(out,'frame-profile-draft-saved.ofs'),'utf8')).customProfiles[0].series,'SV-saved-with-project');
  p = await observeProject();
  checks.push('Unsaved profile replacement can be cancelled and project Save commits the current profile draft');

  await page.locator('.workspace-tabs').getByRole('button',{name:'2D Editor',exact:true}).click();
  const save = page.waitForEvent('download');
  await page.keyboard.press('Control+s');
  const projectDownload = await save, savedPath = path.join(out,'frame-file-roundtrip.ofs');
  assert.match(projectDownload.suggestedFilename(),/\.ofs$/);
  await projectDownload.saveAs(savedPath);
  const saved = JSON.parse(await fs.readFile(savedPath,'utf8'));
  assert.deepEqual(saved.kozijnen,p.kozijnen); assert.deepEqual(saved.customProfiles,p.customProfiles);
  checks.push('Browser Save downloads a complete .ofs file containing real frames and custom profiles');

  await page.keyboard.press('Control+n');
  await page.waitForFunction(async () => JSON.parse((await import('/wasm/ofs_wasm.js')).get_project()).kozijnen.length === 0);
  const choosing = page.waitForEvent('filechooser'); await page.keyboard.press('Control+o');
  await (await choosing).setFiles(savedPath);
  await page.waitForFunction(async () => JSON.parse((await import('/wasm/ofs_wasm.js')).get_project()).kozijnen.length === 1);
  assert.deepEqual(await observeProject(),saved);
  checks.push('Browser Open restores the actual downloaded project and resets the selected frame correctly');
  const invalid = page.waitForEvent('filechooser'); await page.keyboard.press('Control+o');
  await (await invalid).setFiles({name:'corrupt.ofs',mimeType:'application/json',buffer:Buffer.from('{broken')});
  await page.getByText(/line 1 column|key must be|expected/).last().waitFor();
  assert.deepEqual(await observeProject(),saved);
  checks.push('Corrupt project input leaves the complete current project unchanged');

  await page.getByRole('button',{name:'Empty',exact:true}).click();
  const edited = await observeProject(); assert.equal(edited.kozijnen.length,2);
  await page.keyboard.press('Control+n');
  const unsaved = page.getByRole('dialog',{name:'Unsaved changes'});
  await unsaved.getByRole('button',{name:'Cancel',exact:true}).click();
  assert.deepEqual(await observeProject(),edited);
  await page.keyboard.press('Control+n');
  await page.keyboard.press('Escape');
  await unsaved.waitFor({state:'hidden'});
  assert.deepEqual(await observeProject(),edited);
  await page.keyboard.press('Control+n');
  const safeSave = page.waitForEvent('download');
  await unsaved.getByRole('button',{name:'Save',exact:true}).click();
  await (await safeSave).saveAs(path.join(out,'frame-unsaved-saved.ofs'));
  await page.waitForFunction(async () => JSON.parse((await import('/wasm/ofs_wasm.js')).get_project()).kozijnen.length === 0);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(out,'frame-unsaved-saved.ofs'),'utf8')),edited);
  await page.getByRole('button',{name:'Empty',exact:true}).click();
  await page.keyboard.press('Control+n');
  await unsaved.getByRole('button',{name:'Discard changes',exact:true}).click();
  await page.waitForFunction(async () => JSON.parse((await import('/wasm/ofs_wasm.js')).get_project()).kozijnen.length === 0);
  checks.push('Unsaved project Cancel preserves edits, Save downloads them before New, and Discard creates a clean project');

  await page.getByRole('button',{name:'Empty',exact:true}).click();
  await page.locator('.ribbon-tabs').getByRole('button',{name:'Production',exact:true}).click();
  const csv = page.waitForEvent('download');
  await page.getByRole('button',{name:'CSV',exact:true}).click();
  await (await csv).saveAs(path.join(out,'frame-production.zip'));
  checks.push('Browser production export downloads one ZIP containing real Rust-generated CSV files');
  const cnc = page.waitForEvent('download');
  await page.getByRole('button',{name:'CNC G-code',exact:true}).click();
  await (await cnc).saveAs(path.join(out,'frame-cnc.zip'));
  checks.push('Generic CNC preview downloads as a single archive for later machine-specific validation');
  for(const mode of ['light','dark']) {
    await page.getByLabel('Color mode',{exact:true}).selectOption(mode);
    await page.screenshot({path:path.join(out,`frame-file-workflows-${mode}.png`),animations:'disabled'});
  }
  assert.deepEqual(errors,[]);
  await fs.writeFile(path.join(out,'frame-file-workflows.json'),JSON.stringify({checkedAt:new Date().toISOString(),passed:true,checks,errors},null,2)+'\n');
  console.log(`PASS Frame file workflows: ${checks.length} checks`);
} catch(error) {
  await fs.writeFile(path.join(out,'frame-file-workflows.json'),JSON.stringify({checkedAt:new Date().toISOString(),passed:false,checks,errors,failure:String(error)},null,2)+'\n');
  throw error;
} finally { await browser.close(); }

