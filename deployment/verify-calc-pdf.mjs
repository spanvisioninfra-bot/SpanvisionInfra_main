import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';
import pdfLib from '../suite-hub/node_modules/pdf-lib/cjs/index.js';

const pdf = await pdfLib.PDFDocument.create();
pdf.addPage([400, 300]).drawText('Spanvision PDF reference', { x: 30, y: 200 });
pdf.addPage([400, 300]).drawText('Second page', { x: 30, y: 200 });
const buffer = Buffer.from(await pdf.save());
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(process.env.CALC_TEST_URL || 'http://127.0.0.1:4297/');
  await page.getByRole('button', { name: 'PDF', exact: true }).click();
  await page.getByRole('button', { name: 'Open PDF workspace', exact: true }).click();
  const input = page.locator('input[type=file][accept=".pdf"]');
  await input.setInputFiles({ name: 'reference.pdf', mimeType: 'application/pdf', buffer });
  await page.waitForFunction(() => document.querySelector('canvas')?.width === 600);
  await page.waitForTimeout(500);
  assert.equal(await page.locator('canvas').first().evaluate(canvas => {
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    return pixels.some((value, index) => index % 4 === 3 && value > 0);
  }), true);
  await page.getByRole('button', { name: '📏 Length', exact: true }).click();
  const canvas = page.locator('canvas').last();
  await canvas.click({ position: { x: 50, y: 50 } });
  await canvas.dblclick({ position: { x: 200, y: 50 } });
  assert.match(await page.locator('body').innerText(), /0\.10 m/);
  await page.getByRole('button', { name: '+', exact: true }).first().click();
  await page.waitForFunction(() => document.querySelector('canvas')?.width === 700);
  assert.match(await page.locator('body').innerText(), /0\.10 m/);
  await page.getByRole('button', { name: '▶', exact: true }).click();
  await page.waitForTimeout(500);
  await input.setInputFiles({ name: 'invalid.pdf', mimeType: 'application/pdf', buffer: Buffer.from('not PDF') });
  await page.getByRole('alert').waitFor();
  assert.deepEqual(errors, []);
  await fs.writeFile('qa/readiness/calc-pdf-browser.json', JSON.stringify({ checkedAt: new Date().toISOString(), passed: true, checks: ['actual PDF rendering', 'measurement in PDF points', 'zoom stability', 'page navigation', 'invalid file rejection'] }, null, 2));
  console.log('PASS Calc real PDF browser workflow');
} finally {
  await browser.close();
}
