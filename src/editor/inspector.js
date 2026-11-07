// The inspector: fields for the selected block, Story details, or Reflection.
// It redraws when the selection changes, after undo/redo, and after structural
// edits (choosing a file, reordering gallery images), but not while the student types.
import { BLOCKS, blockLabel } from '../blocks/index.js';
import { h, preserveFocus } from './dom.js';
import { STORY_DETAILS, REFLECTION } from '../store.js';
import { renderMetadata } from './metadata.js';
import { renderEffects } from './effects.js';
import { renderReflection } from './reflection.js';
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
      story: store.story,
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
      set: (key, value, o = {}) => store.update((s) => { s.meta[key] = value; }, opts(o, `meta:${key}`)),
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
    body.append(h('h3', { class: 'inspector-title' },
      `${blockLabel(block.type)} block `, h('span', { class: 'inspector-pos' }, `${pos} of ${store.story.blocks.length}`)));
    if (!mod) {
      body.append(h('p', {}, `This version of Illuminate can't edit "${block.type}" blocks. The block is kept so nothing is lost.`));
      return;
    }
    const prompt = promptFor(block.type);
    if (prompt) {
      body.append(h('aside', { class: 'craft-prompt', 'aria-label': 'Craft prompt' },
        h('strong', {}, 'Craft prompt'), h('p', {}, prompt)));
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
    body.append(renderEffects(block, { announce: deps.announce, setBlock: setBlock(block.id), noteMode: getPack().effectNotes }));
    if (getPack().includeNotes) body.append(makersNote(block));
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
