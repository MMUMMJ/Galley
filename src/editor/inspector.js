// The inspector: fields for the selected block.
// It redraws when the selection changes, after undo/redo, and after structural
// edits (choosing a file, reordering gallery images), but not while the student types.
import { BLOCKS, blockLabel } from '../blocks/index.js';
import { h, preserveFocus } from './dom.js';
import { STORY_DETAILS } from '../store.js';
import { renderMetadata } from './metadata.js';

export function mountInspector(panel, store, deps) {
  const body = h('div', { class: 'inspector-body' });
  panel.replaceChildren(h('h2', { class: 'panel-heading', id: 'inspector-heading' }, 'Inspector'), body);

  function blockById(id) {
    return store.story.blocks.find((b) => b.id === id);
  }

  function makeCtx(block) {
    const id = block.id;
    const edit = (fn, opts = {}) => store.update((s) => {
      const b = s.blocks.find((x) => x.id === id);
      if (b) fn(b.data, s);
    }, { from: opts.rerender ? 'inspector-structural' : 'inspector', coalesce: opts.coalesce || null });
    return {
      block,
      story: store.story,
      edit,
      set: (key, value, opts = {}) => edit((data) => { data[key] = value; }, {
        rerender: opts.rerender,
        coalesce: opts.rerender ? null : `${id}:${key}`,
      }),
      setAsset: (assetId, key, value) => store.update((s) => {
        if (s.assets[assetId]) s.assets[assetId][key] = value;
      }, { from: 'inspector', coalesce: `${assetId}:${key}` }),
      importFiles: deps.importFiles,
      assetUrl: deps.assetUrl,
      announce: deps.announce,
    };
  }

  // Updated on every keystroke without redrawing the fields.
  const issuesEl = h('ul', { class: 'inspector-issues', 'aria-label': 'Still to do' });
  function renderIssues() {
    const block = blockById(store.selected);
    const mod = block && BLOCKS[block.type];
    const issues = mod ? safe(() => mod.validate(block.data, store.story), []) : [];
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
      set: (key, value, opts = {}) => store.update((s) => { s.meta[key] = value; }, {
        from: opts.rerender ? 'inspector-structural' : 'inspector',
        coalesce: opts.rerender ? null : `meta:${key}`,
      }),
      assetUrl: deps.assetUrl,
      announce: deps.announce,
    });
  }

  function render() {
    const block = blockById(store.selected);
    body.replaceChildren();
    liveRefresh = null;
    if (store.selected === STORY_DETAILS) {
      issuesEl.hidden = true;
      renderDetails();
      return;
    }
    if (!block) {
      body.append(h('p', { class: 'panel-empty' },
        store.story.blocks.length ? 'Select a block to edit it.' : 'Add a block to start your story.'));
      return;
    }
    const mod = BLOCKS[block.type];
    const pos = store.story.blocks.indexOf(block) + 1;
    body.append(h('h3', { class: 'inspector-title' },
      `${blockLabel(block.type)} block `, h('span', { class: 'inspector-pos' }, `${pos} of ${store.story.blocks.length}`)));
    if (!mod) {
      body.append(h('p', {}, `This version of Illuminate can't edit "${block.type}" blocks. The block is kept so nothing is lost.`));
      return;
    }
    if (mod.prompt) {
      body.append(h('aside', { class: 'craft-prompt', 'aria-label': 'Craft prompt' },
        h('strong', {}, 'Craft prompt'), h('p', {}, mod.prompt)));
    }
    body.append(issuesEl);
    renderIssues();
    const fields = h('div', { class: 'inspector-fields' });
    body.append(fields);
    try {
      mod.editorUI(fields, makeCtx(block));
    } catch (e) {
      fields.append(h('p', { class: 'error' }, `Couldn't show this block's fields: ${e.message}`));
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
      const first = body.querySelector('.inspector-fields input:not(.sr-only), .inspector-fields textarea, .inspector-fields select, .inspector-fields button');
      if (first) first.focus();
    },
  };
}

function safe(fn, fallback) {
  try { return fn() || fallback; } catch { return fallback; }
}
