import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { verifyFrameGlb } from './verify-frame-glb.mjs';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'qa/readiness');
const records = [], errors = [];
const consoleMessages = [];
const record = name => { records.push(name); console.log(`PASS ${name}`); };
// Hand-authored dimensions and units are independent of the exporter/parser.
const reference = `ISO-10303-21;HEADER;FILE_SCHEMA(('IFC4'));ENDSEC;DATA;
#1=IFCPROJECT('1e2Q_KeE19mOCq5dRQGCba',$,'Reference project',$,$,$,$,$,#2);
#2=IFCUNITASSIGNMENT((#3));#3=IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.);
#10=IFCWINDOW('1e2Q_KeE19mOCq5dRQGCbb',$,'Window A',$,$,$,$,'W100',1800.,1200.,.WINDOW.,.SINGLE_PANEL.,$);
#11=IFCDOOR('1e2Q_KeE19mOCq5dRQGCbc',$,'Door A',$,$,$,$,'D100',2100.,900.,.DOOR.,.SINGLE_SWING_LEFT.,$);
ENDSEC;END-ISO-10303-21;`;
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
const page = await context.newPage();
page.setDefaultTimeout(15000);
page.on('pageerror', e => errors.push(e.message));
page.on('console', e => { if (['error','warning'].includes(e.type())) consoleMessages.push(e.text()); });
const project = () => page.evaluate(async () => {
  const engine = await import('/wasm/ofs_wasm.js');
  return JSON.parse(engine.get_project()); // Observe the real engine, never seed it.
});
async function importText(text, name = 'frame-reference.ifc') {
  const choice = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'IFC Import', exact: true }).click();
  await (await choice).setFiles({ name, mimeType: 'application/x-step', buffer: Buffer.from(text) });
}
try {
  const recoveryPage = await context.newPage();
  await recoveryPage.route('**/wasm/ofs_wasm_bg.wasm', route => route.abort());
  await recoveryPage.goto(process.env.FRAME_TEST_URL || 'http://127.0.0.1:4294/?appearance=dark');
  await recoveryPage.getByRole('heading', { name: 'Frame Studio could not start' }).waitFor();
  assert.equal(await recoveryPage.getByRole('button', { name: 'IFC / Export', exact: true }).count(), 0);
  await recoveryPage.unroute('**/wasm/ofs_wasm_bg.wasm');
  await recoveryPage.getByRole('button', { name: 'Reload Frame Studio', exact: true }).click();
  await recoveryPage.getByRole('button', { name: 'IFC / Export', exact: true }).waitFor();
  await recoveryPage.close();
  record('A failed engine download shows a retry screen and cannot substitute fabricated model results');
  await page.goto(process.env.FRAME_TEST_URL || 'http://127.0.0.1:4294/?appearance=dark');
  await page.getByRole('button', { name: 'IFC / Export', exact: true }).click();
  assert.equal((await project()).kozijnen.length, 0);
  await importText('invalid IFC document', 'invalid.ifc');
  await page.getByText(/Unterminated IFC statement or string|not a complete IFC STEP document/).waitFor();
  assert.equal(await page.getByRole('dialog').count(), 0);
  assert.equal((await project()).kozijnen.length, 0);
  record('Invalid IFC is rejected and leaves the actual project unchanged');

  await importText(reference);
  const dialog = page.getByRole('dialog', { name: 'IFC frame dimensions' });
  await dialog.waitFor();
  const windowRow = dialog.getByRole('row').filter({ hasText: 'Window A' });
  const doorRow = dialog.getByRole('row').filter({ hasText: 'Door A' });
  assert.deepEqual(await windowRow.getByRole('cell').allTextContents(), ['Window','Window A','1200','1800','Add frame']);
  assert.deepEqual(await doorRow.getByRole('cell').allTextContents(), ['Door','Door A','900','2100','Add frame']);
  await page.screenshot({ path: path.join(out, 'frame-ifc-preview-dark.png'), animations: 'disabled' });
  record('The real WASM parser reads IFC millimetres and previews exact window/door dimensions');
  await windowRow.getByRole('button', { name: 'Add frame' }).click();
  await windowRow.getByRole('button', { name: 'Added' }).waitFor();
  let saved = await project();
  assert.equal(saved.kozijnen.length, 1);
  assert.equal(saved.kozijnen[0].name, 'Window A');
  assert.equal(saved.kozijnen[0].mark, 'W100');
  assert.equal(saved.kozijnen[0].frame.outerWidth, 1200);
  assert.equal(saved.kozijnen[0].frame.outerHeight, 1800);
  assert.equal(await windowRow.getByRole('button', { name: 'Added' }).isDisabled(), true);
  record('Adding an imported window creates a real Rust project frame and prevents a duplicate click');
  await doorRow.getByRole('button', { name: 'Add frame' }).click();
  await doorRow.getByRole('button', { name: 'Added' }).waitFor();
  saved = await project();
  assert.equal(saved.kozijnen.length, 2);
  const door = saved.kozijnen.find(k => k.mark === 'D100');
  assert.equal(door.frame.outerWidth, 900);
  assert.equal(door.frame.outerHeight, 2100);
  assert.equal(door.cells[0].panelType, 'door');
  record('Adding an imported door retains its dimensions and creates a door panel');
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();

  const lod = page.locator('select').filter({ has: page.locator('option', { hasText: 'LOD 400' }) });
  const exports = [];
  for (const detail of ['200', '300', '400']) {
    await lod.selectOption(detail);
    const downloading = page.waitForEvent('download');
    await page.getByRole('button', { name: 'IFC', exact: true }).click();
    const download = await downloading;
    assert.equal(download.suggestedFilename(), `D100_lod${detail}.ifc`);
    const output = path.join(out, download.suggestedFilename());
    await download.saveAs(output);
    const content = fs.readFileSync(output, 'utf8');
    assert.ok(content.includes("FILE_SCHEMA(('IFC4'))"));
    assert.ok(content.includes("'Spanvision Infra'"));
    const attributes = content.match(/=IFCDOOR\(([^;]+)\);/)[1].split(',');
    assert.equal(Number(attributes[8]), 2.1);
    assert.equal(Number(attributes[9]), 0.9);
    exports.push(content);
    record(`LOD ${detail} exports an actual IFC door with correct metre units`);
  }
  assert.ok(exports[0].length !== exports[1].length && exports[1].length !== exports[2].length);

  for (const [button, extension] of [['DXF', 'dxf'], ['glTF/GLB', 'glb']]) {
    const downloading = page.waitForEvent('download');
    await page.getByRole('button', { name: button, exact: true }).click();
    const download = await downloading;
    assert.equal(download.suggestedFilename(), `D100.${extension}`);
    await download.saveAs(path.join(out, download.suggestedFilename()));
  }
  const dxf = fs.readFileSync(path.join(out, 'D100.dxf'), 'utf8');
  const groups = dxf.trimEnd().split(/\r?\n/);
  assert.equal(groups.length % 2, 0);
  assert.ok(dxf.includes('AC1027'));
  assert.ok(dxf.includes('Door A'));
  assert.equal(groups.at(-2).trim(), '0'); assert.equal(groups.at(-1), 'EOF');
  record('DXF downloads a complete millimetre workshop drawing from the actual project');
  await verifyFrameGlb(path.join(out, 'D100.glb'));
  const glb = fs.readFileSync(path.join(out, 'D100.glb'));
  assert.equal(glb.readUInt32LE(0), 0x46546c67);
  const gltf = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString('utf8'));
  assert.equal(gltf.asset.version, '2.0');
  assert.equal(gltf.nodes[0].name, 'Door A');
  assert.equal(gltf.meshes[0].primitives.length, 5);
  assert.deepEqual(gltf.accessors[0].min, [0, 0, 0]);
  for (const [actual, expected] of gltf.accessors[0].max.map((v, i) => [v, [0.9, 2.1, 0.114][i]])) assert.ok(Math.abs(actual - expected) < 1e-6);
  record('GLB downloads actual metre geometry and passes Khronos validation without errors or warnings');

  await importText(exports[2], 'door-reimport.ifc');
  await dialog.waitFor();
  const reimport = dialog.getByRole('row').filter({ hasText: 'Door A' });
  assert.deepEqual(await reimport.getByRole('cell').allTextContents(), ['Door','Door A','900','2100','Add frame']);
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  assert.equal((await project()).kozijnen.length, 2);
  record('Downloaded IFC reimports without dimension/name drift; closing the review does not create another frame');

  const before = await project();
  await importText(reference.replace('1800.,1200.', '$,1200.'), 'missing-height.ifc');
  await page.getByText(/needs explicit OverallHeight/).waitFor();
  assert.deepEqual(await project(), before);
  record('Missing dimensions produce an actionable error and preserve existing edits');

  await importText(reference.replace('1800.,1200.', '1900.,1200.'), 'valid-retry.ifc');
  await dialog.waitFor();
  assert.equal(await dialog.getByRole('row').filter({ hasText: 'Window A' }).getByRole('cell').nth(3).innerText(), '1900');
  await page.getByLabel('Color mode', { exact: true }).selectOption('light');
  assert.equal(await page.locator('html').getAttribute('data-sv-mode'), 'light');
  await page.screenshot({ path: path.join(out, 'frame-ifc-preview-light.png'), animations: 'disabled' });
  for (const width of [390,820,1440]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    assert.equal(await dialog.getByRole('button', { name: 'Close', exact: true }).isVisible(), true);
  }
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  record('A valid retry works and the review remains usable in light mode and three viewport widths');

  const comparison = page.getByRole('dialog', { name: 'IFC comparison', exact: true });
  const oldChoice = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Compare IFC', exact: true }).click();
  const oldChooser = await oldChoice;
  const nextChoice = page.waitForEvent('filechooser');
  await oldChooser.setFiles({ name: 'before.ifc', mimeType: 'application/x-step', buffer: Buffer.from(reference) });
  const modified = reference.replace('Window A', 'Renamed window').replace('1800.,1200.', '1800.25,1200.');
  await (await nextChoice).setFiles({ name: 'after.ifc', mimeType: 'application/x-step', buffer: Buffer.from(modified) });
  await comparison.waitFor();
  await comparison.getByText('0 added · 0 removed · 1 modified · 1 unchanged', { exact: true }).waitFor();
  assert.deepEqual(await comparison.getByRole('row').filter({ hasText: 'Height' }).getByRole('cell').allTextContents(), ['Height','1800 mm','1800.25 mm']);
  const reporting = page.waitForEvent('download');
  await comparison.getByRole('button', { name: 'Download comparison', exact: true }).click();
  const reportDownload = await reporting;
  const reportPath = path.join(out, reportDownload.suggestedFilename()); await reportDownload.saveAs(reportPath);
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  assert.equal(report.modified[0].changes.find(c => c.property === 'Name').newValue, 'Renamed window');
  assert.equal(report.modified[0].changes.find(c => c.property === 'Height').newValue, '1800.25 mm');
  await comparison.getByRole('button', { name: 'Close', exact: true }).click();
  record('Two actual IFC files produce a detailed comparison and downloaded full-precision change report');

  const roundtripChoice = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'IFC Roundtrip', exact: true }).click();
  await (await roundtripChoice).setFiles({ name: 'original.ifc', mimeType: 'application/x-step', buffer: Buffer.from(reference) });
  await comparison.waitFor();
  await comparison.getByText('0 added · 0 removed · 0 modified · 2 unchanged', { exact: true }).waitFor();
  await page.keyboard.press('Escape'); await comparison.waitFor({ state: 'hidden' });
  record('Project roundtrip matches original IFC Tags rather than unrelated new frame UUIDs or names');

  const ambiguousChoice = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'IFC Roundtrip', exact: true }).click();
  await (await ambiguousChoice).setFiles({ name:'duplicate-tags.ifc', mimeType:'application/x-step', buffer:Buffer.from(reference.replace("'D100'", "'W100'")) });
  await page.getByText(/cannot match duplicate identity Tag:W100/).waitFor();
  assert.equal(await comparison.isVisible(), false);
  assert.equal((await project()).kozijnen.length, 2);
  record('Ambiguous roundtrip Tags are rejected explicitly without modifying the project');
  assert.deepEqual(errors, []);
  assert.equal(consoleMessages.some(message => /Failed to decode downloaded font|OTS parsing error/.test(message)), false);
  fs.writeFileSync(path.join(out,'frame-ifc-browser.json'),JSON.stringify({ checkedAt:new Date().toISOString(),status:'passed',records,pageErrors:errors,limits:['Imports explicit overall dimensions and frame identity; it does not reconstruct source geometry, fittings or placement.','Windows GUI/installer acceptance remains outstanding.','GLB uses simplified rectangular members; PDF, XLSX and other exports require separate acceptance.']},null,2)+'\n');
} catch (error) {
  const diagnostic = await page.evaluate(() => ({
    text: document.body.innerText.slice(-5000),
    dialogs: [...document.querySelectorAll('[role="dialog"]')].map(e => ({ html: e.outerHTML, box: e.getBoundingClientRect().toJSON(), display: getComputedStyle(e).display })),
  })).catch(() => null);
  fs.writeFileSync(path.join(out,'frame-ifc-diagnostic.json'),JSON.stringify({ ...diagnostic, consoleMessages },null,2)+'\n');
  await page.screenshot({ path:path.join(out,'frame-ifc-failure.png'),animations:'disabled' }).catch(()=>{});
  fs.writeFileSync(path.join(out,'frame-ifc-browser.json'),JSON.stringify({ checkedAt:new Date().toISOString(),status:'failed',records,pageErrors:errors,error:String(error)},null,2)+'\n');
  throw error;
} finally { await browser.close(); }
