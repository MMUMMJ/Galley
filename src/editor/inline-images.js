// The "Images and videos in this text" list under a formatted text editor: each image's alt text,
// caption, credit and licence. Position and Remove are on the image itself, in the editor.
import { h } from './dom.js';
import { assetDetails, assetKind, thumb } from './fields.js';

export const IMAGE_LINE = /^\s*!\[([^\]]*)\]\(asset:([A-Za-z0-9_-]+)(?:\s+"(left|right)")?\)\s*$/;

export function findImages(text) {
  return String(text || '').split('\n').map((l) => l.match(IMAGE_LINE)).filter(Boolean).map((m) => ({ id: m[2], position: m[3] || '' }));
}

export function imageDetails(ctx, key) {
  const seen = new Set();
  const images = findImages(ctx.block.data[key]).filter((img) => !seen.has(img.id) && seen.add(img.id));
  if (!images.length) return null;
  return h('fieldset', { class: 'field inline-list' },
    h('legend', {}, 'Images and videos in this text'),
    h('ol', {}, images.map((img, n) => {
      const asset = ctx.story.assets[img.id];
      return h('li', { class: 'inline-item' },
        h('div', { class: 'gallery-item-row' },
          thumb(ctx, img.id),
          h('span', { class: 'gallery-item-name' }, asset ? asset.name || 'Untitled file' : 'Missing file',
            asset && assetKind(asset) !== 'video' && !(asset.alt || '').trim() ? h('span', { class: 'badge' }, 'No alt text') : null)),
        asset ? h('details', { class: 'gallery-item-details', open: assetKind(asset) !== 'video' && !(asset.alt || '').trim() },
          h('summary', { 'data-focus': `${ctx.block.id}:${key}:img-details:${n}` }, 'Alt text, caption and credit'),
          assetDetails(ctx, img.id)) : null);
    })));
}
