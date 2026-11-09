// Images and videos on the canvas, wherever they are (in text too, unless it's being typed in).
// Clicking one puts a small bar on it:
//   Replace…  choose a new file; this block uses it instead (other blocks keep the old one).
//   Alt text  its alt text, caption and credit, right there.
//   Left · Full · Right · Remove   for one placed in text.
//   Settings  the block's settings, for the licence and the rest.
//   ‹ ›       the block's other images (a scroll sequence, a text column, a gallery…).
// From the keyboard: the block toolbar's Image button opens it; arrow keys move along it; Esc closes it.
// The runtime marks every image and video with data-il-asset="<asset id>" (exports too: the
// mark is harmless there).
import { h } from './dom.js';
import { ACCEPT, assetKind } from './fields.js';
import { textPlace, setTextPos, removeFromText, swapInText } from './canvas-media-text.js';

const ALT_HINT = 'Describe what the image shows, for readers who can\'t see it. This is not the caption.';

// Every place in a block's data that shows this asset: media fields, and images in its text.
function swapIn(value, from, to) {
  if (Array.isArray(value)) return value.map((v) => swapIn(v, from, to));
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) value[k] = swapIn(value[k], from, to);
    return value;
  }
  if (value === from) return to;
  return typeof value === 'string' ? swapInText(value, from, to) : value;
}

