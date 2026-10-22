import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { startAuditPreviews } from '../branding/audit-preview-server.mjs';

const root = path.resolve(import.meta.dirname, '..');
const brand = JSON.parse(await fs.readFile(path.join(root, 'branding/brand.json'), 'utf8'));
const selected = process.argv.find(arg => arg.startsWith('--tools='))?.slice(8).split(',') || brand.modules.map(tool => tool.id);
const phase = process.argv.find(arg => arg.startsWith('--phase='))?.slice(8) || 'chrome';
assert.match(phase, /^[a-z0-9-]+$/);
const output = path.join(root, 'qa/deployment/output/frame-layout-2026-10-22');
await fs.mkdir(path.join(output, 'temp'), { recursive: true });
const previews = await startAuditPreviews(root, brand.modules, selected);
const browser = await chromium.launch({ channel: 'msedge', headless: true, env: { ...process.env, TEMP: path.join(output, 'temp'), TMP: path.join(output, 'temp') } });
const results = [];

async function assertNoAbout(page, label) {
  const entries = await page.locator('button,a,summary,[role="menuitem"],[role="tab"]').evaluateAll(elements => elements.filter(element => element.checkVisibility({ checkVisibilityCSS: true })).map(element => (element.getAttribute('aria-label') || element.innerText || element.getAttribute('title') || '').trim()).filter(text => /^(?:about(?:\s|$)|open[ -]source notices|legal and licenses|dependency licen[cs]es|read notices)/i.test(text)));
  assert.deepEqual(entries, [], `${label}: unexpected About/notices entry`);
}

async function enterWorkspace(page, id) {
  if (id === 'bim') {
    const link = page.getByRole('link', { name: /^Open BIM workspace/ }).first();
    await link.waitFor({ state: 'visible', timeout: 15000 });
    await link.click();
    await page.locator('.app-shell').waitFor({ timeout: 20000 });
  }
  if (id === 'speech') {
    const link = page.getByRole('link', { name: 'Open workspace', exact: false }).first();
    if (await link.isVisible()) await link.click();
  }
}

async function inspectNavigation(target) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 950 }, locale: 'en-GB' });
  const page = await context.newPage(), errors = [], checked = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(target.url, { waitUntil: 'domcontentloaded' });
    await page.getByLabel('Color mode', { exact: true }).waitFor({ timeout: 20000 });
    if (target.id === 'cad') {
      await page.waitForFunction(() => window.wasmBindings?.ocs_control_submit && document.querySelector('canvas') && !document.querySelector('#loading'), null, { timeout: 60000 });
      const engine = await page.evaluate(async () => {
        const bindings = window.wasmBindings;
        async function request(value) {
          const ticket = bindings.ocs_control_submit(JSON.stringify(value));
          const deadline = Date.now() + 10000;
          while (Date.now() < deadline) {
            const response = bindings.ocs_control_take(ticket);
            if (response) return JSON.parse(response);
            await new Promise(resolve => setTimeout(resolve, 50));
          }
          throw new Error('CAD did not answer its control request');
        }
        return { state: await request({ op: 'state' }), about: await request({ op: 'commands', name: 'ABOUT' }), options: await request({ op: 'commands', name: 'OPTIONS' }) };
      });
      assert.equal(engine.state.ok, true, 'CAD engine must be ready');
      assert.ok(engine.state.documents.some(document => document.id === engine.state.document_id && !document.start), 'CAD must open the drawing workspace');
      assert.equal(engine.about.ok, false, 'Removed About command must be unavailable');
      assert.equal(engine.about.code, 'unknown_command');
      assert.equal(engine.options.ok, true, 'Options must remain available');
      checked.push('engine-ready', 'drawing-workspace', 'about-command-removed', 'options-command-present');
      await page.screenshot({ path: path.join(output, 'cad-workspace.png') });
    }
    await page.waitForTimeout(300);
    await assertNoAbout(page, `${target.id}/start`); checked.push('start');
    await enterWorkspace(page, target.id);
    await page.waitForTimeout(200);
    await assertNoAbout(page, `${target.id}/workspace`); checked.push('workspace');
    const file = page.getByRole('button', { name: 'File', exact: true }).first();
    if (await file.isVisible()) {
      await file.click(); await page.waitForTimeout(200);
      await assertNoAbout(page, `${target.id}/file`); checked.push('file');
      if (['fem', 'calculation', 'geo', 'pile'].includes(target.id)) {
        for (const name of target.id === 'geo' ? ['Import', 'Export'] : ['Open', 'Import', 'Export']) {
          const item = page.locator('.backstage-item').filter({ has: page.locator('.backstage-item-label', { hasText: new RegExp(`^${name}(?:…|\\.\\.\\.)?$`) }) }).first();
          if (!await item.isVisible()) continue;
          await item.click();
          await page.waitForTimeout(150);
          assert.ok((await page.locator('.backstage-content').innerText()).trim().length > 10, `${target.id}/${name}: missing file panel`);
          await assertNoAbout(page, `${target.id}/${name}`); checked.push(name);
        }
      }
      const preferences = page.getByRole('button', { name: /^Preferences(?:\s|$)/ }).first();
      if (await preferences.isVisible()) {
        await preferences.click(); await page.waitForTimeout(200);
        await assertNoAbout(page, `${target.id}/preferences`); checked.push('preferences');
        await page.keyboard.press('Escape');
      }
      await page.keyboard.press('Escape');
    }
    for (const name of ['Settings', 'Preferences', 'Options']) {
      const button = page.getByRole('button', { name, exact: true }).first();
      if (!await button.isVisible() || !await button.isEnabled()) continue;
      await button.click(); await page.waitForTimeout(200);
      await assertNoAbout(page, `${target.id}/${name}`); checked.push(name);
      await page.keyboard.press('Escape');
    }
    if (target.id === 'pdf') {
      const help = page.getByRole('button', { name: 'Help', exact: true }).first();
      if (await help.isVisible()) { await help.click(); await page.waitForTimeout(200); await assertNoAbout(page, 'pdf/help'); checked.push('help'); }
    }
    if (target.id === 'speech') {
      await page.goto(new URL('#about', target.url).href);
      await page.waitForTimeout(200);
      assert.equal(new URL(page.url()).hash, '#workspace', 'Old Speech About bookmarks must open the workspace');
      await assertNoAbout(page, 'speech/legacy-bookmark'); checked.push('legacy-bookmark');
    }
    assert.deepEqual(errors, [], `${target.id}: browser exceptions`);
    results.push({ tool: target.id, passed: true, checked });
    console.log(`${target.id}: ${checked.join(', ')} passed`);
  } finally { await context.close(); }
}

