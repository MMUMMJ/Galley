import { blockDefaults } from '../model.js';
import { h } from '../editor/dom.js';
import { textArea, selectInput, fileButton, assetDetails, assetBrowser, thumb, assetKind, ACCEPT } from '../editor/fields.js';

export default {
  type: 'gallery',
  label: 'Gallery',
  description: 'A grid of images that readers can open full size.',
  defaults: () => blockDefaults('gallery'),
  prompt: 'Does every image earn its place? Put them in an order that tells a story, and cut any that repeat.',
  summary: (d) => {
    const n = (d.items || []).length;
    return `${n} image${n === 1 ? '' : 's'}`;
  },
  editorUI(el, ctx) {
    const items = ctx.block.data.items || [];
    const bid = ctx.block.id;
    // Change the live list, not the copy from when this panel was drawn.
    const changeItems = (fn, message) => {
      ctx.edit((data) => { data.items = fn((data.items || []).slice()); }, { rerender: true });
      if (message) ctx.announce(message);
    };
    const move = (i, delta) => changeItems((next) => {
      const [id] = next.splice(i, 1);
      next.splice(i + delta, 0, id);
      return next;
    }, `Image moved to position ${i + delta + 1} of ${items.length}.`);

    // Keep focus with the image that moved (buttons are keyed by position, so the same file can
    // be in the list twice). At the top or bottom its own arrow is disabled: the other one takes it.
    const moveAndFollow = (i, delta) => {
      move(i, delta);
      const key = (dir) => `[data-focus="${CSS.escape(`${bid}:g-${dir}:${i + delta}`)}"]`;
      const own = document.querySelector(key(delta < 0 ? 'up' : 'down'));
      (own && !own.disabled ? own : document.querySelector(key(delta < 0 ? 'down' : 'up')))?.focus();
    };

    const list = h('ol', { class: 'gallery-items' }, items.map((id, i) => {
      const asset = ctx.story.assets[id];
      const name = asset?.name || 'Missing file';
      const noAlt = asset && !asset.alt?.trim();
      return h('li', { class: 'gallery-item' },
        h('div', { class: 'gallery-item-row' },
          thumb(ctx, id),
          h('span', { class: 'gallery-item-name' }, `${i + 1}. ${name}`, noAlt ? h('span', { class: 'badge' }, 'No alt text') : null),
          h('span', { class: 'icon-row' },
            h('button', {
              type: 'button', class: 'btn btn-icon', 'aria-label': `Move image ${i + 1} up`, title: 'Move up',
              disabled: i === 0, 'data-focus': `${bid}:g-up:${i}`, onclick: () => moveAndFollow(i, -1),
            }, '↑'),
            h('button', {
              type: 'button', class: 'btn btn-icon', 'aria-label': `Move image ${i + 1} down`, title: 'Move down',
              disabled: i === items.length - 1, 'data-focus': `${bid}:g-down:${i}`, onclick: () => moveAndFollow(i, 1),
            }, '↓'),
            h('button', {
              type: 'button', class: 'btn btn-icon', 'aria-label': `Remove image ${i + 1} from gallery`, title: 'Remove',
              'data-focus': `${bid}:g-del:${i}`,
              onclick: () => changeItems((next) => next.filter((_, j) => j !== i), `Image ${i + 1} removed from the gallery.`),
            }, '✕'))),
        asset ? h('details', { class: 'gallery-item-details', open: noAlt },
          h('summary', { 'data-focus': `${bid}:g-sum:${i}` }, 'Alt text, caption and credit'),
          assetDetails(ctx, id)) : null);
    }));

    const others = Object.entries(ctx.story.assets).filter(([id, a]) => !items.includes(id) && assetKind(a) === 'image');

    el.append(
      h('fieldset', { class: 'field' },
        h('legend', {}, 'Images'),
        items.length ? list : h('p', { class: 'field-hint' }, 'No images yet.'),
        h('div', { class: 'button-row' },
          fileButton(ctx, {
            label: 'Add images…', accept: ACCEPT.image, multiple: true, focusKey: `${bid}:g-add`,
            onFiles: async (files) => {
              const added = await ctx.importFiles(files, ['image']);
              if (!added.length) return;
              ctx.edit((data, story) => {
                for (const a of added) story.assets[a.id] = a.asset;
                data.items = [...(data.items || []), ...added.map((a) => a.id)];
              }, { rerender: true });
              ctx.announce(`${added.length} image${added.length === 1 ? '' : 's'} added to the gallery.`);
            },
          })),
        assetBrowser(ctx, others, {
          label: 'Or add an image already in this story:',
          focusKey: `${bid}:g-existing`,
          onPick: (id) => changeItems((next) => [...next, id], 'Image added to the gallery.'),
        })),
      textArea(ctx, 'caption', { label: 'Gallery caption', rows: 2 }),
      selectInput(ctx, 'width', { label: 'Width', options: [['column', 'Column'], ['wide', 'Wide'], ['full', 'Full width']] }),
    );
  },
  validate: (d) => ((d.items || []).length ? [] : ['Add some images.']),
};
