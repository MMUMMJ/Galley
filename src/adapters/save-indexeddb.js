// Saver: keeps the current story in this browser's IndexedDB.
// Asset files are already in IndexedDB (see src/assets.js), so only the JSON is written here.
import { idb } from '../db.js';
import { registerSaver } from './registry.js';

const KEY = 'current';

export const indexedDbSaver = {
  id: 'indexeddb',
  label: 'This browser',
  isAvailable: () => Boolean(globalThis.indexedDB),
  async load() {
    const record = await idb.get('projects', KEY);
    return record ? record.story : null;
  },
  async save(story) {
    await idb.put('projects', KEY, { story, savedAt: new Date().toISOString() });
  },
};

registerSaver(indexedDbSaver);
