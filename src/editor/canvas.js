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
import { esc, prefersReducedMotion } from './dom.js';

const FOCUSABLE = 'a[href], button, input, select, textarea, summary, video, audio, iframe, [tabindex]';

export function mountCanvas(section, store, { app, sheet, inspector, assetUrl, importFiles, announce, toast }) {
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
        <button type="button" class="btn-slim" data-preview title="Open the story in a new tab, moving as readers will see it">Preview <span aria-hidden="true">↗</span></button>
      </div>
      <div class="canvas-scroll">
        <div class="canvas-page il-page"></div>
        <div class="canvas-chrome">
          <div class="canvas-hover" hidden></div>
          <div class="canvas-frame" hidden></div>
          <div class="canvas-tools" role="toolbar" hidden>
            <span class="canvas-tools-name"></span>
            <button type="button" class="btn-slim" data-act="settings">Settings</button>
            <button type="button" class="btn-slim" data-act="text">Edit text</button>
            <button type="button" class="btn-slim" data-act="up">Up</button>
            <button type="button" class="btn-slim" data-act="down">Down</button>
            <button type="button" class="btn-slim" data-act="dup">Duplicate</button>
            <button type="button" class="btn-slim btn-danger" data-act="del">Delete</button>
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
  const toolsName = $('.canvas-tools-name');
  const insertBtn = $('.canvas-insert');
  const ops = blockOps(store, { announce, toast, from: 'canvas' });
  const draw = articlePatcher();
  const blocks = () => store.story.blocks;
  const isBlock = (id) => blocks().some((b) => b.id === id);
  const elOf = (id) => (id ? page.querySelector(`[id="${CSS.escape(id)}"]`) : null);
  const smooth = () => (prefersReducedMotion() ? 'auto' : 'smooth');

  // ---------------------------------------------------------------- the sheet (inspector)
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'btn sheet-close';
  closeBtn.textContent = 'Close';
  closeBtn.setAttribute('aria-label', 'Close settings');
  sheet.prepend(closeBtn);
  let returnTo = null;
  const sheetOpen = () => app.classList.contains('sheet-open');
  function openSheet(from, { focusField = false } = {}) {
    returnTo = from || document.activeElement;
    app.classList.add('sheet-open');
    sheet.removeAttribute('inert');
    if (focusField) inspector.focusFirstField();
    else sheet.focus();
  }
  function closeSheet() {
    if (!sheetOpen()) return;
    app.classList.remove('sheet-open');
    sheet.setAttribute('inert', '');
    const back = returnTo && returnTo.isConnected ? returnTo : rail.querySelector('[tabindex="0"]');
    back?.focus();
  }
  closeBtn.addEventListener('click', closeSheet);
  sheet.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && active() && !e.defaultPrevented && !e.target.closest('dialog, .rte-pop')) { e.preventDefault(); closeSheet(); }
  });

  // ---------------------------------------------------------------- drawing
  let lastHtml = '';
  function render() {
    const R = window.Illuminate;
    if (!R) return;
    const html = R.renderArticle(store.story, { assetUrl, mode: 'preview', editable: true });
    if (html !== lastHtml) {
      draw(page, html, text.current);
      lastHtml = html;
      // Rarely the typing's block is redrawn anyway (a part's header gains or loses its title):
      // carry on in the same piece of text.
      if (text.current && !text.current.isConnected) {
        const { blockId, field } = text;
        text.stop('switch', { save: false });
        const again = editableIn(elOf(blockId === STORY_DETAILS ? 'il-top' : blockId), field);
        if (again) text.start(again);
      }
      const scheme = R.SCHEMES[store.story.meta.theme];
      page.style.background = scheme ? scheme.bg : '';
      // The page is for looking at and clicking, not tabbing through: the rail and toolbar do that.
      page.querySelectorAll(FOCUSABLE).forEach((el) => el.setAttribute('tabindex', '-1'));
    }
    renderRail();
    place();
  }

  function renderRail() {
    const sel = store.selected;
    const list = blocks();
    const current = list.some((b) => b.id === sel) ? sel : list[0]?.id;
    rail.innerHTML = list.map((b, i) => {
      const issues = BLOCKS[b.type] ? blockIssues(b, store.story) : [];
      const label = `${i + 1}, ${blockLabel(b.type)}${issues.length ? ', needs work' : ''}`;
      return `<li><button type="button" class="rail-item${b.id === sel ? ' is-selected' : ''}${issues.length ? ' needs-work' : ''}"
        data-id="${esc(b.id)}" aria-label="${esc(label)}" title="${esc(label)}" ${b.id === sel ? 'aria-current="true"' : ''}
        tabindex="${b.id === current ? '0' : '-1'}">${i + 1}</button></li>`;
    }).join('');
    $('[data-open="story-details"]').setAttribute('aria-pressed', String(sel === STORY_DETAILS));
    $('[data-open="reflection"]').setAttribute('aria-pressed', String(sel === REFLECTION));
  }

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
    const el = isBlock(id) ? elOf(id) : null;
    page.querySelectorAll('.canvas-sel').forEach((x) => { if (x !== el) x.classList.remove('canvas-sel'); });
    el?.classList.add('canvas-sel'); // shows the block's optional empty text (kicker, byline…)
    frame.hidden = !el;
    tools.hidden = !isBlock(id) || Boolean(text.current);
    text.place();
    if (!isBlock(id)) return;
    const i = ops.indexOf(id);
    const name = `Block ${i + 1}, ${blockLabel(blocks()[i].type)}`;
    tools.setAttribute('aria-label', name);
    toolsName.textContent = `${i + 1} · ${blockLabel(blocks()[i].type)}`;
    tools.querySelector('[data-act="up"]').disabled = i === 0;
    tools.querySelector('[data-act="down"]').disabled = i === blocks().length - 1;
    tools.querySelector('[data-act="up"]').setAttribute('aria-label', `Move ${name} up`);
    tools.querySelector('[data-act="down"]').setAttribute('aria-label', `Move ${name} down`);
    tools.querySelector('[data-act="dup"]').setAttribute('aria-label', `Duplicate ${name}`);
    tools.querySelector('[data-act="del"]').setAttribute('aria-label', `Delete ${name}`);
    tools.querySelector('[data-act="settings"]').setAttribute('aria-label', `Settings for ${name}`);
    tools.querySelector('[data-act="text"]').hidden = !editableIn(el);
    tools.querySelector('[data-act="text"]').setAttribute('aria-label', `Edit the text of ${name}`);
    if (!el) { tools.style.top = `${scroller.scrollTop + 8}px`; tools.style.left = '8px'; return; }
    const box = boxOf(el);
    setBox(frame, box);
    // The toolbar sits just above the block, or on its top edge when there's no room above.
    const above = box.top - tools.offsetHeight - 8;
    tools.style.top = `${above >= 4 ? above : box.top + 6}px`;
    tools.style.left = `${Math.max(6, Math.min(box.left + box.width - tools.offsetWidth - 6, scroller.clientWidth - tools.offsetWidth - 6))}px`;
  }

  const scrollToSelected = (block = 'nearest') => {
    const el = elOf(store.selected);
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
  // A block's first piece of text, or the one for a field.
  const editableIn = (el, field) => {
    if (!el) return null;
    const sel = field ? `[data-il-edit="${field}"]` : '[data-il-edit]';
    return el.matches(sel) ? el : el.querySelector(sel);
  };

  // ---------------------------------------------------------------- typing on the page
  const text = canvasText({
    page, holder: section.querySelector('.canvas-chrome'), scroller, boxOf, blockOf: blockFrom, store, assetUrl, importFiles, announce,
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
    onStart: () => place(),
  });
  // Pressing on a piece of text starts typing there, with the cursor where it was pressed.
  page.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    const target = e.target.closest('[data-il-edit]');
    if (!target || target === text.current) return; // in the text being typed: the browser places the cursor
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
    if (e.target.closest('.canvas-tools')) return;
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
    if (e.target.closest('[data-il-edit]')) return; // typing (see mousedown)
    // Finishing the typing may have redrawn the block that was clicked.
    const target = e.target.isConnected ? e.target : document.elementFromPoint(e.clientX, e.clientY);
    if (!target || !page.contains(target)) return;
    const id = blockIdFrom(target);
    if (!id) return;
    store.select(id, 'canvas');
    if (id === STORY_DETAILS) openSheet(target);
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
    if (act === 'settings') openSheet(btn);
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
  $('[data-preview]').addEventListener('click', () => document.getElementById('preview-popout')?.click());

  // ---------------------------------------------------------------- keeping up with the story
  let timer = 0;
  store.subscribe((change) => {
    if (!active()) return;
    if ((change.type === 'undo' || change.type === 'redo') && text.current) text.cancel();
    if (change.type === 'select') {
      render();
      if (change.from !== 'canvas' && change.from !== 'rail') scrollToSelected('center');
      // Checks send students to a block's settings.
      if (change.from === 'checks') openSheet(railButton(store.selected) || railAdd);
      return;
    }
    // At most one redraw every 200ms while typing in the sheet.
    if (!timer) timer = setTimeout(() => { timer = 0; render(); }, 200);
  });
  new ResizeObserver(() => { if (active()) place(); }).observe(page);
  page.addEventListener('load', () => place(), true); // images change block heights as they arrive

  function active() { return !section.hidden; }

  return {
    show() {
      lastHtml = '';
      render();
      sheet.setAttribute('inert', '');
      requestAnimationFrame(() => scrollToSelected('center'));
    },
    hide() {
      text.stop('hide');
      app.classList.remove('sheet-open');
      sheet.removeAttribute('inert');
      page.replaceChildren();
      lastHtml = '';
    },
  };
}
