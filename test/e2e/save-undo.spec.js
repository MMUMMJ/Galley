// Typing is saved in this browser, survives a reload, and can be undone and redone.
import { test, expect } from '@playwright/test';
import { openEditor, openStoryFile, savedStory, story, block, editText } from './helpers.js';

test('typing saves, survives a reload, and undoes', async ({ page }) => {
  const errors = await openEditor(page);
  await openStoryFile(page, story({ blocks: [block('b1', 'text', { body: 'First line.' })] }));
  const text = page.locator('.canvas-page [data-il-edit=body]').first();
  await expect(text).toContainText('First line.');
  await editText(page, 'b1');
  await page.keyboard.type(' Added.');
  await page.keyboard.press('Escape');
  expect((await savedStory(page)).blocks[0].data.body).toBe('First line. Added.');
  // Undo and redo, from the keyboard.
  await page.keyboard.press('ControlOrMeta+z');
  await expect(text).not.toContainText('Added.');
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(text).toContainText('Added.');
  // Reload: the story is still there.
  await page.reload();
  await page.waitForSelector('html[data-ready]');
  await expect(page.locator('.canvas-page [data-il-edit=body]').first()).toContainText('First line. Added.');
  expect(errors).toEqual([]);
});
