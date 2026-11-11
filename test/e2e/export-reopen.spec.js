// Export a ZIP, open it again: every block and file comes back.
import { test, expect } from '@playwright/test';
import { openEditor, openDemo, dismissToast, savedStory } from './helpers.js';

test('the demo story survives export and reopening', async ({ page }, info) => {
  const errors = await openEditor(page);
  await openDemo(page);
  const before = (await savedStory(page, (s) => s.blocks.length === 26)).blocks.map((b) => b.id);
  expect(before).toHaveLength(26);
  await page.locator('#file').click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('.menu-option', { hasText: 'Export: ZIP' }).click()]);
  const zip = info.outputPath('story.zip');
  await download.saveAs(zip);
  await dismissToast(page);
  // Start again, then open the ZIP.
  await page.locator('#file').click();
  await page.locator('#new-story').click();
  await expect(page.locator('.rail-item')).toHaveCount(0);
  await page.locator('#open + input[type=file]').setInputFiles(zip);
  await expect(page.locator('.rail-item')).toHaveCount(26, { timeout: 20_000 });
  await expect(page.locator('.toast')).toContainText('Opened');
  await expect(page.locator('.toast')).not.toContainText('missing');
  const after = (await savedStory(page, (s) => s.blocks.length === 26)).blocks.map((b) => b.id);
  expect(after).toEqual(before);
  const broken = await page.locator('.canvas-page img[data-il-asset]').evaluateAll((imgs) => Promise.all(imgs.map((i) => i.decode().then(() => 0, () => 1))).then((r) => r.reduce((a, b) => a + b, 0)));
  expect(broken).toBe(0);
  expect(errors).toEqual([]);
});
