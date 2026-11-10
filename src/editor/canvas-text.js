// Typing straight onto the canvas. The runtime marks each piece of text with the field it comes
// from (data-il-edit, see slot() in the runtime). Clicking one makes it editable where it is;
// a bar docked over the top of the canvas names the field and, for formatted text, offers the
// usual formatting tools. Docked there it never covers the text being typed or the lines around it. Every keystroke is saved to the story, so the settings sheet, the preview and the
// checks keep up. The canvas leaves the block alone while it is being typed in and redraws it
// when the typing ends.
//   Enter (one-line text) or Tab: the next piece of text in the block. Shift+Tab: the one before.
//   Esc or Done: stop typing.
import { h } from './dom.js';
import { toHtml, padImages, mediaFigure, MEDIA } from './rich-core.js';
import { attachRichEditing } from './rich-tools.js';

const NAMES = {
  kicker: 'Kicker', title: 'Headline', standfirst: 'Standfirst', byline: 'Byline', body: 'Text',
  col1: 'Column 1', col2: 'Column 2', col3: 'Column 3', cite: 'Who said it', role: 'Their role',
  value: 'Number', unit: 'Unit', context: 'Context line', sourceName: 'Source', sourceRef: 'Source reference',
};
const nameOf = (type, field) => {
  const step = /^steps\.(\d+)\.text$/.exec(field);
  if (step) return `Step ${Number(step[1]) + 1}`;
  return field === 'text' ? (type === 'quote' ? 'Quote' : 'Label') : NAMES[field] || field;
};

// A field is a key in the block's data, or a path into it (steps.2.text: a scroll step's text).
// Returns the object that holds the text and the key within it.
export function fieldSpot(data, field) {
  const parts = field.split('.');
  const key = parts.pop();
  let obj = data;
  for (const p of parts) obj = obj?.[/^\d+$/.test(p) ? Number(p) : p];
  return obj && typeof obj === 'object' ? { obj, key } : null;
}

let uid = 0;

