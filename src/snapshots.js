// Earlier versions of the story, kept in this browser so lost work can be brought back.
//   - One every 10 minutes while the story is being saved.
//   - One just before anything replaces the story (New story, Open…, the demo, restoring).
// The newest 10 are kept, beside the saved story: projects store, keys "snapshot:<time>".
// Their media files are kept too (see assetIdsInSnapshots and pruneAssets).
import { idb } from './db.js';

const PREFIX = 'snapshot:';
const KEEP = 10;
const EVERY = 10 * 60 * 1000;
let lastAt = 0;
let lastJson = '';

const titleOf = (story) => story.meta?.title || story.blocks?.find((b) => b.type === 'header' && b.data?.title)?.data.title || 'Untitled story';

// reason: why it was taken now ('' for the regular one).
export async function takeSnapshot(story, reason = '') {
  if (!story?.blocks?.length) return; // nothing worth keeping
  const json = JSON.stringify(story);
  if (json === lastJson && !reason) return;
  const at = new Date();
  await idb.put('projects', `${PREFIX}${at.toISOString()}`, { story, savedAt: at.toISOString(), reason, title: titleOf(story), blocks: story.blocks.length });
  lastAt = at.getTime();
  lastJson = json;
  const keys = (await listKeys()).slice(KEEP);
  for (const key of keys) await idb.del('projects', key);
}

// Called after each save: keeps one every 10 minutes.
export async function maybeSnapshot(story) {
  if (!lastAt) {
    const [newest] = await listKeys();
    lastAt = newest ? Date.parse(newest.slice(PREFIX.length)) || 0 : 0;
  }
  if (Date.now() - lastAt >= EVERY) await takeSnapshot(story);
}

async function listKeys() {
  return (await idb.keys('projects')).filter((k) => typeof k === 'string' && k.startsWith(PREFIX)).sort().reverse();
}

// Newest first: [{ key, savedAt, reason, title, blocks }].
export async function listSnapshots() {
  const out = [];
  for (const key of await listKeys()) {
    const s = await idb.get('projects', key);
    if (s) out.push({ key, savedAt: s.savedAt, reason: s.reason || '', title: s.title, blocks: s.blocks });
  }
  return out;
}

export const getSnapshot = async (key) => (await idb.get('projects', key))?.story || null;

// Every media file an earlier version uses, so start-up clean-up keeps them.
export async function assetIdsInSnapshots() {
  const ids = new Set();
  try {
    for (const key of await listKeys()) Object.keys((await idb.get('projects', key))?.story?.assets || {}).forEach((id) => ids.add(id));
  } catch { /* storage unavailable */ }
  return ids;
}
