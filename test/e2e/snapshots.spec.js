// Earlier versions: replacing the story keeps a copy that can be restored (and the restore undone).
import { test, expect } from '@playwright/test';
import { openEditor, openStoryFile, story, block, dismissToast } from './helpers.js';

test('a story replaced by New story can be brought back', async ({ page }) => {
  const errors = await openEditor(page);
  await openStoryFile(page, story({ title: 'Version A', blocks: [block('b1', 'text', { body: 'Words from version A.' })] }));
  await expect(page.locator('.rail-item')).toHaveCount(1);
  await dismissToast(page);
  await page.locator('#file').click();
  await page.locator('#new-story').click();
  await expect(page.locator('.rail-item')).toHaveCount(0);
  await page.locator('#file').click();
  await page.locator('#versions').click();
  const dialog = page.locator('.versions-dialog');
  await expect(dialog).toContainText('Version A');
  await expect(dialog).toContainText('Before starting a new story');
  await dialog.getByRole('button', { name: /^Restore the version/ }).first().click();
  await expect(page.locator('.canvas-page')).toContainText('Words from version A.');
  await page.locator('.toast').getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('.rail-item')).toHaveCount(0);
  expect(errors).toEqual([]);
});
