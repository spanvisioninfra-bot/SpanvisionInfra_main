import assert from 'node:assert/strict';
import { test } from 'node:test';

test('FEM warms Render, queues real checks, rejects errors and never replays POST requests', async () => {
  const { engineRequest } = await import('../fem-vision-studio/design-mockup/src/lib/engineApi.ts');
  const original = globalThis.fetch;
  const calls = [];
  let active = 0, peak = 0;
  try {
    globalThis.fetch = async (url, options) => {
      calls.push({ url, ...options });
      if (url === '/api/engine-health') return Response.json({ status: 'ok' });
      active++; peak = Math.max(peak, active);
      await new Promise(resolve => setTimeout(resolve, 5));
      active--;
      const data = JSON.parse(options.body);
      if (data.fail) return Response.json({ detail: 'Rejected calculation' }, { status: 400 });
      return Response.json(data);
    };
    const result = await Promise.all([
      engineRequest('toetsing', { inputs: [1] }), engineRequest('doorsnede', [{ h: 200, b: 100 }]),
    ]);
    assert.equal(peak, 1);
    assert.deepEqual(result, [{ inputs: [1] }, [{ h: 200, b: 100 }]]);
    assert.equal(calls.filter(call => call.url === '/api/engine-health').length, 1);
    const posts = calls.filter(call => call.method === 'POST');
    assert.equal(posts.length, 2);
    assert.ok(posts.every(call => call.cache === 'no-store' && call.credentials === 'same-origin'));
    await assert.rejects(engineRequest('toetsing', { fail: true }), /Rejected calculation/);
    assert.equal(calls.filter(call => call.method === 'POST').length, 3);
    assert.deepEqual(await engineRequest('toetsing', { inputs: [] }), { inputs: [] });
    const controller = new AbortController(); controller.abort();
    const before = calls.length;
    await assert.rejects(engineRequest('toetsing', {}, controller.signal), { name: 'AbortError' });
    assert.equal(calls.length, before);
    const queuedInput = { inputs: [1] };
    const queued = engineRequest('toetsing', queuedInput);
    queuedInput.inputs[0] = 99;
    assert.deepEqual(await queued, { inputs: [1] });
    globalThis.fetch = async url => url === '/api/engine-health' ? Response.json({ status: 'ok' }) : new Response('<html>Fallback</html>');
    await assert.rejects(engineRequest('toetsing', {}), /did not return JSON/);
    let postsAfterDisconnect = 0;
    globalThis.fetch = async url => {
      if (url === '/api/engine-health') return Response.json({ status: 'ok' });
      postsAfterDisconnect++; throw new TypeError('Network failure');
    };
    await assert.rejects(engineRequest('toetsing', {}), /could not be reached/);
    assert.equal(postsAfterDisconnect, 1);
  } finally { globalThis.fetch = original; }
});
