// Open: turns a file the student picked back into a story plus its asset files.
// Accepts a Galley ZIP (as exported, or unzipped and re-zipped by Windows or
// macOS, even inside a folder), an exported .html page, or a story .json file.
import { load } from './model.js';
import { isZip, listZip, readEntry } from './zip-read.js';

// Exports made before the rename (when the project was called Illuminate) use the old ids.
const SOURCE_IDS = ['galley-source', 'illuminate-source'];
const ASSET_IDS = ['galley-assets', 'illuminate-assets'];

// Returns { story, blobs: Map(id -> Blob), missing: [names], errors }.
export async function openFile(file) {
  if (await isZip(file)) return openZip(file);
  const text = await file.text();
  if (/^\s*\{/.test(text)) return finish(parseJson(text), new Map());
  const { raw, blobs } = await fromHtml(text);
  return finish(raw, blobs);
}

// A story published on the web as a saved folder (index.html, story.json, assets/), such as the
// demo story at demo/. base: the folder's address, ending in a slash.
export async function openFolderAt(base) {
  const res = await fetch(new URL('story.json', new URL(base, document.baseURI)), { cache: 'no-cache' });
  if (!res.ok) throw new Error('The story couldn\'t be downloaded. Check your connection and try again.');
  const raw = parseJson(await res.text());
  const blobs = new Map();
  await Promise.all(Object.entries(raw.assets || {}).map(async ([id, asset]) => {
    const file = await fetch(new URL(window.Galley.assetPath(id, asset), new URL(base, document.baseURI))).catch(() => null);
    if (file && file.ok) blobs.set(id, await file.blob());
  }));
  return finish(raw, blobs);
}

function parseJson(text) {
  try { return JSON.parse(text); } catch { throw new Error('This file isn\'t a valid Galley story.'); }
}

async function fromHtml(text) {
  const doc = new DOMParser().parseFromString(text, 'text/html');
  const source = SOURCE_IDS.map((id) => doc.getElementById(id)).find(Boolean);
  if (!source) throw new Error('This web page wasn\'t made by Galley, so it can\'t be opened for editing.');
  const raw = parseJson(source.textContent);
  // Single-file exports carry their assets as data: URLs.
  const blobs = new Map();
  const ids = Object.keys(raw.assets || {});
  const spareEl = ASSET_IDS.map((id) => doc.getElementById(id)).find(Boolean);
  const spare = spareEl ? parseJson(spareEl.textContent) : {};
  for (const id of ids) {
    const el = doc.querySelector(`[data-il-asset="${CSS.escape(id)}"]`);
    const url = (el && el.getAttribute('src')) || spare[id];
    if (url && url.startsWith('data:')) blobs.set(id, await (await fetch(url)).blob());
  }
  return { raw, blobs };
}

async function openZip(file) {
  const entries = (await listZip(file)).filter((e) => !/(^|\/)__MACOSX\//.test(e.name) && !/(^|\/)\._/.test(e.name));
  const depth = (name) => name.split('/').length;
  const byDepth = (a, b) => depth(a.name) - depth(b.name);
  const pages = entries.filter((e) => /(^|\/)index\.html?$/i.test(e.name)).sort(byDepth);
  const jsons = entries.filter((e) => /(^|\/)story\.json$/i.test(e.name)).sort(byDepth);

  let raw = null;
  let base = '';
  let blobs = new Map();
  for (const entry of pages) {
    const text = await (await readEntry(file, entry)).text();
    if (!SOURCE_IDS.some((id) => text.includes(id))) continue;
    ({ raw, blobs } = await fromHtml(text));
    base = entry.name.slice(0, entry.name.lastIndexOf('/') + 1);
    break;
  }
  if (!raw && jsons.length) {
    raw = parseJson(await (await readEntry(file, jsons[0])).text());
    base = jsons[0].name.slice(0, jsons[0].name.lastIndexOf('/') + 1);
  }
  if (!raw) throw new Error('This ZIP doesn\'t contain a Galley story (no index.html made by Galley).');

  // Files are stored as assets/<id>-<name>; match on the id so renamed files still work.
  for (const [id, asset] of Object.entries(raw.assets || {})) {
    if (blobs.has(id)) continue;
    const prefix = `${base}assets/${id}-`;
    const entry = entries.find((e) => e.name.startsWith(prefix) && !e.name.endsWith('/'));
    if (entry) blobs.set(id, await readEntry(file, entry, asset && asset.mime));
  }
  return finish(raw, blobs);
}

function finish(raw, blobs) {
  const { story, errors } = load(raw); // migrates older stories; throws for newer ones
  const missing = Object.entries(story.assets).filter(([id]) => !blobs.has(id)).map(([id, a]) => a.name || id);
  return { story, blobs, missing, errors };
}
