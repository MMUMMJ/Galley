// A check that breaks says so, instead of looking like a clean story.
import { test, expect } from '@playwright/test';
import { openEditor } from './helpers.js';

test('a broken check is shown as one that couldn\'t run', async ({ page }) => {
  await openEditor(page);
  await page.evaluate(async () => {
    const { CHECKS } = await import('/src/checks/index.js');
    CHECKS.push({ id: 'broken', title: 'A broken check', run() { throw new Error('boom'); } });
  });
  await page.locator('#checks').click();
  await expect(page.locator('#checks-panel .check-error')).toContainText('couldn\'t run');
  await expect(page.locator('#checks-panel')).not.toContainText('No questions right now');
  await expect(page.locator('#checks')).toHaveAttribute('aria-label', /1 check couldn't run/);
});
