// Saver: keeps an unzipped copy of the project in a folder the student chooses
// (ideally inside their synced OneDrive folder): index.html, story.json and assets/.
// Chrome and Edge only (File System Access API). Writes are debounced, and only
// asset files that changed are written. The folder handle is kept in IndexedDB,
// and permission is asked for again when the browser has forgotten it.
import { registerSaver } from './registry.js';
import { runtime, runtimeFiles } from './export-shared.js';
import { idb } from '../db.js';
import { load } from '../model.js';

const KEY = 'folder';
const DELAY = 2000;
const OURS = /^a_[A-Za-z0-9_]+-/; // asset files Galley wrote (assets/<id>-<name>)

export const folderSupported = () => typeof window.showDirectoryPicker === 'function' && window.isSecureContext;

const state = { handle: null, permission: 'none', lastSaved: null, error: '', saving: false, pending: null, timer: 0, running: null };
const listeners = new Set();

export function folderStatus() {
  return {
    connected: Boolean(state.handle), name: state.handle ? state.handle.name : '',
    permission: state.permission, lastSaved: state.lastSaved, error: state.error, saving: state.saving,
  };
}
export function onFolderStatus(fn) {
  listeners.add(fn);
  fn(folderStatus());
  return () => listeners.delete(fn);
}
const emit = () => listeners.forEach((fn) => fn(folderStatus()));

async function permissionOf(handle, ask = false) {
  const opts = { mode: 'readwrite' };
  if (ask && typeof handle.requestPermission === 'function') return handle.requestPermission(opts);
  if (typeof handle.queryPermission === 'function') return handle.queryPermission(opts);
  return 'granted';
}

async function remember() {
  try {
    if (state.handle) await idb.put('projects', KEY, { handle: state.handle, lastSaved: state.lastSaved ? state.lastSaved.toISOString() : null });
    else await idb.del('projects', KEY);
  } catch { /* the folder still works this session */ }
}

// On start-up: find the folder chosen last time and check we may still write to it.
export async function restoreFolder() {
  if (!folderSupported()) return;
  try {
    const saved = await idb.get('projects', KEY);
    if (saved && saved.handle) {
      state.handle = saved.handle;
      state.lastSaved = saved.lastSaved ? new Date(saved.lastSaved) : null;
      state.permission = await permissionOf(saved.handle);
    }
  } catch { /* no folder */ }
  emit();
}

export function pickFolder() {
  return window.showDirectoryPicker({ id: 'illuminate' /* old name: keeps the remembered folder */, mode: 'readwrite', startIn: 'documents' });
}

// What's already in a folder the student picked.
export async function inspectFolder(handle) {
  let title = '';
  let hasStory = false;
  let otherFiles = 0;
  for await (const [name, entry] of handle.entries()) {
    if (name === 'story.json' && entry.kind === 'file') {
      hasStory = true;
      try {
        const s = JSON.parse(await (await entry.getFile()).text());
        title = s?.meta?.title || (s?.blocks || []).find((b) => b?.type === 'header' && b.data?.title)?.data.title || '';
      } catch { /* unreadable */ }
    } else if (!['index.html', 'assets'].includes(name) && !name.startsWith('.')) {
      otherFiles++;
    }
  }
  return { hasStory, title, otherFiles };
}

// Reads a saved folder back in as a project: { story, blobs, missing }.
export async function readProject(handle) {
  const raw = JSON.parse(await (await (await handle.getFileHandle('story.json')).getFile()).text());
  const { story } = load(raw);
  const files = new Map();
  try {
    const assets = await handle.getDirectoryHandle('assets');
    for await (const [name, entry] of assets.entries()) if (entry.kind === 'file') files.set(name, entry);
  } catch { /* no assets folder */ }
  const blobs = new Map();
  const missing = [];
  for (const [id, asset] of Object.entries(story.assets)) {
    const name = [...files.keys()].find((n) => n.startsWith(`${id}-`));
    if (!name) { missing.push(asset.name || id); continue; }
    const file = await files.get(name).getFile();
    blobs.set(id, new Blob([file], { type: asset.mime || file.type }));
  }
  return { story, blobs, missing };
}

