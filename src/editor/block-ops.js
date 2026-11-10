// Adding, moving, duplicating and deleting blocks, shared by the Classic block list and the
// canvas so both behave (and announce) the same. Each returns what the caller needs to put
// focus somewhere sensible afterwards.
import { createBlock, newId } from '../model.js';
import { blockLabel } from '../blocks/index.js';
import { STORY_DETAILS, REFLECTION } from '../store.js';

export function blockOps(store, { announce, toast, from }) {
  const blocks = () => store.story.blocks;
  const indexOf = (id) => blocks().findIndex((b) => b.id === id);
  const labelOf = (id) => blockLabel(blocks()[indexOf(id)]?.type);

  // Where a new block goes by default: after the selected block, at the top from
  // Story details or Reflection, otherwise at the end.
  function insertIndex() {
    const i = indexOf(store.selected);
    if (store.selected === STORY_DETAILS || store.selected === REFLECTION) return 0;
    return i < 0 ? blocks().length : i + 1;
  }

  // Words for the block picker: where the new block will go.
  function whereText(at = insertIndex()) {
    const all = blocks();
    if (!all.length) return 'Adds the first block of your story.';
    if (at <= 0) return 'Adds at the start of your story.';
    if (at >= all.length) return 'Adds at the end of your story.';
    return `Adds between block ${at} (${blockLabel(all[at - 1].type)}) and block ${at + 1} (${blockLabel(all[at].type)}).`;
  }

  return {
    indexOf,
    labelOf,
    insertIndex,
    whereText,
    // Returns the new block's id.
    add(type, at = insertIndex()) {
      // The first header opens the story full screen; later ones start parts, so they're compact.
      const later = type === 'header' && blocks().slice(0, at).some((b) => b.type === 'header');
      const block = createBlock(type, later ? { variant: 'compact' } : {});
      store.update((s) => { s.blocks.splice(at, 0, block); }, { select: block.id, from });
      announce(`${blockLabel(type)} block added at position ${at + 1}.`);
      return block.id;
    },
    // Returns true if the block moved.
    moveTo(id, to) {
      const at = indexOf(id);
      if (at < 0 || to < 0 || to >= blocks().length || to === at) return false;
      store.update((s) => {
        const [b] = s.blocks.splice(at, 1);
        s.blocks.splice(to, 0, b);
      }, { select: id, from });
      announce(`${labelOf(id)} block moved to position ${to + 1} of ${blocks().length}.`);
      return true;
    },
    // Returns the copy's id.
    duplicate(id) {
      const i = indexOf(id);
      const copy = { ...structuredClone(blocks()[i]), id: newId('b') };
      store.update((s) => { s.blocks.splice(i + 1, 0, copy); }, { select: copy.id, from });
      announce(`${labelOf(id)} block duplicated. The copy is block ${i + 2}.`);
      return copy.id;
    },
    // Returns the neighbouring block that is now selected (or null when none are left).
    remove(id) {
      const i = indexOf(id);
      const label = labelOf(id);
      const all = blocks();
      const neighbour = all[i + 1]?.id || all[i - 1]?.id || null;
      store.update((s) => { s.blocks.splice(i, 1); }, { select: neighbour, from });
      toast(`${label} block deleted.`, { action: 'Undo', onAction: () => store.undo() });
      return neighbour;
    },
  };
}
