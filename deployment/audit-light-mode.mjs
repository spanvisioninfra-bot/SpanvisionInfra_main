import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { startAuditPreviews } from '../branding/audit-preview-server.mjs';

const root = path.resolve(import.meta.dirname, '..');
const brand = JSON.parse(await fs.readFile(path.join(root, 'branding/brand.json'), 'utf8'));
const option = name => process.argv.find(value => value.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const phase = option('phase') || 'before';
const mode = option('mode') || 'light';
const selected = option('tools')?.split(',') || ['hub', ...brand.modules.map(tool => tool.id)];
const quick = process.argv.includes('--quick');
const width = Number(option('width') || 1440);
const signedIn = process.argv.includes('--signed-in');
const verify = process.argv.includes('--verify');
const output = path.join(root, 'qa/deployment/output/light-mode-2026-10-21', phase);
await fs.mkdir(path.join(output, 'temp'), { recursive: true });
const previews = await startAuditPreviews(root, brand.modules, selected);
const browser = await chromium.launch({ channel: 'msedge', headless: true, env: { ...process.env, TEMP: path.join(output, 'temp'), TMP: path.join(output, 'temp') } });
const results = [];

// Measure only rendered UI text. Transparent backgrounds are composited through
// ancestors; gradients/images are reported separately for visual review.
function inspectContrast() {
  const colorCanvas = document.createElement('canvas'); colorCanvas.width = colorCanvas.height = 1;
  const colorContext = colorCanvas.getContext('2d', { willReadFrequently: true });
  const colors = new Map();
  const rgba = color => {
    if (!/^rgba?\(/.test(color)) {
      if (!colors.has(color)) {
        colorContext.clearRect(0, 0, 1, 1); colorContext.fillStyle = color; colorContext.fillRect(0, 0, 1, 1);
        const [r, g, b, a] = colorContext.getImageData(0, 0, 1, 1).data;
        colors.set(color, [r, g, b, a / 255]);
      }
      return colors.get(color);
    }
    const values = color.match(/[\d.]+/g)?.map(Number);
    return values?.length >= 3 ? [...values.slice(0, 3), values[3] ?? 1] : [0, 0, 0, 0];
  };
  const over = (front, back) => {
    const alpha = front[3] + back[3] * (1 - front[3]);
    return [...front.slice(0, 3).map((channel, i) => (channel * front[3] + back[i] * back[3] * (1 - front[3])) / (alpha || 1)), alpha];
  };
  const luminance = rgb => rgb.slice(0, 3).map(n => n / 255).map(n => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4).reduce((sum, n, i) => sum + n * [.2126, .7152, .0722][i], 0);
  const selector = element => element.id ? `#${CSS.escape(element.id)}` : element.tagName.toLowerCase() + [...element.classList].slice(0, 3).map(value => '.' + CSS.escape(value)).join('');
  const rows = [], seen = new Set();
  for (const element of document.body.querySelectorAll('*')) {
    if (element.closest('svg, canvas, script, style, option, [inert], [aria-hidden="true"]') || element.matches('input[type="checkbox"],input[type="radio"],input[type="color"],input[type="range"],input[type="file"]')) continue;
    const text = [...element.childNodes].filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent.trim()).filter(Boolean).join(' ') || (element.matches('input, textarea') ? element.value || element.placeholder : '');
    if (!/[\p{L}\p{N}]/u.test(text) || !element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
    const rect = element.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2 || rect.bottom < 0 || rect.top >= innerHeight || rect.right < 0 || rect.left >= innerWidth) continue;
    const x = Math.max(1, Math.min(innerWidth - 1, rect.left + rect.width / 2));
    const y = Math.max(1, Math.min(innerHeight - 1, rect.top + rect.height / 2));
    const hit = document.elementFromPoint(x, y);
    if (hit && !element.contains(hit) && !hit.contains(element)) continue;
    const style = getComputedStyle(element);
    const ink = rgba(element.matches('input, textarea') && !element.value && element.placeholder ? getComputedStyle(element, '::placeholder').color : style.color);
    let backdrop = [0, 0, 0, 0], opacity = 1, image = false;
    for (let parent = element; parent; parent = parent.parentElement) {
      const css = getComputedStyle(parent);
      opacity *= Number(css.opacity);
      if (backdrop[3] < .99) {
        image ||= css.backgroundImage !== 'none';
        backdrop = over(backdrop, rgba(css.backgroundColor));
      }
    }
    if (image || opacity < .05 || element.closest('button:disabled, input:disabled, select:disabled, [aria-disabled="true"], .disabled')) continue;
    backdrop = over(backdrop, [255, 255, 255, 1]);
    const renderedInk = over([...ink.slice(0, 3), ink[3] * opacity], backdrop);
    const light = luminance(renderedInk), dark = luminance(backdrop);
    const ratio = (Math.max(light, dark) + .05) / (Math.min(light, dark) + .05);
    const large = parseFloat(style.fontSize) >= 24 || parseFloat(style.fontSize) >= 18.66 && Number(style.fontWeight) >= 700;
    if (ratio >= (large ? 3 : 4.5)) continue;
    const key = selector(element) + ':' + text.slice(0, 80);
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ selector: selector(element), text: text.slice(0, 110), ratio: +ratio.toFixed(2), color: style.color, background: backdrop.slice(0, 3).map(Math.round), parents: [element.parentElement, element.parentElement?.parentElement].filter(Boolean).map(selector).join(' > ') });
  }
  return { mode: document.documentElement.dataset.svMode, overflow: document.documentElement.scrollWidth > innerWidth + 1, rows: rows.sort((a, b) => a.ratio - b.ratio) };
}

