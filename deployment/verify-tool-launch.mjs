import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { startAuditPreviews } from '../branding/audit-preview-server.mjs';
import { moduleUrl } from '../suite-hub/src/module-url.js';

// Exercise the built launcher under a public origin. Health endpoints deliberately
// fail: a separate backend must not stop users opening any of the 16 workspaces.
const root = path.resolve(import.meta.dirname, '..');
const brand = JSON.parse(await fs.readFile(path.join(root, 'branding/brand.json'), 'utf8'));
const manifest = JSON.parse(await fs.readFile(path.join(root, 'deployment/production.json'), 'utf8'));
const output = path.join(root, 'qa/deployment/output/launcher-map-fix-2026-10-21');
await fs.mkdir(path.join(output, 'temp'), { recursive: true });
const preview = await startAuditPreviews(root, brand.modules, ['hub']);
const browser = await chromium.launch({ channel: 'msedge', headless: true, env: { ...process.env, TEMP: path.join(output, 'temp'), TMP: path.join(output, 'temp') } });
const results = [];
try {
  for (const scenario of [
    ...brand.modules.map(module => ({ id: module.id, type: 'open' })),
    { id: 'stl', type: 'unavailable' },
    { id: 'stl', type: 'invalid-url' },
    { id: 'stl', type: 'retry' },
  ]) {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      const errors = [], healthRequests = [];
      let availabilityRequests = 0;
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.origin !== 'https://spanvisioninfra.com') return route.fulfill({ contentType: 'text/html', body: '<h1>Workspace opened</h1>' });
        if (url.pathname.startsWith('/__suite/ready/')) {
          healthRequests.push(url.pathname);
          return route.fulfill({ status: 503, json: { status: 'unavailable' } });
        }
        if (url.pathname === '/__suite/status') {
          availabilityRequests++;
          const data = structuredClone(manifest);
          const state = data.modules.find(module => module.id === scenario.id);
          if (scenario.type === 'unavailable' || (scenario.type === 'retry' && availabilityRequests === 1)) state.available = false;
          if (scenario.type === 'invalid-url') state.url = 'javascript:alert(1)';
          return route.fulfill({ json: data });
        }
        const local = new URL(url.pathname + url.search, preview.targets[0].url);
        const response = await fetch(local);
        return route.fulfill({ status: response.status, contentType: response.headers.get('content-type') || 'application/octet-stream', body: Buffer.from(await response.arrayBuffer()) });
      });
      await page.goto(`https://spanvisioninfra.com/launch.html?tool=${scenario.id}&appearance=dark`, { waitUntil: 'domcontentloaded' });
      const expected = moduleUrl(brand.modules.find(module => module.id === scenario.id), manifest.modules.find(module => module.id === scenario.id), 'dark', 'spanvisioninfra.com');
      if (['unavailable', 'invalid-url', 'retry'].includes(scenario.type)) {
        await page.locator('.tool-splash[data-state="error"]').waitFor({ timeout: 5000 });
        assert.equal(await page.locator('#splash-direct').isVisible(), false);
        if (scenario.type === 'retry') await page.getByRole('button', { name: 'Try again' }).click();
      }
      if (['open', 'retry'].includes(scenario.type)) await page.waitForURL(expected, { timeout: 5000 });
      assert.deepEqual(healthRequests, []);
      assert.deepEqual(errors, []);
      results.push({ ...scenario, passed: true });
      console.log(`PASS ${scenario.id}: ${scenario.type}, no blocking health request`);
    } finally { await context.close(); }
  }
} finally {
  await browser.close(); await preview.close();
  await fs.writeFile(path.join(output, 'launcher-results.json'), JSON.stringify(results, null, 2));
}
assert.equal(results.length, brand.modules.length + 3);
