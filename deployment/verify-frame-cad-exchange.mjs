import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'qa/readiness');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const checks = [], errors = [];
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(process.env.CAD2D_TEST_URL || 'http://127.0.0.1:4220/');
  const choosing = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: /^Open file/ }).click();
  await (await choosing).setFiles(path.join(out, 'D100.dxf'));
  await page.locator('.web-start-overlay').waitFor({ state: 'hidden' });
  await page.waitForFunction(() => !!window.cad);
  const shapes = await page.evaluate(() => window.cad._entities.list());
  await fs.writeFile(path.join(out, 'frame-dxf-imported-shapes.json'), JSON.stringify(shapes, null, 2) + '\n');
  assert.ok(shapes.length > 10, `Expected workshop entities, found ${shapes.length}`);
  assert.ok(shapes.some(shape => shape.type === 'text' && shape.text.includes('Door A')));
  assert.ok(shapes.filter(shape => shape.type === 'text').every(shape => shape.isModelText === true));
  // DXF is Y-up; the editor's canvas coordinates are Y-down.
  const edges = [[[0,0],[900,0]], [[900,0],[900,-2100]], [[900,-2100],[0,-2100]], [[0,-2100],[0,0]]];
  for (const [start, end] of edges) assert.ok(shapes.some(shape => shape.type === 'line'
    && shape.start.x === start[0] && shape.start.y === start[1]
    && shape.end.x === end[0] && shape.end.y === end[1]), 'Frame outer outline retains 900 × 2100 mm in the receiving CAD editor');
  checks.push('Actual Frame DXF opens in 2D CAD with its dimensioned outline, text and drawing entities');
  for (const mode of ['dark', 'light']) {
    await page.getByLabel('Color mode', { exact: true }).selectOption(mode);
    assert.equal(await page.locator('html').getAttribute('data-sv-mode'), mode);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const view = await page.evaluate(() => ({ size: window.cad._viewport.canvasSize,
      viewport: window.cad._viewport.get(),
      corners: [[0,0],[900,0],[900,-2100],[0,-2100]].map(point => window.cad._viewport.worldToScreen(point)) }));
    assert.ok(view.size.width > 0 && view.size.height > 0);
    assert.ok(view.viewport.zoom >= 0.1, 'The door must remain large enough to read; imported text must not expand 100-fold at 1:100 paper scale');
    for (const point of view.corners) assert.ok(point.x >= 0 && point.x <= view.size.width
      && point.y >= 0 && point.y <= view.size.height, `DXF corner is outside the ${mode} canvas: ${JSON.stringify({point,view})}`);
    await page.screenshot({ path: path.join(out, `frame-dxf-cad-${mode}.png`), animations: 'disabled' });
  }
  checks.push('Imported DXF is displayed in both themes');
  await page.evaluate(() => { window.showSaveFilePicker = undefined; });
  await page.keyboard.press('Control+Shift+s');
  const dialog = page.getByRole('dialog', { name: 'Download project' });
  await dialog.getByRole('textbox').fill('Frame DXF exchange');
  const downloading = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Download .o2d', exact: true }).click();
  const savedPath = path.join(out, 'frame-dxf-exchange.o2d');
  await (await downloading).saveAs(savedPath);
  const saved = JSON.parse(await fs.readFile(savedPath, 'utf8'));
  assert.equal(saved.shapes.length, shapes.length);
  const reopened = await context.newPage();
  reopened.on('pageerror', error => errors.push(error.message));
  await reopened.goto(process.env.CAD2D_TEST_URL || 'http://127.0.0.1:4220/');
  const opening = reopened.waitForEvent('filechooser');
  await reopened.getByRole('button', { name: /^Open file/ }).click();
  await (await opening).setFiles(savedPath);
  await reopened.locator('.web-start-overlay').waitFor({ state: 'hidden' });
  await reopened.waitForFunction(() => !!window.cad);
  assert.deepEqual(await reopened.evaluate(() => window.cad._entities.list()), saved.shapes);
  const reopenedView = await reopened.evaluate(() => window.cad._viewport.get());
  assert.ok(Number.isFinite(reopenedView.zoom) && reopenedView.zoom > 0);
  const invalidChoice = reopened.waitForEvent('filechooser');
  await reopened.keyboard.press('Control+o');
  await (await invalidChoice).setFiles({ name: 'invalid.dxf', mimeType: 'application/dxf', buffer: Buffer.from('invalid DXF') });
  await reopened.getByText('No supported entities found in the DXF file.', {exact: true}).waitFor();
  assert.deepEqual(await reopened.evaluate(() => window.cad._entities.list()), saved.shapes);
  assert.deepEqual(await reopened.evaluate(() => window.cad._viewport.get()), reopenedView);
  checks.push('An invalid DXF preserves every entity and the viewport of the current drawing');
  const dwgChoice = reopened.waitForEvent('filechooser');
  await reopened.keyboard.press('Control+o');
  await (await dwgChoice).setFiles({ name: 'drawing.dwg', mimeType: 'application/acad', buffer: Buffer.from('AC1032') });
  await reopened.getByText('DWG import requires the Windows app. Convert the drawing to DXF to open it in the browser.', {exact: true}).waitFor();
  assert.deepEqual(await reopened.evaluate(() => window.cad._entities.list()), saved.shapes);
  assert.deepEqual(await reopened.evaluate(() => window.cad._viewport.get()), reopenedView);
  checks.push('Unsupported browser DWG import preserves the active drawing and reports its native requirement');
  checks.push('Received drawing saves as a CAD project and reopens without losing any imported entity');
  assert.deepEqual(errors, []);
  await fs.writeFile(path.join(out, 'frame-cad-exchange.json'), JSON.stringify({ checkedAt: new Date().toISOString(), passed: true, checks, entities: shapes.length, errors }, null, 2) + '\n');
  console.log(`PASS Frame → 2D CAD exchange: ${checks.length} workflows, ${shapes.length} entities`);
} catch (error) {
  await fs.writeFile(path.join(out, 'frame-cad-exchange.json'), JSON.stringify({ checkedAt: new Date().toISOString(), passed: false, checks, errors, failure: String(error) }, null, 2) + '\n');
  throw error;
} finally { await browser.close(); }
