// File & Export > Earlier versions…: the story as it was earlier (snapshots.js), to bring back.
// Restoring is one step Undo can reverse, and the story it replaces becomes an earlier version too.
import { load } from '../model.js';
import { STORY_DETAILS } from '../store.js';
import { loadAssets } from '../assets.js';
import { syncStoryPack } from '../packs.js';
import { listSnapshots, getSnapshot, takeSnapshot } from '../snapshots.js';
import { h } from './dom.js';

const when = (iso) => {
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return today ? `Today, ${time}` : `${d.toLocaleDateString([], { day: 'numeric', month: 'short' })}, ${time}`;
};

export function mountVersions(store, { button, returnTo, announce, toast }) {
  const dialog = h('dialog', { class: 'choice-dialog versions-dialog', 'aria-labelledby': 'versions-title' });
  document.body.append(dialog);
  dialog.addEventListener('close', () => returnTo?.focus());

  async function open() {
    let list = [];
    try { list = await listSnapshots(); } catch { /* storage unavailable: shown as none */ }
    const close = h('button', { type: 'button', class: 'btn', onclick: () => dialog.close() }, 'Close');
    dialog.replaceChildren(
      h('h2', { id: 'versions-title' }, 'Earlier versions'),
      h('p', {}, 'Galley keeps a copy of your story every 10 minutes while you work, and one just before a story is replaced. The newest 10 are kept in this browser.'),
      list.length
        ? h('ol', { class: 'versions-list' }, list.map((v) => h('li', {},
          h('span', { class: 'versions-what' }, h('strong', {}, when(v.savedAt)), ` · ${v.title} · ${v.blocks} block${v.blocks === 1 ? '' : 's'}`,
            v.reason ? h('span', { class: 'versions-why' }, v.reason) : null),
          h('button', { type: 'button', class: 'btn', 'aria-label': `Restore the version from ${when(v.savedAt)}, ${v.title}`, onclick: () => restore(v) }, 'Restore'))))
        : h('p', { class: 'field-hint' }, 'No earlier versions yet.'),
      h('div', { class: 'button-row' }, close),
    );
    dialog.showModal();
    (dialog.querySelector('.versions-list button') || close).focus();
  }

  async function restore(v) {
    try {
      const raw = await getSnapshot(v.key);
      if (!raw) throw new Error('That version is no longer here.');
      const { story } = load(raw);
      try {
        await syncStoryPack(story);
      } catch (err) {
        toast(`${err.message} Carrying on without a pack.`, { tone: 'warning' });
      }
      await loadAssets(Object.keys(story.assets));
      await takeSnapshot(store.story, 'Before restoring an earlier version').catch(() => {});
      store.update(() => story, { select: story.blocks[0]?.id ?? STORY_DETAILS, from: 'restore', keepModified: true });
      dialog.close();
      toast(`Restored the version from ${when(v.savedAt)}.`, { action: 'Undo', onAction: () => { store.undo(); announce('Undone: back to the story you had.'); } });
      announce(`Restored the version from ${when(v.savedAt)}.`);
    } catch (err) {
      toast(`Couldn't restore that version: ${err.message}`, { tone: 'warning' });
    }
  }

  button.addEventListener('click', open);
}
