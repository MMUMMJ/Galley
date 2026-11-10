// Header controls: undo, redo, new story, and the save status line.
import { startStory } from '../packs.js';
import { STORY_DETAILS } from '../store.js';

export function mountToolbar(store, { undoBtn, redoBtn, newBtn, announce }) {
  const sync = () => {
    undoBtn.disabled = !store.canUndo;
    redoBtn.disabled = !store.canRedo;
  };
  const undo = () => { if (store.undo()) announce('Undone.'); };
  const redo = () => { if (store.redo()) announce('Redone.'); };

  undoBtn.addEventListener('click', undo);
  redoBtn.addEventListener('click', redo);
  newBtn.addEventListener('click', () => {
    const ok = window.confirm('Start a new, empty story?\n\nYour current story will be replaced. '
      + 'You can bring it back with Undo until you close or reload this page.');
    if (!ok) return;
    const next = startStory();
    store.update(() => next, { select: next.blocks[0]?.id ?? STORY_DETAILS, from: 'toolbar' });
    announce('New story started. Use Undo to bring back the previous one.');
  });

  // Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z and Ctrl+Y always use the story's undo history,
  // including inside text fields, so there is only ever one history to think about.
  document.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const key = e.key.toLowerCase();
    if (key === 'z') { e.preventDefault(); (e.shiftKey ? redo : undo)(); }
    else if (key === 'y' && e.ctrlKey) { e.preventDefault(); redo(); }
  });

  store.subscribe(sync);
  sync();
}

export function saveStatusText(state, detail) {
  if (state === 'pending') return 'Unsaved changes';
  if (state === 'saving') return 'Saving…';
  if (state === 'saved') return `Saved in this browser at ${detail.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  if (state === 'error') return 'Not saved: storage problem';
  if (state === 'off') return 'Not saving: browser storage unavailable';
  return '';
}
