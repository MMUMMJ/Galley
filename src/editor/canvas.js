// The story canvas: the story as readers will see it, with editing tools laid over it.
//   - A rail of numbered blocks on the left (arrow keys move between them).
//   - Click a block to select it; its toolbar (Settings, Edit text, Up, Down, Duplicate, Delete) sits on it.
//   - Click a piece of text (headline, paragraphs, quote, number…) to type straight onto the page
//     (canvas-text.js).
//   - "+ Add" appears between blocks on hover and opens the illustrated block picker.
//   - Settings open the usual Write / Look / Notes inspector as a sheet from the right.
// The page is drawn by the runtime without enhance(), so nothing moves or hides while editing:
// scroll sequences show their steps one after another, effects are off.
import { STORY_DETAILS, REFLECTION } from '../store.js';
import { BLOCKS, blockLabel } from '../blocks/index.js';
import { blockIssues } from '../packs.js';
import { blockOps } from './block-ops.js';
import { openBlockPicker } from './block-picker.js';
import { articlePatcher } from './article-patch.js';
import { canvasText } from './canvas-text.js';
import { canvasSheet } from './canvas-sheet.js';
import { canvasMedia } from './canvas-media.js';
import { labelToolbar, toolbarKeys } from './canvas-toolbar.js';
import { drawRail } from './canvas-rail.js';
import { prefersReducedMotion } from './dom.js';
import { assetKind } from './fields.js';

const FOCUSABLE = 'a[href], button, input, select, textarea, summary, video, audio, iframe, [tabindex]';

// Blocks whose effect only shows when the story moves: Play opens the preview at them. So do
// blocks with a scroll effect, and a header with a background video (still on the canvas).
const SHOWPIECES = new Set(['scrolly', 'textcolumn', 'scrollpoints', 'number', 'compare']);
const moves = (b, story) => SHOWPIECES.has(b.type) || (b.effect && b.effect !== 'none')
  || (b.type === 'header' && assetKind(story.assets[b.data.media]) === 'video');

