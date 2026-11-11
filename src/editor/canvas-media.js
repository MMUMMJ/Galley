// Canvas selection is only a route into the shared media editor. It doesn't own a second form.
import { openMediaEditor, closeMediaEditor, mediaEditorContains } from './media-editor.js';
import { mediaTargets } from './media-targets.js';
import { textPlace } from './canvas-media-text.js';

export function canvasMedia({ page, blockOf, store }) {
  let currentBlock = null;
  const mediaIn = (el) => el ? [...el.querySelectorAll('[data-il-asset]')].filter((x) => !x.closest('.canvas-typing')) : [];
  function show(el, { returnFocus } = {}) {
    const info = blockOf(el);
    if (!info || info.meta) return false;
    const id = el.dataset.ilAsset;
    const b = store.story.blocks.find((x) => x.id === info.id);
    const targets = mediaTargets(b).filter((t) => t.assetId === id);
    const spot = textPlace(el);
    let target;
    if (spot) target = targets.filter((t) => t.line !== undefined && t.path.join('.') === spot.field)[spot.nth];
    else {
      const copies = mediaIn(info.el).filter((x) => x.dataset.ilAsset === id && !textPlace(x));
      target = targets.filter((t) => t.line === undefined)[Math.max(0, copies.indexOf(el))];
    }
    if (!target) return false;
    currentBlock = info.id;
    const opened = openMediaEditor({ ...target, returnFocus: returnFocus
      || document.querySelector(`.rail-item[data-id="${CSS.escape(info.id)}"]`) });
    if (opened) el.classList.add('media-selected');
    return opened;
  }
  function hide() { currentBlock = null; closeMediaEditor(); }
  return {
    click(x, y) {
      for (const el of document.elementsFromPoint(x, y)) {
        if (!page.contains(el) || el.closest('.canvas-typing')) continue;
        const media = el.matches('[data-il-asset]') ? el : el.closest('figure')?.querySelector('[data-il-asset]');
        if (media) return show(media);
        if (el.closest('[data-il-edit]')) break;
      }
      hide(); return false;
    },
    show, hide,
    openIn(el, from) { const first = mediaIn(el)[0]; return first ? show(first, { returnFocus: from }) : false; },
    has: (el) => mediaIn(el).length > 0,
    place() {},
    contains: mediaEditorContains,
    get blockId() { return currentBlock; },
  };
}
