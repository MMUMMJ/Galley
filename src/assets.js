// Asset files (Blobs), kept in IndexedDB and referenced from the story by id.
// The story JSON only holds each asset's metadata; the bytes live here.
import { idb } from './db.js';

const cache = new Map(); // id -> { blob, url }
let persistent = true;

function toBlob(record) {
  if (record instanceof Blob) return record;
  if (record && record.buffer) return new Blob([record.buffer], { type: record.type || '' });
  return null;
}

export async function loadAssets(ids) {
  for (const id of ids) {
    try {
      const blob = toBlob(await idb.get('assets', id));
      if (blob) cache.set(id, { blob, url: null });
    } catch {
      persistent = false;
    }
  }
}

// Stores a file. Returns false if it could only be kept in memory for this session.
export async function putAsset(id, blob) {
  cache.set(id, { blob, url: null });
  try {
    await idb.put('assets', id, blob);
    return true;
  } catch {
    // Some browsers refuse Blobs in IndexedDB; an ArrayBuffer always works.
    try {
      await idb.put('assets', id, { type: blob.type, buffer: await blob.arrayBuffer() });
      return true;
    } catch {
      persistent = false;
      return false;
    }
  }
}

export function getBlob(id) {
  const entry = cache.get(id);
  return entry ? entry.blob : null;
}

export function assetUrl(id) {
  const entry = cache.get(id);
  if (!entry) return '';
  if (!entry.url) entry.url = URL.createObjectURL(entry.blob);
  return entry.url;
}

// Deletes stored files the story no longer lists. Only run at start-up:
// during a session, undo can bring an asset back, so nothing is deleted then.
export async function pruneAssets(keep) {
  try {
    for (const key of await idb.keys('assets')) {
      if (!keep.has(key)) await idb.del('assets', key);
    }
  } catch {
    /* storage unavailable; nothing to prune */
  }
}

export const assetsPersistent = () => persistent;
