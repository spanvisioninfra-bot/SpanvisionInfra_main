import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';

const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage();
  await page.goto(process.env.HUB_TEST_URL || 'http://127.0.0.1:4299/#account');
  await page.getByLabel('Display name').fill('Test Engineer');
  await page.getByRole('button', { name: 'Save profile' }).click();
  await page.getByText('Profile saved in this browser.').waitFor();
  await page.reload();
  assert.equal(await page.getByLabel('Display name').inputValue(), 'Test Engineer');
  await page.getByLabel('Display name').fill('   ');
  await page.getByRole('button', { name: 'Save profile' }).click();
  await page.getByText('Enter your display name.').waitFor();
  await page.reload();
  assert.equal(await page.getByLabel('Display name').inputValue(), 'Test Engineer');
  await page.evaluate(() => { location.hash = 'login'; });
  await page.waitForURL('**/#account');
  assert.equal(await page.locator('input[type=password],input[type=email]').count(), 0);
  for (const mode of ['light', 'dark']) {
    await page.getByLabel('Interface theme', { exact: true }).selectOption(mode);
    await page.reload();
    assert.equal(await page.locator('html').getAttribute('data-sv-mode'), mode);
    assert.equal(await page.getByLabel('Display name').inputValue(), 'Test Engineer');
  }
  await fs.writeFile(new URL('../qa/readiness/local-profile-browser.json', import.meta.url), JSON.stringify({
    verifiedAt: new Date().toISOString(), persistedAfterReload: true, blankNameRejected: true,
    legacySignInRedirect: true, credentialsRequested: false, themes: ['light', 'dark'],
  }, null, 2));
  console.log('PASS: anonymous local profile, persistence, validation, legacy routes, and both themes');
} finally { await browser.close(); }
