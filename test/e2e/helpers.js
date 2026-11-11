// Shared steps for Galley's browser tests.
import { expect } from '@playwright/test';

// Waits here, in Node, not in the page (whose timers the browser may slow down).
export const pause = (ms) => new Promise((r) => setTimeout(r, ms));

// Opens the editor (canvas view by default) and waits until it's ready. Fails the test on any
// page error. Confirm dialogs (New story, Open…) are accepted.
export async function openEditor(page, { query = 'view=canvas', errors = [] } = {}) {
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.goto(`/?${query}`);
  await page.waitForSelector('html[data-ready]');
  return errors;
}

// Opens the demo story from the File menu and waits for its blocks.
export async function openDemo(page) {
  await page.locator('#file').click();
  await page.locator('#open-demo').click();
  await expect(page.locator('.rail-item')).toHaveCount(26, { timeout: 20_000 });
  await dismissToast(page);
}

// Starts typing in a block's text the keyboard way: select it in the rail, then Edit text.
// The cursor starts at the end of the text.
export async function editText(page, blockId) {
  await page.locator(`.rail-item[data-id="${blockId}"]`).click();
  await page.locator('.canvas-tools [data-act=text]').click();
  await expect(page.locator('.canvas-typing')).toBeFocused();
}

export async function dismissToast(page) {
  await page.locator('.toast button[aria-label="Dismiss message"]').click().catch(() => {});
}

// Opens a story made in the test, through File > Open… (a .json file).
export async function openStoryFile(page, story, name = 'story.json') {
  await page.locator('#open + input[type=file]').setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(story)) });
}

// The story as saved in this browser, once done(story) says the autosave has caught up
// (by default: once nothing is waiting to be saved). Polled from here, not timed in the page.
export async function savedStory(page, done = () => true) {
  const read = () => page.evaluate(async () => (await (await import('/src/db.js')).idb.get('projects', 'current'))?.story || null);
  for (let i = 0; i < 100; i++) {
    const pending = await page.evaluate(() => /Unsaved|Saving/.test(document.getElementById('app-status')?.textContent || ''));
    const s = pending ? null : await read();
    if (s && done(s)) return s;
    await pause(100);
  }
  return read();
}

// A small valid story; blocks and assets can be added.
export function story({ title = 'Test story', blocks = [], assets = {} } = {}) {
  return {
    schemaVersion: 2, runtimeVersion: '1.17.1',
    meta: { title, standfirst: '', byline: '', seoTitle: '', seoDescription: '', shareImage: null, shareText: '', pack: null, created: '2026-01-01T00:00:00.000Z', modified: '2026-01-01T00:00:00.000Z', appendix: false, theme: 'house' },
    blocks, assets, reflection: [],
  };
}
export const block = (id, type, data) => ({ id, type, effect: 'none', effectNote: '', note: '', background: null, data });