// page, holder, scroller, boxOf, blockOf: as for canvasText. openSettings(blockId).
export function canvasMedia({ page, holder, scroller, boxOf, blockOf, store, importFiles, announce, openSettings }) {
  const name = h('span', { class: 'canvas-media-name' });
  const replaceBtn = h('button', { type: 'button', class: 'btn-slim' }, 'Replace…');
  const altBtn = h('button', { type: 'button', class: 'btn-slim', 'aria-expanded': 'false' }, 'Alt text');
  const settingsBtn = h('button', { type: 'button', class: 'btn-slim' }, 'Settings');
  const closeBtn = h('button', { type: 'button', class: 'btn-slim canvas-media-close', 'aria-label': 'Close the image tools' }, '×');
  const prevBtn = h('button', { type: 'button', class: 'btn-slim canvas-media-step', 'aria-label': 'Previous image in this block' }, '‹');
  const nextBtn = h('button', { type: 'button', class: 'btn-slim canvas-media-step', 'aria-label': 'Next image in this block' }, '›');
  const count = h('span', { class: 'canvas-media-count' });
  const input = h('input', { type: 'file', class: 'sr-only', tabindex: '-1', 'aria-hidden': 'true' });
  const altId = `cv-alt-${Math.random().toString(36).slice(2, 8)}`;
  const altBox = h('textarea', { id: altId, rows: 3 });
  const altHint = h('p', { class: 'field-hint', id: `${altId}-hint` }, ALT_HINT);
  const altDone = h('button', { type: 'button', class: 'btn-slim' }, 'Done');
  const capBox = h('textarea', { id: `${altId}-cap`, rows: 2 });
  const creditBox = h('input', { id: `${altId}-credit`, type: 'text' });
  const altPop = h('div', { class: 'canvas-media-alt', hidden: true },
    h('label', { for: altId }, 'Alt text'), altHint, altBox,
    h('label', { for: capBox.id }, 'Caption'), h('p', { class: 'field-hint' }, 'Shown under it. Adds context the picture can\'t.'), capBox,
    h('label', { for: creditBox.id }, 'Credit'), h('p', { class: 'field-hint' }, 'Who made it, e.g. "Photo: Sam Example".'), creditBox,
    h('div', { class: 'canvas-media-alt-row' }, altDone));
  altBox.setAttribute('aria-describedby', altHint.id);
  // For an image placed in text: where it sits, or take it out.
  const posBtns = [['left', 'Left'], ['', 'Full'], ['right', 'Right']].map(([pos, label]) => h('button', {
    type: 'button', class: 'btn-slim canvas-media-pos', 'data-pos': pos, 'aria-pressed': 'false', 'aria-label': `${label}: ${pos ? `float ${pos}, text wraps round it` : 'full width'}`,
  }, label));
  const removeBtn = h('button', { type: 'button', class: 'btn-slim btn-danger canvas-media-pos' }, 'Remove');
  const bar = h('div', { class: 'canvas-media', role: 'toolbar', hidden: true },
    prevBtn, count, nextBtn, name, replaceBtn, altBtn, ...posBtns, removeBtn, settingsBtn, closeBtn, input, altPop);
  holder.append(bar);

  let cur = null; // { assetId, blockId, nth: which of this block's copies of the file, place: where it is in text }
  let session = 0;
  let returnTo = null; // where focus goes when the bar closes from the keyboard

  // A block's images and videos, in page order (not ones in text being typed: typing has those).
  const mediaIn = (blockEl) => [...blockEl.querySelectorAll('[data-il-asset]')].filter((e) => !e.closest('.canvas-typing'));
  const blockEl = () => (cur ? page.querySelector(`[id="${CSS.escape(cur.blockId)}"]`) : null);

  const asset = () => (cur ? store.story.assets[cur.assetId] : null);
  // The element again after a redraw: the same file, the same copy, in the same block.
  function elOf() {
    if (!cur) return null;
    const block = page.querySelector(`[id="${CSS.escape(cur.blockId)}"]`);
    const all = block ? [...block.querySelectorAll(`[data-il-asset="${CSS.escape(cur.assetId)}"]`)] : [];
    return all[cur.nth] || all[0] || null;
  }

  // The image or video at a point on the page, unless it sits in text (typing deals with those).
  function at(x, y) {
    for (const el of document.elementsFromPoint(x, y)) {
      if (!page.contains(el)) continue;
      if (el.closest('.canvas-typing')) return null;
      // An image in text: the picture, or its caption.
      const fig = el.closest('figure.il-inline-img');
      const media = el.matches('[data-il-asset]') ? el : fig?.querySelector('[data-il-asset]');
      if (media) return media;
      if (el.closest('[data-il-edit]')) return null; // the words: typing
    }
    return null;
  }

  function show(el, { focus = false } = {}) {
    const info = blockOf(el);
    if (!info || info.meta) { hide(); return false; }
    const all = mediaIn(info.el);
    const at = all.indexOf(el);
    prevBtn.hidden = nextBtn.hidden = count.hidden = all.length < 2;
    prevBtn.disabled = at <= 0;
    nextBtn.disabled = at < 0 || at >= all.length - 1;
    count.textContent = `${at + 1} of ${all.length}`;
    const id = el.dataset.ilAsset;
    const same = [...info.el.querySelectorAll(`[data-il-asset="${CSS.escape(id)}"]`)];
    cur = { assetId: id, blockId: info.id, nth: Math.max(0, same.indexOf(el)), place: textPlace(el) };
    posBtns.concat(removeBtn).forEach((b) => { b.hidden = !cur.place; });
    if (cur.place) posBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.pos === cur.place.pos)));
    const a = asset();
    const kind = assetKind(a) || 'image';
    name.textContent = a?.name || (kind === 'video' ? 'Video' : 'Image');
    altBtn.textContent = kind === 'image' ? 'Alt text' : 'Description';
    altBtn.classList.toggle('needs-alt', !String(a?.alt || '').trim());
    replaceBtn.setAttribute('aria-label', `Replace ${name.textContent}`);
    input.accept = kind === 'video' ? 'video/*,.mov' : ACCEPT.image;
    closeAlt(false);
    bar.hidden = false;
    bar.setAttribute('aria-label', `${kind === 'video' ? 'Video' : 'Image'}${all.length > 1 ? ` ${at + 1} of ${all.length}` : ''}: ${name.textContent}`);
    if (focus) {
      el.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      announce(`${bar.getAttribute('aria-label')}. ${a && !String(a.alt || '').trim() ? 'It has no alt text yet. ' : ''}Arrow keys move between the tools; Escape closes them.`);
    }
    place();
    return true;
  }
  // Steps to the block's previous or next image, keeping focus on the same button if it can.
  function step(delta, btn) {
    const all = blockEl() ? mediaIn(blockEl()) : [];
    const el = all[all.indexOf(elOf()) + delta];
    if (!el) return;
    show(el, { focus: true });
    requestAnimationFrame(() => { place(); (btn.disabled ? (btn === prevBtn ? nextBtn : prevBtn) : btn).focus(); });
  }
  prevBtn.addEventListener('click', () => step(-1, prevBtn));
  nextBtn.addEventListener('click', () => step(1, nextBtn));
  function hide() {
    if (!cur && bar.hidden) return;
    cur = null;
    closeAlt(false);
    bar.hidden = true;
  }

  function place() {
    if (!cur || bar.hidden) return;
    const el = elOf();
    if (!el) {
      // Not drawn yet (a new file is on its way to the page): wait. The block gone: close.
      if (!page.querySelector(`[id="${CSS.escape(cur.blockId)}"]`)) hide();
      return;
    }
    const box = boxOf(el);
    // On the image's top edge, kept inside the view while a tall image scrolls past.
    const top = Math.min(Math.max(box.top + 8, scroller.scrollTop + 8), box.top + Math.max(8, box.height - bar.offsetHeight - 8));
    bar.style.top = `${top}px`;
    bar.style.left = `${Math.max(6, Math.min(box.left + 8, scroller.clientWidth - bar.offsetWidth - 6))}px`;
  }
  scroller.addEventListener('scroll', place, { passive: true });

  // ---- replace
  replaceBtn.addEventListener('click', () => input.click());
  input.addEventListener('change', async () => {
    const files = [...(input.files || [])];
    input.value = '';
    if (!files.length || !cur) return;
    const { assetId: old, blockId } = cur;
    const kind = assetKind(store.story.assets[old]) || 'image';
    const [added] = await importFiles(files.slice(0, 1), [kind]);
    if (!added) return;
    // The new file keeps the old one's caption, credit and alt text until they're changed:
    // the student is usually swapping in a better shot of the same thing.
    const before = store.story.assets[old] || {};
    const keep = Object.fromEntries(['alt', 'caption', 'credit', 'licence'].filter((k) => before[k]).map((k) => [k, before[k]]));
    store.update((s) => {
      s.assets[added.id] = { ...added.asset, ...keep };
      const b = s.blocks.find((x) => x.id === blockId);
      if (b) swapIn(b.data, old, added.id);
    }, { from: 'canvas-media' });
    cur = { ...cur, assetId: added.id };
    requestAnimationFrame(() => { place(); replaceBtn.focus(); });
    announce(`Replaced with ${added.asset.name || 'the new file'}.${keep.alt ? ' Check the alt text still fits.' : ' Now add its alt text.'}`);
    if (!keep.alt) openAlt();
  });

  // ---- alt text
  function openAlt() {
    if (!cur) return;
    session++;
    altBox.value = asset()?.alt || '';
    capBox.value = asset()?.caption || '';
    creditBox.value = asset()?.credit || '';
    const kind = assetKind(asset()) || 'image';
    altPop.querySelector('label').textContent = kind === 'image' ? 'Alt text' : 'Description';
    altHint.textContent = kind === 'image' ? ALT_HINT : `Describe the ${kind} for readers who can't see or hear it.`;
    const uses = store.story.blocks.filter((b) => JSON.stringify(b.data).includes(`"${cur.assetId}"`)).length;
    if (uses > 1) altHint.textContent += ` This file is in ${uses} blocks: the text goes with it everywhere.`;
    altPop.hidden = false;
    altBtn.setAttribute('aria-expanded', 'true');
    altBox.focus();
    place();
  }
  function closeAlt(refocus = true) {
    if (altPop.hidden) return;
    altPop.hidden = true;
    altBtn.setAttribute('aria-expanded', 'false');
    if (cur) altBtn.classList.toggle('needs-alt', !String(asset()?.alt || '').trim());
    if (refocus) altBtn.focus();
  }
  altBtn.addEventListener('click', () => (altPop.hidden ? openAlt() : closeAlt()));
  altDone.addEventListener('click', () => closeAlt());
  // Alt text, caption and credit belong to the file, so they follow it into every block that uses it.
  for (const [box, key] of [[altBox, 'alt'], [capBox, 'caption'], [creditBox, 'credit']]) {
    box.addEventListener('input', () => {
      if (!cur) return;
      const id = cur.assetId;
      store.update((s) => { if (s.assets[id]) s.assets[id][key] = box.value; }, { from: 'canvas-media', coalesce: `canvas-${key}:${session}` });
    });
  }
  // In text: move it, or take it out (the file stays in the story's files).
  posBtns.forEach((b) => b.addEventListener('click', () => {
    if (!cur?.place) return;
    setTextPos(store, cur.blockId, cur.place, cur.assetId, b.dataset.pos);
    cur.place = { ...cur.place, pos: b.dataset.pos };
    posBtns.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    announce(b.dataset.pos ? `Moved to the ${b.dataset.pos}; the text wraps round it.` : 'Full width.');
    requestAnimationFrame(() => place());
  }));
  removeBtn.addEventListener('click', () => {
    if (!cur?.place) return;
    removeFromText(store, cur.blockId, cur.place, cur.assetId);
    announce('Removed from the text. The file stays in your story\'s files.');
    close();
  });
  altBox.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); closeAlt(); }
  });
  bar.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (!altPop.hidden) closeAlt();
      else close();
      return;
    }
    // Arrow keys along the bar's own buttons (not inside the alt text box).
    if (altPop.contains(e.target)) return;
    const buttons = [...bar.children].filter((b) => b.tagName === 'BUTTON' && !b.hidden && !b.disabled);
    const i = buttons.indexOf(document.activeElement);
    const to = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: buttons.length - 1 }[e.key];
    if (to === undefined || i < 0) return;
    e.preventDefault();
    buttons[(to + buttons.length) % buttons.length].focus();
  });
  // Closes the bar; focus goes back where it came from if it was in the bar.
  function close() {
    const had = bar.contains(document.activeElement);
    hide();
    if (had && returnTo?.isConnected) returnTo.focus();
  }

  settingsBtn.addEventListener('click', () => { const id = cur?.blockId; if (id) openSettings(id); });
  closeBtn.addEventListener('click', () => close());

  return {
    // A click on the page: show the bar for the image or video under it, or hide it.
    click(x, y) {
      returnTo = null;
      const el = at(x, y);
      return el ? show(el) : (hide(), false);
    },
    show,
    hide,
    // From the keyboard: the first image in a block, with focus on the bar. from: where Esc returns.
    openIn(blockElement, from) {
      const first = mediaIn(blockElement)[0];
      if (!first || !show(first, { focus: true })) return false;
      returnTo = from;
      requestAnimationFrame(() => { place(); replaceBtn.focus(); });
      return true;
    },
    has: (blockElement) => Boolean(blockElement) && mediaIn(blockElement).length > 0,
    place,
    contains: (el) => bar.contains(el),
    get blockId() { return cur ? cur.blockId : null; },
  };
}
