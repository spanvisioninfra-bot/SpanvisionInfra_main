import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { moduleUrl } from '../suite-hub/src/module-url.js';
import { backendServices } from '../deployment/backend-services.mjs';
import { waitForBackend } from '../deployment/service-readiness.mjs';
import { startAuditPreviews } from './audit-preview-server.mjs';

const root = path.resolve(import.meta.dirname, '..');
const output = path.resolve(root, 'qa/deployment/output/ui-english-audit-2026-10-15');
await fs.mkdir(output, { recursive: true });
const brand = JSON.parse(await fs.readFile(path.join(root, 'branding/brand.json'), 'utf8'));
let manifest = JSON.parse(await fs.readFile(path.join(root, 'deployment/production.json'), 'utf8'));
const local = process.argv.includes('--local');
if (!local) try {
  const response = await fetch('https://www.spanvisioninfra.com/__suite/status', { cache: 'no-store', signal: AbortSignal.timeout(15000) });
  if (response.ok) manifest = await response.json();
} catch { /* Keep known public deployments when the status endpoint is unavailable. */ }

const dutch = /\b(?:opslaan|annuleren|verwijderen|toevoegen|instellingen|weergave|eigenschappen|berekenen|waarschuwingen|geselecteerd|wachtwoord|gebruiker|mislukt|naamloos|ongedaan|breedte|hoogte|lengte|afdrukken|afmetingen|omschrijving|invoer|uitvoer|verbinding|plakken|kopi[eë]ren|knippen|bevestigen|ontbreekt|verplicht|aangemaakt|opgeslagen|tekeningen|kolommen|vernieuwen|bibliotheek|tekeninstellingen|voorkeuren|kantoorgebouw|projecten|beschrijving|toon|verberg|doorgetrokken|gestippeld|hartlijn|tagtekst|opleggingen|belastinggevallen|belastingcombinaties|doorbuiging|sneltoetsen|binnenkort|hernoemen|transparantie|toepassen|draairichting)\b/ig;
let targets = [{ id: 'hub', url: 'https://www.spanvisioninfra.com/' }, ...brand.modules.map(tool => ({
  id: tool.id, url: moduleUrl(tool, manifest.modules.find(item => item.id === tool.id), 'dark', 'www.spanvisioninfra.com'),
}))];
const selected = process.argv.slice(2).filter(argument => argument !== '--local');
const previews = local ? await startAuditPreviews(root, brand.modules, selected) : null;
if (previews) targets = previews.targets;
let browser;
const results = [];
const reportFile = path.join(output, local ? 'local-browser-audit.json' : 'live-browser-audit.json');
if (selected.length) {
  try { results.push(...JSON.parse(await fs.readFile(reportFile, 'utf8')).filter(result => !selected.includes(result.id))); }
  catch { /* The first targeted audit creates a new report. */ }
}
try {
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  for (const tool of targets.filter(item => !selected.length || selected.includes(item.id))) {
    console.log(`Scanning ${tool.id}…`);
    const result = { id: tool.id, url: tool.url, auditedAt: new Date().toISOString(), visitedViews: [], findings: [], documentData: [], errors: [] };
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'en-GB' });
    const page = await context.newPage();
    page.on('pageerror', error => result.errors.push(error.message));
    async function inspect(view) {
      result.visitedViews.push(view);
      const text = await page.evaluate(() => {
        const visible = element => element.getClientRects().length > 0;
        return [document.body.innerText, ...Array.from(document.querySelectorAll('[title], [aria-label], input[placeholder]'))
          .filter(visible).map(element => [element.getAttribute('title'), element.getAttribute('aria-label'), element.getAttribute('placeholder')].filter(Boolean).join(' '))].join('\n');
      });
      for (const line of text.split('\n')) {
        dutch.lastIndex = 0;
        if (dutch.test(line)) {
          const entry = { view, text: line.trim().slice(0, 500) };
          if (/^\s*(?:\d+\s+)?#\d+\s*=\s*IFC/.test(line)) result.documentData.push(entry);
          else result.findings.push(entry);
        }
      }
    }
    try {
      if (!local && backendServices[tool.id]) await waitForBackend(tool.id, backendServices[tool.id].origin + backendServices[tool.id].health);
      const response = await page.goto(tool.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      result.status = response.status();
      await page.waitForTimeout(tool.id === 'cad' ? 5000 : 2000);
      result.language = await page.locator('html').getAttribute('lang');
      await inspect('initial');
      if (tool.id === 'hub') for (const screen of ['modules', 'pricing', 'faq', 'login', 'signup', 'forgot', 'reset', 'account', 'admin']) {
        await page.goto(tool.url + '#' + screen, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(350); await inspect(screen);
      }
      const tabs = await page.locator('[role="tab"], button.ribbon-tab, button.tab-btn, button.sidebar-tab').evaluateAll(elements =>
        [...new Set(elements.filter(element => !element.disabled && element.getClientRects().length).map(element => element.textContent.trim()).filter(Boolean))].slice(0, 30));
      for (const name of tabs.sort((a, b) => Number(a === 'File') - Number(b === 'File'))) {
        const button = page.locator('[role="tab"], button.ribbon-tab, button.tab-btn, button.sidebar-tab').filter({ hasText: name }).first();
        try { if (await button.isVisible() && await button.isEnabled()) { await button.click({ timeout: 2500 }); await page.waitForTimeout(200); await inspect('tab: ' + name); await page.keyboard.press('Escape'); } }
        catch { /* Some tabs require a loaded document; their source text is audited separately. */ }
      }
      for (const name of ['Settings', 'Preferences', 'Options', 'About', 'Help', 'Symbol Library Settings']) {
        const button = page.getByRole('button', { name, exact: true }).first();
        try {
          if (await button.isVisible() && await button.isEnabled()) {
            await button.click({ timeout: 2000 }); await page.waitForTimeout(250); await inspect('dialog: ' + name);
            await page.keyboard.press('Escape');
          }
        } catch { /* Do not create, upload, save, or delete data to unlock a dialog. */ }
      }
      console.log(`${tool.id}: ${result.visitedViews.length} views, ${result.findings.length} Dutch text findings`);
    } catch (error) { result.error = error.message; console.log(`${tool.id}: ${error.message}`); }
    finally {
      results.push(result);
      await fs.writeFile(reportFile, JSON.stringify(results, null, 2));
      await context.close();
    }
  }
} finally { await browser?.close(); await previews?.close(); }
console.log(`Audit saved: ${output}`);
