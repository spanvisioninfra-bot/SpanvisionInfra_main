import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startAuditPreviews } from './audit-preview-server.mjs';

const root = path.resolve(import.meta.dirname, '..');
const brand = JSON.parse(await fs.readFile(path.join(root, 'branding/brand.json'), 'utf8'));
const previews = await startAuditPreviews(root, brand.modules, ['geo', 'pointcloud', 'stl']);
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const results = [];
try {
  for (const target of previews.targets) {
    for (const area of [
      { country: 'India', countryCode: 'IN', city: 'Bengaluru', latitude: 12.97, longitude: 77.59 },
      { country: 'United States', countryCode: 'US', city: 'New York', latitude: 40.71, longitude: -74 },
      { country: 'United Kingdom', countryCode: 'GB', city: 'London', latitude: 51.51, longitude: -0.12 },
    ]) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'en-GB' });
      try {
        await context.addInitScript(() => {
          window.__auditGpsCalls = 0;
          Object.defineProperty(navigator, 'permissions', { value: { query: async () => ({ state: 'prompt' }) } });
          Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition() { window.__auditGpsCalls++; } } });
        });
        const page = await context.newPage();
        await page.route('https://www.spanvisioninfra.com/__suite/location', route => route.fulfill({ json: { available: true, source: 'approximate', ...area }, headers: { 'Access-Control-Allow-Origin': '*' } }));
        await page.goto(target.url, { waitUntil: 'domcontentloaded' });
        if (target.id === 'pointcloud') {
          await page.getByRole('button', { name: 'Tools', exact: true }).click();
          await page.getByRole('button', { name: '3D BAG', exact: true }).click();
        }
        await page.locator(`.leaflet-container[data-map-country-code="${area.countryCode}"]`).first().waitFor({ timeout: 15000 });
        const actual = await page.locator('.leaflet-container[data-map-country-code]').first().evaluate(element => {
          const workspace = element.closest('.mini-map-workspace') || element;
          const bar = workspace.querySelector('.sv-map-location');
          const mapRect = element.getBoundingClientRect(), barRect = bar.getBoundingClientRect();
          return { country: element.dataset.mapCountry, latitude: Number(element.dataset.mapLatitude), longitude: Number(element.dataset.mapLongitude), message: bar.textContent, gpsCalls: window.__auditGpsCalls, external: workspace !== element, overlapsMap: mapRect.x < barRect.right && mapRect.right > barRect.x && mapRect.y < barRect.bottom && mapRect.bottom > barRect.y };
        });
        assert.equal(actual.country, area.country);
        assert.ok(Math.abs(actual.latitude - area.latitude) < 0.0001, JSON.stringify(actual));
        assert.ok(Math.abs(actual.longitude - area.longitude) < 0.0001, JSON.stringify(actual));
        assert.ok(actual.message.includes(area.country));
        assert.equal(actual.gpsCalls, 0);
        if (target.id === 'geo') {
          assert.equal(actual.external, true);
          assert.equal(actual.overlapsMap, false, 'The location toolbar must not cover the small map');
        }
        results.push({ tool: target.id, country: area.country, result: 'passed' });
        console.log(`PASS ${target.id}: ${area.country}, real map centered without a GPS prompt`);
      } finally { await context.close(); }
    }
  }
} finally {
  await browser.close(); await previews.close();
  const output = path.join(root, 'qa/deployment/output/ui-english-audit-2026-10-15');
  await fs.mkdir(output, { recursive: true });
  await fs.writeFile(path.join(output, 'map-browser-checks.json'), JSON.stringify(results, null, 2));
}
assert.equal(results.length, 9);
