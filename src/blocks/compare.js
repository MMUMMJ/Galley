import { blockDefaults } from '../model.js';
import { h } from '../editor/dom.js';
import { textInput, textArea, selectInput, assetPicker, nested } from '../editor/fields.js';

const SIDES = [['before', 'Before'], ['after', 'After']];

export default {
  type: 'compare',
  label: 'Before/after slider',
  description: 'Two images of the same place or thing; readers slide between them. Showpiece.',
  defaults: () => blockDefaults('compare'),
  prompt: 'Before/after works when the change is the story. What should the reader compare? '
    + 'Were both images taken from the same spot, at the same framing?',
  summary: (d) => [d.before?.label, d.after?.label].filter(Boolean).join(' → ') || '(no labels)',
  editorUI(el, ctx) {
    for (const [key, word] of SIDES) {
      const sub = nested(ctx, (d) => d[key], key);
      el.append(h('fieldset', { class: 'field' },
        h('legend', {}, word),
        textInput(sub, 'label', { label: `${word} label or date (required)`, hint: 'e.g. "1990" or "Before the flood".' }),
        assetPicker(sub, 'asset', { label: `${word} image`, kinds: ['image'] })));
    }
    el.append(
      textArea(ctx, 'caption', { label: 'Caption', rows: 2 }),
      selectInput(ctx, 'width', { label: 'Width', options: [['column', 'Column'], ['wide', 'Wide'], ['full', 'Full width']] }),
    );
  },
  validate: (d, story) => {
    const issues = [];
    for (const [key, word] of SIDES) {
      const side = d[key] || {};
      if (!side.asset) issues.push(`Choose the ${word.toLowerCase()} image.`);
      else if (!story?.assets[side.asset]?.credit?.trim()) issues.push(`Who took the ${word.toLowerCase()} image? Add a credit.`);
      if (!(side.label || '').trim()) issues.push(`Add a label or date for the ${word.toLowerCase()} image.`);
    }
    return issues;
  },
};
