import { blockDefaults } from '../model.js';
import { textInput } from '../editor/fields.js';

export default {
  type: 'divider',
  label: 'Divider',
  description: 'A break between sections, with an optional label.',
  defaults: () => blockDefaults('divider'),
  prompt: null,
  summary: (d) => d.text || '* * *',
  editorUI(el, ctx) {
    el.append(textInput(ctx, 'text', { label: 'Label', hint: 'Leave empty to show * * *.' }));
  },
  validate: () => [],
};
