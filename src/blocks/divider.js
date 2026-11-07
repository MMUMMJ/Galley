import { blockDefaults } from '../model.js';
import { textInput } from '../editor/fields.js';

export default {
  type: 'divider',
  label: 'Divider',
  description: 'A break between sections, with an optional label.',
  defaults: () => blockDefaults('divider'),
  prompt: 'A break should mark a real shift: in time, place, voice or perspective.',
  summary: (d) => d.text || '* * *',
  editorUI(el, ctx) {
    el.append(textInput(ctx, 'text', { label: 'Label', hint: 'Leave empty to show * * *.' }));
  },
  validate: () => [],
};
