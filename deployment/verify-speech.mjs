import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const out = new URL('../qa/readiness/', import.meta.url);
const fixture = new URL('speech-jfk.wav', out);
try { await fs.access(fixture); } catch {
  const response = await fetch('https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/jfk.wav');
  if (!response.ok) throw new Error(`Speech fixture download failed: ${response.status}`);
  await fs.writeFile(fixture, Buffer.from(await response.arrayBuffer()));
}
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(process.env.SPEECH_TEST_URL || 'http://127.0.0.1:4298/#transcribe');
  await page.getByRole('button', { name: 'Import audio' }).click();
  await page.locator('dialog input[type=file]').setInputFiles({ name: 'invalid.wav', mimeType: 'audio/wav', buffer: Buffer.from('invalid audio') });
  await page.getByRole('button', { name: 'Transcribe recording' }).click();
  await page.getByRole('alert').filter({ hasText: 'cannot decode' }).waitFor();
  await page.locator('dialog input[type=file]').setInputFiles(fileURLToPath(fixture));
  await page.getByRole('button', { name: 'Transcribe recording' }).click();
  await page.getByText('Transcription complete. Review the text before using it.').waitFor({ timeout: 360000 });
  const text = await page.locator('dialog .sample-excerpt').innerText();
  assert.match(text, /Americans/i);
  assert.match(text, /your country/i);
  await page.getByRole('button', { name: 'Open transcript' }).click();
  assert.equal(await page.getByLabel('Edit transcript').inputValue(), text);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export text', exact: true }).click();
  const download = await downloadPromise;
  assert.equal(await fs.readFile(await download.path(), 'utf8'), text);
  assert.deepEqual(errors, []);
  await fs.writeFile(new URL('speech-browser.json', out), JSON.stringify({ passed: true, checkedAt: new Date().toISOString(), recording: 'Transformers.js JFK WAV fixture', transcript: text, invalidRecordingRejected: true, exportVerified: true }, null, 2));
  console.log('PASS real speech recognition, invalid recording rejection, editable transcript and text export');
} finally { await browser.close(); }
