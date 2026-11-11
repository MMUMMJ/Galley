import { test, expect } from '@playwright/test';
import { openEditor, openStoryFile, savedStory, story, block, dismissToast, editText } from './helpers.js';

const asset = { name: 'photo.png', mime: 'image/png', bytes: 70, alt: 'Original description', caption: 'Original caption', credit: '', licence: '', width: 1, height: 1 };
const cases = [
  ['header', { media: 'a_photo', title: 'Test story' }],
  ['gallery', { items: ['a_photo', 'a_photo'] }],
  ['text', { body: 'Words.\n![one](asset:a_photo)\nMore words.\n![two](asset:a_photo "right")' }],
  ['scrolly', { steps: [{ media: 'a_photo', text: 'First' }, { media: 'a_photo', text: 'Second' }] }],
  ['textcolumn', { images: ['a_photo'], body: 'Scroll text' }],
  ['compare', { before: { asset: 'a_photo', label: 'Before' }, after: { asset: 'a_photo', label: 'After' } }],
  ['media', { asset: 'a_photo', kind: 'image' }],
];

for (const [type, data] of cases) {
  test(`${type}: canvas and settings use the same media editor, with undo and reload`, async ({ page }) => {
    const errors = await openEditor(page);
    await openStoryFile(page, story({ blocks: [block('b_media', type, data)], assets: { a_photo: asset } }));
    await expect(page.locator('.rail-item')).toHaveCount(1);
    await dismissToast(page);
    await page.locator('.canvas-tools [data-act=media]').click();
    const dialog = page.locator('.media-editor');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('label')).toHaveText(['Alt text', 'Caption', 'Credit', 'Licence']);
    await dialog.getByLabel('Credit', { exact: true }).fill('Photo: Student');
    await page.keyboard.press('ControlOrMeta+z');
    await expect(dialog.getByLabel('Credit', { exact: true })).toHaveValue('');
    await page.keyboard.press('ControlOrMeta+Shift+z');
    await expect(dialog.getByLabel('Credit', { exact: true })).toHaveValue('Photo: Student');
    await dialog.getByLabel('Licence', { exact: true }).selectOption('Own work');
    await dialog.getByRole('button', { name: /Back to .* settings/ }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.locator('#inspector')).toBeVisible();
    await page.locator('#inspector .media-details-open').first().click();
    await expect(dialog.getByLabel('Credit', { exact: true })).toHaveValue('Photo: Student');
    await dialog.getByRole('button', { name: 'Done', exact: true }).click();
    expect((await savedStory(page)).assets.a_photo.licence).toBe('Own work');
    await page.reload(); await page.waitForSelector('html[data-ready]');
    await page.locator('.canvas-tools [data-act=media]').click();
    await expect(dialog.getByLabel('Credit', { exact: true })).toHaveValue('Photo: Student');
    expect(errors).toEqual([]);
  });
}

