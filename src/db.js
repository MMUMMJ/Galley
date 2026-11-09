// Tiny promise wrapper around IndexedDB. Two stores:
//   projects: key "current" -> { story, savedAt }
//   assets:   asset id      -> Blob (or { type, buffer } where a browser refuses Blobs)

const DB_NAME = 'illuminate'; // the project's old name: kept so saved stories and settings survive the rename
const DB_VERSION = 1;
let opening = null;

export function openDb() {
  if (!opening) {
    opening = new Promise((resolve, reject) => {
      if (!globalThis.indexedDB) return reject(new Error('This browser has no IndexedDB storage.'));
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const name of ['projects', 'assets']) {
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('Could not open storage.'));
      req.onblocked = () => reject(new Error('Storage is blocked by another Galley tab. Close other tabs and reload.'));
    });
    opening.catch(() => { opening = null; });
  }
  return opening;
}

async function run(store, mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(req ? req.result : undefined);
    tx.onerror = () => reject(tx.error || new Error('Storage error.'));
    tx.onabort = () => reject(tx.error || new Error('Storage was interrupted (the device may be full).'));
  });
}

export const idb = {
  get: (store, key) => run(store, 'readonly', (s) => s.get(key)),
  put: (store, key, value) => run(store, 'readwrite', (s) => s.put(value, key)),
  del: (store, key) => run(store, 'readwrite', (s) => s.delete(key)),
  keys: (store) => run(store, 'readonly', (s) => s.getAllKeys()),
};
