import { blockDefaults } from '../model.js';
import { assetPicker, selectInput, assetKind } from '../editor/fields.js';

export default {
  type: 'media',
  label: 'Media',
  description: 'One image, video or audio clip.',
  defaults: () => blockDefaults('media'),
  prompt: null,
  summary: (d, story) => story.assets[d.asset]?.name || '(no file)',
  editorUI(el, ctx) {
    const asset = ctx.story.assets[ctx.block.data.asset];
    el.append(assetPicker(ctx, 'asset', {
      label: 'File',
      kinds: ['image', 'video', 'audio'],
      onSet: (data, a) => { data.kind = assetKind(a); },
    }));
    if (assetKind(asset) !== 'audio') {
      el.append(selectInput(ctx, 'width', {
        label: 'Width',
        options: [['column', 'Column (same as the text)'], ['wide', 'Wide'], ['full', 'Full width (edge to edge)']],
      }));
    }
  },
  validate: (d) => (d.asset ? [] : ['Choose a file for this block.']),
};
