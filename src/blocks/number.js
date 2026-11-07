import { blockDefaults } from '../model.js';
import { textInput, textArea } from '../editor/fields.js';

export default {
  type: 'number',
  label: 'Big number',
  description: 'One striking figure with its context and source. Showpiece.',
  defaults: () => blockDefaults('number'),
  prompt: 'A number means little on its own. Compared with what? Per what? Since when? '
    + 'Where does it come from, and would a reader trust that source?',
  summary: (d) => [d.value, d.unit].filter(Boolean).join(' ') || '(no number)',
  badge: (d) => ((d.sourceName || '').trim() ? null : 'Unsourced'),
  editorUI(el, ctx) {
    el.append(
      textInput(ctx, 'value', { label: 'Number', hint: 'Just the figure, e.g. 1,200 or £3.4 or 45. It counts up when readers reach it.' }),
      textInput(ctx, 'unit', { label: 'Unit', hint: 'e.g. %, million, tonnes. Optional.' }),
      textArea(ctx, 'context', { label: 'Context line', rows: 2, hint: 'Why does this number matter? e.g. "trolleys pulled from the canal since 2019".' }),
      textInput(ctx, 'sourceName', { label: 'Source (required)', hint: 'Who published the figure, e.g. "Office for National Statistics".' }),
      textInput(ctx, 'sourceRef', { label: 'Source link or reference', hint: 'A web address, or a reference such as "Annual report 2024, p. 12".' }),
    );
  },
  validate: (d) => [
    ...((d.value || '').trim() ? [] : ['Add the number.']),
    ...((d.context || '').trim() ? [] : ['Add a context line: why does this number matter?']),
    ...((d.sourceName || '').trim() ? [] : ['Where\'s this figure from? Add the source.']),
  ],
};
