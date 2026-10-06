import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import sharp from 'sharp';

const root = path.resolve(import.meta.dirname, '../..');
const out = import.meta.dirname;
const records = [], errors = [];
const record = (name, detail = {}) => { records.push({ name, ...detail }); console.log(`PASS ${name} ${JSON.stringify(detail)}`); };
const fixture = fs.readFileSync(path.join(root, 'ifc-view/demo/Spanvision-IFC-View-Demo.ifc'));
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const page = await context.newPage();
page.setDefaultTimeout(15000);
page.on('pageerror', error => errors.push(error.message));
const upload = async (name, buffer) => {
  await page.locator('header input[type=file]').setInputFiles({ name, mimeType: 'application/octet-stream', buffer });
};
const canvasShot = async () => {
  await page.mouse.move(10, 10);
  await page.waitForTimeout(150);
  return page.locator('canvas').screenshot({ animations: 'disabled' });
};
async function differentPixels(a, b) {
  const [aa, bb] = await Promise.all([sharp(a).removeAlpha().raw().toBuffer({ resolveWithObject: true }), sharp(b).removeAlpha().raw().toBuffer({ resolveWithObject: true })]);
  assert.deepEqual(aa.info, bb.info);
  let changed = 0;
  for (let i = 0; i < aa.data.length; i += 3) {
    if (Math.abs(aa.data[i] - bb.data[i]) + Math.abs(aa.data[i+1] - bb.data[i+1]) + Math.abs(aa.data[i+2] - bb.data[i+2]) > 24) changed++;
  }
  return changed;
}
try {
  await page.goto(process.env.IFC_TEST_URL || 'http://127.0.0.1:3005/?appearance=dark');
  await page.getByRole('button', { name: 'Choose file', exact: true }).waitFor();
  assert.equal(await page.locator('html').getAttribute('lang'), 'en');
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'spanvision-mono');
  assert.equal(await page.getByRole('button', { name: 'Export parameter CSV' }).isDisabled(), true);
  await upload('invalid.ifc', Buffer.from('invalid IFC data'));
  await page.getByText('Error loading: The file is not an IFC STEP document.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Choose file', exact: true }).waitFor();
  record('Invalid initial IFC is rejected without a false success or stuck loading state');

  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Choose file', exact: true }).focus();
  await page.keyboard.press('Enter');
  const chooser = await chooserPromise;
  await chooser.setFiles({ name: 'readiness-demo.ifc', mimeType: 'application/octet-stream', buffer: fixture });
  await page.getByText('6 elements loaded', { exact: true }).waitFor();
  const parameter = page.getByLabel('Sequence parameter');
  assert.match(await parameter.inputValue(), /Mark/);
  const slider = page.getByRole('slider', { name: 'visible', exact: true });
  assert.equal(await slider.getAttribute('aria-valuemax'), '3');
  await page.getByTitle('Last (End)', { exact: true }).click();
  assert.equal(await slider.getAttribute('aria-valuenow'), '3');
  const modelShot = await canvasShot();
  fs.writeFileSync(path.join(out, 'ifc-model-dark.png'), modelShot);
  record('Real web-ifc WASM parses the six-element IFC and exposes three Mark groups');
  record('The file chooser opens through keyboard activation');

  await page.getByTitle('First (Home)', { exact: true }).click();
  await page.getByTitle('Next (→)', { exact: true }).click();
  assert.equal(await slider.getAttribute('aria-valuenow'), '1');
  await slider.focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await slider.getAttribute('aria-valuenow'), '2');
  await page.getByTitle('First (Home)', { exact: true }).click();
  await page.getByTitle('Play (Space)', { exact: true }).click();
  assert.equal(await slider.getAttribute('aria-valuenow'), '1');
  await page.locator('body').click({ position: { x: 2, y: 50 } });
  await page.keyboard.press('Space');
  await page.getByTitle('Play (Space)', { exact: true }).waitFor();
  const paused = await slider.getAttribute('aria-valuenow');
  await page.waitForTimeout(1250);
  assert.equal(await slider.getAttribute('aria-valuenow'), paused);
  record('Button/keyboard playback share one timer; keyboard pause stays paused and slider arrows advance once');

  await page.getByTitle('Last (End)', { exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export parameter CSV' }).click();
  const download = await downloadPromise;
  const csvPath = path.join(out, 'ifc-parameters.csv');
  await download.saveAs(csvPath);
  const csv = fs.readFileSync(csvPath, 'utf8');
  assert.equal(csv.split('\r\n').filter(Boolean).length, 7);
  for (const id of [109,127,137,147,157,167]) assert.ok(csv.includes(`"${id}"`));
  record('Parameter CSV download contains every actual IFC Express ID', { rows: 6, filename: download.suggestedFilename() });

  const beforeBad = await canvasShot();
  await upload('corrupt-second.ifc', Buffer.from('wrong data'));
  await page.getByText('Error loading: The file is not an IFC STEP document.', { exact: true }).waitFor();
  assert.equal(await page.locator('[title="readiness-demo.ifc"]').count(), 1);
  assert.equal(await page.getByRole('button', { name: 'Export parameter CSV' }).isDisabled(), false);
  assert.match(await parameter.inputValue(), /Mark/);
  assert.equal(await differentPixels(beforeBad, await canvasShot()), 0);
  record('A bad second import preserves the active document, selected parameter and rendered geometry');

  await page.getByTitle('Reset view (Esc)', { exact: true }).click();
  const structure = page.getByRole('button', { name: /2 02 Structure 4 elements/ });
  await structure.click();
  assert.equal(await structure.getAttribute('aria-pressed'), 'true');
  const isolated = await canvasShot();
  const isolationDifference = await differentPixels(beforeBad, isolated);
  assert.ok(isolationDifference > 100, `Isolation did not change geometry: ${isolationDifference}`);
  record('Value-group filtering changes real rendered geometry', { changedPixels: isolationDifference });

  await upload('second-demo.ifc', fixture);
  await page.getByText('6 elements loaded', { exact: true }).waitFor();
  assert.equal(await page.locator('[title="second-demo.ifc"]').count(), 1);
  await page.locator('[title="readiness-demo.ifc"]').click();
  assert.equal(await structure.getAttribute('aria-pressed'), 'true');
  assert.equal(await differentPixels(isolated, await canvasShot()), 0);
  record('Document switching restores the first document\'s isolation and camera');

  await page.getByTitle('Reset view (Esc)', { exact: true }).click();
  const options = await parameter.locator('option').evaluateAll(items => items.map(item => ({ value: item.value, text: item.textContent })));
  const material = options.find(item => item.value === 'Material');
  assert.ok(material, 'Single-valued Material parameter is missing');
  await parameter.selectOption('Material');
  assert.equal(await slider.getAttribute('aria-valuemax'), '1');
  await parameter.selectOption('');
  assert.equal(await page.getByTitle('Play (Space)', { exact: true }).isDisabled(), true);
  assert.equal(await page.getByRole('button', { name: 'Export parameter CSV' }).isDisabled(), true);
  const mark = options.find(item => /Mark/.test(item.value));
  await parameter.selectOption(mark.value);
  await page.getByTitle('Last (End)', { exact: true }).click();
  record('Single-group parameters work, and clearing the parameter disables stale playback/export');

  await page.getByLabel('Change appearance', { exact: true }).click();
  await page.getByLabel('Interface theme', { exact: true }).selectOption('light');
  await page.locator('body').click({ position: { x: 2, y: 50 } });
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
  const lightShot = await canvasShot();
  fs.writeFileSync(path.join(out, 'ifc-model-light.png'), lightShot);
  assert.ok(await differentPixels(modelShot, lightShot) > 1000);
  const canvasColor = await page.locator('canvas').evaluate(element => getComputedStyle(element).backgroundColor);
  assert.equal(canvasColor, 'rgb(238, 241, 245)');
  record('Light mode changes the live WebGL canvas and active geometry contrast', { canvasColor });

  for (const width of [320,390,820,1440]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    assert.equal(await page.getByRole('button', { name: 'Export parameter CSV' }).isVisible(), true);
    await page.screenshot({ path: path.join(out, `ifc-layout-${width}.png`), animations: 'disabled' });
    record('IFC workspace fits the viewport', { width });
  }
  await page.setViewportSize({ width:1440,height:900 });
  await page.locator('[title="readiness-demo.ifc"]').getByTitle('Close', { exact:true }).click();
  await page.locator('[title="second-demo.ifc"]').getByTitle('Close', { exact:true }).click();
  await page.getByRole('button', { name: 'Choose file', exact:true }).waitFor();
  assert.equal(await parameter.isDisabled(), true);
  await page.reload();
  await page.getByRole('button', { name: 'Choose file', exact:true }).waitFor();
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
  record('Closing all documents releases the viewer and stored theme survives a reload');
  assert.deepEqual(errors, []);
  fs.writeFileSync(path.join(out, 'ifc-browser.json'), JSON.stringify({ checkedAt:new Date().toISOString(), status:'passed', records, pageErrors:errors, limits:['IFC2X3 six-element fixture only; large/corrupt schema coverage and native Windows GUI/installer remain unverified.','CSV exports parameters; IFC authoring/export is not implemented.'] },null,2)+'\n');
} catch (error) {
  await page.screenshot({ path:path.join(out,'ifc-failure.png'),animations:'disabled' }).catch(()=>{});
  fs.writeFileSync(path.join(out,'ifc-browser.json'),JSON.stringify({ checkedAt:new Date().toISOString(),status:'failed',records,pageErrors:errors,error:String(error)},null,2)+'\n');
  throw error;
} finally { await browser.close(); }
