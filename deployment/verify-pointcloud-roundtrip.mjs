import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const out = path.resolve('qa/readiness');
const base = process.env.POINTCLOUD_TEST_URL || 'http://127.0.0.1:4250/';
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-unsafe-swiftshader'] });
const errors = [], checks = [];
const fixture = path.resolve('spanvision-pointcloud-workspace/tests/fixtures/rgb-classified');
// Independent first-point reading from the uncompressed source fixture.
const source = await fs.readFile(fixture + '.las');
const pointOffset = source.readUInt32LE(96);
const firstPoint = [0, 1, 2].map(axis => source.readInt32LE(pointOffset + axis * 4) * source.readDoubleLE(131 + axis * 8) + source.readDoubleLE(155 + axis * 8));
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  page.setDefaultTimeout(45000);
  page.on('pageerror', error => errors.push(error.message));
  for (const format of ['las', 'laz']) {
    await page.goto(base);
    await page.locator('input[type=file]').setInputFiles(fixture + '.' + format);
    await page.getByRole('button', { name: 'Load sample', exact: true }).waitFor({ state: 'hidden' });
    await page.waitForFunction(() => /64/.test(document.querySelector('.workspace-status')?.textContent || ''));
    for (const mode of ['light', 'dark']) {
      await page.getByLabel('Color mode', { exact: true }).selectOption(mode);
      await page.waitForFunction(mode => document.documentElement.dataset.svMode === mode, mode);
      await page.screenshot({ path: path.join(out, `pointcloud-${format}-${mode}.png`) });
    }
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'PLY (ASCII)', exact: true }).click();
    const download = await downloadPromise;
    const exportedPath = path.join(out, `pointcloud-${format}-roundtrip.ply`);
    await download.saveAs(exportedPath);
    const text = await fs.readFile(exportedPath, 'utf8');
    const [header, body] = text.split('end_header\n');
    const columns = header.split('\n').filter(line => line.startsWith('property')).map(line => line.split(' ').at(-1));
    const rows = body.trim().split('\n').map(row => Object.fromEntries(row.split(/\s+/).map((value, i) => [columns[i], Number(value)])));
    assert.equal(rows.length, 64);
    for (const [axis, name] of ['x', 'y', 'z'].entries()) assert.ok(Math.abs(rows[0][name] - firstPoint[axis]) < 1e-5, `${format}: original survey ${name} changed`);
    assert.deepEqual(rows.slice(0, 2).map(row => row.classification), [2, 6]);
    assert.ok(rows[0].red > 150 && rows[0].green > 90 && rows[0].blue > 60);
    await page.goto(base);
    await page.locator('input[type=file]').setInputFiles(exportedPath);
    await page.getByRole('button', { name: 'Load sample', exact: true }).waitFor({ state: 'hidden' });
    await page.waitForFunction(() => /64/.test(document.querySelector('.workspace-status')?.textContent || ''));
    checks.push(`${format.toUpperCase()}: real worker import, themes, export world coordinates/RGB/classes and PLY reimport`);
  }
  await page.goto(base);
  await page.locator('input[type=file]').setInputFiles({ name: 'invalid.ply', mimeType: 'application/octet-stream', buffer: Buffer.from('ply\nformat ascii 1.0\nelement vertex 1\nproperty float x\nproperty float y\nproperty float z\nend_header\n') });
  await page.getByText(/Truncated PLY/).first().waitFor();
  await page.locator('input[type=file]').setInputFiles(fixture + '.las');
  await page.getByRole('button', { name: 'Load sample', exact: true }).waitFor({ state: 'hidden' });
  checks.push('Malformed PLY reports a useful error and the worker accepts the next valid import');
  assert.deepEqual(errors, []);
  await fs.writeFile(path.join(out, 'pointcloud-roundtrip.json'), JSON.stringify({ checkedAt: new Date().toISOString(), passed: true, checks, errors }, null, 2));
  console.log('PASS Pointcloud browser source-coordinate and attribute round trips');
} catch (error) {
  await fs.writeFile(path.join(out, 'pointcloud-roundtrip.json'), JSON.stringify({ checkedAt: new Date().toISOString(), passed: false, checks, errors, failure: error.stack || String(error) }, null, 2));
  throw error;
} finally { await browser.close(); }
