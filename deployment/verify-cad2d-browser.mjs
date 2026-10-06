import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const out = path.resolve('qa/readiness');
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const checks = [];
const errors = [];
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(process.env.CAD2D_TEST_URL || 'http://127.0.0.1:4220/');
  await page.getByRole('button', { name: /^New drawing/ }).click();
  await page.waitForFunction(() => !!window.cad);
  assert.equal(await page.locator('html').getAttribute('data-sv-mode'), 'dark');
  const panelSpacing = await page.getByText('Show Axes', { exact: true }).evaluate(element => {
    const section = element.closest('div.p-3');
    return section ? parseFloat(getComputedStyle(section).paddingTop) : 0;
  });
  assert.ok(panelSpacing >= 12, `Editor panel padding is missing: ${panelSpacing}`);
  await page.getByRole('button', { name: 'Rectangle', exact: true }).first().click();
  const canvas = await page.locator('canvas').first().boundingBox();
  assert.ok(canvas.width > 500 && canvas.height > 300);
  await page.mouse.click(canvas.x + 220, canvas.y + 180);
  await page.mouse.click(canvas.x + 490, canvas.y + 350);
  await page.keyboard.press('Escape');
  checks.push('Rectangle drawn through canvas mouse input');

  for (const mode of ['light', 'dark']) {
    await page.getByLabel('Color mode', { exact: true }).selectOption(mode);
    await page.waitForFunction(mode => document.documentElement.dataset.svMode === mode, mode);
    await page.waitForFunction(mode => {
      const input = document.querySelector('input.bg-cad-input');
      return input && getComputedStyle(input).backgroundColor === (mode === 'light' ? 'rgb(255, 255, 255)' : 'rgb(27, 27, 27)');
    }, mode);
    const dimensions = await page.locator('canvas').first().evaluate(canvas => ({ width: canvas.width, height: canvas.height }));
    assert.ok(dimensions.width > 500 && dimensions.height > 300);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    await page.screenshot({ path: path.join(out, `cad2d-drawing-${mode}.png`) });
  }
  checks.push('Light and dark canvas layout, dimensions and no page overflow');

  await page.getByText('Queries', { exact: true }).click();
  await page.getByTitle('New Query', { exact: true }).click();
  const sql = page.getByPlaceholder('SELECT * FROM shapes', { exact: true });
  await sql.fill('SELECT [type] FROM shapes');
  await page.getByTitle('Execute Query', { exact: true }).click();
  await page.locator('table tbody').getByText('rectangle', { exact: true }).waitFor();
  await sql.fill('SELECT FROM');
  await page.getByTitle('Execute Query', { exact: true }).click();
  await page.getByText('Parse error', { exact: false }).first().waitFor();
  await sql.fill('SELECT COUNT(*) AS [total] FROM shapes');
  await page.getByTitle('Execute Query', { exact: true }).click();
  assert.equal(await page.locator('table tbody td').first().textContent(), '1');
  checks.push('Browser SQL reads actual geometry and recovers after an invalid query');

  await page.evaluate(() => { window.showSaveFilePicker = undefined; });
  await page.keyboard.press('Control+Shift+s');
  await page.getByRole('dialog', { name: 'Download project' }).getByRole('textbox').fill('Readiness CAD round trip');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download .o2d', exact: true }).click();
  const download = await downloadPromise;
  const savedPath = path.join(out, 'cad2d-roundtrip.o2d');
  await download.saveAs(savedPath);
  const saved = JSON.parse(await fs.readFile(savedPath, 'utf8'));
  assert.equal(saved.shapes.length, 1);
  assert.equal(saved.shapes[0].type, 'rectangle');
  assert.ok(saved.shapes[0].width > 0 && saved.shapes[0].height > 0);
  assert.equal(saved.queries[0].sql, 'SELECT COUNT(*) AS [total] FROM shapes');
  checks.push('Downloaded project contains drawn geometry and saved SQL');

  await page.reload();
  await page.getByRole('button', { name: /^Restore draft/ }).waitFor();
  assert.equal(await page.locator('html').getAttribute('data-sv-mode'), 'dark');
  await page.getByRole('button', { name: /^Restore draft/ }).click();
  await page.locator('canvas').first().waitFor();
  checks.push('Browser draft and selected theme survive reload');

  const reopened = await context.newPage();
  reopened.on('pageerror', error => errors.push(error.message));
  await reopened.goto(process.env.CAD2D_TEST_URL || 'http://127.0.0.1:4220/');
  const chooserPromise = reopened.waitForEvent('filechooser');
  await reopened.getByRole('button', { name: /^Open file/ }).click();
  await (await chooserPromise).setFiles(savedPath);
  await reopened.locator('.web-start-overlay').waitFor({ state: 'hidden' });
  await reopened.getByText('Queries', { exact: true }).click();
  await reopened.getByText('Query 1', { exact: true }).click();
  await reopened.getByTitle('Execute Query', { exact: true }).click();
  assert.equal(await reopened.locator('table tbody td').first().textContent(), '1');
  checks.push('Downloaded .o2d reopens in a fresh page and queries restored geometry');
  assert.deepEqual(errors, [], 'Uncaught browser errors');
  await fs.writeFile(path.join(out, 'cad2d-browser.json'), JSON.stringify({ checkedAt: new Date().toISOString(), passed: true, checks, errors }, null, 2));
  console.log(`PASS 2D CAD browser: ${checks.length} drawing, query and persistence checks`);
} catch (error) {
  await fs.writeFile(path.join(out, 'cad2d-browser.json'), JSON.stringify({ checkedAt: new Date().toISOString(), passed: false, checks, errors, failure: error.stack || String(error) }, null, 2));
  throw error;
} finally { await browser.close(); }
