// Formatted text fields in the settings panel. Students see bold as bold and headings as
// headings, and never type Markdown; behind the scenes the text is still saved as the same
// simple Markdown the runtime reads, so stories, exports and checks are unchanged.
// The conversion lives in rich-core.js and the toolbar in rich-tools.js; the canvas uses both too.
//
// Modes:
//   'blocks'  paragraphs, subheadings, lists and (optionally) media: images, videos and
//             embedded links. Text blocks, columns, scroll steps
//   'inline'  one paragraph with bold, italics and links: standfirsts
//   'lines'   one item per line with bold, italics and links: references (saved as a list)
import { h } from './dom.js';
import { toHtml, padImages, mediaFigure } from './rich-core.js';
import { attachRichEditing } from './rich-tools.js';

export { plainText } from './rich-core.js';

let uid = 0;

// ctx: inspector context (block, story, set, edit, importFiles, assetUrl, announce).
// key: the field in ctx.block.data. Options: label, hint, mode, images, imageLabel, rows.
export function richText(ctx, key, { label, hint, mode = 'blocks', images = false, imageLabel, imageName, rows = 8 } = {}) {
  const id = `rte-${++uid}`;
  const focusKey = `${ctx.block.id}:${key}`;
  const figure = mediaFigure(ctx, 'panel');

  const body = h('div', {
    id, class: `rte-body rte-${mode}`, contenteditable: 'true', role: 'textbox', 'aria-multiline': mode === 'inline' ? 'false' : 'true',
    'aria-labelledby': `${id}-label`, 'aria-describedby': hint ? `${id}-hint` : null, spellcheck: 'true', 'data-focus': focusKey,
    style: `min-height:${mode === 'inline' ? 3 : rows * 1.6 + 1}em`,
  });
  body.innerHTML = toHtml(ctx.block.data[key], mode, figure);
  padImages(body);

  let wrap = null;
  const editor = attachRichEditing(body, {
    id, label, mode, images, imageLabel, imageName, ctx, key, focusKey, figure,
    save: (opts) => ctx.set(key, editor.value(), opts),
    // After a structural save the inspector has redrawn: the text is in a new element.
    findBody: () => document.querySelector(`[data-focus="${CSS.escape(focusKey)}"]`),
    inside: (el) => Boolean(wrap?.contains(el)),
  });

  wrap = h('div', { class: 'field rte' },
    h('span', { class: 'rte-label', id: `${id}-label` }, label),
    hint ? h('p', { class: 'field-hint', id: `${id}-hint` }, hint) : null,
    editor.bar, editor.pop, body);
  return wrap;
}