test('Checks opens the exact media field and Noted survives reload until the media changes', async ({ page }) => {
  const errors = await openEditor(page);
  await openStoryFile(page, story({ blocks: [block('b_media', 'media', { asset: 'a_photo', kind: 'image' })], assets: { a_photo: asset } }));
  await expect(page.locator('.rail-item')).toHaveCount(1); await dismissToast(page);
  await page.locator('#checks').click();
  let group = page.locator('.checks-group').filter({ has: page.getByRole('heading', { name: 'Alt text, credits and licences', exact: true }) });
  await group.getByRole('button', { name: 'Noted', exact: true }).click();
  await expect(group.getByRole('button', { name: 'Noted ✓', exact: true })).toBeVisible();
  await savedStory(page, (s) => !!s.meta.reviewedChecks);
  await page.reload(); await page.waitForSelector('html[data-ready]'); await page.locator('#checks').click();
  await expect(group.getByRole('button', { name: 'Noted ✓', exact: true })).toBeVisible();
  await group.locator('.check-item').click();
  await expect(page.locator('#media-editor-credit')).toBeFocused();
  await page.locator('#media-editor-caption').fill('Changed context');
  await page.locator('.media-editor').getByRole('button', { name: 'Done', exact: true }).click();
  await page.locator('#checks').click();
  await expect(group.getByRole('button', { name: 'Noted', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('media inside text being edited opens the shared editor without losing words', async ({ page }) => {
  const errors = await openEditor(page);
  await openStoryFile(page, story({ blocks: [block('b_text', 'text', cases[2][1])], assets: { a_photo: asset } }));
  await expect(page.locator('.rail-item')).toHaveCount(1); await dismissToast(page);
  await editText(page, 'b_text');
  await page.locator('.canvas-typing [data-details]').last().click();
  await expect(page.locator('.media-editor')).toBeVisible();
  await expect(page.locator('.media-editor-scope')).toContainText('used 2 times');
  await page.locator('#media-editor-credit').fill('Inline photographer');
  await page.locator('.media-editor').getByRole('button', { name: 'Done', exact: true }).click();
  const saved = await savedStory(page);
  expect(saved.blocks[0].data.body).toContain('Words.');
  expect(saved.blocks[0].data.body).toContain('More words.');
  expect(saved.blocks[0].data.body.match(/asset:a_photo/g)).toHaveLength(2);
  expect(saved.blocks[0].data.body).toContain('asset:a_photo "right"');
  expect(saved.assets.a_photo.credit).toBe('Inline photographer');
  expect(errors).toEqual([]);
});

test('headlines stay linked through the canvas and toolbar fits after outline and viewport changes', async ({ page }) => {
  await openEditor(page);
  await openStoryFile(page, story({ blocks: [block('b_header', 'header', { title: 'Test story' })] }));
  await expect(page.locator('.rail-item')).toHaveCount(1); await dismissToast(page);
  await page.locator('.canvas-page [data-il-edit=title]').click(); await page.locator('.canvas-typing').fill('Changed headline'); await page.keyboard.press('Escape');
  expect((await savedStory(page)).meta.title).toBe('Changed headline');
  await page.locator('.rail-toggle').click();
  await expect.poll(async () => (await page.locator('.canvas-tools').boundingBox()).height).toBeLessThan(100);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(async () => { const b = await page.locator('.canvas-tools').boundingBox(); return b.x + b.width; }).toBeLessThanOrEqual(390);
  await expect.poll(async () => (await page.locator('.canvas-tools').boundingBox()).height).toBeLessThan(110);
  await page.locator('.canvas-tools [data-act=more]').click();
  const menu = await page.locator('.canvas-more-menu').boundingBox();
  expect(menu.x).toBeGreaterThanOrEqual(0); expect(menu.x + menu.width).toBeLessThanOrEqual(390);
});

for (const type of ['gallery', 'text']) {
  test(`${type}: replacing the second copy preserves the first, undo and exported media`, async ({ page }, info) => {
    const errors = await openEditor(page);
    const data = cases.find(([t]) => t === type)[1];
    // Both copies have real media, so export/reopen can verify the file bytes as well as references.
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const s = story({ blocks: [block('b_copies', type, data)], assets: { a_photo: asset } });
    const html = `<script type="application/json" id="galley-source">${JSON.stringify(s)}</script><script type="application/json" id="galley-assets">${JSON.stringify({ a_photo: png })}</script>`;
    await page.locator('#open + input[type=file]').setInputFiles({ name: 'copies.html', mimeType: 'text/html', buffer: Buffer.from(html) });
    await expect(page.locator('.rail-item')).toHaveCount(1); await dismissToast(page);
    await page.locator('.canvas-tools [data-act=settings]').click();
    await page.locator('#inspector .media-details-open').last().click();
    const dialog = page.locator('.media-editor');
    await expect(dialog).toContainText('2 of 2');
    // An SVG avoids depending on an image encoder for a replacement fixture.
    await dialog.locator('input[type=file]').setInputFiles({ name: 'replacement.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="red"/></svg>') });
    await expect(dialog.locator('.media-editor-file')).toContainText('replacement.svg');
    await page.keyboard.press('ControlOrMeta+z');
    await expect(dialog.locator('.media-editor-file')).toContainText('photo.png');
    await page.keyboard.press('ControlOrMeta+Shift+z');
    await expect(dialog.locator('.media-editor-file')).toContainText('replacement.svg');
    await dialog.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(page.locator('#inspector .media-details-open').last()).toBeFocused();
    const saved = await savedStory(page);
    const refs = type === 'gallery' ? saved.blocks[0].data.items : [...saved.blocks[0].data.body.matchAll(/asset:([A-Za-z0-9_-]+)/g)].map((m) => m[1]);
    expect(refs[0]).toBe('a_photo'); expect(refs[1]).not.toBe('a_photo');
    expect(saved.assets[refs[1]].caption).toBe('Original caption');
    if (type === 'text') expect(saved.blocks[0].data.body).toContain(`asset:${refs[1]} "right"`);
    await page.locator('#file').click();
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Export for Moodle/ }).click()]);
    const zip = info.outputPath('copies.zip'); await download.saveAs(zip);
    await page.locator('#open + input[type=file]').setInputFiles(zip);
    await expect(page.locator('.toast')).toContainText('Opened');
    await expect(page.locator('.toast')).not.toContainText('missing');
    expect(errors).toEqual([]);
  });
}

test('clicking gallery and inline images selects the exact occurrence; audio uses Description', async ({ page }) => {
  const errors = await openEditor(page);
  const svg = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="180"><rect width="300" height="180" fill="teal"/></svg>');
  const s = story({ assets: { a_photo: { ...asset, mime: 'image/svg+xml' }, a_audio: { ...asset, name: 'interview.wav', mime: 'audio/wav' } }, blocks: [
    block('b_gallery', 'gallery', { items: ['a_photo', 'a_photo'] }),
    block('b_inline', 'text', { body: 'Words\n![photo](asset:a_photo)\nMore words' }),
    block('b_audio', 'media', { asset: 'a_audio', kind: 'audio' }),
  ] });
  const html = `<script type="application/json" id="galley-source">${JSON.stringify(s)}</script><script type="application/json" id="galley-assets">${JSON.stringify({ a_photo: svg })}</script>`;
  await page.locator('#open + input[type=file]').setInputFiles({ name: 'clicks.html', mimeType: 'text/html', buffer: Buffer.from(html) });
  await expect(page.locator('.rail-item')).toHaveCount(3); await dismissToast(page);
  await page.locator('#b_gallery img[data-il-asset]').nth(1).click();
  await expect(page.locator('.media-editor-head')).toContainText('Image 2 of 2');
  await page.keyboard.press('Escape');
  await expect(page.locator('.rail-item[data-id=b_gallery]')).toBeFocused();
  await page.locator('.rail-item[data-id=b_inline]').click();
  await page.locator('#b_inline img[data-il-asset]').click();
  await expect(page.locator('.media-editor-head')).toContainText('In the text');
  await page.keyboard.press('Escape');
  await page.locator('.rail-item[data-id=b_audio]').click();
  await page.locator('.canvas-tools [data-act=media]').click();
  await expect(page.locator('.media-editor').getByLabel('Description', { exact: true })).toBeFocused();
  await expect(page.locator('.media-editor').getByLabel('Licence', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
