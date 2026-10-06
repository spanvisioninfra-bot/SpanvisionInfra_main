import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import pdfLib from '../suite-hub/node_modules/pdf-lib/cjs/index.js';

const out = path.resolve('qa/readiness');
await fs.mkdir(out, { recursive: true });
const pdf = await pdfLib.PDFDocument.create();
for (const color of [pdfLib.rgb(.8, .1, .1), pdfLib.rgb(.1, .2, .8)]) {
  pdf.addPage([400, 300]).drawRectangle({ x: 0, y: 0, width: 400, height: 300, color });
}
const buffer = Buffer.from(await pdf.save());
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const errors = [], checks = [];
let page;
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, permissions: ['geolocation'], geolocation: { latitude: 52.08, longitude: 4.3 } });
  page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(process.env.GEO_TEST_URL || 'http://127.0.0.1:4235/');
  await page.getByRole('button', { name: 'Site plan', exact: true }).click();
  const input = page.locator('input[type=file][accept^=".pdf,"]');
  const upload = () => input.setInputFiles({ name: 'two-page-reference.pdf', mimeType: 'application/pdf', buffer });
  await upload();
  await page.locator('.pcrop-thumb').last().waitFor();
  assert.equal(await page.locator('.pcrop-thumb').count(), 2);
  assert.equal(await page.locator('.icrop-info').innerText(), '2 pages');
  await page.getByTitle('Page 2', { exact: true }).click();
  await page.locator('.icrop-rect').waitFor();
  await page.waitForFunction(() => /\d+ × \d+ px/.test(document.querySelector('.icrop-info')?.textContent || ''));
  const firstSize = await page.locator('.icrop-info').innerText();
  const handle = await page.locator('.icrop-h-se').boundingBox();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x - 75, handle.y - 60, { steps: 8 });
  await page.mouse.up();
  assert.notEqual(await page.locator('.icrop-info').innerText(), firstSize);
  const dimensions = (await page.locator('.icrop-info').innerText()).match(/(\d+) × (\d+) px/).slice(1).map(Number);
  await page.getByRole('button', { name: 'Crop & add', exact: true }).click();
  await page.locator('.icrop-backdrop').waitFor({ state: 'hidden' });
  await page.waitForFunction(() => document.querySelector('img.tek-overlay-img')?.complete);
  const image = await page.locator('img.tek-overlay-img').evaluate(img => {
    const canvas = document.createElement('canvas'); canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0);
    return { dimensions: [img.naturalWidth, img.naturalHeight], pixel: [...ctx.getImageData(1, 1, 1, 1).data], src: img.src };
  });
  assert.deepEqual(image.dimensions, dimensions);
  assert.ok(image.pixel[0] < 50 && image.pixel[1] < 90 && image.pixel[2] > 180 && image.pixel[3] === 255, 'The second page must remain blue in the actual cropped image');
  checks.push('Actual two-page PDF thumbnails, second-page selection, pointer crop resize and independently decoded output PNG');
  for (const mode of ['light', 'dark']) {
    await page.getByLabel('Color mode', { exact: true }).selectOption(mode);
    await page.waitForFunction(mode => document.documentElement.dataset.svMode === mode, mode);
    await page.screenshot({ path: path.join(out, `geo-pdf-${mode}.png`) });
  }
  checks.push('Imported overlay is displayed in both color modes');
  await upload();
  await page.getByTitle('Page 1', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.equal(await page.locator('img.tek-overlay-img').getAttribute('src'), image.src);
  await input.setInputFiles({ name: 'invalid.pdf', mimeType: 'application/pdf', buffer: Buffer.from('not a PDF') });
  await page.getByText('Unable to read PDF', { exact: true }).waitFor();
  await page.locator('.icrop-dialog').getByRole('button', { name: 'Close', exact: true }).click();
  assert.equal(await page.locator('img.tek-overlay-img').getAttribute('src'), image.src);
  await upload();
  await page.getByTitle('Page 1', { exact: true }).click();
  await page.getByRole('button', { name: 'Crop & add', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Another page' }).click();
  await page.getByTitle('Page 2', { exact: true }).click();
  await page.getByRole('button', { name: 'Crop & add', exact: true }).click();
  await page.locator('.icrop-backdrop').waitFor({ state: 'hidden' });
  checks.push('Cancel and invalid PDF preserve the current overlay; a valid retry and page reselection succeed');
  assert.deepEqual(errors, []);
  await fs.writeFile(path.join(out, 'geo-pdf-browser.json'), JSON.stringify({ checkedAt: new Date().toISOString(), passed: true, checks, errors }, null, 2));
  console.log('PASS Geotechnical real PDF page/crop/recovery workflow');
} catch (error) {
  await page?.screenshot({ path: path.join(out, 'geo-pdf-failure.png') }).catch(() => {});
  await fs.writeFile(path.join(out, 'geo-pdf-browser.json'), JSON.stringify({ checkedAt: new Date().toISOString(), passed: false, checks, errors, failure: error.stack || String(error) }, null, 2));
  throw error;
} finally { await browser.close(); }
