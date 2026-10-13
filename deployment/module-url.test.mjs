import assert from 'node:assert/strict';
import test from 'node:test';
import { moduleUrl, toolLaunchUrl } from '../suite-hub/src/module-url.js';
const tool = { port: 4220, path: '/' };
test('local preview continues to open the local tool in the chosen theme', () => {
  assert.equal(moduleUrl(tool, {}, 'light', '127.0.0.1'), 'http://127.0.0.1:4220/?appearance=light');
});
test('production uses its deployment URL and preserves other query parameters', () => {
  assert.equal(moduleUrl(tool, { url: 'https://tool.vercel.app/draw?project=one' }, 'dark', 'spanvision-infra.vercel.app'), 'https://tool.vercel.app/draw?project=one&appearance=dark');
});
test('production never opens a visitors localhost or insecure/missing deployments', () => {
  for (const url of [undefined, 'not a URL', 'http://tool.example/', 'https://127.0.0.1:4220/']) {
    assert.equal(moduleUrl(tool, { url }, 'dark', 'spanvision-infra.vercel.app'), null);
  }
});

test('suite launch enters BIM and Speech workspaces instead of their landing pages', () => {
  const bim = new URL(moduleUrl({id:'bim'}, {url:'https://spanvision-bim.onrender.com/home'}, 'light', 'spanvision-infra.vercel.app'));
  assert.equal(bim.pathname, '/viewer');
  assert.equal(bim.searchParams.get('launch'), 'workspace');
  assert.equal(bim.searchParams.get('appearance'), 'light');
  const speech = new URL(moduleUrl({id:'speech'}, {url:'https://spanvision-speech.vercel.app/'}, 'dark', 'spanvision-infra.vercel.app'));
  assert.equal(speech.hash, '#workspace');
  const deepLink = new URL(moduleUrl({id:'speech'}, {url:'https://spanvision-speech.vercel.app/#transcribe'}, 'light', 'spanvision-infra.vercel.app'));
  assert.equal(deepLink.hash, '#transcribe');
});

test('tool cards open the splash on the hub origin, without accepting a redirect URL', () => {
  const location = {origin:'https://spanvision-infra.vercel.app',hostname:'spanvision-infra.vercel.app'};
  const url = new URL(toolLaunchUrl({id:'cad2d'}, {url:'https://spanvision-cad2d.vercel.app/'}, 'dark', location));
  assert.equal(url.origin, location.origin);
  assert.equal(url.pathname, '/launch.html');
  assert.equal(url.searchParams.get('tool'), 'cad2d');
  assert.equal(url.searchParams.get('appearance'), 'dark');
  assert.equal(url.searchParams.has('url'), false);
  assert.equal(toolLaunchUrl({id:'cad2d'}, {}, 'light', location), null);
});
