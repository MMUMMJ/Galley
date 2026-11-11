// Damaged or oversized ZIPs fail clearly instead of opening with bad files.
import { test, expect } from '@playwright/test';
import { openEditor } from './helpers.js';

test('a changed byte, a wrong size or a too-big file is caught', async ({ page }) => {
  await openEditor(page);
  const results = await page.evaluate(async () => {
    const { makeZip } = await import('/src/zip-write.js');
    const { listZip, readEntry } = await import('/src/zip-read.js');
    const zip = await makeZip([{ path: 'a.txt', data: new Blob(['hello, world']) }]);
    const bytes = new Uint8Array(await zip.arrayBuffer());
    const read = async (b) => { try { const [e] = await listZip(new Blob([b])); return await (await readEntry(new Blob([b]), e)).text(); } catch (err) { return `error: ${err.message}`; } };
    const flipped = bytes.slice(); flipped[30 + 'a.txt'.length + 1] ^= 1; // a byte of the file's contents
    const cd = bytes.length - 22 - 46 - 'a.txt'.length; // the central directory entry
    const resized = bytes.slice(); new DataView(resized.buffer).setUint32(cd + 24, 99, true);
    const huge = bytes.slice(); new DataView(huge.buffer).setUint32(cd + 24, 0xFFFFFFF0, true);
    return { good: await read(bytes), flipped: await read(flipped), resized: await read(resized), huge: await read(huge) };
  });
  expect(results.good).toBe('hello, world');
  expect(results.flipped).toMatch(/damaged.*checksum/);
  expect(results.resized).toMatch(/damaged.*size/);
  expect(results.huge).toMatch(/too big/);
});
