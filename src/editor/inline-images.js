// Images inside running text (Text blocks and scroll-sequence steps).
// In the text, an image is a line of its own: ![file name](asset:<id>), optionally
// with "left" or "right" so the text wraps round it. Students insert images with a
// button and manage them in the list below the text box; they never type ids.
import { h } from './dom.js';
import { fileButton, assetDetails, thumb, assetKind, ACCEPT } from './fields.js';

export const IMAGE_LINE = /^\s*!\[([^\]]*)\]\(asset:([A-Za-z0-9_-]+)(?:\s+"(left|right)")?\)\s*$/;

export const imageLine = (name, id, position) =>
  `![${String(name || 'image').replace(/[[\]\n]/g, '')}](asset:${id}${position ? ` "${position}"` : ''})`;

// [{ line, id, position }] in the order they appear.
export function findImages(text) {
  return String(text || '').split('\n').map((l, line) => {
    const m = l.match(IMAGE_LINE);
    return m ? { line, id: m[2], position: m[3] || '' } : null;
  }).filter(Boolean);
}

const POSITIONS = [['', 'Full width'], ['left', 'Left, text wraps round it'], ['right', 'Right, text wraps round it']];

// ctx: the block's (or a scroll step's) inspector context; key: the text field;
// getTextarea(): the text box, so new images go after the line the cursor is on.
export function inlineImages(ctx, key, getTextarea, { buttonLabel = 'Insert image…' } = {}) {
  const bid = ctx.block.id;
  const images = findImages(ctx.block.data[key]);

  // Every change works on the live text, not the copy from when this panel was drawn.
  const changeText = (fn, message) => {
    ctx.edit((data, story) => { data[key] = fn(String(data[key] || ''), story); }, { rerender: true });
    if (message) ctx.announce(message);
  };
  const insert = (id, asset, isNew) => {
    const box = getTextarea();
    // After the cursor's line; at the end if the cursor was never placed in the text.
    const caret = box && box.selectionStart > 0 ? box.selectionStart : Infinity;
    changeText((text, story) => {
      if (isNew) story.assets[id] = asset;
      const line = imageLine(asset.name, id);
      if (!text.trim()) return line;
      const lines = text.split('\n');
      const at = Number.isFinite(caret) ? text.slice(0, caret).split('\n').length : lines.length;
      lines.splice(at, 0, line);
      return lines.join('\n');
    }, `${asset.name || 'Image'} added to the text.`);
  };
  // The nth image line in the live text.
  const nth = (text, n) => findImages(text)[n];
  const setPosition = (n, position) => changeText((text, story) => {
    const img = nth(text, n);
    if (!img) return text;
    const lines = text.split('\n');
    lines[img.line] = imageLine(story.assets[img.id]?.name, img.id, position);
    return lines.join('\n');
  });
  const remove = (n) => changeText((text) => {
    const img = nth(text, n);
    if (!img) return text;
    const lines = text.split('\n');
    lines.splice(img.line, 1);
    return lines.join('\n');
  }, 'Image removed from the text. It stays in your story\'s files.');

  const others = Object.entries(ctx.story.assets).filter(([, a]) => assetKind(a) === 'image');
  const existingId = `${bid}-${key}-inline-existing`;

  return h('div', { class: 'inline-images' },
    h('div', { class: 'button-row' },
      fileButton(ctx, {
        label: buttonLabel, accept: ACCEPT.image, focusKey: `${bid}:${key}:inline-add`,
        onFiles: async (files) => {
          const [added] = await ctx.importFiles(files.slice(0, 1), ['image']);
          if (added) insert(added.id, added.asset, true);
        },
      }),
      others.length ? h('label', { class: 'inline-existing', for: existingId }, 'or use one in this story',
        h('select', {
          id: existingId, 'data-focus': `${bid}:${key}:inline-existing`,
          onchange: (e) => { if (e.target.value) insert(e.target.value, ctx.story.assets[e.target.value], false); },
        }, h('option', { value: '' }, 'Choose…'), others.map(([id, a]) => h('option', { value: id }, a.name || id)))) : null),
    images.length ? h('fieldset', { class: 'field inline-list' },
      h('legend', {}, 'Images in this text'),
      h('ol', {}, images.map((img, n) => {
        const asset = ctx.story.assets[img.id];
        const selectId = `${bid}-${key}-inline-pos-${n}`;
        return h('li', { class: 'inline-item' },
          h('div', { class: 'gallery-item-row' },
            thumb(ctx, img.id),
            h('span', { class: 'gallery-item-name' }, asset ? asset.name || 'Untitled image' : 'Missing image',
              asset && !(asset.alt || '').trim() ? h('span', { class: 'badge' }, 'No alt text') : null),
            h('button', {
              type: 'button', class: 'btn', 'data-focus': `${bid}:${key}:inline-del:${n}`, onclick: () => remove(n),
            }, 'Remove')),
          h('div', { class: 'field' },
            h('label', { for: selectId }, 'Position'),
            h('select', {
              id: selectId, 'data-focus': `${bid}:${key}:inline-pos:${n}`,
              onchange: (e) => setPosition(n, e.target.value),
            }, POSITIONS.map(([v, label]) => h('option', { value: v, selected: v === img.position }, label)))),
          asset ? h('details', { class: 'gallery-item-details', open: !(asset.alt || '').trim() },
            h('summary', { 'data-focus': `${bid}:${key}:inline-sum:${n}` }, 'Alt text, caption and credit'),
            assetDetails(ctx, img.id)) : null);
      }))) : null);
}
