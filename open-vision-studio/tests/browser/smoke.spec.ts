import { expect, test } from '@playwright/test';

test('de ontwikkelapp start met de zelftestbrug', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#root > div')).toBeVisible();
  await expect.poll(() => page.evaluate(() => '__OPS__' in window)).toBe(true);
});

test('de suite opent de werkruimte zonder de welkomststap', async ({ page }) => {
  await page.goto('/?launch=workspace');
  await expect(page.locator('#root > div')).toBeVisible();
  await expect.poll(() => page.evaluate(() => '__OPS__' in window)).toBe(true);
  await page.waitForTimeout(1500);
  await expect(page.locator('[data-ops-welcome-dialog]')).toHaveCount(0);
});
