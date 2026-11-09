// Images and videos on the canvas. Clicking one (outside text being typed) puts a small bar on it:
//   Replace…  choose a new file; this block uses it instead (other blocks keep the old one).
//   Alt text  write the description for readers who can't see it, right there.
//   Settings  the block's settings, for the caption, credit, licence and the rest.
// The runtime marks every image and video with data-il-asset="<asset id>" (exports too: the
// mark is harmless there).
import { h } from './dom.js';
import { ACCEPT, assetKind } from './fields.js';

const ALT_HINT = 'Describe what the image shows, for readers who can\'t see it. This is not the caption.';

// Every place in a block's data that holds exactly this asset id (media fields, not text).
function swapIn(value, from, to) {
  if (Array.isArray(value)) return value.map((v) => swapIn(v, from, to));
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) value[k] = swapIn(value[k], from, to);
    return value;
  }
  return value === from ? to : value;
}

// page, holder, scroller, boxOf, blockOf: as for canvasText. openSettings(blockId).
export function canvasMedia({ page, holder, scroller, boxOf, blockOf, store, importFiles, announce, openSettings }) {
  const name = h('span', { class: 'canvas-media-name' });
  const replaceBtn = h('button', { type: 'button', class: 'btn-slim' }, 'Replace…');
  const altBtn = h('button', { type: 'button', class: 'btn-slim', 'aria-expanded': 'false' }, 'Alt text');
  const settingsBtn = h('button', { type: 'button', class: 'btn-slim' }, 'Settings');
  const closeBtn = h('button', { type: 'button', class: 'btn-slim canvas-media-close', 'aria-label': 'Close the image tools' }, '×');
  const input = h('input', { type: 'file', class: 'sr-only', tabindex: '-1', 'aria-hidden': 'true' });
  const altId = `cv-alt-${Math.random().toString(36).slice(2, 8)}`;
  const altBox = h('textarea', { id: altId, rows: 3 });
  const altHint = h('p', { class: 'field-hint', id: `${altId}-hint` }, ALT_HINT);
  const altDone = h('button', { type: 'button', class: 'btn-slim' }, 'Done');
  const altPop = h('div', { class: 'canvas-media-alt', hidden: true },
    h('label', { for: altId }, 'Alt text'), altHint, altBox, h('div', { class: 'canvas-media-alt-row' }, altDone));
  altBox.setAttribute('aria-describedby', altHint.id);
  const bar = h('div', { class: 'canvas-media', role: 'toolbar', hidden: true },
    name, replaceBtn, altBtn, settingsBtn, closeBtn, input, altPop);
  holder.append(bar);

  let cur = null; // { assetId, blockId, nth: which of this block's copies of the file }
  let session = 0;

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
      if (el.closest('[data-il-edit]')) return null;
      if (el.matches('[data-il-asset]')) return el;
    }
    return null;
  }

  function show(el) {
    const info = blockOf(el);
    if (!info || info.meta) { hide(); return false; }
    const id = el.dataset.ilAsset;
    const same = [...info.el.querySelectorAll(`[data-il-asset="${CSS.escape(id)}"]`)];
    cur = { assetId: id, blockId: info.id, nth: Math.max(0, same.indexOf(el)) };
    const a = asset();
    const kind = assetKind(a) || 'image';
    name.textContent = a?.name || (kind === 'video' ? 'Video' : 'Image');
    altBtn.textContent = kind === 'image' ? 'Alt text' : 'Description';
    altBtn.classList.toggle('needs-alt', !String(a?.alt || '').trim());
    replaceBtn.setAttribute('aria-label', `Replace ${name.textContent}`);
    input.accept = kind === 'video' ? 'video/*,.mov' : ACCEPT.image;
    closeAlt(false);
    bar.hidden = false;
    bar.setAttribute('aria-label', `${kind === 'video' ? 'Video' : 'Image'}: ${name.textContent}`);
    place();
    return true;
  }
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
  altBox.addEventListener('input', () => {
    if (!cur) return;
    const id = cur.assetId;
    store.update((s) => { if (s.assets[id]) s.assets[id].alt = altBox.value; }, { from: 'canvas-media', coalesce: `canvas-alt:${session}` });
  });
  altBox.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); closeAlt(); }
  });
  bar.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    if (!altPop.hidden) closeAlt();
    else hide();
  });

  settingsBtn.addEventListener('click', () => { const id = cur?.blockId; if (id) openSettings(id); });
  closeBtn.addEventListener('click', () => hide());

  return {
    // A click on the page: show the bar for the image or video under it, or hide it.
    click(x, y) {
      const el = at(x, y);
      return el ? show(el) : (hide(), false);
    },
    show,
    hide,
    place,
    contains: (el) => bar.contains(el),
    get blockId() { return cur ? cur.blockId : null; },
  };
}
