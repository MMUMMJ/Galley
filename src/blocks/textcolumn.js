import { blockDefaults } from '../model.js';
import { h } from '../editor/dom.js';
import { selectInput, fileButton, assetDetails, assetBrowser, thumb, assetKind, ACCEPT, help } from '../editor/fields.js';
import { richText, plainText } from '../editor/rich-text.js';
import { imageDetails } from '../editor/inline-images.js';

// Text column: one long text scrolls over full-screen images. The text and the images are
// separate: the images share the scroll evenly, so with two images the first stays on screen
// for the first half of the text and the second for the rest.
export const wordsIn = (md) => plainText(md || '').split(/\s+/).filter(Boolean).length;

export default {
  type: 'textcolumn',
  label: 'Text column',
  description: 'One column of text scrolls over full-screen images. The images share the scroll evenly. Showpiece.',
  defaults: () => blockDefaults('textcolumn'),
  prompt: 'Which image belongs with which part of the text? The images change at even points through the text, '
    + 'so put them in the order the reader meets the ideas.',
  summary: (d) => {
    const n = (d.images || []).length;
    const box = d.backdrop === 'vignette' ? ', vignette' : d.backdrop === 'none' ? ', no box' : '';
    return `${wordsIn(d.body)} words · ${n} image${n === 1 ? '' : 's'}${box}${d.align && d.align !== 'center' ? `, text ${d.align}` : ''}`;
  },
  editorUI(el, ctx) {
    const images = ctx.block.data.images || [];
    const bid = ctx.block.id;
    // Change the live list, not the copy from when this panel was drawn.
    const changeImages = (fn, message) => {
      ctx.edit((data) => { data.images = fn((data.images || []).slice()); }, { rerender: true });
      if (message) ctx.announce(message);
    };
    const move = (i, delta) => changeImages((next) => {
      const [id] = next.splice(i, 1);
      next.splice(i + delta, 0, id);
      return next;
    }, `Image moved to position ${i + delta + 1} of ${images.length}.`);
    const share = images.length > 1 ? Math.round(100 / images.length) : 100;

    // Keep focus with the image that moved (buttons are keyed by position, so the same file can
    // be in the list twice). At the top or bottom its own arrow is disabled: the other one takes it.
    const moveAndFollow = (i, delta) => {
      move(i, delta);
      const key = (dir) => `[data-focus="${CSS.escape(`${bid}:tc-${dir}:${i + delta}`)}"]`;
      const own = document.querySelector(key(delta < 0 ? 'up' : 'down'));
      (own && !own.disabled ? own : document.querySelector(key(delta < 0 ? 'down' : 'up')))?.focus();
    };

    const list = h('ol', { class: 'gallery-items' }, images.map((id, i) => {
      const asset = ctx.story.assets[id];
      const name = asset?.name || 'Missing file';
      const noAlt = asset && !asset.alt?.trim();
      const from = Math.round((i * 100) / images.length);
      const to = Math.round(((i + 1) * 100) / images.length);
      return h('li', { class: 'gallery-item' },
        h('div', { class: 'gallery-item-row' },
          thumb(ctx, id),
          h('span', { class: 'gallery-item-name' }, `${i + 1}. ${name}`,
            h('span', { class: 'field-hint textcol-share' }, images.length > 1 ? `On screen from ${from}% to ${to}% of the text` : 'On screen for all of the text'),
            noAlt ? h('span', { class: 'badge' }, assetKind(asset) === 'video' ? 'No description' : 'No alt text') : null),
          h('span', { class: 'icon-row' },
            h('button', {
              type: 'button', class: 'btn btn-icon', 'aria-label': `Move image ${i + 1} up`, title: 'Move up',
              disabled: i === 0, 'data-focus': `${bid}:tc-up:${i}`, onclick: () => moveAndFollow(i, -1),
            }, '↑'),
            h('button', {
              type: 'button', class: 'btn btn-icon', 'aria-label': `Move image ${i + 1} down`, title: 'Move down',
              disabled: i === images.length - 1, 'data-focus': `${bid}:tc-down:${i}`, onclick: () => moveAndFollow(i, 1),
            }, '↓'),
            h('button', {
              type: 'button', class: 'btn btn-icon', 'aria-label': `Remove image ${i + 1}`, title: 'Remove',
              'data-focus': `${bid}:tc-del:${i}`,
              onclick: () => changeImages((next) => next.filter((_, j) => j !== i), `Image ${i + 1} removed. It stays in your story's files.`),
            }, '✕'))),
        asset ? h('details', { class: 'gallery-item-details', open: noAlt },
          h('summary', { 'data-focus': `${bid}:tc-sum:${i}` }, 'Alt text, caption and credit'),
          assetDetails(ctx, id)) : null);
    }));

    const others = Object.entries(ctx.story.assets)
      .filter(([id, a]) => !images.includes(id) && ['image', 'video'].includes(assetKind(a)));

    el.append(
      richText(ctx, 'body', {
        label: 'Text', mode: 'blocks', images: true, rows: 10,
        hint: 'One continuous text. It scrolls over the images in a single column.',
      }),
      imageDetails(ctx, 'body'),
      h('fieldset', { class: 'field' },
        h('legend', {}, 'Images behind the text'),
        help(images.length > 1
          ? `The images change at even points through the text: each one is on screen for about ${share}% of it.`
          : 'Add two or more images and they change at even points through the text. One image stays for all of it.'),
        images.length ? list : h('p', { class: 'field-hint' }, 'No images yet.'),
        h('div', { class: 'button-row' },
          fileButton(ctx, {
            label: 'Add images or videos…', accept: ACCEPT.imageVideo, multiple: true, focusKey: `${bid}:tc-add`,
            onFiles: async (files) => {
              const added = await ctx.importFiles(files, ['image', 'video']);
              if (!added.length) return;
              ctx.edit((data, story) => {
                for (const a of added) story.assets[a.id] = a.asset;
                data.images = [...(data.images || []), ...added.map((a) => a.id)];
              }, { rerender: true });
              ctx.announce(`${added.length} file${added.length === 1 ? '' : 's'} added behind the text.`);
            },
          })),
        assetBrowser(ctx, others, {
          label: 'Or add a file already in this story:',
          focusKey: `${bid}:tc-existing`,
          onPick: (id) => changeImages((next) => [...next, id], 'Added behind the text.'),
        })),
      selectInput(ctx, 'align', {
        label: 'Text position',
        hint: 'Where the column of text sits over the images. On phones it always fills the width.',
        options: [['left', 'Left'], ['center', 'Centre'], ['right', 'Right']],
      }),
      selectInput(ctx, 'backdrop', {
        label: 'Text backdrop',
        fallback: 'solid',
        hint: 'Vignette fades softly from the edge behind the column into the image.',
        options: [['solid', 'Solid column'], ['vignette', 'Soft vignette (gradient fade)'], ['none', 'No box (text shadow only)']],
      }),
    );
  },
  validate: (d) => {
    const issues = [];
    if (!plainText(d.body || '').trim() && !/asset:|\]\(https?:/.test(d.body || '')) issues.push('Write the text that scrolls over the images.');
    if (!(d.images || []).length) issues.push('Add an image or video to go behind the text.');
    return issues;
  },
};
