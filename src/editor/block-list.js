// The block list: select, add, move, duplicate and delete blocks.
// Keyboard: arrow keys move between blocks; Alt + arrow moves the selected block.
// Only the selected block's buttons are in the Tab order, so Tab reaches the inspector quickly.
import { createBlock, newId } from '../model.js';
import { BLOCKS, blockLabel } from '../blocks/index.js';
import { esc, preserveFocus } from './dom.js';
import { enableDrag } from './drag.js';
import { STORY_DETAILS, REFLECTION } from '../store.js';
import { getPack, allowedBlocks, blockIssues, showpieceCount } from '../packs.js';
import { effectBadge } from './effects.js';

export function mountBlockList(panel, store, { announce, toast, onAdded }) {
  panel.innerHTML = `
    <h2 class="panel-heading" id="blocks-heading">Blocks</h2>
    <div class="pack-info"></div>
    <button type="button" class="details-select story-select" data-focus="details"></button>
    <button type="button" class="details-select reflection-select" data-focus="reflection"></button>
    <ol class="block-list" aria-labelledby="blocks-heading" aria-describedby="blocks-tip"></ol>
    <p class="panel-empty" hidden>Your story has no blocks yet. Add one below.</p>
    <div class="add-block">
      <button type="button" class="btn btn-primary" aria-expanded="false" aria-controls="add-menu" data-focus="add">Add block</button>
      <ul class="add-menu" id="add-menu" hidden>
        ${Object.values(BLOCKS).filter((b) => allowedBlocks().includes(b.type)).map((b) => `<li><button type="button" class="add-option" data-type="${b.type}">
          <strong>${esc(b.label)}</strong><span>${esc(b.description)}</span></button></li>`).join('')}
      </ul>
    </div>
    <p class="panel-tip" id="blocks-tip">Arrow keys move between blocks. Alt + ↑ or ↓ moves the selected block. Drag ⠿ to reorder.</p>`;

  const list = panel.querySelector('.block-list');
  const details = panel.querySelector('.story-select');
  const reflection = panel.querySelector('.reflection-select');
  const packInfo = panel.querySelector('.pack-info');
  const empty = panel.querySelector('.panel-empty');
  const addButton = panel.querySelector('[aria-controls="add-menu"]');
  const menu = panel.querySelector('#add-menu');

  const blocks = () => store.story.blocks;
  const indexOf = (id) => blocks().findIndex((b) => b.id === id);
  const labelOf = (id) => blockLabel(blocks()[indexOf(id)]?.type);
  const focusKey = (key) => list.querySelector(`[data-focus="${CSS.escape(key)}"]`)?.focus();

  // A small swatch when the block has a background band.
  function bandBadge(b) {
    const colour = b.background && window.Illuminate ? window.Illuminate.bandColour(b.background, store.story.meta.theme) : '';
    return colour ? ` <span class="badge badge-band"><span class="badge-dot" style="background:${colour}" aria-hidden="true"></span>Band</span>` : '';
  }

  function renderDetails() {
    const m = store.story.meta;
    const on = store.selected === STORY_DETAILS;
    details.classList.toggle('is-selected', on);
    details.setAttribute('aria-current', on ? 'true' : 'false');
    details.innerHTML = `<span class="block-type">Story details${m.title ? '' : ' <span class="badge">No title yet</span>'}</span>
      <span class="block-summary">${esc(m.title || 'Title, byline, search and sharing')}</span>`;
  }

  function renderReflection() {
    const r = store.story.reflection;
    const on = store.selected === REFLECTION;
    const answered = r.filter((x) => x.a.trim()).length;
    reflection.classList.toggle('is-selected', on);
    reflection.setAttribute('aria-current', on ? 'true' : 'false');
    reflection.innerHTML = `<span class="block-type">Reflection</span>
      <span class="block-summary">${r.length ? `${answered} of ${r.length} questions answered` : 'Questions about how you made it'}</span>`;
  }

  // The pack's name and rules, so students can see what their course expects.
  function renderPack() {
    const pack = getPack();
    packInfo.hidden = !pack.path;
    if (!pack.path) return;
    const rules = [
      pack.scheme && window.Illuminate ? `House style: ${window.Illuminate.SCHEMES[pack.scheme].name} colour scheme` : null,
      pack.includeNotes ? 'Maker\'s notes on every block' : null,
      pack.effectNotes === 'required' ? 'Every effect needs a note' : null,
      { inline: 'Source claims with links in the text', references: 'Source claims with a reference list', both: 'Source claims with links and a reference list' }[pack.sourcing],
      pack.requireShowpiece ? `Showpiece blocks: ${showpieceCount(store.story)} of ${pack.requireShowpiece}` : null,
      `Export size limit: ${pack.maxExportMB} MB`,
    ].filter(Boolean);
    packInfo.innerHTML = `<details class="pack-details"><summary>Pack: <strong>${esc(pack.name || pack.path)}</strong></summary>
      <ul>${rules.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></details>`;
    packInfo.querySelector('details').open = packOpen;
  }
  let packOpen = false;
  packInfo.addEventListener('toggle', (e) => { packOpen = e.target.open; }, true);

  function render() {
    renderPack();
    renderDetails();
    renderReflection();
    const all = blocks();
    const selected = store.selected === STORY_DETAILS || store.selected === REFLECTION ? null : store.selected;
    const tabbable = selected || all[0]?.id;
    empty.hidden = all.length > 0;
    list.innerHTML = all.map((b, i) => {
      const mod = BLOCKS[b.type];
      const label = blockLabel(b.type);
      let summary = '';
      try { summary = mod ? mod.summary(b.data, store.story) : 'Not supported in this version'; } catch { summary = ''; }
      const issues = mod ? blockIssues(b, store.story) : [];
      let badge = issues.length ? 'Unfinished' : '';
      try { badge = (mod && mod.badge && mod.badge(b.data, store.story)) || badge; } catch { /* keep default */ }
      const isSel = b.id === selected;
      const tab = b.id === tabbable ? '0' : '-1';
      const act = isSel ? '0' : '-1';
      const name = `${label} block ${i + 1}`;
      return `<li class="block-item${isSel ? ' is-selected' : ''}" data-id="${esc(b.id)}">
        <span class="drag-handle" aria-hidden="true">⠿</span>
        <button type="button" class="block-select" data-act="select" data-focus="sel:${esc(b.id)}" tabindex="${tab}"
          aria-current="${isSel ? 'true' : 'false'}">
          <span class="block-num">${i + 1}</span>
          <span class="block-text"><span class="block-type">${esc(label)}${badge ? ` <span class="badge">${esc(badge)}</span>` : ''}${effectBadge(b.effect) ? ` <span class="badge badge-fx" title="Movement">↯ ${esc(effectBadge(b.effect))}</span>` : ''}${bandBadge(b)}</span>
          <span class="block-summary">${esc(String(summary).slice(0, 80))}</span></span>
        </button>
        <span class="block-actions">
          <button type="button" class="btn btn-icon" data-act="up" data-focus="up:${esc(b.id)}" tabindex="${act}" aria-label="Move ${name} up" title="Move up" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button type="button" class="btn btn-icon" data-act="down" data-focus="down:${esc(b.id)}" tabindex="${act}" aria-label="Move ${name} down" title="Move down" ${i === all.length - 1 ? 'disabled' : ''}>↓</button>
          <button type="button" class="btn btn-icon" data-act="dup" data-focus="dup:${esc(b.id)}" tabindex="${act}" aria-label="Duplicate ${name}" title="Duplicate">⧉</button>
          <button type="button" class="btn btn-icon btn-danger" data-act="del" data-focus="del:${esc(b.id)}" tabindex="${act}" aria-label="Delete ${name}" title="Delete">✕</button>
        </span>
      </li>`;
    }).join('');
  }

  function moveTo(id, to) {
    const from = indexOf(id);
    if (from < 0 || to < 0 || to >= blocks().length || to === from) return;
    store.update((s) => {
      const [b] = s.blocks.splice(from, 1);
      s.blocks.splice(to, 0, b);
    }, { select: id, from: 'list' });
    announce(`${labelOf(id)} block moved to position ${to + 1} of ${blocks().length}.`);
  }

  function duplicate(id) {
    const i = indexOf(id);
    const copy = { ...structuredClone(blocks()[i]), id: newId('b') };
    store.update((s) => { s.blocks.splice(i + 1, 0, copy); }, { select: copy.id, from: 'list' });
    announce(`${labelOf(id)} block duplicated. The copy is block ${i + 2}.`);
    focusKey(`sel:${copy.id}`);
  }

  function remove(id) {
    const i = indexOf(id);
    const label = labelOf(id);
    const all = blocks();
    const neighbour = all[i + 1]?.id || all[i - 1]?.id || null;
    store.update((s) => { s.blocks.splice(i, 1); }, { select: neighbour, from: 'list' });
    toast(`${label} block deleted.`, { action: 'Undo', onAction: () => store.undo() });
    if (neighbour) focusKey(`sel:${neighbour}`); else addButton.focus();
  }

  function add(type) {
    const block = createBlock(type);
    const i = indexOf(store.selected);
    const at = store.selected === STORY_DETAILS || store.selected === REFLECTION ? 0 : i < 0 ? blocks().length : i + 1;
    store.update((s) => { s.blocks.splice(at, 0, block); }, { select: block.id, from: 'list' });
    announce(`${blockLabel(type)} block added at position ${at + 1}.`);
    closeMenu();
    onAdded(block.id);
  }

  function openMenu() {
    menu.hidden = false;
    addButton.setAttribute('aria-expanded', 'true');
    menu.querySelector('button').focus();
  }
  function closeMenu(refocus) {
    menu.hidden = true;
    addButton.setAttribute('aria-expanded', 'false');
    if (refocus) addButton.focus();
  }

  addButton.addEventListener('click', () => (menu.hidden ? openMenu() : closeMenu()));
  menu.addEventListener('click', (e) => {
    const opt = e.target.closest('[data-type]');
    if (opt) add(opt.dataset.type);
  });
  menu.addEventListener('keydown', (e) => {
    const opts = Array.from(menu.querySelectorAll('button'));
    const i = opts.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); closeMenu(true); }
    if (e.key === 'ArrowDown') { e.preventDefault(); opts[(i + 1) % opts.length].focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); opts[(i - 1 + opts.length) % opts.length].focus(); }
  });

  list.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const id = btn.closest('[data-id]').dataset.id;
    const act = btn.dataset.act;
    if (act === 'select') store.select(id, 'list');
    else if (act === 'up') moveTo(id, indexOf(id) - 1);
    else if (act === 'down') moveTo(id, indexOf(id) + 1);
    else if (act === 'dup') duplicate(id);
    else if (act === 'del') remove(id);
  });

  list.addEventListener('keydown', (e) => {
    const item = e.target.closest('[data-id]');
    if (!item || !e.target.classList.contains('block-select')) return;
    const id = item.dataset.id;
    const i = indexOf(id);
    const last = blocks().length - 1;
    let target = null;
    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      moveTo(id, i + (e.key === 'ArrowUp' ? -1 : 1));
      focusKey(`sel:${id}`);
      return;
    }
    if (e.key === 'ArrowUp' && i === 0) {
      e.preventDefault();
      store.select(REFLECTION, 'list');
      reflection.focus();
      return;
    }
    if (e.key === 'ArrowUp') target = Math.max(0, i - 1);
    else if (e.key === 'ArrowDown') target = Math.min(last, i + 1);
    else if (e.key === 'Home') target = 0;
    else if (e.key === 'End') target = last;
    if (target === null) return;
    e.preventDefault();
    const next = blocks()[target].id;
    store.select(next, 'list');
    focusKey(`sel:${next}`);
  });

  // Story details → Reflection → blocks, by arrow keys.
  details.addEventListener('click', () => store.select(STORY_DETAILS, 'list'));
  reflection.addEventListener('click', () => store.select(REFLECTION, 'list'));
  details.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowDown') return;
    e.preventDefault();
    store.select(REFLECTION, 'list');
    reflection.focus();
  });
  reflection.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      store.select(STORY_DETAILS, 'list');
      details.focus();
    } else if (e.key === 'ArrowDown' && blocks().length) {
      e.preventDefault();
      const first = blocks()[0].id;
      store.select(first, 'list');
      focusKey(`sel:${first}`);
    }
  });

  enableDrag(list, { onDrop: (id, to) => moveTo(id, to) });

  store.subscribe(() => preserveFocus(panel, render, () => {
    const sel = store.selected;
    if (sel) focusKey(`sel:${sel}`);
  }));
  render();
}

