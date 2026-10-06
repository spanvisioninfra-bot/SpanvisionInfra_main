import { test, expect, type Page } from '@playwright/test';
import { seedProject, waitForOps } from './fixtures/ops';
import fs from 'node:fs';

async function noPageOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual((page.viewportSize()?.width ?? 0) + 1);
}

async function dialogFits(page: Page) {
  const dialog = page.getByRole('dialog').last();
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box).not.toBeNull();
  const viewport = page.viewportSize()!;
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);
  await noPageOverflow(page);
}

for (const width of [390, 768, 1440]) {
  test(`Spanvision: welkom, canvas, dialoog, instellingen en help op ${width}px`, async ({ page }) => {
    test.setTimeout(60_000);
    fs.mkdirSync('qa/spanvision', { recursive: true });
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    const errors: string[] = [];
    const upstreamRequests: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('request', r => { if (/openaec|open-aec/i.test(r.url())) upstreamRequests.push(r.url()); });
    await page.addInitScript(() => localStorage.setItem('ops-locale', 'en'));
    await page.goto('/');
    await waitForOps(page);
    await expect(page.locator('[data-ops-welcome-dialog]')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'spanvision-mono');
    await expect(page.getByRole('dialog')).toContainText('Spanvision Infra');
    await expect(page.getByRole('dialog')).toContainText('Open Vision Studio');
    await dialogFits(page);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `qa/spanvision/welcome-${width}.png` });
    await page.getByRole('button', { name: 'Skip', exact: true }).click();

    await seedProject(page, [
      { name: 'Site preparation', start: '2026-10-05', finish: '2026-10-09', durationDays: 5 },
      { name: 'Foundations & substructure', start: '2026-10-12', finish: '2026-10-23', durationDays: 10 },
      { name: 'Structural frame', start: '2026-10-26', finish: '2026-11-13', durationDays: 15 },
      { name: 'Building services', start: '2026-11-09', finish: '2026-11-20', durationDays: 10 },
      { name: 'Finishes & handover', start: '2026-11-23', finish: '2026-12-04', durationDays: 10 },
    ], 'Spanvision · Commercial development');
    await page.keyboard.press('Control+0');
    await expect.poll(() => page.evaluate(() => window.__OPS__!.store.getState().view.pendingFit)).toBeFalsy();
    await expect(page.getByTestId('gantt-primary-canvas')).toBeVisible();
    expect((await page.getByTestId('gantt-primary-canvas').boundingBox())!.width).toBeGreaterThan(100);
    await noPageOverflow(page);
    await expect(page.locator('body')).not.toContainText('Open Planner Studio');
    await expect(page.locator('body')).not.toContainText('OpenAEC');
    await page.screenshot({ path: `qa/spanvision/workspace-${width}.png` });

    if (width < 901) {
      const railTrigger = page.locator('[data-ops-rail-strip]');
      await expect(railTrigger).toBeVisible();
      await railTrigger.click();
      await expect(page.locator('[data-ops-rail]')).toBeVisible();
      const railBox = (await page.locator('[data-ops-rail]').boundingBox())!;
      expect(railBox.x + railBox.width).toBeLessThanOrEqual(width);
      await page.keyboard.press('Escape');
      await expect(railTrigger).toBeVisible();
      await expect(railTrigger).toBeFocused();
    }

    await page.locator('.quick-access-btn[title="New project"]').click();
    await dialogFits(page);
    await page.screenshot({ path: `qa/spanvision/project-${width}.png` });
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();

    await page.locator('.quick-access-btn[title="Settings"]').click();
    await dialogFits(page);
    const mono = page.locator('[data-ops-theme-card="spanvision-mono"]');
    await expect(mono).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Tab');
    await mono.focus();
    expect(await mono.evaluate(e => getComputedStyle(e).outlineStyle)).toBe('solid');
    expect(await mono.evaluate(e => getComputedStyle(e).backgroundColor)).toBe('rgb(51, 51, 51)');
    await page.screenshot({ path: `qa/spanvision/settings-${width}.png` });
    await page.getByRole('dialog').getByRole('button', { name: 'Language', exact: true }).click();
    const menu = page.locator('.ops-select__menu');
    await expect(menu).toBeVisible();
    const menuBox = (await menu.boundingBox())!;
    expect(menuBox.x).toBeGreaterThanOrEqual(0);
    expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(width + 1);
    await page.screenshot({ path: `qa/spanvision/dropdown-${width}.png` });
    await page.keyboard.press('Escape');
    await expect(page.locator('.settings-dialog')).toBeVisible();
    await expect(menu).toBeHidden();

    await page.locator('[data-ops-theme-card="light"]').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.locator('[data-ops-theme-card="spanvision-mono"]').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'spanvision-mono');
    await page.getByRole('dialog').getByRole('button', { name:'Close', exact:true }).first().click();

    await page.getByRole('button', { name: 'File', exact: true }).click();
    await page.getByRole('button', { name: 'Examples', exact: true }).click();
    await expect(page.locator('.backstage-main')).toBeVisible();
    expect(await page.locator('.backstage-main').evaluate(e => e.scrollWidth - e.clientWidth)).toBeLessThanOrEqual(1);
    await noPageOverflow(page);
    await page.screenshot({ path: `qa/spanvision/examples-${width}.png` });
    await page.getByRole('button', { name: 'Help', exact: true }).click();
    await expect(page.locator('.backstage-main')).toBeVisible();
    expect(await page.locator('.backstage-main').evaluate(e => e.scrollWidth - e.clientWidth)).toBeLessThanOrEqual(1);
    await noPageOverflow(page);
    await page.screenshot({ path: `qa/spanvision/help-${width}.png` });
    expect(errors).toEqual([]);
    expect(upstreamRequests).toEqual([]);
  });
}

test('Mono canvas laat tekenkleuren intact en onthoudt de voorkeur', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('ops-locale', 'en');
    localStorage.setItem('ops-welcomeSeen', 'true');
  });
  await page.goto('/');
  await waitForOps(page);
  const palette = await page.evaluate(async () => {
    const paletteUrl = '/src/engine/renderer/themePalette.ts';
    const { readGanttPalette } = await import(paletteUrl);
    return readGanttPalette();
  });
  expect(palette.bg.toUpperCase()).toBe('#1B1B1B');
  expect(palette.normal).toBe('#2563EB');
  expect(palette.critical).toBe('#DC2626');
  expect(palette.milestone).toBe('#7C3AED');
  expect(palette.accentOn).toBe('#000000');
  await page.locator('.quick-access-btn[title="Settings"]').click();
  await page.locator('[data-ops-theme-card="light"]').click();
  await page.reload();
  await waitForOps(page);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.locator('.quick-access-btn[title="Settings"]').click();
  await page.locator('[data-ops-theme-card="spanvision-mono"]').click();
  expect(await page.evaluate(() => localStorage.getItem('ops-theme'))).toBe('spanvision-mono');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'spanvision-mono');
});
