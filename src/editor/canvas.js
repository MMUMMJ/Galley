// The story canvas: the story as readers will see it, with editing tools laid over it. A rail of
// numbered blocks on the left; click a block for its toolbar, click text to type (canvas-text.js),
// "+ Add" between blocks opens the block picker, Settings slide in from the right. The page is
// drawn without enhance(), so nothing moves while editing: steps sit one after another, effects
// are off. Play runs one block, moving, over the canvas (canvas-player.js).
import { STORY_DETAILS, REFLECTION } from '../store.js';
import { createBlock } from '../model.js';
import { BLOCKS, blockLabel } from '../blocks/index.js';
import { blockIssues, allowedBlocks } from '../packs.js';
import { getSettings, setSetting } from '../settings.js';
import { blockOps } from './block-ops.js';
import { openBlockPicker } from './block-picker.js';
import { articlePatcher } from './article-patch.js';
import { canvasText } from './canvas-text.js';
import { canvasSheet } from './canvas-sheet.js';
import { canvasMedia } from './canvas-media.js';
import { labelToolbar, toolbarKeys, closeMore, toggleMore } from './canvas-toolbar.js';
import { drawRail } from './canvas-rail.js';
import { canvasPlayer } from './canvas-player.js';
import { prefersReducedMotion } from './dom.js';
import { assetKind } from './fields.js';

const FOCUSABLE = 'a[href], button, input, select, textarea, summary, video, audio, iframe, [tabindex]';

// Blocks whose effect only shows when the story moves: Play runs them in place (canvas-player.js).
// So do blocks with a scroll effect, and a header with a background video (still on the canvas).
const SHOWPIECES = new Set(['scrolly', 'textcolumn', 'scrollpoints', 'number', 'compare']);
const moves = (b, story) => SHOWPIECES.has(b.type) || (b.effect && b.effect !== 'none')
  || (b.type === 'header' && assetKind(story.assets[b.data.media]) === 'video');

