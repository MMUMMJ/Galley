import { blockDefaults } from '../model.js';
import { selectInput, help } from '../editor/fields.js';
import { richText, plainText } from '../editor/rich-text.js';
import { imageDetails } from '../editor/inline-images.js';

const KEYS = ['col1', 'col2', 'col3'];
const shown = (d) => KEYS.slice(0, d.count === 3 ? 3 : 2);

export default {
  type: 'columns',
  label: 'Columns',
  description: 'Text side by side in two or three columns.',
  defaults: () => blockDefaults('columns'),
  prompt: 'Columns suit things a reader compares: two sides, before and after, three key facts. '
    + 'For a long piece of writing, a single Text block is easier to read on a screen.',
  summary: (d) => {
    const kind = `${d.count === 3 ? 3 : 2} ${d.mode === 'flow' ? 'flowing' : 'separate'} columns`;
    const first = plainText(d.mode === 'flow' ? d.body : d.col1).split('\n').find((l) => l.trim());
    return first ? `${kind} · ${first}` : kind;
  },
  editorUI(el, ctx) {
    const d = ctx.block.data;
    const flow = d.mode === 'flow';
    el.append(
      selectInput(ctx, 'mode', {
        label: 'Kind of columns',
        hint: flow
          ? 'One text that runs from the bottom of one column to the top of the next, like print. Keep it short: readers scroll back up for each column.'
          : 'Write each column separately. Good for two sides of a story, before and after, or three key facts.',
        options: [['separate', 'Separate: write each column'], ['flow', 'Flowing: one text across the columns']],
      }),
      selectInput(ctx, 'count', { label: 'Number of columns', options: [[2, '2 columns'], [3, '3 columns']], number: true }),
      selectInput(ctx, 'width', { label: 'Width', options: [['wide', 'Wide (more room for each column)'], ['column', 'Same as the text']] }),
    );
    const add = (key, label, rows) => {
      el.append(richText(ctx, key, { label, mode: 'blocks', images: true, rows }));
      const media = imageDetails(ctx, key);
      if (media) el.append(media);
    };
    if (flow) add('body', 'Text', 12);
    else shown(d).forEach((key, i) => add(key, `Column ${i + 1}`, 6));
    el.append(help('On phones the columns sit one under another, in order.'));
  },
  validate: (d) => {
    if (d.mode === 'flow') return plainText(d.body).trim() || /asset:|\]\(https?:/.test(d.body || '') ? [] : ['This columns block has no text yet.'];
    return shown(d).flatMap((key, i) => (plainText(d[key]).trim() || /asset:|\]\(https?:/.test(d[key] || '') ? [] : [`Column ${i + 1} is empty.`]));
  },
};
