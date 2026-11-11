// The "Images and videos in this text" list under a formatted text editor: each image's alt text,
// caption, credit and licence. Position and Remove are on the image itself, in the editor.
import { h } from './dom.js';
import { assetDetails, assetKind, thumb } from './fields.js';

export const IMAGE_LINE = /^\s*!\[([^\]]*)\]\(asset:([A-Za-z0-9_-]+)(?:\s+"(left|right)")?\)\s*$/;

export function findImages(text) {
  return String(text || '').split('\n').flatMap((l, line) => { const m = l.match(IMAGE_LINE); return m ? [{ id: m[2], position: m[3] || '', line }] : []; });
}

export function imageDetails(ctx, key) {
  const images = findImages(ctx.block.data[key]);
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
        asset ? assetDetails(ctx, img.id, { path: [...(ctx.dataPath || []), key], line: img.line }) : null);
    })));
}
