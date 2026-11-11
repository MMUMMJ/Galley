// Autosave: after each change, wait a moment, then hand the story to every saver.
// Also saves straight away when the page is hidden or closed.

export function startAutosave(store, savers, { getBlob, onStatus, delay = 800 }) {
  let timer = 0;
  let dirty = false;
  let chain = Promise.resolve();
  let stopped = false; // another tab took over: never save over its work

  if (!savers.length) {
    onStatus('off');
    return { saveNow: () => Promise.resolve(), markDirty: () => {}, stop: () => {} };
  }

  function saveNow() {
    clearTimeout(timer);
    if (!dirty || stopped) return chain;
    dirty = false;
    const story = store.story;
    onStatus('saving');
    chain = chain
      .then(async () => {
        for (const saver of savers) await saver.save(story, { getBlob });
        onStatus(dirty ? 'pending' : 'saved', new Date());
      })
      .catch((err) => {
        dirty = true;
        onStatus('error', err);
      });
    return chain;
  }

  function markDirty() {
    if (stopped) return;
    dirty = true;
    onStatus('pending');
    clearTimeout(timer);
    timer = setTimeout(saveNow, delay);
  }

  store.subscribe((change) => {
    if (change.type !== 'select') markDirty();
  });

  window.addEventListener('pagehide', saveNow);
  window.addEventListener('beforeunload', saveNow);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveNow();
  });

  // Never saves again: first saving anything pending if save is true. (When another tab has
  // already taken over, saving now would overwrite its work, so save is false.)
  async function stop(save) {
    if (save) await saveNow();
    stopped = true;
    clearTimeout(timer);
    onStatus('elsewhere');
  }

  return { saveNow, markDirty, stop };
}