export function mountCanvas(section, store, { app, sheet, inspector, assetUrl, importFiles, announce, toast, playFrom, openDemo }) {
  section.innerHTML = `
    <h2 class="sr-only" id="canvas-heading">Story canvas</h2>
    <nav class="canvas-rail" aria-label="Blocks">
      <ol class="rail-list"></ol>
      <button type="button" class="rail-add" aria-haspopup="dialog" aria-label="Add a block" title="Add a block"><span class="rail-add-plus" aria-hidden="true">+</span><span class="rail-add-label" aria-hidden="true">Add</span></button>
    </nav>
    <div class="canvas-main">
      <div class="canvas-bar">
        <button type="button" class="btn-slim" data-open="${STORY_DETAILS}">Story details</button>
        <button type="button" class="btn-slim" data-open="${REFLECTION}">Reflection</button>
        <span class="canvas-bar-grow"></span>
        <span class="canvas-pack" hidden></span>
        <button type="button" class="btn-slim" data-preview title="Open the story in a new tab, moving as readers will see it">Preview <span aria-hidden="true">↗</span></button>
      </div>
      <div class="canvas-scroll" tabindex="0" role="region" aria-label="Story canvas. Arrow keys scroll it.">
        <div class="canvas-empty" hidden>
          <p><strong>Your story is empty.</strong> Start it with <strong>+ Add</strong>, on the left.</p>
          <p>New to Galley? <button type="button" class="btn" data-demo>Open the demo story</button> It shows every kind of block, and you can change anything in it.</p>
        </div>
        <div class="canvas-page il-page"></div>
        <div class="canvas-chrome">
          <div class="canvas-hover" hidden></div>
          <div class="canvas-frame" hidden></div>
          <div class="canvas-tools" role="toolbar" hidden>
            <span class="canvas-tools-name"></span>
            <button type="button" class="btn-slim" data-act="settings">Settings</button>
            <button type="button" class="btn-slim" data-act="text">Edit text</button>
            <button type="button" class="btn-slim" data-act="media">Image</button>
            <button type="button" class="btn-slim canvas-play" data-act="play" title="Open the preview here, to see it move as readers will">Play <span aria-hidden="true">▶</span></button>
            <button type="button" class="btn-slim" data-act="up">Up</button>
            <button type="button" class="btn-slim" data-act="down">Down</button>
            <button type="button" class="btn-slim" data-act="dup">Duplicate</button>
            <button type="button" class="btn-slim btn-danger" data-act="del">Delete</button>
            <button type="button" class="btn-slim canvas-todo" data-act="todo" hidden></button>
          </div>
          <button type="button" class="canvas-insert" aria-haspopup="dialog" hidden>+ Add</button>
        </div>
      </div>
    </div>`;

  const $ = (sel) => section.querySelector(sel);
  const rail = $('.rail-list');
  const railAdd = $('.rail-add');
  const scroller = $('.canvas-scroll');
  const page = $('.canvas-page');
  const hover = $('.canvas-hover');
  const frame = $('.canvas-frame');
  const tools = $('.canvas-tools');
  const insertBtn = $('.canvas-insert');
  const ops = blockOps(store, { announce, toast, from: 'canvas' });
  const draw = articlePatcher();
  const blocks = () => store.story.blocks;
  const isBlock = (id) => blocks().some((b) => b.id === id);
  const elOf = (id) => (id ? page.querySelector(`[id="${CSS.escape(id)}"]`) : null);
  const smooth = () => (prefersReducedMotion() ? 'auto' : 'smooth');

  // ---------------------------------------------------------------- the sheet (inspector)
  const { open: openSheet } = canvasSheet({ app, sheet, inspector, active, fallback: () => rail.querySelector('[tabindex="0"]') });

  // ---------------------------------------------------------------- drawing
  let lastHtml = '';
  function render() {
    const R = window.Galley;
    if (!R) return;
    const html = R.renderArticle(store.story, { assetUrl, mode: 'preview', editable: true });
    if (html !== lastHtml) {
      draw(page, html, text.current);
      lastHtml = html;
      // Rarely the typing's block is redrawn anyway (a part's header gains or loses its title):
      // carry on in the same piece of text.
      if (text.current && !text.current.isConnected) {
        const { blockId, field, session } = text;
        text.stop('switch', { save: false });
        const again = editableIn(elOf(blockId === STORY_DETAILS ? 'il-top' : blockId), field);
        if (again) text.start(again, { resume: session });
      }
      const scheme = R.SCHEMES[store.story.meta.theme];
      page.style.background = scheme ? scheme.bg : '';
      // The page is for looking at and clicking, not tabbing through: the rail and toolbar do that.
      page.querySelectorAll(FOCUSABLE).forEach((el) => el.setAttribute('tabindex', '-1'));
    }
    renderRail();
    place();
  }

  const renderRail = () => drawRail(rail, section, store);

  // Where an element sits inside the scrolling canvas.
  function boxOf(el) {
    const r = el.getBoundingClientRect();
    const s = scroller.getBoundingClientRect();
    return { top: r.top - s.top + scroller.scrollTop, left: r.left - s.left + scroller.scrollLeft, width: r.width, height: r.height };
  }
  function setBox(node, box) {
    node.style.top = `${box.top}px`;
    node.style.left = `${box.left}px`;
    node.style.width = `${box.width}px`;
    node.style.height = `${box.height}px`;
  }

  // The selection frame and its toolbar.
  function place() {
    const id = store.selected;
    // With no header block, the story's opening (#il-top) is Story details.
    const el = isBlock(id) ? elOf(id) : id === STORY_DETAILS ? elOf('il-top') : null;
    page.querySelectorAll('.canvas-sel').forEach((x) => { if (x !== el) x.classList.remove('canvas-sel'); });
    el?.classList.add('canvas-sel'); // shows the block's optional empty text (kicker, byline…)
    frame.hidden = !el;
    tools.hidden = !isBlock(id) || Boolean(text.current);
    text.place();
    if (media.blockId && media.blockId !== id) media.hide();
    media.place();
    if (!isBlock(id)) { if (el) setBox(frame, boxOf(el)); return; }
    const i = ops.indexOf(id);
    const b = blocks()[i];
    labelToolbar(tools, {
      index: i, count: blocks().length, label: blockLabel(b.type), el,
      hasText: Boolean(editableIn(el)), hasMedia: media.has(el), playable: moves(b, store.story) && Boolean(playFrom),
      todo: BLOCKS[b.type] ? blockIssues(b, store.story) : [],
    });
    if (!el) { tools.style.top = `${scroller.scrollTop + 8}px`; tools.style.left = '8px'; return; }
    const box = boxOf(el);
    setBox(frame, box);
    // The toolbar sits just above the block, or on its top edge when there's no room above.
    const above = box.top - tools.offsetHeight - 8;
    tools.style.top = `${above >= 4 ? above : box.top + 6}px`;
    tools.style.left = `${Math.max(6, Math.min(box.left + box.width - tools.offsetWidth - 6, scroller.clientWidth - tools.offsetWidth - 6))}px`;
  }

  const scrollToSelected = (block = 'nearest') => {
    const el = elOf(store.selected === STORY_DETAILS ? 'il-top' : store.selected);
    if (el) el.scrollIntoView({ block, behavior: smooth() });
  };

  // ---------------------------------------------------------------- pointer: hover, select, insert
  // The block a page element belongs to (inner elements such as a header's title have ids too).
  function blockFrom(target) {
    for (let el = target.closest('[id]'); el && page.contains(el); el = el.parentElement?.closest('[id]')) {
      if (el.id === 'il-top') return { id: STORY_DETAILS, type: 'header', meta: true, el };
      const b = blocks().find((x) => x.id === el.id);
      if (b) return { id: b.id, type: b.type, el };
    }
    return null;
  }
  const blockIdFrom = (target) => blockFrom(target)?.id || null;
  // An image or video placed in text (not text being typed): clicking it opens the image tools.
  const inTextMedia = (el) => Boolean(el.closest('figure.il-inline-img')?.querySelector('[data-il-asset]')) && !el.closest('.canvas-typing');
  // A block's first piece of text, or the one for a field.
  const editableIn = (el, field) => {
    if (!el) return null;
    const sel = field ? `[data-il-edit="${field}"]` : '[data-il-edit]';
    return el.matches(sel) ? el : el.querySelector(sel);
  };

  // ---------------------------------------------------------------- typing on the page
  const text = canvasText({
    page, holder: section.querySelector('.canvas-main'), dockOver: section.querySelector('.canvas-bar'),
    scroller, boxOf, blockOf: blockFrom, store, assetUrl, importFiles, announce,
    onEnd(how, blockId, el) {
      if (how === 'switch') return;
      draw.forget(el);
      lastHtml = '';
      render();
      if (how === 'escape' || how === 'done') tools.querySelector('[data-act="text"]:not([hidden])')?.focus();
      else if (how === 'tab-out') tools.querySelector('[data-act="settings"]')?.focus();
      else if (how === 'back-out') railButton(blockId)?.focus();
    },
    openSettings: (blockId) => openSheet(railButton(blockId) || railAdd),
    onStart: () => { media.hide(); place(); },
  });
  // Clicking an image or video: Replace, Alt text and Settings on it (canvas-media.js).
  const media = canvasMedia({
    page, holder: section.querySelector('.canvas-chrome'), scroller, boxOf, blockOf: blockFrom, store, importFiles, announce,
    openSettings: (blockId) => openSheet(railButton(blockId) || railAdd),
  });
  // Pressing on a piece of text starts typing there, with the cursor where it was pressed.
  page.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    const target = e.target.closest('[data-il-edit]');
    if (!target || target === text.current) return; // in the text being typed: the browser places the cursor
    if (inTextMedia(e.target)) return; // an image in the text: its own tools (see click)
    const info = blockFrom(target);
    if (!info) return;
    e.preventDefault();
    const { clientX: x, clientY: y } = e;
    let el = target;
    if (text.current && text.blockId !== info.id) {
      text.stop('away'); // redraws the other block, which can move this one
      el = document.elementFromPoint(x, y)?.closest('[data-il-edit]');
      if (!el || !blockFrom(el)) return;
    }
    store.select(info.id, 'canvas');
    text.start(el, { x, y });
  });

  let insertAt = -1;
  function showInsert(y) {
    // The gaps between blocks, and before the first and after the last.
    const els = blocks().map((b) => elOf(b.id));
    const edges = [];
    els.forEach((el, i) => {
      if (!el) return;
      const box = boxOf(el);
      const prev = els.slice(0, i).reverse().find(Boolean);
      edges.push({ at: i, y: prev ? (boxOf(prev).top + boxOf(prev).height + box.top) / 2 : box.top });
      if (i === els.length - 1) edges.push({ at: i + 1, y: box.top + box.height });
    });
    const near = edges.find((g) => Math.abs(g.y - y) < 16);
    insertBtn.hidden = !near;
    if (!near) { insertAt = -1; return; }
    insertAt = near.at;
    insertBtn.style.top = `${near.y - insertBtn.offsetHeight / 2}px`;
    insertBtn.setAttribute('aria-label', `Add a block here. ${ops.whereText(near.at)}`);
  }

  scroller.addEventListener('mousemove', (e) => {
    if (e.target.closest('.canvas-tools, .canvas-media')) return;
    const s = scroller.getBoundingClientRect();
    if (!e.target.closest('.canvas-insert')) showInsert(e.clientY - s.top + scroller.scrollTop);
    const id = page.contains(e.target) ? blockIdFrom(e.target) : null;
    const el = id && id !== store.selected ? elOf(id === STORY_DETAILS ? 'il-top' : id) : null;
    hover.hidden = !el;
    if (el) setBox(hover, boxOf(el));
  });
  scroller.addEventListener('mouseleave', () => { hover.hidden = true; insertBtn.hidden = true; });

  page.addEventListener('click', (e) => {
    // Links and buttons in the story don't go anywhere while editing.
    if (e.target.closest('a, button, summary') && !e.target.closest('.rte-img-tools')) e.preventDefault();
    if (e.target.closest('[data-il-edit]') && !inTextMedia(e.target)) return; // typing (see mousedown)
    // Finishing the typing may have redrawn the block that was clicked.
    const target = e.target.isConnected ? e.target : document.elementFromPoint(e.clientX, e.clientY);
    if (!target || !page.contains(target)) return;
    const id = blockIdFrom(target);
    if (!id) return;
    store.select(id, 'canvas');
    if (id === STORY_DETAILS) { media.hide(); openSheet(target); } else media.click(e.clientX, e.clientY);
  });
  page.addEventListener('dblclick', (e) => {
    if (e.target.closest('[data-il-edit]')) return; // double-click in text selects a word
    const id = blockIdFrom(e.target);
    if (id) { store.select(id, 'canvas'); openSheet(railButton(id)); }
  });

  // ---------------------------------------------------------------- adding blocks
  function pick(at, returnFocus) {
    openBlockPicker({
      where: ops.whereText(at),
      returnFocus,
      onChoose: (type) => {
        const id = ops.add(type, at);
        render();
        scrollToSelected('center');
        openSheet(railButton(id), { focusField: true });
      },
    });
  }
  insertBtn.addEventListener('click', () => pick(insertAt, insertBtn));
  railAdd.addEventListener('click', () => pick(ops.insertIndex(), railAdd));

  // ---------------------------------------------------------------- block toolbar
  const railButton = (id) => rail.querySelector(`[data-id="${CSS.escape(id)}"]`);
  tools.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    const id = store.selected;
    if (!btn || !isBlock(id)) return;
    const act = btn.dataset.act;
    if (act === 'settings' || act === 'todo') openSheet(btn);
    else if (act === 'media') media.openIn(elOf(id), btn);
    else if (act === 'play') playFrom(id);
    else if (act === 'text') { const el = editableIn(elOf(id)); if (el) { scrollToSelected(); text.start(el); } }
    else if (act === 'up' || act === 'down') {
      ops.moveTo(id, ops.indexOf(id) + (act === 'up' ? -1 : 1));
      render();
      scrollToSelected();
      const same = tools.querySelector(`[data-act="${act}"]`);
      (same.disabled ? tools.querySelector(`[data-act="${act === 'up' ? 'down' : 'up'}"]`) : same).focus();
    } else if (act === 'dup') { ops.duplicate(id); render(); scrollToSelected(); tools.querySelector('[data-act="dup"]').focus(); }
    else if (act === 'del') {
      const next = ops.remove(id);
      render();
      (next ? railButton(next) : railAdd)?.focus();
    }
  });

  toolbarKeys(tools);

  // ---------------------------------------------------------------- rail and bar
  rail.addEventListener('click', (e) => {
    const b = e.target.closest('[data-id]');
    if (!b) return;
    store.select(b.dataset.id, 'rail');
    scrollToSelected('center');
  });
  rail.addEventListener('keydown', (e) => {
    const b = e.target.closest('[data-id]');
    if (!b) return;
    const i = ops.indexOf(b.dataset.id);
    const last = blocks().length - 1;
    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      if (ops.moveTo(b.dataset.id, i + (e.key === 'ArrowUp' ? -1 : 1))) { render(); scrollToSelected(); railButton(b.dataset.id)?.focus(); }
      return;
    }
    const to = { ArrowUp: i - 1, ArrowDown: i + 1, Home: 0, End: last }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    const next = blocks()[Math.max(0, Math.min(last, to))];
    if (!next) return;
    store.select(next.id, 'rail');
    railButton(next.id)?.focus();
    scrollToSelected('center');
  });
  section.querySelectorAll('[data-open]').forEach((btn) => btn.addEventListener('click', () => {
    store.select(btn.dataset.open, 'canvas');
    openSheet(btn);
  }));
  $('[data-demo]').addEventListener('click', () => openDemo?.());
  $('[data-preview]').addEventListener('click', () => document.getElementById('preview-popout')?.click());

  // ---------------------------------------------------------------- keeping up with the story
  let timer = 0;
  store.subscribe((change) => {
    if (!active()) return;
    if (change.type === 'undo' || change.type === 'redo') { if (text.current) text.cancel(); media.hide(); }
    if (change.type === 'select') {
      render();
      if (change.from !== 'canvas' && change.from !== 'rail' && change.from !== 'checks') scrollToSelected('center');
      return;
    }
    // At most one redraw every 200ms while typing in the sheet.
    if (!timer) timer = setTimeout(() => { timer = 0; render(); }, 200);
  });
  new ResizeObserver(() => { if (active()) place(); }).observe(page);
  page.addEventListener('load', () => place(), true); // images change block heights as they arrive

  function active() { return !section.hidden; }

  return {
    // Checks send students to a block's settings, even when it's already the selected one.
    reveal(id, from) {
      if (!active()) return false;
      if (text.current) text.stop('away');
      media.hide();
      render();
      scrollToSelected('center');
      openSheet(from || railButton(id) || $(`[data-open="${STORY_DETAILS}"]`) || railAdd);
      return true;
    },
    show() {
      lastHtml = '';
      render();
      sheet.setAttribute('inert', '');
      requestAnimationFrame(() => scrollToSelected('center'));
    },
    hide() {
      text.stop('hide');
      media.hide();
      app.classList.remove('sheet-open');
      sheet.removeAttribute('inert');
      page.replaceChildren();
      lastHtml = '';
    },
  };
}
