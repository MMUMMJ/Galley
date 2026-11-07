import { blockDefaults } from '../model.js';
import { textInput, checkbox } from '../editor/fields.js';
import { richText } from '../editor/rich-text.js';

export default {
  type: 'references',
  label: 'References',
  description: 'Your reference list, which readers can open and close.',
  defaults: () => blockDefaults('references'),
  prompt: "Is every source you cite in the text listed here, and is everything listed here cited? Use your course's Harvard style.",
  summary: (d) => {
    const n = (d.items || []).filter((s) => s.trim()).length;
    return `${n} reference${n === 1 ? '' : 's'}`;
  },
  editorUI(el, ctx) {
    el.append(
      textInput(ctx, 'title', { label: 'Heading' }),
      richText(ctx, 'items', {
        label: 'References', mode: 'lines', rows: 8,
        hint: 'One reference per line, in Harvard style. Use I for titles.',
      }),
      checkbox(ctx, 'collapsed', { label: 'Start closed', hint: 'Readers click the heading to open the list.' }),
    );
  },
  validate: (d) => ((d.items || []).some((s) => s.trim()) ? [] : ['No references yet.']),
};
