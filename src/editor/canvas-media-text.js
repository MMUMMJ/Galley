// Images and videos placed inside a block's text, changed from the canvas's image bar without
// typing: move them left, full width or right, or take them out of the text. Each one is a line
// of the text: ![name](asset:<id>) or ![name](asset:<id> "left").
import { fieldSpot } from './canvas-text.js';

// Where an image on the page sits in the story's text: the field, which copy of the file in that
// field, and its position. Null for an image that isn't in text.
export function textPlace(el) {
  const field = el.closest('[data-il-edit]');
  if (!field) return null;
  const id = el.dataset.ilAsset;
  const nth = [...field.querySelectorAll(`[data-il-asset="${CSS.escape(id)}"]`)].indexOf(el);
  const pos = (el.closest('figure')?.className.match(/il-inline-img--(left|right)/) || [])[1] || '';
  return { field: field.dataset.ilEdit, nth: Math.max(0, nth), pos };
}

const imageLines = (id) => new RegExp(`^(\\s*!\\[[^\\]\\n]*\\]\\(asset:${id})(?:\\s+"(?:left|right)")?(\\)\\s*)$`, 'gm');

// Rewrites the nth line for this file in the text: make(head, tail) returns the new line ('' removes it).
function changeLine(text, assetId, nth, make) {
  let i = -1;
  return String(text || '')
    .replace(imageLines(assetId), (line, head, tail) => (++i === nth ? make(head, tail) : line))
    .replace(/\n{3,}/g, '\n\n').replace(/^\n+|\n+$/g, '');
}

function edit(store, blockId, place, assetId, make) {
  store.update((s) => {
    const b = s.blocks.find((x) => x.id === blockId);
    const spot = b && fieldSpot(b.data, place.field);
    if (spot) spot.obj[spot.key] = changeLine(spot.obj[spot.key], assetId, place.nth, make);
  }, { from: 'canvas-media' });
}

export const setTextPos = (store, blockId, place, assetId, pos) => edit(store, blockId, place, assetId,
  (head, tail) => `${head}${pos ? ` "${pos}"` : ''}${tail.trim()}`);

export const removeFromText = (store, blockId, place, assetId) => edit(store, blockId, place, assetId, () => '');

// A replaced file in text: the one line that was clicked shows the new file, in the same position.
export const swapLineInText = (text, from, to, place) => changeLine(text, from, place.nth,
  (head, tail) => `${head.slice(0, -from.length)}${to}${place.pos ? ` "${place.pos}"` : ''}${tail.trim()}`);
