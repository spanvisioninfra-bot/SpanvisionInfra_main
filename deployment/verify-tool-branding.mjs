import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { startAuditPreviews } from '../branding/audit-preview-server.mjs';

const root = path.resolve(import.meta.dirname, '..');
const brand = JSON.parse(await fs.readFile(path.join(root, 'branding/brand.json'), 'utf8'));
const icons = JSON.parse(await fs.readFile(path.join(root, 'branding/tool-icons.json'), 'utf8'));
const release = JSON.parse(await fs.readFile(path.join(root, 'branding/release.json'), 'utf8'));
const output = path.join(root, 'qa/deployment/output/tool-branding-2026-10-21');
await fs.mkdir(path.join(output, 'temp'), { recursive: true });
const previews = await startAuditPreviews(root, brand.modules, ['hub', ...brand.modules.map(tool => tool.id)]);
const browser = await chromium.launch({ channel: 'msedge', headless: true, env: { ...process.env, TEMP: path.join(output, 'temp'), TMP: path.join(output, 'temp') } });
const results = [];
const interactionResults = [];
const interactionsOnly = process.argv.includes('--interactions-only');
try {
  for (const target of interactionsOnly ? [] : previews.targets) {
    for (const mode of ['dark', 'light']) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-GB' });
      try {
        const page = await context.newPage(), errors = [];
        page.on('pageerror', error => errors.push(error.message));
        const url = new URL(target.url);
        url.searchParams.set('appearance', mode);
        if (target.id === 'hub') url.hash = 'modules';
        await page.goto(url.href, { waitUntil: 'domcontentloaded' });
        if (target.id === 'hub') {
          await page.locator('.module-card').first().waitFor();
          assert.equal(await page.locator('.module-card').count(), 16);
          for (const tool of brand.modules) {
            const card = page.locator(`.module-card[data-module="${tool.id}"]`);
            assert.equal((await card.locator('.module-release').innerText()).trim(), `v${release.version}`);
            const paths = await card.locator('.tool-icon path').evaluateAll(nodes => nodes.map(node => node.getAttribute('d')));
            assert.deepEqual(paths, [icons[tool.id].tone, icons[tool.id].lines]);
          }
        } else {
          const logo = page.locator(`img[data-sv-tool-logo="${target.id}"]`).filter({ visible: true }).first();
          await logo.waitFor({ timeout: 15000 });
          await page.waitForFunction(id => [...document.querySelectorAll(`img[data-sv-tool-logo="${id}"]`)].some(image => image.complete && image.naturalWidth > 0), target.id);
          const svg = decodeURIComponent((await logo.getAttribute('src')).split(',').slice(1).join(','));
          assert.ok(svg.includes(`d="${icons[target.id].lines}"`), `${target.id} must use the landing-page icon`);
          assert.ok(svg.includes(`stroke="${await logo.getAttribute('data-sv-logo-ink')}"`));
          const badge = page.locator('.sv-tool-release').filter({ visible: true }).first();
          assert.equal((await badge.innerText()).trim(), `v${release.version}`);
          for (const legacy of await page.locator('[data-sv-engine-version]').all()) assert.equal(await legacy.isVisible(), false);
          const switcher = page.getByLabel('Color mode', { exact: true });
          await switcher.selectOption(mode === 'light' ? 'dark' : 'light');
          await page.waitForFunction(mode => document.documentElement.dataset.svMode === mode, mode === 'light' ? 'dark' : 'light');
          await page.waitForTimeout(100);
          assert.equal(await logo.isVisible(), true, 'Logo remains visible when the theme changes');
          await switcher.selectOption(mode);
          await page.waitForTimeout(100);
          if (target.id === 'cad') {
            const bar = await page.locator('.sv-canvas-brandbar').boundingBox();
            const canvas = await page.locator('body > canvas').boundingBox();
            assert.ok(canvas.y >= bar.y + bar.height - 1, 'CAD branding must not cover its drawing canvas');
          }
        }
        assert.deepEqual(errors, [], `${target.id} browser errors`);
        await page.screenshot({ path: path.join(output, `${target.id}-${mode}.png`), clip: { x: 0, y: 0, width: 1440, height: target.id === 'hub' ? 900 : 220 } });
        results.push({ tool: target.id, mode, passed: true });
        console.log(`PASS ${target.id} ${mode}: landing-page icon and v${release.version}`);
      } finally { await context.close(); }
    }
  }
  // Exercise native header actions in different editor shells. The shared
  // identity layer must leave their original buttons and event handlers intact.
  for (const [id, button, dialog] of [
    ['fem', 'Preferences', '.modal-overlay'],
    ['frame', 'Settings', '[role="dialog"]'],
    ['stl', 'About', '#about-dialog[open]'],
  ]) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-GB' });
    try {
      const page = await context.newPage();
      await page.goto(previews.targets.find(target => target.id === id).url, { waitUntil: 'domcontentloaded' });
      await page.locator(`img[data-sv-tool-logo="${id}"]`).filter({ visible: true }).first().waitFor();
      await page.getByRole('button', { name: button, exact: true }).first().click();
      await page.locator(dialog).filter({ visible: true }).first().waitFor();
      interactionResults.push({ tool: id, action: button, passed: true });
      console.log(`PASS ${id}: native ${button} action`);
    } finally { await context.close(); }
  }
  for (const id of ['cad', 'stl']) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-GB' });
    try {
      const page = await context.newPage();
      await page.goto(previews.targets.find(target => target.id === id).url, { waitUntil: 'domcontentloaded' });
      const logo = page.locator(`img[data-sv-tool-logo="${id}"]`).filter({ visible: true }).first();
      await logo.waitFor();
      for (const element of [logo, page.locator('.sv-tool-release').filter({ visible: true }).first(), page.getByLabel('Color mode', { exact: true })]) {
        const box = await element.boundingBox();
        assert.ok(box && box.x >= 0 && box.x + box.width <= 391, `${id} header stays within the narrow screen`);
      }
      await page.screenshot({ path: path.join(output, `${id}-narrow.png`) });
      interactionResults.push({ tool: id, action: 'narrow header', passed: true });
      console.log(`PASS ${id}: narrow header`);
    } finally { await context.close(); }
  }
} finally {
  await browser.close(); await previews.close();
  if (!interactionsOnly) await fs.writeFile(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
  await fs.writeFile(path.join(output, 'interaction-results.json'), JSON.stringify(interactionResults, null, 2));
}
assert.equal(results.length, interactionsOnly ? 0 : (brand.modules.length + 1) * 2);
assert.equal(interactionResults.length, 5);
