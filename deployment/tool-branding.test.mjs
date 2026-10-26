import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { installWorkspaceUi } from './browser-ui.mjs';

const root = path.resolve(import.meta.dirname, '..');
const brand = JSON.parse(await fs.readFile(path.join(root, 'branding/brand.json'), 'utf8'));
const icons = JSON.parse(await fs.readFile(path.join(root, 'branding/tool-icons.json'), 'utf8'));
const release = JSON.parse(await fs.readFile(path.join(root, 'branding/release.json'), 'utf8'));

async function removeFixture(directory) {
  const temporaryRoot = await fs.realpath(os.tmpdir()), target = await fs.realpath(directory);
  assert.ok(target.startsWith(temporaryRoot + path.sep));
  assert.ok(/^spanvision-(tool|docker)-identity-/.test(path.basename(target)));
  await fs.rm(target, { recursive: true, force: true });
}

test('all 16 landing-page tools have their own icon and the v1.0 product release', () => {
  assert.equal(brand.modules.length, 16);
  assert.deepEqual(Object.keys(icons).sort(), brand.modules.map(tool => tool.id).sort());
  assert.equal(release.version, '1.0');
  assert.equal(new Set(Object.values(icons).map(icon => icon.lines)).size, 16);
});

test('branding installation is idempotent, embeds the tool icon and leaves application markup intact', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'spanvision-tool-identity-'));
  try {
    for (const id of ['stl', 'planner', 'cad']) {
      const fixture = `<!doctype html><html><head><script src="appearance.js" data-module="${id}"></script></head><body><button id="original-action">Open</button></body></html>`;
      await fs.writeFile(path.join(directory, 'index.html'), fixture);
      await installWorkspaceUi(directory);
      const first = await fs.readFile(path.join(directory, 'index.html'), 'utf8');
      await installWorkspaceUi(directory);
      const second = await fs.readFile(path.join(directory, 'index.html'), 'utf8');
      assert.equal(first, second);
      assert.equal((second.match(/id="sv-tool-identity-data"/g) || []).length, 1);
      assert.equal((second.match(/workspace-route\.js\?v=/g) || []).length, 1);
      assert(second.indexOf('workspace-route.js')<second.indexOf('src="appearance.js"'));
      assert.equal(second.includes('<base href="/app/">'),id==='cad');
      if(id!=='cad')assert(!second.includes('<base '),'ordinary fragment links must stay on the current page');
      assert.equal((second.match(/id="sv-light-mode-ui"/g) || []).length, 1);
      assert.ok(second.includes('light-mode.css?v='));
      assert.ok((await fs.stat(path.join(directory, '__spanvision-ui/light-mode.css'))).size > 0);
      const identity = JSON.parse(second.match(/id="sv-tool-identity-data"[^>]*>([^<]+)<\/script>/)[1]);
      assert.equal(identity.id, id);
      assert.equal(identity.version, '1.0');
      assert.deepEqual(identity.icon, icons[id]);
      assert.ok(second.includes('<button id="original-action">Open</button>'));
    }
  } finally { await removeFixture(directory); }
});

test('the Render Docker COPY layout includes everything the shared installer needs', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'spanvision-docker-identity-'));
  try {
    // On Linux, /../branding normalizes to /branding. A nested installer directory
    // reproduces that relative lookup inside a disposable Windows fixture.
    assert.equal(new URL('../branding/', 'file:///browser-ui.mjs').pathname, '/branding/');
    const installers = path.join(directory, 'installers');
    await fs.mkdir(installers);
    for (const name of ['browser-identity.mjs', 'browser-ui.mjs']) await fs.copyFile(path.join(root, 'deployment', name), path.join(installers, name));
    for (const name of ['browser-icons', 'browser-ui']) await fs.cp(path.join(root, 'deployment', name), path.join(installers, name), { recursive: true });
    await fs.mkdir(path.join(directory, 'branding'));
    for (const name of ['brand.json', 'release.json', 'tool-icons.json']) await fs.copyFile(path.join(root, 'branding', name), path.join(directory, 'branding', name));
    await fs.mkdir(path.join(directory, 'web'));
    await fs.copyFile(path.join(root, 'spanvision-stl-3d-map-workspace/web/index.html'), path.join(directory, 'web/index.html'));
    const installer = await fs.realpath(path.join(installers, 'browser-identity.mjs'));
    await promisify(execFile)(process.execPath, [installer, path.join(directory, 'web'), '/static/__spanvision-brand/'], { windowsHide: true });
    const html = await fs.readFile(path.join(directory, 'web/index.html'), 'utf8');
    assert.ok(html.includes('"id":"stl"'));
    assert.ok(html.includes('/static/__spanvision-ui/tool-identity.js?v='));
    const dockerfile = await fs.readFile(path.join(root, 'Dockerfile'), 'utf8');
    assert.ok(dockerfile.includes('COPY branding/brand.json branding/release.json branding/tool-icons.json /branding/'));
  } finally { await removeFixture(directory); }
});
