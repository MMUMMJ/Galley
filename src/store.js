// In-memory editor state with undo and redo.
// Every change goes through update(), which works on a copy of the story,
// so earlier versions stay intact on the undo stack.

const MAX_UNDO = 200;
const COALESCE_MS = 1500;

export function createStore(initial) {
  let present = initial;
  let past = [];
  let future = [];
  let selected = null;
  let lastKey = null;
  let lastTime = 0;
  const listeners = new Set();

  const emit = (change) => listeners.forEach((fn) => fn(change));
  const exists = (id) => present.blocks.some((b) => b.id === id);

  return {
    get story() { return present; },
    get selected() { return selected; },
    get canUndo() { return past.length > 0; },
    get canRedo() { return future.length > 0; },

    // recipe(draft) mutates the draft, or returns a whole new story.
    // opts.coalesce: a key; repeated edits with the same key (typing in one field)
    //   within COALESCE_MS share a single undo step.
    // opts.keepModified: leave meta.modified alone (opening a file isn't an edit).
    // opts.from: who made the change, so panels can avoid redrawing themselves mid-typing.
    update(recipe, opts = {}) {
      const draft = structuredClone(present);
      const next = recipe(draft) || draft;
      if (!opts.keepModified) next.meta.modified = new Date().toISOString();
      const now = Date.now();
      const merge = opts.coalesce && opts.coalesce === lastKey && now - lastTime < COALESCE_MS;
      if (!merge) {
        past.push(present);
        if (past.length > MAX_UNDO) past.shift();
      }
      lastKey = opts.coalesce || null;
      lastTime = now;
      future = [];
      present = next;
      if (opts.select !== undefined) selected = opts.select;
      if (selected && !exists(selected)) selected = null;
      emit({ type: 'edit', from: opts.from || null });
    },

    undo() {
      if (!past.length) return false;
      future.push(present);
      present = past.pop();
      lastKey = null;
      if (selected && !exists(selected)) selected = null;
      emit({ type: 'undo' });
      return true;
    },

    redo() {
      if (!future.length) return false;
      past.push(present);
      present = future.pop();
      lastKey = null;
      if (selected && !exists(selected)) selected = null;
      emit({ type: 'redo' });
      return true;
    },

    select(id, from = null) {
      const next = id && exists(id) ? id : null;
      if (next === selected) return;
      selected = next;
      emit({ type: 'select', from });
    },

    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