async function inspectFrameLayout(target) {
  for (const mode of ['light', 'dark']) {
    for (const [width, zoom] of [[1764, 1], [1280, 1], [1024, 1], [1366, 1.5], [1280, 2], [390, 1]]) {
      // A zoomed browser uses a smaller CSS viewport at a higher pixel ratio.
      const context = await browser.newContext({ viewport: { width: Math.floor(width / zoom), height: Math.floor(950 / zoom) }, deviceScaleFactor: zoom, locale: 'en-GB' });
      const page = await context.newPage();
      try {
        const url = new URL(target.url); url.searchParams.set('appearance', mode);
        await page.goto(url.href, { waitUntil: 'domcontentloaded' });
        await page.getByLabel('Color mode', { exact: true }).waitFor();
        // Focusing an off-screen ribbon control used to scroll the whole #app
        // sideways despite overflow:hidden, cutting off its left-hand side.
        await page.locator('.ribbon-content button:enabled').last().focus();
        const ribbon = await page.locator('.ribbon-content').evaluate(element => {
          const box = element.getBoundingClientRect(), control = document.activeElement.getBoundingClientRect();
          return { left: box.left, right: box.right, controlLeft: control.left, controlRight: control.right, overflow: getComputedStyle(element).overflowX };
        });
        assert.equal(ribbon.overflow, 'auto');
        assert.ok(ribbon.controlLeft >= ribbon.left - 2 && ribbon.controlRight <= ribbon.right + 2, `Frame ${width}/${zoom}: focused ribbon control is clipped`);
        await page.locator('.ws-tab').last().focus();
        const shell = await page.locator('#app').evaluate(element => {
          const box = element.getBoundingClientRect();
          return { left: box.left, right: box.right, bottom: box.bottom, scroll: element.scrollLeft, pageScroll: document.scrollingElement.scrollLeft, viewport: innerWidth, viewportHeight: innerHeight };
        });
        assert.equal(shell.scroll, 0, 'Frame application must not scroll sideways');
        assert.equal(shell.pageScroll, 0, 'Frame page must not scroll sideways');
        assert.ok(shell.left >= -1 && shell.right <= shell.viewport + 1, `Frame ${width}/${zoom}: page extends outside viewport`);
        assert.ok(shell.bottom <= shell.viewportHeight + 1, `Frame ${width}/${zoom}: status bar extends below viewport`);
        await page.locator('.ribbon-content,.workspace-tabs').evaluateAll(elements => elements.forEach(element => { element.scrollLeft = 0; }));
        await page.screenshot({ path: path.join(output, `frame-${mode}-${width}-${zoom}.png`) });
        results.push({ tool: 'frame', mode, width, zoom, passed: true });
      } finally { await context.close(); }
    }
  }
  console.log('frame: 12 responsive layout and keyboard-focus checks passed');
}

try {
  for (const target of previews.targets) {
    try {
      await inspectNavigation(target);
      if (target.id === 'frame') await inspectFrameLayout(target);
    } catch (error) {
      results.push({ tool: target.id, passed: false, error: error.message });
      console.error(`${target.id}: ${error.message}`);
    }
  }
} finally {
  await browser.close(); await previews.close();
  await fs.writeFile(path.join(output, `${phase}-results.json`), JSON.stringify(results, null, 2));
}
if (results.some(result => !result.passed)) throw new Error(`Workspace checks failed; see ${output}`);