export async function connectFolder(handle) {
  state.handle = handle;
  state.permission = await permissionOf(handle);
  state.error = '';
  await remember();
  emit();
}

export async function disconnectFolder() {
  clearTimeout(state.timer);
  state.handle = null;
  state.pending = null;
  state.permission = 'none';
  state.lastSaved = null;
  state.error = '';
  await remember();
  emit();
}

// Must be called from a click: browsers only show the permission prompt then.
export async function reconnectFolder() {
  if (!state.handle) return false;
  state.permission = await permissionOf(state.handle, true);
  state.error = state.permission === 'granted' ? '' : state.error;
  emit();
  return state.permission === 'granted';
}

async function writeFile(dir, name, data) {
  const fh = await dir.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  await w.write(data);
  await w.close();
}

async function writeProject(story, getBlob) {
  const R = runtime();
  const { css, js } = await runtimeFiles();
  const dir = state.handle;
  if ((await permissionOf(dir)) !== 'granted') {
    const err = new Error('Galley needs your permission to save to this folder again.');
    err.name = 'NotAllowedError';
    throw err;
  }
  const assetsDir = await dir.getDirectoryHandle('assets', { create: true });
  const existing = new Map();
  for await (const [name, entry] of assetsDir.entries()) if (entry.kind === 'file') existing.set(name, entry);
  const expected = new Set();
  for (const [id, asset] of Object.entries(story.assets)) {
    const name = R.assetPath(id, asset).slice('assets/'.length);
    expected.add(name);
    const blob = getBlob(id);
    if (!blob) continue;
    const there = existing.get(name);
    if (there && (await there.getFile()).size === blob.size) continue; // unchanged: don't rewrite
    await writeFile(assetsDir, name, blob);
  }
  // Remove only files Galley wrote that the story no longer uses.
  for (const name of existing.keys()) {
    if (OURS.test(name) && !expected.has(name)) await assetsDir.removeEntry(name);
  }
  const source = { ...story, runtimeVersion: R.RUNTIME_VERSION };
  await writeFile(dir, 'story.json', JSON.stringify(source, null, 2));
  await writeFile(dir, 'index.html', R.renderDocument(story, { css, js }));
}

function describe(err) {
  if (err.name === 'NotAllowedError' || err.name === 'SecurityError') {
    state.permission = 'prompt';
    return 'Galley needs your permission to save to this folder again.';
  }
  if (err.name === 'NotFoundError') return 'The folder can\'t be found. Was it moved, renamed or deleted? Choose it again.';
  if (err.name === 'QuotaExceededError') return 'The folder\'s drive is full.';
  return `Couldn't save to the folder: ${err.message}`;
}

function flush() {
  clearTimeout(state.timer);
  if (state.running || !state.pending || !state.handle) return state.running || Promise.resolve();
  const { story, getBlob } = state.pending;
  state.pending = null;
  state.saving = true;
  emit();
  state.running = writeProject(story, getBlob)
    .then(() => { state.lastSaved = new Date(); state.error = ''; return remember(); })
    .catch((err) => { state.error = describe(err); })
    .finally(() => {
      state.running = null;
      state.saving = false;
      emit();
      if (state.pending) state.timer = setTimeout(flush, DELAY);
    });
  return state.running;
}

// Writes straight away (after connecting, or "Save now").
export function saveFolderNow(story, getBlob) {
  state.pending = { story, getBlob };
  return flush();
}

export const folderSaver = {
  id: 'folder',
  label: 'Folder',
  isAvailable: folderSupported,
  load: async () => null, // the browser copy is the working copy; folders are opened from the folder button
  // Called by autosave after every change; collects changes and writes them a moment later.
  async save(story, { getBlob }) {
    if (!state.handle || state.permission !== 'granted') return;
    state.pending = { story, getBlob };
    clearTimeout(state.timer);
    if (!state.running) state.timer = setTimeout(flush, DELAY);
  },
};

registerSaver(folderSaver);
