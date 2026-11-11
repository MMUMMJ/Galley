// Saving to a folder: story.json goes last, cleanup waits, and changed files are rewritten.
// Uses the browser's private file system in place of a folder the student picks (Chromium only).
import { test, expect } from '@playwright/test';
import { openEditor } from './helpers.js';

test('a folder save writes everything, then tidies up', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'folder saving is Chrome and Edge only');
  await openEditor(page);
  const r = await page.evaluate(async () => {
    const F = await import('/src/adapters/save-folder.js');
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle(`t${Date.now()}`, { create: true });
    await F.connectFolder(dir);
    const blobs = { a_1: new Blob(['aaaa'], { type: 'text/plain' }), a_2: new Blob(['bbbb'], { type: 'text/plain' }) };
    const asset = (name) => ({ name, mime: 'text/plain', bytes: 4, alt: '', caption: '', credit: '', licence: '', width: null, height: null });
    const s = { schemaVersion: 2, runtimeVersion: '1.17.1', meta: { title: 'Folder test', theme: 'house', standfirst: '', byline: '', seoTitle: '', seoDescription: '', shareImage: null, shareText: '', pack: null, appendix: false }, blocks: [], reflection: [], assets: { a_1: asset('one.txt'), a_2: asset('two.txt') } };
    const list = async () => { const out = []; for await (const [n] of (await dir.getDirectoryHandle('assets')).entries()) out.push(n); return out.sort(); };
    const read = async (path) => { let d = dir; const parts = path.split('/'); for (const p of parts.slice(0, -1)) d = await d.getDirectoryHandle(p); return (await (await d.getFileHandle(parts.at(-1))).getFile()).text(); };
    await F.saveFolderNow(s, (id) => blobs[id]);
    const first = { files: await list(), story: JSON.parse(await read('story.json')).meta.title, html: (await read('index.html')).includes('galley-source'), manifest: Object.keys(JSON.parse(await read('.galley-files.json'))).sort(), error: F.folderStatus().error };
    // Same name and size, different contents: rewritten. A file no longer used: removed (only files
    // Galley wrote, whose names start with an asset id like a_1, are ever removed).
    blobs.a_1 = new Blob(['AAAA'], { type: 'text/plain' });
    delete s.assets.a_2;
    await F.saveFolderNow(s, (id) => blobs[id]);
    return { first, second: { files: await list(), a1: await read('assets/a_1-one.txt'), error: F.folderStatus().error } };
  });
  expect(r.first).toEqual({ files: ['a_1-one.txt', 'a_2-two.txt'], story: 'Folder test', html: true, manifest: ['a_1-one.txt', 'a_2-two.txt'], error: '' });
  expect(r.second).toEqual({ files: ['a_1-one.txt'], a1: 'AAAA', error: '' });
});
