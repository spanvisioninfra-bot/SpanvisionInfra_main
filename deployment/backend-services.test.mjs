import assert from 'node:assert/strict';
import { test } from 'node:test';
import http from 'node:http';
import { backendRoutes, backendServices } from './backend-services.mjs';
import { serviceIsReady, waitForBackend } from './service-readiness.mjs';
import { proxyBackend } from './backend-proxy.mjs';
import { api as stlApi } from '../spanvision-stl-3d-map-workspace/web/api.mjs';

test('hub checks all three backends; FEM routes stay separate from account APIs', () => {
  const hub = backendRoutes('hub');
  assert.equal(hub.length, 3);
  for (const id of ['bim', 'stl', 'fem']) {
    assert.equal(hub.find(route => route.src.endsWith('/' + id)).dest, backendServices[id].origin + backendServices[id].health);
  }
  const fem = backendRoutes('fem');
  assert.equal(fem[0].dest, 'https://spanvision-fem-engine.onrender.com/health');
  assert.equal(fem[1].dest, 'https://spanvision-fem-engine.onrender.com/api/$1');
  assert.deepEqual(backendRoutes('cad'), []);
  assert.ok([...hub, ...fem].every(route => route.headers['Cache-Control'] === 'no-store' && !route.src.includes('account')));
});

test('readiness validates the backend payload and retries GET only until Render is awake', async () => {
  const calls = [];
  const replies = [new Response('Starting', { status: 502 }), Response.json({ status: 'unavailable' }), Response.json({ status: 'ok' })];
  await waitForBackend('fem', '/health', { sleep: async () => {}, fetcher: async (url, options) => {
    calls.push({ url, ...options }); return replies.shift();
  } });
  assert.equal(calls.length, 3);
  assert.ok(calls.every(call => call.method === 'GET' && call.cache === 'no-store' && call.credentials === 'omit'));
  assert.equal(serviceIsReady('bim', { status: 'healthy' }), true);
  assert.equal(serviceIsReady('stl', { app: 'spanvision-stl-3d-map-workspace' }), true);
  assert.equal(serviceIsReady('fem', { status: 'healthy' }), false);
});

test('readiness can be cancelled and cannot wait forever', async () => {
  const controller = new AbortController();
  controller.abort(new DOMException('Cancelled', 'AbortError'));
  await assert.rejects(waitForBackend('fem', '/health', { signal: controller.signal }), { name: 'AbortError' });
  await assert.rejects(waitForBackend('fem', '/health', {
    timeoutMs: 20, intervalMs: 5, fetcher: async () => new Response('Starting', { status: 503 }),
  }), /longer to start/);
});

test('BIM readiness tolerates a slow health response without accepting a proxy error page', async () => {
  const calls = [];
  await waitForBackend('bim', '/__suite/ready/bim', {
    sleep: async () => {},
    fetcher: async (url, options) => {
      calls.push({ url, ...options });
      if (calls.length === 1) return new Response('<html>502</html>', { status: 502 });
      await new Promise(resolve => setTimeout(resolve, 40));
      options.signal.throwIfAborted();
      return Response.json({ status: 'healthy' });
    },
  });
  assert.equal(calls.length, 2);
  assert.ok(calls.every(call => call.method === 'GET' && call.credentials === 'omit'));
});

test('STL uses the private session and rejects an HTML fallback instead of treating it as data', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (path, options) => {
      assert.equal(path, '/api/area');
      assert.equal(options.cache, 'no-store');
      assert.equal(options.credentials, 'same-origin');
      return Response.json({ geojson: { features: [] } });
    };
    assert.deepEqual(await stlApi('/api/area', { method: 'POST' }), { geojson: { features: [] } });
    globalThis.fetch = async () => new Response('<html>App shell</html>');
    await assert.rejects(stlApi('/api/appinfo'), /did not return data/);
    globalThis.fetch = async () => Response.json({ detail: 'Workspace unavailable' }, { status: 503 });
    await assert.rejects(stlApi('/api/appinfo'), /Workspace unavailable/);
  } finally { globalThis.fetch = original; }
});

test('preview proxy forwards real JSON bodies, status codes, and busy retry headers', async () => {
  const backend = http.createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    res.writeHead(503, { 'Content-Type': 'application/json', 'Retry-After': '5' });
    res.end(JSON.stringify({ path: req.url, body: JSON.parse(body) }));
  });
  await new Promise(resolve => backend.listen(0, '127.0.0.1', resolve));
  const proxy = http.createServer((req, res) => proxyBackend(req, res, `http://127.0.0.1:${backend.address().port}${req.url}`));
  await new Promise(resolve => proxy.listen(0, '127.0.0.1', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${proxy.address().port}/api/toetsing`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ opdracht: 'check_steel_beams', inputs: [] }),
    });
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('retry-after'), '5');
    assert.deepEqual(await response.json(), { path: '/api/toetsing', body: { opdracht: 'check_steel_beams', inputs: [] } });
  } finally { await Promise.all([new Promise(resolve => proxy.close(resolve)), new Promise(resolve => backend.close(resolve))]); }
});
