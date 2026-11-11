// Keyboard editing on the canvas, and pasting from Word or the web.
import { test, expect } from '@playwright/test';
import { openEditor, openStoryFile, savedStory, story, block, editText } from './helpers.js';

test('bold from the keyboard, Escape to finish, Home and End stay put', async ({ page }) => {
  const errors = await openEditor(page);
  await openStoryFile(page, story({ blocks: [block('b1', 'text', { body: 'Plain words here.' })] }));
  const text = page.locator('.canvas-page [data-il-edit=body]').first();
  await editText(page, 'b1');
  const top = () => page.evaluate(() => document.querySelector('.canvas-scroll').scrollTop);
  const before = await top();
  await page.keyboard.press('End');
  await page.keyboard.press('Home');
  await page.keyboard.press('End');
  expect(await top()).toBe(before);
  await page.keyboard.press('ControlOrMeta+b');
  await page.keyboard.type('Strong');
  await page.keyboard.press('Escape');
  await expect(page.locator('.canvas-tools [data-act=text]')).toBeFocused();
  expect((await savedStory(page)).blocks[0].data.body).toBe('Plain words here.**Strong**');
  expect(errors).toEqual([]);
});

test('pasting keeps bold and links, and drops colours and sizes', async ({ page }) => {
  const errors = await openEditor(page);
  await openStoryFile(page, story({ blocks: [block('b1', 'text', { body: 'Start.' })] }));
  const text = page.locator('.canvas-page [data-il-edit=body]').first();
  await editText(page, 'b1');
  await text.evaluate((el) => {
    const data = new DataTransfer();
    data.setData('text/html', '<p style="color:red"> <b>Bold</b> and <span style="font-size:40px">big</span> <a href="https://example.com">link</a></p>');
    data.setData('text/plain', ' Bold and big link');
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  });
  await page.keyboard.press('Escape');
  const body = (await savedStory(page)).blocks[0].data.body;
  expect(body).toContain('**Bold**');
  expect(body).toContain('[link](https://example.com)');
  expect(body).not.toMatch(/color|font-size|<span/);
  expect(errors).toEqual([]);
});
