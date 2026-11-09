// The block list: select, add, move, duplicate and delete blocks.
// Keyboard: arrow keys move between blocks; Alt + arrow moves the selected block.
// Only the selected block's buttons are in the Tab order, so Tab reaches the inspector quickly.
import { BLOCKS, blockLabel } from '../blocks/index.js';
import { esc, preserveFocus, prefersReducedMotion } from './dom.js';
import { enableDrag } from './drag.js';
import { STORY_DETAILS, REFLECTION } from '../store.js';
import { getPack, blockIssues, showpieceCount } from '../packs.js';
import { effectBadge } from './effects.js';
import { openBlockPicker } from './block-picker.js';
import { blockOps } from './block-ops.js';

export function mountBlockList(panel, store, { announce, toast, onAdded }) {
  panel.innerHTML = `
    <div class="pack-info"></div>
    <div class="story-rows">
      <button type="button" class="details-select story-select" data-focus="details"></button>
      <button type="button" class="details-select reflection-select" data-focus="reflection"></button>
    </div>
    <div class="blocks-head">
      <h2 class="panel-heading" id="blocks-heading">Blocks</h2>
      <button type="button" class="btn btn-small" aria-haspopup="dialog" data-focus="add">+ Add block</button>
    </div>
    <ol class="block-list" aria-labelledby="blocks-heading" aria-describedby="blocks-tip"></ol>
    <p class="panel-empty" hidden>Your story has no blocks yet. Use + Add block to start.</p>
    <p class="panel-tip" id="blocks-tip">Arrow keys move between blocks. Alt + ↑ or ↓ moves the selected block. Drag ⠿ to reorder.</p>`;

  const list = panel.querySelector('.block-list');
  const details = panel.querySelector('.story-select');
  const reflection = panel.querySelector('.reflection-select');
  const packInfo = panel.querySelector('.pack-info');
  const empty = panel.querySelector('.panel-empty');
  const addButton = panel.querySelector('[data-focus="add"]');

  const ops = blockOps(store, { announce, toast, from: 'list' });
  const blocks = () => store.story.blocks;
  const { indexOf, labelOf } = ops;
  const focusKey = (key) => list.querySelector(`[data-focus="${CSS.escape(key)}"]`)?.focus();

  // Small word tags after the summary: what still needs doing, movement, and a band.
  function tags(b, warning) {
    const out = [];
    if (warning) out.push(`<span class="tag tag-warn">${esc(warning)}</span>`);
    if (effectBadge(b.effect)) out.push(`<span class="tag">${esc(effectBadge(b.effect).split(' ')[0])}</span>`);
    const colour = b.background && window.Galley ? window.Galley.bandColour(b.background, store.story.meta.theme) : '';
    if (colour) out.push(`<span class="tag"><span class="tag-dot" style="background:${colour}" aria-hidden="true"></span>Band</span>`);
    return out.join('');
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
      pack.scheme && window.Galley ? `House style: ${window.Galley.SCHEMES[pack.scheme].name} colour scheme` : null,
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
      const name = `${label} block ${i + 1}`;
      // One line per block; only the selected block shows its actions (never on hover).
      return `<li class="block-item${isSel ? ' is-selected' : ''}" data-id="${esc(b.id)}">
        <span class="drag-handle" aria-hidden="true">⠿</span>
        <button type="button" class="block-select" data-act="select" data-focus="sel:${esc(b.id)}" tabindex="${tab}"
          aria-current="${isSel ? 'true' : 'false'}">
          <span class="block-num">${i + 1}</span><span class="block-type">${esc(label)}</span>
          <span class="block-summary">${esc(String(summary).slice(0, 80))}</span>${tags(b, badge)}
        </button>
        ${isSel ? `<span class="block-actions" role="group" aria-label="${esc(name)}">
          <button type="button" class="btn-slim" data-act="up" data-focus="up:${esc(b.id)}" aria-label="Move ${esc(name)} up" ${i === 0 ? 'disabled' : ''}>Up</button>
          <button type="button" class="btn-slim" data-act="down" data-focus="down:${esc(b.id)}" aria-label="Move ${esc(name)} down" ${i === all.length - 1 ? 'disabled' : ''}>Down</button>
          <button type="button" class="btn-slim" data-act="dup" data-focus="dup:${esc(b.id)}" aria-label="Duplicate ${esc(name)}">Duplicate</button>
          <button type="button" class="btn-slim btn-danger" data-act="del" data-focus="del:${esc(b.id)}" aria-label="Delete ${esc(name)}">Delete</button>
        </span>` : ''}
      </li>`;
    }).join('');
  }

  const moveTo = (id, to) => ops.moveTo(id, to);
  const duplicate = (id) => focusKey(`sel:${ops.duplicate(id)}`);
  const remove = (id) => {
    const neighbour = ops.remove(id);
    if (neighbour) focusKey(`sel:${neighbour}`); else addButton.focus();
  };
  const add = (type) => onAdded(ops.add(type));
  addButton.addEventListener('click', () => openBlockPicker({ where: ops.whereText(), onChoose: add, returnFocus: addButton }));

  const scrollInspectorOnNarrow = () => {
    if (window.matchMedia('(max-width: 760px)').matches) {
      document.getElementById('inspector')?.scrollIntoView({ block: 'start', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    }
  };

  list.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const id = btn.closest('[data-id]').dataset.id;
    const act = btn.dataset.act;
    if (act === 'select') { store.select(id, 'list'); scrollInspectorOnNarrow(); }
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
  details.addEventListener('click', () => { store.select(STORY_DETAILS, 'list'); scrollInspectorOnNarrow(); });
  reflection.addEventListener('click', () => { store.select(REFLECTION, 'list'); scrollInspectorOnNarrow(); });
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

  store.subscribe((change) => {
    preserveFocus(panel, render, () => {
      const sel = store.selected;
      if (sel) focusKey(`sel:${sel}`);
    });
    if (change.type === 'select' && change.from === 'preview' && store.selected) {
      const item = list.querySelector(`[data-id="${CSS.escape(store.selected)}"]`);
      item?.scrollIntoView({ block: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
      scrollInspectorOnNarrow();
    }
  });
  render();
}