// page: the canvas page; holder: where the bar goes (it covers dockOver, the canvas's top bar,
// while typing); boxOf(el): where an element sits in the scrolling canvas; blockOf(el): { id, type, meta, el } for a marked element;
// onEnd(how, blockId, el): after typing stops ('escape', 'done', 'tab-out', 'back-out', 'blur',
// 'undo', or 'switch' when moving on to another piece of text in the same block).
// openSettings(blockId): the Settings button on the bar (the block's own toolbar is hidden while typing).
// onStart(): typing has started (the canvas hides the block's toolbar).
export function canvasText({ page, holder, dockOver, scroller, boxOf, blockOf, store, assetUrl, importFiles, announce, onStart, onEnd, openSettings }) {
  const format = h('div', { class: 'canvas-format', hidden: true, role: 'group' });
  holder.append(format);
  let cur = null;

  const stored = (c) => {
    if (c.meta) return store.story.meta[c.field] ?? '';
    const b = store.story.blocks.find((x) => x.id === c.blockId);
    const spot = b && fieldSpot(b.data, c.field);
    return spot ? spot.obj[spot.key] ?? '' : '';
  };
  const write = (c, value) => {
    if (value === stored(c)) return;
    store.update((s) => {
      if (c.meta) s.meta[c.field] = value;
      else { const b = s.blocks.find((x) => x.id === c.blockId); const spot = b && fieldSpot(b.data, c.field); if (spot) spot.obj[spot.key] = value; }
    }, { from: 'canvas-type', coalesce: `canvas:${c.session}` }); // each spell of typing is its own undo step
  };
  const isEmpty = (el) => !el.textContent.trim() && !el.querySelector(MEDIA);
  const inside = (el) => Boolean(el) && (format.contains(el) || (cur && cur.el.contains(el)));

  // The pieces of text in the same block, in reading order.
  const siblings = (c) => {
    const owner = c.blockEl;
    return owner.matches('[data-il-edit]') ? [owner] : [...owner.querySelectorAll('[data-il-edit]')];
  };

  function caretAt(el, x, y) {
    let range = null;
    if (x != null && document.caretPositionFromPoint) {
      const p = document.caretPositionFromPoint(x, y);
      if (p) { range = document.createRange(); range.setStart(p.offsetNode, p.offset); }
    } else if (x != null && document.caretRangeFromPoint) range = document.caretRangeFromPoint(x, y);
    if (!range || !el.contains(range.startContainer)) {
      range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
    }
    range.collapse(true);
    getSelection().removeAllRanges();
    getSelection().addRange(range);
  }

  // Starts typing in el. at: { x, y } (a click) or nothing (cursor at the end); { resume } carries
  // on a spell of typing whose element was redrawn: the same undo step, nothing announced.
  function start(el, at = {}) {
    if (cur?.el === el) return;
    if (cur) stop('switch');
    const info = blockOf(el);
    if (!info) return;
    const c = { el, field: el.dataset.ilEdit, mode: el.dataset.ilMode, meta: info.meta || el.hasAttribute('data-il-meta'), blockId: info.id, type: info.type, blockEl: info.el };
    c.label = nameOf(c.type, c.field);
    c.session = at.resume || ++uid;
    cur = c;
    const value = stored(c);
    const id = `cv-text-${++uid}`;
    el.id ||= id;
    el.setAttribute('role', 'textbox');
    el.setAttribute('aria-label', c.label);
    el.setAttribute('aria-multiline', String(c.mode === 'blocks' || c.mode === 'lines'));
    el.setAttribute('spellcheck', 'true');
    el.classList.add('canvas-typing');

    let bar = null;
    let pop = null;
    if (c.mode === 'plain') {
      el.textContent = value;
      try { el.contentEditable = 'plaintext-only'; } catch { el.contentEditable = 'true'; }
      el.addEventListener('input', c.onInput = () => write(c, el.textContent.replace(/\s*\n\s*/g, ' ')));
      el.addEventListener('paste', c.onPaste = (e) => {
        e.preventDefault();
        document.execCommand('insertText', false, e.clipboardData.getData('text/plain').replace(/\s+/g, ' '));
      });
    } else {
      const ctx = {
        // Always the current story: a file added while typing must be found when the text is tidied.
        get story() { return store.story; },
        setAsset: (assetId, k, value) => store.update((s) => { if (s.assets[assetId]) s.assets[assetId][k] = value; },
          { from: 'canvas-type', coalesce: `canvas-asset:${assetId}:${k}` }),
        assetUrl, importFiles, announce,
        // Media added from the bar: fn sets data[key], so it gets the object that holds this text.
        edit: (fn) => store.update((s) => { const b = s.blocks.find((x) => x.id === c.blockId); const spot = b && fieldSpot(b.data, c.field); if (spot) fn(spot.obj, s); }, { from: 'canvas-type' }),
      };
      const figure = mediaFigure(ctx, 'page');
      const shape = { base: Number(el.dataset.ilBase) || 2, bare: c.mode === 'inline' };
      el.innerHTML = toHtml(value, c.mode, figure, shape);
      if (c.mode === 'blocks') padImages(el);
      el.contentEditable = 'true';
      const editor = attachRichEditing(el, {
        id: el.id, label: c.label, mode: c.mode, images: c.mode === 'blocks', ctx, key: c.field.split('.').pop(), focusKey: `canvas:${c.blockId}:${c.field}`,
        figure, ...shape, inside,
        save: () => write(c, c.mode === 'lines' ? editor.value().join('\n') : editor.value()),
        onChange: () => c.onEmpty?.(),
      });
      c.tidy = editor.tidy;
      c.output = () => (c.mode === 'lines' ? editor.value().join('\n') : editor.value());
      ({ bar, pop } = editor);
    }
    el.addEventListener('input', c.onEmpty = () => { el.toggleAttribute('data-il-empty', isEmpty(el)); place(); });
    el.addEventListener('keydown', c.onKey = (e) => key(e, c));
    el.addEventListener('focusout', c.onBlur = (e) => {
      if (cur !== c || inside(e.relatedTarget)) return;
      // Checked a moment later: when the canvas redraws the element mid-typing, the browser
      // reports it as losing focus, and the canvas carries on in the new one instead.
      queueMicrotask(() => {
        if (cur !== c || !c.el.isConnected || inside(document.activeElement)) return;
        if (!document.hasFocus()) return; // switching to another window: carry on when they come back
        stop('blur');
      });
    });

    const done = h('button', { type: 'button', class: 'btn-slim canvas-format-done', onclick: () => stop('done') }, 'Done');
    const settings = h('button', { type: 'button', class: 'btn-slim', onclick: () => { stop('settings'); openSettings(c.blockId); } }, 'Settings');
    // The formatting row scrolls sideways on a narrow screen; Settings and Done always stay in
    // view at the end. The link and media pop-ups hang below the bar.
    const row = h('div', { class: 'canvas-format-row' }, h('span', { class: 'canvas-format-name' }, c.label), ...(bar ? [bar] : []));
    format.replaceChildren(row, h('div', { class: 'canvas-format-end' }, settings, done), ...(pop ? [pop] : []));
    format.setAttribute('aria-label', `Typing in ${c.label}`);
    format.hidden = false;
    el.focus({ preventScroll: true });
    caretAt(el, at.x, at.y);
    onStart();
    place();
    if (!at.resume) announce(`Typing in ${c.label}. Press Escape when you're done.`);
  }

  function key(e, c) {
    if (e.key === 'Escape') { e.preventDefault(); stop('escape'); return; }
    // Home and End: to the start or end of the line (Shift selects). Done here because Chrome
    // scrolls the whole canvas to its top or bottom when the cursor is already there.
    if ((e.key === 'Home' || e.key === 'End') && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      getSelection().modify(e.shiftKey ? 'extend' : 'move', e.key === 'End' ? 'forward' : 'backward', 'lineboundary');
      return;
    }
    const oneLine = c.mode === 'plain' || c.mode === 'inline';
    const tab = e.key === 'Tab' && !e.altKey && !e.ctrlKey && !e.metaKey;
    if (!(tab || (oneLine && e.key === 'Enter'))) return;
    e.preventDefault();
    const list = siblings(c);
    const next = list[list.indexOf(c.el) + (e.shiftKey && tab ? -1 : 1)];
    if (next) start(next);
    else if (tab) stop(e.shiftKey ? 'back-out' : 'tab-out');
  }

  // Ends typing: final save, then the block is redrawn from the story.
  function stop(how = 'done', { save = true } = {}) {
    const c = cur;
    if (!c) return;
    cur = null;
    if (save) {
      if (c.tidy) { c.tidy(); write(c, c.output()); }
      else write(c, c.el.textContent.replace(/\s+/g, ' ').trim());
    }
    const el = c.el;
    el.removeEventListener('input', c.onInput);
    el.removeEventListener('paste', c.onPaste);
    el.removeEventListener('input', c.onEmpty);
    el.removeEventListener('keydown', c.onKey);
    el.removeEventListener('focusout', c.onBlur);
    el.removeAttribute('contenteditable');
    el.classList.remove('canvas-typing');
    format.hidden = true;
    format.replaceChildren();
    onEnd(how, c.blockId, el);
  }

  // The bar is docked over the canvas's top bar, the same height, so nothing moves.
  function place() {
    if (!cur || format.hidden) return;
    format.style.minHeight = `${dockOver.offsetHeight}px`;
  }

  return {
    start,
    stop,
    place,
    // Undo or redo replaced the text: drop the typing without saving over it.
    cancel: () => stop('undo', { save: false }),
    get current() { return cur ? cur.el : null; },
    get blockId() { return cur ? cur.blockId : null; },
    get field() { return cur ? cur.field : null; },
    get session() { return cur ? cur.session : null; },
  };
}
