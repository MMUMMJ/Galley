// Small per-browser settings kept in IndexedDB, e.g. when the story was last exported.
import { idb } from './db.js';

let cache = null;

export async function getSettings() {
  if (!cache) {
    try { cache = (await idb.get('projects', 'settings')) || {}; } catch { cache = {}; }
  }
  return cache;
}

export async function setSetting(key, value) {
  const s = await getSettings();
  s[key] = value;
  try { await idb.put('projects', 'settings', s); } catch { /* storage unavailable: keep in memory */ }
}
