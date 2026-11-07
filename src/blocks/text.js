import { blockDefaults } from '../model.js';
import { richText, plainText } from '../editor/rich-text.js';
import { imageDetails } from '../editor/inline-images.js';

export default {
  type: 'text',
  label: 'Text',
  description: 'Paragraphs, subheadings, lists and links.',
  defaults: () => blockDefaults('text'),
  prompt: "Lead with what's new. One idea per paragraph, kept short for screens. Where does each claim come from?",
  summary: (d) => plainText(d.body).split('\n').find((l) => l.trim()) || '(empty)',
  editorUI(el, ctx) {
    el.append(
      richText(ctx, 'body', { label: 'Text', mode: 'blocks', images: true, rows: 12 }),
      imageDetails(ctx, 'body'),
    );
  },
  validate: (d) => (plainText(d.body).trim() || /asset:/.test(d.body || '') ? [] : ['This text block is empty.']),
};
