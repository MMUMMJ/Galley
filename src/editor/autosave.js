// Autosave: after each change, wait a moment, then hand the story to every saver.
// Also saves straight away when the page is hidden or closed.

export function startAutosave(store, savers, { getBlob, onStatus, delay = 800 }) {
  let timer = 0;
  let dirty = false;
  let chain = Promise.resolve();

  if (!savers.length) {
    onStatus('off');
    return { saveNow: () => Promise.resolve(), markDirty: () => {} };
  }

  function saveNow() {
    clearTimeout(timer);
    if (!dirty) return chain;
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

  return { saveNow, markDirty };
}
