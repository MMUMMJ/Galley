// When the browser won't store media, the student is told plainly, and told how to keep it.
import { test, expect } from '@playwright/test';
import { openEditor, story, block } from './helpers.js';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

test('media that only exists in memory gets a lasting warning with Export', async ({ page }) => {
  // Every attempt to store a media file fails, as in a full browser or private browsing.
  await page.addInitScript(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'assets') throw new DOMException('Full', 'QuotaExceededError');
      return put.apply(this, args);
    };
  });
  const errors = await openEditor(page);
  const s = story({ assets: { a1: { name: 'dot.png', mime: 'image/png', bytes: 70, alt: 'A dot', caption: '', credit: 'Me', licence: 'Own work', width: 1, height: 1 } },
    blocks: [block('b1', 'media', { kind: 'image', asset: 'a1', width: 'column' })] });
  const html = `<!doctype html><script type="application/json" id="galley-source">${JSON.stringify(s)}</script><script type="application/json" id="galley-assets">${JSON.stringify({ a1: PNG })}</script>`;
  await page.locator('#open + input[type=file]').setInputFiles({ name: 'story.html', mimeType: 'text/html', buffer: Buffer.from(html) });
  const alert = page.locator('.alert');
  await expect(alert).toContainText('only in memory');
  await expect(alert).toContainText('dot.png');
  // It's an alert under the header, not a toast: toasts time out, alerts stay until dealt with.
  await expect(page.locator('#alerts .alert')).toBeVisible();
  await expect(page.locator('#toasts')).not.toContainText('only in memory');
  const [download] = await Promise.all([page.waitForEvent('download'), alert.getByRole('button', { name: 'Export a ZIP now' }).click()]);
  expect(download.suggestedFilename()).toMatch(/\.zip$/);
  await expect(alert).toHaveCount(0);
  expect(errors).toEqual([]);
});