export function mountCanvas(section, store, { app, sheet, inspector, assetUrl, importFiles, announce, toast, playFrom, openDemo }) {
  section.innerHTML = `
    <h2 class="sr-only" id="canvas-heading">Story canvas</h2>
    <nav class="canvas-rail" aria-label="Blocks">
      <button type="button" class="rail-toggle" aria-expanded="false" aria-label="Show story outline" title="Show or hide block names in the rail"><span class="rail-toggle-icon" aria-hidden="true">☰</span><span class="rail-toggle-text">Outline</span></button>
      <ol class="rail-list"></ol>
      <button type="button" class="rail-add" aria-haspopup="dialog" aria-label="Add a block" title="Add a block"><span class="rail-add-plus" aria-hidden="true">+</span><span class="rail-add-label" aria-hidden="true">Add</span></button>
    </nav>
    <div class="canvas-main">
      <div class="canvas-bar">
        <button type="button" class="btn-slim" data-open="${STORY_DETAILS}">Story details</button>
        <button type="button" class="btn-slim" data-open="${REFLECTION}">Reflection</button>
        <span class="canvas-cue" hidden>Click text to write · Click media for details <button type="button" class="canvas-cue-close" aria-label="Dismiss tip" title="Dismiss tip">×</button></span>
        <span class="canvas-bar-grow"></span>
        <span class="canvas-pack" hidden></span>
        <button type="button" class="btn-slim" data-preview title="Open the whole story in a new tab, moving as readers will see it">Preview story <span aria-hidden="true">↗</span></button>
      </div>
      <div class="canvas-scroll" tabindex="0" role="region" aria-label="Story canvas. Arrow keys scroll it.">
        <div class="canvas-empty" hidden>
          <p class="canvas-empty-title"><strong>Start your story</strong></p>
          <p>Begin straight away with a headline and text, or choose from 14 visual block types.</p>
          <div class="canvas-empty-actions">
            <button type="button" class="btn btn-primary" data-start-writing>Start writing</button>
            <button type="button" class="btn" data-start-add>+ Choose a block…</button>
            <button type="button" class="btn" data-demo>Open the demo story</button>
          </div>
        </div>
        <div class="canvas-page il-page"></div>
        <div class="canvas-chrome">
          <div class="canvas-hover" hidden></div>
          <div class="canvas-frame" hidden></div>
          <div class="canvas-tools" role="toolbar" hidden>
            <span class="canvas-tools-name"></span>
            <button type="button" class="btn-slim" data-act="settings">Settings</button>
            <button type="button" class="btn-slim" data-act="text">Edit text</button>
            <button type="button" class="btn-slim" data-act="media">Media</button>
            <button type="button" class="btn-slim" data-act="add-step" hidden>+ Step</button>
            <button type="button" class="btn-slim canvas-play" data-act="play" title="Play this block here, moving as readers will see it">Play <span aria-hidden="true">▶</span></button>
            <button type="button" class="btn-slim canvas-todo" data-act="todo" hidden></button>
            <div class="canvas-more-wrap">
              <button type="button" class="btn-slim canvas-more-btn" data-act="more" aria-expanded="false" aria-haspopup="true">More <span aria-hidden="true">▾</span></button>
              <div class="canvas-more-menu" role="group" hidden>
                <button type="button" class="btn-slim" data-act="up">Move up</button>
                <button type="button" class="btn-slim" data-act="down">Move down</button>
                <button type="button" class="btn-slim" data-act="dup">Duplicate</button>
                <button type="button" class="btn-slim btn-danger" data-act="del">Delete</button>
              </div>
            </div>
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
  // Play: the selected block moving, laid over the canvas until Stop.
  const player = canvasPlayer({ holder: section.querySelector('.canvas-main'), scroller, store, assetUrl, announce,
    label: (id) => `block ${ops.indexOf(id) + 1}, ${ops.labelOf(id)}`, openPreview: (id) => playFrom?.(id) });

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
  let lastPlacedId = null;
  function place() {
    const id = store.selected;
    if (id !== lastPlacedId) { closeMore(tools); lastPlacedId = id; }
    // With no header block, the story's opening (#il-top) is Story details.
    const el = isBlock(id) ? elOf(id) : id === STORY_DETAILS ? elOf('il-top') : null;
    page.querySelectorAll('.canvas-sel').forEach((x) => { if (x !== el) x.classList.remove('canvas-sel'); });
    el?.classList.add('canvas-sel'); // shows the block's optional empty text (kicker, byline…)
    frame.hidden = !el;
    tools.hidden = !isBlock(id) || Boolean(text.current);
    if (tools.hidden) closeMore(tools);
    text.place();
    if (media.blockId && media.blockId !== id) media.hide();
    media.place();
    if (!isBlock(id)) { if (el) setBox(frame, boxOf(el)); return; }
    const i = ops.indexOf(id);
    const b = blocks()[i];
    labelToolbar(tools, {
      index: i, count: blocks().length, label: blockLabel(b.type), el,
      hasText: Boolean(editableIn(el)), hasMedia: media.has(el),
      hasSteps: b.type === 'scrolly' || b.type === 'scrollpoints',
      playable: moves(b, store.story) && Boolean(playFrom),
      todo: BLOCKS[b.type] ? blockIssues(b, store.story) : [],
    });
    if (!el) { tools.style.top = `${scroller.scrollTop + 8}px`; tools.style.left = '8px'; return; }
    const box = boxOf(el);
    setBox(frame, box);
    // The toolbar sits just above the block, or on its top edge when there's no room above.
    // Measure at the full available width, before anchoring: an old left offset must not
    // squeeze a wrapping toolbar into a column when the outline or settings change width.
    tools.style.left = '6px';
    tools.style.width = 'max-content';
    tools.style.maxWidth = `${Math.max(0, scroller.clientWidth - 12)}px`;
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
      if (how === 'escape' || how === 'done' || how === 'undo') {
        (tools.querySelector('[data-act="text"]:not([hidden])') || tools.querySelector('[data-act="settings"]:not([hidden])') || railButton(blockId))?.focus();
      } else if (how === 'tab-out') tools.querySelector('[data-act="settings"]')?.focus();
      else if (how === 'back-out') railButton(blockId)?.focus();
    },
    openSettings: (blockId) => openSheet(railButton(blockId) || railAdd),
    onStart: () => { media.hide(); place(); },
  });
  // Selecting any media opens the shared media editor.
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
    if (e.target.closest('[data-il-edit], [data-il-asset], figure')) return; // media has its own editor; text selects a word
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
    if (act === 'more') { toggleMore(tools); return; }
    if (act === 'settings' || act === 'todo') { closeMore(tools); openSheet(btn); }
    else if (act === 'media') { closeMore(tools); media.openIn(elOf(id), btn); }
    else if (act === 'play') { closeMore(tools); player.open(id, btn); }
    else if (act === 'text') { closeMore(tools); const el = editableIn(elOf(id)); if (el) { scrollToSelected(); text.start(el); } }
    else if (act === 'add-step') {
      closeMore(tools);
      const b = blocks()[ops.indexOf(id)];
      if (!b || !Array.isArray(b.data.steps)) return;
      const nextIdx = b.data.steps.length;
      const stepObj = b.type === 'scrollpoints'
        ? { text: '', align: 'auto', focus: true, x: 35, y: 35, w: 30, h: 30 }
        : { media: null, text: '', align: 'center' };
      store.update((s) => {
        const target = s.blocks.find((x) => x.id === id);
        if (target && Array.isArray(target.data.steps)) target.data.steps.push(stepObj);
      }, { select: id, from: 'canvas' });
      lastHtml = '';
      render();
      const stepEl = editableIn(elOf(id), `steps.${nextIdx}.text`);
      if (stepEl) {
        stepEl.scrollIntoView({ block: 'center', behavior: smooth() });
        text.start(stepEl);
      }
      announce(`Step ${nextIdx + 1} added.`);
    } else if (act === 'up' || act === 'down') {
      ops.moveTo(id, ops.indexOf(id) + (act === 'up' ? -1 : 1));
      render();
      scrollToSelected();
      const same = tools.querySelector(`[data-act="${act}"]`);
      (same.disabled ? tools.querySelector(`[data-act="${act === 'up' ? 'down' : 'up'}"]`) : same).focus();
    } else if (act === 'dup') {
      closeMore(tools);
      ops.duplicate(id);
      render();
      scrollToSelected();
      tools.querySelector('[data-act="more"]')?.focus();
    } else if (act === 'del') {
      closeMore(tools);
      const next = ops.remove(id);
      render();
      (next ? railButton(next) : railAdd)?.focus();
    }
  });
  document.addEventListener('click', (e) => {
    if (!tools.hidden && !tools.querySelector('.canvas-more-wrap')?.contains(e.target)) closeMore(tools);
  });

  toolbarKeys(tools);

  // ---------------------------------------------------------------- rail, cue and empty-story starters
  const railToggle = $('.rail-toggle');
  const setRailExpanded = (expanded, save = true) => {
    section.classList.toggle('rail-expanded', expanded);
    railToggle.setAttribute('aria-expanded', String(expanded));
    railToggle.setAttribute('aria-label', expanded ? 'Hide story outline' : 'Show story outline');
    if (save) setSetting('railExpanded', expanded);
    place();
  };
  railToggle.addEventListener('click', () => setRailExpanded(!section.classList.contains('rail-expanded'), true));
  const cue = $('.canvas-cue');
  $('.canvas-cue-close')?.addEventListener('click', () => {
    cue.hidden = true;
    setSetting('canvasCueDismissed', true);
  });
  getSettings().then((s) => {
    if (s.railExpanded) setRailExpanded(true, false);
    if (!s.canvasCueDismissed) cue.hidden = false;
  });

  $('[data-start-writing]').addEventListener('click', () => {
    const allowed = allowedBlocks();
    const types = ['header', 'text'].filter((t) => allowed.includes(t));
    if (!types.length) { pick(0, $('[data-start-writing]')); return; }
    const created = types.map((t) => createBlock(t));
    store.update((s) => { s.blocks.push(...created); }, { select: created[0].id, from: 'canvas' });
    render();
    const firstField = editableIn(elOf(created[0].id), created[0].type === 'header' ? 'title' : undefined);
    if (firstField) text.start(firstField);
    announce('Started your story with a header and a text block. Type your headline.');
  });
  $('[data-start-add]').addEventListener('click', () => pick(0, $('[data-start-add]')));
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
    // Any change, or choosing another block, stops the player: what it shows would be out of date.
    if (player.blockId && (change.type !== 'select' || store.selected !== player.blockId)) player.close(false);
    if (change.type === 'undo' || change.type === 'redo') { if (text.current) text.cancel(); }
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
    // Checks send students to a block's settings (and a specific field when given), even when it's already the selected one.
    reveal(id, from, focusTarget = null) {
      if (!active()) return false;
      if (text.current) text.stop('away');
      media.hide();
      render();
      scrollToSelected('center');
      openSheet(from || railButton(id) || $(`[data-open="${STORY_DETAILS}"]`) || railAdd, { focusTarget });
      return true;
    },
    show() {
      lastHtml = '';
      render();
      sheet.setAttribute('inert', '');
      requestAnimationFrame(() => scrollToSelected('center'));
    },
    hide() {
      player.close(false);
      text.stop('hide');
      media.hide();
      app.classList.remove('sheet-open');
      sheet.removeAttribute('inert');
      page.replaceChildren();
      lastHtml = '';
    },
  };
}
