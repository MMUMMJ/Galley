import { blockDefaults } from '../model.js';
import { textArea } from '../editor/fields.js';

export default {
  type: 'text',
  label: 'Text',
  description: 'Paragraphs, subheadings, lists and links.',
  defaults: () => blockDefaults('text'),
  prompt: null,
  summary: (d) => (d.body || '').split('\n').find((l) => l.trim()) || '(empty)',
  editorUI(el, ctx) {
    el.append(textArea(ctx, 'body', {
      label: 'Text',
      rows: 14,
      hint: 'Each line is a paragraph. ## starts a subheading (### a smaller one). "- " or "1. " starts a list item. '
        + '**bold**, *italic*, [link text](https://…).',
    }));
  },
  validate: (d) => ((d.body || '').trim() ? [] : ['This text block is empty.']),
};
