import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';

const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(process.env.FEM_TEST_URL || 'http://127.0.0.1:4296/');
  await page.locator('.fem-canvas-svg').waitFor();
  assert.equal(await page.locator('html').getAttribute('data-sv-mode'), 'dark');
  for (const mode of ['light', 'dark']) {
    await page.getByLabel('Color mode', { exact: true }).selectOption(mode);
    await page.reload();
    await page.locator('.fem-canvas-svg').waitFor();
    assert.equal(await page.locator('html').getAttribute('data-sv-mode'), mode);
    const colors = await page.locator('.fem-canvas-wrap').evaluate(element => ({ background: getComputedStyle(element).backgroundColor, text: getComputedStyle(element).color }));
    assert.equal(colors.background, mode === 'dark' ? 'rgb(27, 27, 27)' : 'rgb(238, 241, 245)');
    assert.equal(colors.text, mode === 'dark' ? 'rgb(255, 255, 255)' : 'rgb(23, 32, 43)');
    assert.ok(await page.locator('.fem-canvas-svg line').count() > 20);
    await page.screenshot({ path: `qa/readiness/fem-canonical-${mode}.png` });
  }
  const result = await page.evaluate(async () => {
    const response = await fetch('/api/doorsnede', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify([{ naam: 'Reference rectangle', soort: 'Rechthoek', h: 200, b: 100 }]) });
    return { status: response.status, result: await response.json() };
  });
  assert.equal(result.status, 200);
  assert.ok(Math.abs(result.result[0].area_mm2 - 20000) < 1);
  assert.equal(await page.locator('html').getAttribute('lang'), 'en');
  assert.deepEqual(errors, []);
  await fs.writeFile('qa/readiness/fem-browser.json', JSON.stringify({ checkedAt: new Date().toISOString(), passed: true, checks: ['default dark', 'theme persistence', 'surface and text colors', 'visible model geometry', 'real Rust section API', 'English runtime locale'] }, null, 2));
  console.log('PASS FEM canonical browser theme and actual Rust API');
} finally { await browser.close(); }
