import assert from 'node:assert/strict';
import { backendServices } from './backend-services.mjs';
import { waitForBackend } from './service-readiness.mjs';

// Read-only data checks and a stateless reference calculation. No uploads,
// project changes, accounts, credentials, or private project data are logged.
await Promise.all(Object.entries(backendServices).map(async ([id, service]) => {
  await waitForBackend(id, service.origin + service.health);
  console.log(`PASS ${id}: live backend ready`);
}));

async function json(url, options = {}) {
  const response = await fetch(url, { ...options, cache: 'no-store', signal: AbortSignal.timeout(45000) });
  assert.equal(response.status, 200, `${url}: HTTP ${response.status}`);
  return response.json();
}

const bim = await json(backendServices.bim.origin + '/api/v2/projects');
assert.ok(Array.isArray(bim.projects));
console.log('PASS BIM: live project list');
const stl = await json(backendServices.stl.origin + '/api/appinfo');
assert.equal(stl.cloud, true);
assert.ok(stl.version);
console.log('PASS STL: live workspace information');
const input = [{ naam: 'Connection check', soort: 'Rechthoek', h: 200, b: 100 }];
for (const origin of [backendServices.fem.origin, 'https://spanvision-fem.vercel.app']) {
  const result = await json(origin + '/api/doorsnede', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  });
  assert.ok(Math.abs(result[0].area_mm2 - 20000) < 1);
  assert.ok(Math.abs(result[0].iy_mm4 - 100 * 200 ** 3 / 12) < 1);
  console.log(`PASS FEM: real Rust area and inertia via ${origin}`);
}
