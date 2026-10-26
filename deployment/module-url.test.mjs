import assert from 'node:assert/strict';
import test from 'node:test';
import { moduleUrl, toolLaunchUrl } from '../suite-hub/src/module-url.js';
const tool = { port: 4220, path: '/' };
test('local preview continues to open the local tool in the chosen theme', () => {
  assert.equal(moduleUrl(tool, {}, 'light', '127.0.0.1'), 'http://127.0.0.1:4220/?appearance=light');
});
test('production preserves document links without adding technical launch parameters', () => {
  assert.equal(moduleUrl(tool, { url: 'https://tool.vercel.app/draw?project=one' }, 'dark', 'spanvision-infra.vercel.app'), 'https://tool.vercel.app/draw?project=one');
});
test('production never opens a visitors localhost or insecure/missing deployments', () => {
  for (const url of [undefined, 'not a URL', 'http://tool.example/', 'https://127.0.0.1:4220/']) {
    assert.equal(moduleUrl(tool, { url }, 'dark', 'spanvision-infra.vercel.app'), null);
  }
});

test('suite launch enters BIM and Speech workspaces instead of their landing pages', () => {
  const bim = new URL(moduleUrl({id:'bim'}, {url:'https://spanvision-bim.onrender.com/home'}, 'light', 'spanvision-infra.vercel.app'));
  assert.equal(bim.pathname, '/workspace');
  assert.equal(bim.search, '');
  const speech = new URL(moduleUrl({id:'speech'}, {url:'https://spanvision-speech.vercel.app/'}, 'dark', 'spanvision-infra.vercel.app'));
  assert.equal(speech.pathname, '/workspace');assert.equal(speech.hash, '');
  const deepLink = new URL(moduleUrl({id:'speech'}, {url:'https://spanvision-speech.vercel.app/#transcribe'}, 'light', 'spanvision-infra.vercel.app'));
  assert.equal(deepLink.pathname, '/transcribe');assert.equal(deepLink.hash, '');
});

test('tool cards open the splash on the hub origin, without accepting a redirect URL', () => {
  const location = {origin:'https://spanvision-infra.vercel.app',hostname:'spanvision-infra.vercel.app'};
  const url = new URL(toolLaunchUrl({id:'cad2d'}, {url:'https://spanvision-cad2d.vercel.app/'}, 'dark', location));
  assert.equal(url.origin, location.origin);
  assert.equal(url.pathname, '/launch/cad2d');
  assert.equal(url.search, '');
  assert.equal(url.searchParams.has('url'), false);
  assert.equal(toolLaunchUrl({id:'cad2d'}, {}, 'light', location), null);
});
