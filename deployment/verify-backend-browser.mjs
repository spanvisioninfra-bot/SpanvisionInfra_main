import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { backendServices } from './backend-services.mjs';
import { proxyBackend } from './backend-proxy.mjs';

const root = path.resolve(import.meta.dirname, '..');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.wasm': 'application/wasm' };
let areaRequest;
let readinessChecks = 0;

async function serve(id, directory) {
  const server = http.createServer(async (req, res) => {
    if (id === 'hub' && req.url === '/__suite/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(await fs.readFile(path.join(root, 'deployment/production.json'))); return;
    }
    if (id === 'hub' && req.url === '/__suite/ready/fem') {
      readinessChecks++;
      res.writeHead(readinessChecks === 1 ? 503 : 200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: readinessChecks === 1 ? 'unavailable' : 'ok' })); return;
    }
    if (id === 'stl' && req.url === '/api/area') {
      // Exercise the real UI handler without fetching a large geographic area.
      let raw = ''; for await (const chunk of req) raw += chunk;
      areaRequest = JSON.parse(raw);
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ detail: 'Test: map source is unavailable' })); return;
    }
    if (req.url.startsWith('/api/')) {
      return proxyBackend(req, res, new URL(req.url === '/api/engine-health' ? '/health' : req.url, backendServices[id].origin));
    }
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const relative = id === 'stl' ? pathname.replace(/^\/static\//, '/') : pathname;
    const file = path.resolve(directory, '.' + (relative === '/' ? '/index.html' : relative));
    if (!file.startsWith(directory + path.sep)) { res.writeHead(403).end(); return; }
    try {
      const bytes = await fs.readFile(file);
      res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(bytes);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}

const servers = [];
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  for (const [id, directory] of [
    ['stl', 'spanvision-stl-3d-map-workspace/dist/web'],
    ['fem', 'fem-vision-studio/design-mockup/dist'],
  ]) {
    const host = await serve(id, path.join(root, directory)); servers.push(host.server);
    const page = await browser.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    if (id === 'stl') await page.addInitScript(() => localStorage.setItem('3dmaps.project', JSON.stringify({ bbox_wgs84: [4.89, 52.37, 4.891, 52.371] })));
    await page.goto(host.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    if (id === 'stl') {
      // Version and cloud/download controls must be populated from live Render data.
      await page.waitForFunction(() => document.getElementById('export-dir').value === 'Browser download', undefined, { timeout: 90000 });
      assert.equal(await page.locator('#export-dir').inputValue(), 'Browser download');
      await page.locator('#btn-load').click();
      await page.getByText('Test: map source is unavailable', { exact: true }).waitFor();
      assert.equal(areaRequest.refresh, true);
      assert.deepEqual(areaRequest.project.bbox_wgs84, [4.89, 52.37, 4.891, 52.371]);
      assert.equal(await page.locator('#busy').isVisible(), false);
      console.log('PASS STL browser: module loads, real backend information, fresh area request, visible server error');
    } else {
      await page.locator('.fem-canvas-svg').waitFor();
      const result = await page.evaluate(async () => {
        const health = await fetch('/api/engine-health', { cache: 'no-store' });
        const response = await fetch('/api/doorsnede', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify([{ naam: 'Browser check', soort: 'Rechthoek', h: 200, b: 100 }]) });
        return { health: await health.json(), status: response.status, data: await response.json() };
      });
      assert.equal(result.health.status, 'ok');
      assert.equal(result.status, 200);
      assert.equal(result.data[0].area_mm2, 20000);
      console.log('PASS FEM browser: workspace loads and proxy returns real Rust results');
    }
    assert.deepEqual(errors, [], `${id}: no uncaught browser errors`);
    await page.close();
  }
  const host = await serve('hub', path.join(root, 'suite-hub/dist')); servers.push(host.server);
  const page = await browser.newPage();
  // Use a production-style origin so the built launch page exercises Render
  // readiness rather than the intentional localhost preview bypass.
  await page.route('https://spanvision-preview.test/**', async route => {
    const url = new URL(route.request().url());
    await route.fulfill({ response: await page.request.get(host.url + url.pathname + url.search) });
  });
  await page.route('https://spanvision-fem.vercel.app/**', route => route.fulfill({ contentType: 'text/html', body: '<html lang="en">FEM destination</html>' }));
  await page.goto('https://spanvision-preview.test/launch.html?tool=fem&appearance=dark');
  await page.waitForURL(url => url.hostname === 'spanvision-fem.vercel.app', { timeout: 15000 });
  assert.equal(readinessChecks, 2);
  assert.equal(new URL(page.url()).searchParams.get('launch'), 'workspace');
  console.log('PASS hub browser: FEM splash waits through startup and opens the deployed workspace');
  await page.close();
} finally {
  await browser.close();
  await Promise.all(servers.map(server => new Promise(resolve => server.close(resolve))));
}