try {
  for (const target of previews.targets) {
    const context = await browser.newContext({ viewport: { width, height: 950 }, locale: 'en-GB', reducedMotion: 'reduce' });
    const page = await context.newPage(), errors = [], views = [];
    page.setDefaultTimeout(4000);
    page.on('pageerror', error => errors.push(error.message));
    const url = new URL(target.url); url.searchParams.set('appearance', mode);
    if (target.id === 'hub') {
      const user = { id: 'visual-audit', name: 'Sample Administrator', email: 'visual-audit@example.test', role: 'super_admin', emailVerified: true, access: { plan: 'team', source: 'super_admin', expiresAt: null } };
      await page.route('**/api/account/config', route => route.fulfill({ json: { authAvailable: true, databaseAvailable: true, passwordMinLength: 8, plans: [] } }));
      await page.route('**/api/account/session', route => route.fulfill({ json: { user: signedIn ? user : null } }));
      if (signedIn) {
        // Synthetic read-only fixtures. No real sign-in or administrative writes.
        await page.route('**/api/admin/users?*', route => route.fulfill({ json: { users: [user], page: 1, hasNext: false, total: 1 } }));
        await page.route('**/api/admin/user?*', route => route.fulfill({ json: { user, access: user.access, override: null, subscriptions: [], audit: [] } }));
        await page.route('**/api/billing/status', route => route.fulfill({ json: { subscriptions: [], access: user.access } }));
      }
    }
    async function inspect(name, screenshot = false) {
      await page.waitForTimeout(250);
      const result = await page.evaluate(inspectContrast);
      views.push({ name, ...result });
      if (screenshot || result.rows.some(row => row.ratio < 2)) await page.screenshot({ path: path.join(output, `${target.id}-${name.replace(/[^a-z0-9-]/gi, '-').slice(0, 75)}.png`), animations: 'disabled' });
    }
    try {
      await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 30000 });
      if (target.id === 'cad2d' && width < 768) await page.locator('.tablet-workspace').waitFor({ timeout: 20000 });
      else await page.getByLabel('Color mode', { exact: true }).waitFor({ timeout: 20000 });
      await page.waitForTimeout(target.id === 'cad' ? 2500 : 400);
      await inspect('initial', true);
      if (target.id === 'cad2d' && width < 768) {
        const dismiss = page.getByRole('button', { name: 'Got it', exact: true });
        if (await dismiss.isVisible()) await dismiss.click();
        await inspect('phone-workspace', true);
        for (const name of ['Search', 'Layers', 'Drawings']) {
          const button = page.getByRole('button', { name, exact: true }).first();
          if (await button.isVisible()) {
            await button.click(); await inspect('phone-' + name, true);
            const backdrop = page.locator('[class~="bg-black/40"]').filter({ visible: true }).first();
            if (await backdrop.count()) await backdrop.click({ position: { x: 2, y: 2 } });
            else await button.click();
          }
        }
      }
      if (!quick) {
        if (target.id === 'hub') {
          for (const route of ['modules','pricing','faq','login','signup','forgot','verify','reset','account','profile','admin']) {
            await page.goto(url.href + '#' + route, { waitUntil: 'domcontentloaded' });
            if (route === 'faq') await page.locator('details').evaluateAll(nodes => nodes.forEach(node => { node.open = true; }));
            await inspect(route, true);
            if (['modules', 'pricing', 'faq'].includes(route)) {
              await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
              await inspect(route + '-bottom', true);
              await page.evaluate(() => window.scrollTo(0, 0));
            }
          }
          await page.goto(url.href, { waitUntil: 'domcontentloaded' });
          await page.getByRole('button', { name: 'Explore scan & OCR', exact: true }).click();
          await inspect('scan-dialog', true); await page.keyboard.press('Escape');
          if (signedIn) {
            await page.goto(url.href + '#admin', { waitUntil: 'domcontentloaded' });
            await page.getByRole('button', { name: 'View plans →', exact: true }).first().click();
            await inspect('admin-user-dialog', true); await page.keyboard.press('Escape');
          }
        }
        if (target.id === 'cad2d') {
          await page.getByRole('button', { name: 'Project start', exact: true }).click();
          await page.locator('.web-start-brand').waitFor(); await inspect('welcome', true);
          await page.getByRole('button', { name: /^New drawing/ }).click();
        }
        if (target.id === 'bim') {
          const link = page.getByRole('link', { name: 'Open BIM workspace', exact: true });
          if (await link.count()) { await link.click(); await page.locator('.app-shell').waitFor(); await inspect('workspace', true); }
        }
        if (target.id === 'speech') {
          const open = page.getByRole('link', { name: 'Open workspace', exact: false }).first();
          if (await open.count()) { await open.click(); await inspect('workspace', true); }
        }
        if (target.id === 'ifc') {
          await page.locator('input[type="file"][accept*=".ifc"]').first().setInputFiles(path.join(root, 'ifc-view/demo/Spanvision-IFC-View-Demo.ifc'));
          await page.getByText('Drag your IFC file here', { exact: true }).waitFor({ state: 'hidden', timeout: 15000 });
          await inspect('loaded-example', true);
        }
        if (target.id === 'field') {
          for (const name of ['project','plattegrond','ifc','opname','inspectie','oplevering','dashboard','export','koppelingen','handleiding']) {
            await page.locator(`[data-tab="${name}"]`).click(); await inspect('tab-' + name);
          }
        } else {
          const selector = '[role="tab"], button.ribbon-tab, button.tab-btn, button.sidebar-tab, button.ribbon-tab-btn, button.tab, button.ws-tab, button.panel-tab, button.sidebar-item';
          const names = await page.locator(selector).evaluateAll(elements => [...new Set(elements.filter(el => !el.disabled && el.getClientRects().length).map(el => el.textContent.trim()).filter(Boolean))].slice(0, 40));
          for (const name of names.filter(name => !/^File$/i.test(name))) {
            try { await page.locator(selector).filter({ hasText: name }).first().click({ timeout: 1500 }); await inspect('tab-' + name); await page.keyboard.press('Escape'); } catch {}
          }
        }
        for (const name of ['Settings', 'Preferences', 'Options', 'About', 'Help']) {
          const button = page.getByRole('button', { name, exact: true }).first();
          try {
            if (await button.isVisible() && await button.isEnabled()) { await button.click({ timeout: 1500 }); await inspect('dialog-' + name, true); await page.keyboard.press('Escape'); }
          } catch {}
        }
      }
      await page.evaluate(mode => { window.SpanvisionAppearance.setMode(mode === 'light' ? 'dark' : 'light'); }, mode);
      await page.waitForTimeout(100);
      await page.evaluate(mode => window.SpanvisionAppearance.setMode(mode), mode);
      await page.waitForTimeout(100);
      if (await page.locator('html').getAttribute('data-sv-mode') !== mode) errors.push('Theme round trip failed');
      console.log(`${target.id}: ${views.length} views, ${new Set(views.flatMap(view => view.rows.filter(row => row.ratio < 3).map(row => row.selector + ':' + row.text))).size} text items below 3:1`);
    } catch (error) { errors.push(error.message); console.log(`ERROR ${target.id}: ${error.message.slice(0, 160)}`); }
    finally {
      results.push({ tool: target.id, errors, views }); await context.close();
      await fs.writeFile(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
    }
  }
} finally { await browser.close(); await previews.close(); }
if (verify && results.some(tool => tool.errors.length || tool.views.some(view => view.rows.length || view.overflow))) {
  throw new Error(`Light-mode review found browser errors, clipped pages or text contrast issues. See ${path.join(output, 'results.json')}`);
}
