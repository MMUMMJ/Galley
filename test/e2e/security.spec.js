// A story file from anywhere must never run code: file names, titles and captions are shown as text.
import { test, expect } from '@playwright/test';
import { openEditor, openStoryFile, story, block, pause } from './helpers.js';

const HOSTILE = '<img src=x onerror="window.__pwned=1">';

test('hostile file names and titles in an opened story stay as text', async ({ page }) => {
  const errors = await openEditor(page, { query: 'view=classic' });
  await openStoryFile(page, story({
    title: `<script>window.__pwned=2</script>${HOSTILE}`,
    assets: { a_x: { name: HOSTILE, mime: 'image/png', bytes: 1, alt: HOSTILE, caption: HOSTILE, credit: HOSTILE, licence: 'Own work', width: null, height: null } },
    blocks: [block('b1', 'text', { body: `Words.\n\n![x](asset:a_x)\n\n${HOSTILE}` })],
  }), 'hostile.json');
  await expect(page.locator('.block-item')).toHaveCount(1);
  // The text block's settings show the image's card, with its file name.
  await page.locator('.block-item .block-select').first().click();
  const card = page.locator('#inspector figure.rte-img figcaption').first();
  await expect(card).toContainText('<img src=x');
  // The canvas draws the same story.
  await page.locator('[data-view=canvas]').click();
  await expect(page.locator('.canvas-page')).toContainText('<img src=x');
  await pause(500);
  expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
  expect(errors).toEqual([]);
});
