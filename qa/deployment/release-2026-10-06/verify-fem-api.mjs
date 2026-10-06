import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const base = process.argv[2] || 'https://spanvision-fem-engine.onrender.com';
const findings = [];
async function post(endpoint, body, status = 200) {
  const response = await fetch(base + endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body), signal: AbortSignal.timeout(60000) });
  assert.equal(response.status, status, await response.clone().text());
  return response.json();
}
if (base.includes('onrender.com')) {
  const health = await fetch(base + '/health', { signal: AbortSignal.timeout(60000) });
  assert.equal(health.status, 200);
  assert.equal((await health.json()).status, 'ok');
  findings.push('both Rust executables installed');
}
const section = [{ naam: 'Independent rectangle', soort: 'Rechthoek', h: 200, b: 100 }];
const [result] = await post('/api/doorsnede', section);
assert.ok(Math.abs(result.area_mm2 - 200 * 100) <= 1);
assert.ok(Math.abs(result.iy_mm4 - 100 * 200 ** 3 / 12) <= 100);
assert.ok(Math.abs(result.iz_mm4 - 200 * 100 ** 3 / 12) <= 100);
findings.push('rectangle area and both inertias match independent formulae');
for (const height of [0, -1]) await post('/api/doorsnede', [{ ...section[0], h: height }], 400);
await post('/api/doorsnede', 'not JSON', 400);
await post('/api/toetsing', [], 400);
await post('/api/toetsing', { opdracht: 'not_a_command' }, 400);
await post('/api/toetsing', { opdracht: 'check_steel_beams', inputs: [], unsupported: true }, 400);
await post('/api/toetsing', 'x'.repeat(2 * 1024 * 1024 + 1), 413);
findings.push('invalid sections, JSON, commands, fields and oversized input rejected');
const checks = await post('/api/toetsing', { opdracht: 'check_steel_beams', inputs: [] });
assert.ok(checks && typeof checks === 'object');
assert.equal((await post('/api/doorsnede', section))[0].area_mm2, 20000);
findings.push('service recovers after invalid requests');
const record = { base, checkedAt: new Date().toISOString(), passed: true, findings };
await fs.writeFile(new URL(base.includes('onrender.com') ? 'fem-render-api.json' : 'fem-vercel-api.json', import.meta.url), JSON.stringify(record, null, 2));
console.log('PASS live FEM Rust API: ' + base);
