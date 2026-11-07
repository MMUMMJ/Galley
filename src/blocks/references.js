import { blockDefaults } from '../model.js';
import { textInput, textArea, checkbox } from '../editor/fields.js';

export default {
  type: 'references',
  label: 'References',
  description: 'Your reference list, which readers can open and close.',
  defaults: () => blockDefaults('references'),
  prompt: null,
  summary: (d) => {
    const n = (d.items || []).filter((s) => s.trim()).length;
    return `${n} reference${n === 1 ? '' : 's'}`;
  },
  editorUI(el, ctx) {
    el.append(
      textInput(ctx, 'title', { label: 'Heading' }),
      textArea(ctx, 'items', {
        label: 'References',
        rows: 10,
        lines: true,
        hint: 'One reference per line, in Harvard style. *Italics* for titles.',
      }),
      checkbox(ctx, 'collapsed', { label: 'Start closed', hint: 'Readers click the heading to open the list.' }),
    );
  },
  validate: (d) => ((d.items || []).some((s) => s.trim()) ? [] : ['No references yet.']),
};
