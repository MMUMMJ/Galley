// Two tabs can't both save: the second asks, the first saves and steps aside.
import { test, expect } from '@playwright/test';
import { openEditor, openStoryFile, savedStory, story, block, editText } from './helpers.js';

test('a second tab takes over only when asked, after the first has saved', async ({ page, context }) => {
  await openEditor(page);
  await openStoryFile(page, story({ blocks: [block('b1', 'text', { body: 'From tab one.' })] }));
  const text = page.locator('.canvas-page [data-il-edit=body]').first();
  await editText(page, 'b1');
  await page.keyboard.type(' Latest.');
  // Tab two: Galley says it's open elsewhere, and doesn't load or save anything yet.
  const two = await context.newPage();
  two.on('dialog', (d) => d.accept());
  await two.goto('/?view=canvas');
  const dialog = two.locator('#tab-dialog');
  await expect(dialog).toContainText('already open in another tab');
  expect(await two.evaluate(() => document.documentElement.dataset.ready)).toBeUndefined();
  // Use Galley here: tab one saves its typing first, so tab two opens the latest story.
  await dialog.getByRole('button', { name: 'Use Galley here' }).click();
  await two.waitForSelector('html[data-ready]');
  await expect(two.locator('.canvas-page [data-il-edit=body]').first()).toContainText('From tab one. Latest.');
  // Tab one says where Galley went, and no longer saves.
  await expect(page.locator('#tab-dialog')).toContainText('open in another tab');
  await expect(page.locator('#app-status')).toContainText('Not saving');
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  // Tab two's edits are the ones kept.
  const t2 = two.locator('.canvas-page [data-il-edit=body]').first();
  await editText(two, 'b1');
  await two.keyboard.type(' From tab two.');
  await two.keyboard.press('Escape');
  expect((await savedStory(two)).blocks[0].data.body).toBe('From tab one. Latest. From tab two.');
});
