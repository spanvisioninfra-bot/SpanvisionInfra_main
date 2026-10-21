import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { startAuditPreviews } from '../branding/audit-preview-server.mjs';

const root = path.resolve(import.meta.dirname, '..');
const brand = JSON.parse(await fs.readFile(path.join(root, 'branding/brand.json'), 'utf8'));
const output = path.join(root, 'qa/deployment/output/stl-toolbar-fix-2026-10-21');
await fs.mkdir(path.join(output, 'temp'), { recursive: true });
const preview = await startAuditPreviews(root, brand.modules, ['stl']);
const browser = await chromium.launch({ channel: 'msedge', headless: true, env: { ...process.env, TEMP: path.join(output, 'temp'), TMP: path.join(output, 'temp') } });
const results = [];
const overlaps = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

async function checkLayout(page) {
  const map = await page.locator('#map').boundingBox();
  const bar = await page.locator('#map-location-toolbar .sv-map-location').boundingBox();
  const attribution = await page.locator('.leaflet-control-attribution').boundingBox();
  assert.ok(map && bar && attribution);
  assert.ok(map.height >= 120);
  assert.equal(overlaps(map, bar), false, 'Location controls must be outside the map');
  assert.ok(bar.y >= map.y + map.height - 1, 'Location toolbar must be below the map');
  assert.equal(overlaps(bar, attribution), false);
  if (await page.locator('#map-guidance').isVisible()) {
    const guidance = await page.locator('#map-guidance').boundingBox();
    assert.equal(overlaps(bar, guidance), false, 'Location controls cover area instructions');
  }
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'No page overflow');
}

try {
  const cases = [
    ...[1440, 390].flatMap(width => ['dark', 'light'].map(mode => ({ width, mode }))),
    { width: 1440, mode: 'dark', saved: true },
    { width: 390, mode: 'dark', saved: true },
    { width: 390, mode: 'dark', denied: true },
    { width: 390, mode: 'light', area: true },
  ];
  for (const scenario of cases) {
    const context = await browser.newContext({ viewport: { width: scenario.width, height: scenario.width === 390 ? 844 : 900 } });
    try {
      await context.addInitScript(({ saved, denied, area }) => {
        window.__gpsCalls = 0;
        Object.defineProperty(navigator, 'permissions', { value: { query: async () => ({ state: 'prompt' }) } });
        Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition(success, error) {
          window.__gpsCalls++;
          if (denied) error({ code: 1 });
          else success({ coords: { latitude: 28.69384, longitude: 77.15052 } });
        } } });
        if (saved) localStorage.setItem('oststl.map', JSON.stringify({ center: [28.69384, 77.15052], zoom: 14, layer: 'Map' }));
        if (area) localStorage.setItem('3dmaps.project', JSON.stringify({ bbox_wgs84: [4.89, 52.36, 4.90, 52.37] }));
      }, scenario);
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('https://www.spanvisioninfra.com/__suite/location', route => route.fulfill({ json: { available: true, country: 'India', countryCode: 'IN', city: 'Delhi', latitude: 28.69384, longitude: 77.15052 }, headers: { 'Access-Control-Allow-Origin': '*' } }));
      await page.route('**/api/appinfo', route => route.fulfill({ json: { cloud: true, version: '1.1.1', services: {} } }));
      const url = new URL(preview.targets[0].url);
      url.searchParams.set('appearance', scenario.mode);
      await page.goto(url.href, { waitUntil: 'domcontentloaded' });
      await page.locator('#map-location-toolbar .sv-map-location').waitFor();
      if (scenario.saved || scenario.area) {
        assert.equal(await page.evaluate(() => window.__gpsCalls), 0);
        assert.ok((await page.locator('.sv-map-location').innerText()).includes('Saved or project location kept'));
      } else {
        await page.locator('#map[data-map-country-code="IN"]').waitFor();
        await page.getByRole('button', { name: 'Use my location', exact: true }).click();
        await page.locator(`.sv-map-location[data-location-state="${scenario.denied ? 'unavailable' : 'located'}"]`).waitFor();
      }
      await checkLayout(page);
      if (!scenario.area && !scenario.denied) {
        assert.ok(Math.abs(Number(await page.locator('#map').getAttribute('data-map-latitude')) - 28.69384) < 0.0001, 'Map keeps the saved or requested latitude');
        assert.ok(Math.abs(Number(await page.locator('#map').getAttribute('data-map-longitude')) - 77.15052) < 0.0001, 'Map keeps the saved or requested longitude');
      }
      const label = `${scenario.width}-${scenario.mode}${scenario.saved ? '-saved' : ''}${scenario.denied ? '-denied' : ''}${scenario.area ? '-area' : ''}`;
      await page.waitForFunction(() => {
        const tiles = [...document.querySelectorAll('#map .leaflet-tile')];
        return tiles.length > 0 && tiles.every(tile => tile.complete && tile.naturalWidth > 0);
      }, undefined, { timeout: 15000 });
      // Leaflet fades loaded tiles in; capture the settled canvas, not its first tile.
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(output, `${label}.png`) });
      if (scenario.width === 390) {
        await page.getByRole('button', { name: 'Settings', exact: true }).click();
        assert.equal(await page.locator('.map-workspace').isVisible(), false);
        if (!scenario.area) await page.locator('#btn-center-area').click();
        await page.getByRole('button', { name: 'Map', exact: true }).click();
        await checkLayout(page);
        assert.equal(await page.locator('#map-guidance').isVisible(), false, 'Selected area hides the initial instructions');
      }
      assert.deepEqual(errors, []);
      results.push({ label, passed: true });
      console.log(`PASS STL ${label}: location toolbar stays outside the map`);
    } finally { await context.close(); }
  }
} finally {
  await browser.close(); await preview.close();
  await fs.writeFile(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
}
assert.equal(results.length, 8);
