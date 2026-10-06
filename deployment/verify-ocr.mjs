/** Real browser OCR, PDF text-layer extraction and image/PDF downloads. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import pdfLib from '../suite-hub/node_modules/pdf-lib/cjs/index.js';
import * as pdfjs from '../suite-hub/node_modules/pdfjs-dist/legacy/build/pdf.mjs';
const { PDFDocument } = pdfLib;

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const findings = [];
try {
  const page = await browser.newPage();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(process.env.OCR_TEST_URL || 'http://127.0.0.1:4299/#modules');
  const bytes = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 1000; canvas.height = 300;
    const context = canvas.getContext('2d'); context.fillStyle = 'white'; context.fillRect(0, 0, 1000, 300);
    context.fillStyle = 'black'; context.font = 'bold 54px Arial';
    context.fillText('Spanvision Infra', 50, 100); context.font = '42px Arial'; context.fillText('Project 12345', 50, 200);
    return Array.from(Uint8Array.from(atob(canvas.toDataURL('image/png').split(',')[1]), char => char.charCodeAt(0)));
  });
  const png = Buffer.from(bytes);
  const pdf = await PDFDocument.create(); const embedded = await pdf.embedPng(png);
  for (let index = 0; index < 2; index++) pdf.addPage([750, 225]).drawImage(embedded, { x: 0, y: 0, width: 750, height: 225 });
  const inputs = [
    { name: 'image.png', mimeType: 'image/png', buffer: png, pages: 1 },
    { name: 'scan.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await pdf.save()), pages: 2 },
  ];
  for (const input of inputs) {
    await page.getByRole('button', { name: 'Explore scan & OCR' }).click();
    await page.locator('dialog input[type=file]').setInputFiles({ name: input.name, mimeType: input.mimeType, buffer: input.buffer });
    await page.getByRole('button', { name: 'Recognize text', exact: true }).click();
    await page.getByText('Recognition complete. Review the text before using it.').waitFor({ timeout: 180000 });
    const recognized = await page.locator('.scan-text').inputValue();
    assert.match(recognized, /Spanvision Infra/); assert.match(recognized, /12345/);
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download searchable PDF' }).click();
    const download = await downloadPromise;
    const loadingTask = pdfjs.getDocument({ data: new Uint8Array(await fs.readFile(await download.path())), isEvalSupported: false,
      standardFontDataUrl: fileURLToPath(new URL('../suite-hub/node_modules/pdfjs-dist/standard_fonts/', import.meta.url)).replaceAll('\\', '/') });
    const document = await loadingTask.promise;
    assert.equal(document.numPages, input.pages);
    const extracted = (await (await document.getPage(1)).getTextContent()).items.map(item => item.str).join(' ').replace(/\s+/g, ' ');
    assert.match(extracted, /Spanvision Infra/); assert.match(extracted, /12345/);
    await loadingTask.destroy();
    const textDownloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download text', exact: true }).click();
    const textDownload = await textDownloadPromise;
    assert.match(await fs.readFile(await textDownload.path(), 'utf8'), /12345/);
    findings.push({ input: input.name, recognized: true, searchablePdf: true, textDownload: true, pages: input.pages });
    await page.getByRole('button', { name: 'Done', exact: true }).click();
  }
  await page.getByRole('button', { name: 'Explore scan & OCR' }).click();
  const activeWorker = page.waitForEvent('worker');
  await Promise.all([activeWorker, page.getByRole('button', { name: 'Recognize text', exact: true }).click()]);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.locator('dialog').waitFor({state:'hidden'});
  await page.getByRole('button', { name: 'Explore scan & OCR' }).click();
  await page.getByRole('button', { name: 'Recognize text', exact: true }).waitFor({state:'visible'});
  assert.equal(await page.getByRole('button', { name: 'Recognize text', exact: true }).isEnabled(),true);
  await page.locator('dialog input[type=file]').setInputFiles({name:'broken.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.7\nbroken')});
  await page.getByRole('button', { name: 'Recognize text', exact: true }).click();
  await page.locator('dialog [role=alert]').waitFor();
  assert.equal(await page.getByRole('button', { name: 'Recognize text', exact: true }).isEnabled(),true);
  const longPdf=await PDFDocument.create();
  for(let index=0;index<26;index++)longPdf.addPage([100,100]);
  await page.locator('dialog input[type=file]').setInputFiles({name:'too-many.pdf',mimeType:'application/pdf',buffer:Buffer.from(await longPdf.save())});
  await page.getByRole('button', { name: 'Recognize text', exact: true }).click();
  await page.getByText('Process up to 25 pages at a time. Split larger PDFs in PDF Studio.',{exact:true}).waitFor();
  await page.locator('dialog input[type=file]').setInputFiles({name:'recovery.png',mimeType:'image/png',buffer:png});
  await page.getByRole('button', { name: 'Recognize text', exact: true }).click();
  await page.getByText('Recognition complete. Review the text before using it.').waitFor({timeout:180000});
  assert.match(await page.locator('.scan-text').inputValue(),/12345/);
  findings.push({cancellation:true,malformedPdfRejected:true,pageLimitEnforced:true,recoveryRecognition:true});
  assert.deepEqual(errors, []);
  await fs.writeFile(new URL('../qa/readiness/ocr-browser.json', import.meta.url), JSON.stringify({ verifiedAt: new Date().toISOString(), findings }, null, 2));
  console.log('PASS: real image and PDF recognition, searchable PDF text layers, and text downloads');
} finally { await browser.close(); }
