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
