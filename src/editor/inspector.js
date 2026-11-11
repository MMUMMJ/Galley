// The inspector: fields for the selected block, Story details, or Reflection.
// It redraws when the selection changes, after undo/redo, and after structural
// edits (choosing a file, reordering gallery images), but not while the student types.
import { BLOCKS, blockLabel } from '../blocks/index.js';
import { h, preserveFocus } from './dom.js';
import { STORY_DETAILS, REFLECTION } from '../store.js';
import { renderMetadata } from './metadata.js';
import { renderEffects } from './effects.js';
import { renderReflection } from './reflection.js';
import { renderBackground } from './background.js';
import { getPack, promptFor, blockIssues } from '../packs.js';

export function mountInspector(panel, store, deps) {
  const body = h('div', { class: 'inspector-body' });
  panel.replaceChildren(h('h2', { class: 'panel-heading', id: 'inspector-heading' }, 'Inspector'), body);

  const blockById = (id) => store.story.blocks.find((b) => b.id === id);
  const opts = (o = {}, key = null) => ({
    from: o.rerender ? 'inspector-structural' : 'inspector',
    coalesce: o.rerender ? null : (o.coalesce || key),
  });

  function makeCtx(block) {
    const id = block.id;
    const edit = (fn, o = {}) => store.update((s) => {
      const b = s.blocks.find((x) => x.id === id);
      if (b) fn(b.data, s);
    }, opts(o));
    return {
      block,
      get story() { return store.story; }, // always current: a file added a moment ago must be found
      edit,
      set: (key, value, o = {}) => edit((data) => { data[key] = value; }, { ...o, coalesce: `${id}:${key}` }),
      setAsset: (assetId, key, value) => store.update((s) => {
        if (s.assets[assetId]) s.assets[assetId][key] = value;
      }, { from: 'inspector', coalesce: `${assetId}:${key}` }),
      importFiles: deps.importFiles,
      assetUrl: deps.assetUrl,
      announce: deps.announce,
    };
  }

  // Block-level fields (effect, effectNote, note) rather than block.data.
  const setBlock = (blockId) => (key, value, o = {}) => store.update((s) => {
    const b = s.blocks.find((x) => x.id === blockId);
    if (b) b[key] = value;
  }, opts(o, `${blockId}:${key}`));

  // Write / Look / Notes tabs. The chosen tab stays as the student moves between blocks.
  let tab = 'write';
  const TAB_LABELS = { write: 'Write', look: 'Look', notes: 'Notes' };
  function tabList(block) {
    const keys = ['write', 'look', ...(getPack().includeNotes ? ['notes'] : [])];
    if (!keys.includes(tab)) tab = 'write';
    const moving = block.effect && block.effect !== 'none';
    const set = { look: moving || Boolean(block.background), notes: Boolean((block.note || '').trim()) };
    const needs = { look: moving && getPack().effectNotes === 'required' && !(block.effectNote || '').trim() };
    const go = (k, focus) => {
      tab = k;
      preserveFocus(panel, render);
      if (focus) panel.querySelector(`[data-focus="tab:${k}"]`)?.focus();
    };
    const list = h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Block settings' }, keys.map((k) => h('button', {
      type: 'button', role: 'tab', id: `tab-${k}`, 'aria-selected': String(k === tab), 'aria-controls': 'inspector-tabpanel',
      tabindex: k === tab ? '0' : '-1', 'data-focus': `tab:${k}`, onclick: () => go(k),
    }, TAB_LABELS[k],
    needs[k] ? h('span', { class: 'tab-dot tab-dot-warn', 'aria-hidden': 'true' }) : set[k] ? h('span', { class: 'tab-dot', 'aria-hidden': 'true' }) : null,
    needs[k] ? h('span', { class: 'sr-only' }, ' (needs attention)') : set[k] ? h('span', { class: 'sr-only' }, ' (set)') : null)));
    list.addEventListener('keydown', (e) => {
      const i = keys.indexOf(tab);
      const next = { ArrowRight: keys[(i + 1) % keys.length], ArrowLeft: keys[(i - 1 + keys.length) % keys.length], Home: keys[0], End: keys[keys.length - 1] }[e.key];
      if (next) { e.preventDefault(); go(next, true); }
    });
    return list;
  }

  // Updated on every keystroke without redrawing the fields.
  const issuesEl = h('ul', { class: 'inspector-issues', 'aria-label': 'Still to do' });
  function renderIssues() {
    const block = blockById(store.selected);
    const issues = block && BLOCKS[block.type] ? blockIssues(block, store.story) : [];
    issuesEl.hidden = !issues.length;
    issuesEl.replaceChildren(...issues.map((t) => h('li', {}, t)));
  }

  // Story details reuses the field helpers, pointed at story.meta instead of a block's data.
  let liveRefresh = null;
  function renderDetails() {
    body.append(h('h3', { class: 'inspector-title' }, 'Story details'));
    const fields = h('div', { class: 'inspector-fields' });
    body.append(fields);
    liveRefresh = renderMetadata(fields, {
      block: { id: 'meta', data: store.story.meta },
      story: store.story,
      liveStory: () => store.story,
      set: (key, value, o = {}) => store.update((s) => {
        const prev = s.meta[key];
        s.meta[key] = value;
        if (key === 'title' || key === 'standfirst' || key === 'byline') {
          const h0 = s.blocks.find((b) => b.type === 'header');
          if (h0 && (!h0.data[key] || h0.data[key] === prev)) h0.data[key] = value;
        }
      }, opts(o, `meta:${key}`)),
      syncToHeader: () => store.update((s) => {
        const h0 = s.blocks.find((b) => b.type === 'header');
        if (!h0) return;
        for (const k of ['title', 'standfirst', 'byline']) if (s.meta[k]) h0.data[k] = s.meta[k];
      }, opts({ rerender: true })),
      selectBlock: (id) => store.select(id, 'inspector'),
      assetUrl: deps.assetUrl,
      announce: deps.announce,
    });
  }

  function renderReflectionPanel() {
    body.append(h('h3', { class: 'inspector-title' }, 'Reflection'));
    const fields = h('div', { class: 'inspector-fields' });
    body.append(fields);
    renderReflection(fields, {
      story: store.story,
      update: (recipe, o = {}) => store.update(recipe, opts(o)),
      announce: deps.announce,
    });
  }

  function makersNote(block) {
    const id = `note-${block.id}`;
    return h('fieldset', { class: 'field makers-note' },
      h('legend', {}, 'Maker\'s note'),
      h('label', { for: id, class: 'sr-only' }, 'Maker\'s note'),
      h('p', { class: 'field-hint', id: `${id}-hint` },
        'For your tutor, not your reader: why you made this block this way, where its material came from, '
        + 'what you\'d change. It appears in the export only if you add the appendix (see Reflection).'),
      h('textarea', {
        id, rows: 3, value: block.note || '', 'data-focus': `${block.id}:note`, 'aria-describedby': `${id}-hint`,
        oninput: (e) => setBlock(block.id)('note', e.target.value),
      }));
  }

  function render() {
    const block = blockById(store.selected);
    body.replaceChildren();
    liveRefresh = null;
    if (store.selected === STORY_DETAILS) return renderDetails();
    if (store.selected === REFLECTION) return renderReflectionPanel();
    if (!block) {
      body.append(h('p', { class: 'panel-empty' },
        store.story.blocks.length ? 'Select a block to edit it.' : 'Add a block to start your story.'));
      return;
    }
    const mod = BLOCKS[block.type];
    const pos = store.story.blocks.indexOf(block) + 1;
    const titleEl = h('h3', { class: 'inspector-title' },
      `${blockLabel(block.type)} block `, h('span', { class: 'inspector-pos' }, `${pos} of ${store.story.blocks.length}`));
    if (!mod) {
      body.append(titleEl, h('p', {}, `This version of Galley can't edit "${block.type}" blocks. The block is kept so nothing is lost.`));
      return;
    }
    body.append(h('div', { class: 'inspector-head' }, titleEl, tabList(block)));
    const panelEl = h('div', { class: 'tabpanel', role: 'tabpanel', id: 'inspector-tabpanel', 'aria-labelledby': `tab-${tab}` });
    body.append(panelEl);
    if (tab === 'write') {
      const prompt = promptFor(block.type);
      if (prompt) {
        panelEl.append(h('aside', { class: 'craft-prompt', 'aria-label': 'Craft prompt' },
          h('strong', {}, 'Craft prompt'), h('p', {}, prompt)));
      }
      panelEl.append(issuesEl);
      renderIssues();
      const fields = h('div', { class: 'inspector-fields' });
      // Blocks may pass null for a field they leave out; the DOM's append() would print "null".
      const append = fields.append.bind(fields);
      fields.append = (...items) => append(...items.filter((x) => x !== null && x !== undefined && x !== false));
      panelEl.append(fields);
      try {
        mod.editorUI(fields, makeCtx(block));
      } catch (e) {
        fields.append(h('p', { class: 'error' }, `Couldn't show this block's fields: ${e.message}`));
      }
    } else if (tab === 'look') {
      panelEl.append(renderEffects(block, { announce: deps.announce, setBlock: setBlock(block.id), noteMode: getPack().effectNotes }));
      const background = renderBackground(block, store.story, { announce: deps.announce, setBlock: setBlock(block.id) });
      if (background) panelEl.append(background);
    } else {
      panelEl.append(makersNote(block));
    }
  }

  store.subscribe((change) => {
    if (change.type === 'edit' && change.from === 'inspector') {
      if (liveRefresh) liveRefresh();
      return renderIssues();
    }
    preserveFocus(panel, render);
  });
  render();

  return {
    focusFirstField() {
      if (tab !== 'write') { tab = 'write'; render(); }
      // A place to type first; buttons (such as a formatting toolbar) only if there's nothing else.
      const first = body.querySelector('.inspector-fields [contenteditable="true"], .inspector-fields input:not(.sr-only):not([type="file"]), .inspector-fields textarea')
        || body.querySelector('.inspector-fields select, .inspector-fields button');
      if (first) first.focus();
    },
    focusTarget(target) {
      if (!target) { panel.focus(); return; }
      const nextTab = target.tab || 'write';
      if (tab !== nextTab && store.selected !== STORY_DETAILS && store.selected !== REFLECTION) {
        tab = nextTab;
        render();
      }
      if (target.focusKey) {
        const el = body.querySelector(`[data-focus="${CSS.escape(target.focusKey)}"]`)
          || body.querySelector(`[data-focus$=":${CSS.escape(target.focusKey)}"]`)
          || body.querySelector(`#${CSS.escape(target.focusKey)}`);
        if (el) {
          for (let d = el.closest('details'); d && body.contains(d); d = d.parentElement?.closest('details')) d.open = true;
          el.focus();
          el.scrollIntoView({ block: 'nearest' });
          return;
        }
      }
      this.focusFirstField();
    },
  };
}
