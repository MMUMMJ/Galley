import { blockDefaults } from '../model.js';
import { textArea, textInput } from '../editor/fields.js';

export default {
  type: 'quote',
  label: 'Quote',
  description: 'A pull quote with who said it.',
  defaults: () => blockDefaults('quote'),
  prompt: null,
  summary: (d) => d.text || '(empty)',
  editorUI(el, ctx) {
    el.append(
      textArea(ctx, 'text', { label: 'Quote', rows: 4, hint: 'Just the words, without quotation marks.' }),
      textInput(ctx, 'cite', { label: 'Who said it' }),
      textInput(ctx, 'role', { label: 'Their role', hint: 'e.g. "volunteer since 2019".' }),
    );
  },
  validate: (d) => [
    ...((d.text || '').trim() ? [] : ['This quote is empty.']),
    ...((d.text || '').trim() && !(d.cite || '').trim() ? ['Who said this?'] : []),
  ],
};
