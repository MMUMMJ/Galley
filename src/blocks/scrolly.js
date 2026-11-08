import { blockDefaults } from '../model.js';
import { h } from '../editor/dom.js';
import { selectInput, assetPicker, help, nested } from '../editor/fields.js';
import { richText, plainText } from '../editor/rich-text.js';
import { imageDetails } from '../editor/inline-images.js';

export default {
  type: 'scrolly',
  label: 'Scroll sequence',
  description: 'An image stays on screen while text steps scroll past. Showpiece.',
  defaults: () => blockDefaults('scrolly'),
  prompt: 'A scroll sequence controls the reader\'s pace. Each step should reveal one new thing. '
    + 'If a single image and a paragraph would do the job, use those instead.',
  summary: (d) => `${(d.steps || []).length} steps · ${d.layout === 'column'
    ? `text column${d.backdrop === 'vignette' ? ' (vignette)' : d.backdrop === 'none' ? ' (no box)' : ''}${d.align && d.align !== 'center' ? `, text ${d.align}` : ''}`
    : d.layout === 'overlay'
      ? `overlay${d.backdrop === 'vignette' ? ' (vignette)' : d.backdrop === 'none' ? ' (no box)' : ''}`
      : `side by side${d.textSide === 'left' ? ', text left' : ''}`}`,
  editorUI(el, ctx) {
    const steps = ctx.block.data.steps || [];
    const bid = ctx.block.id;
    // Always change the live steps, never the copy from when this panel was drawn:
    // text typed since then isn't in that copy.
    const changeSteps = (fn, message) => {
      ctx.edit((data) => { data.steps = fn((data.steps || []).slice()); }, { rerender: true });
      ctx.announce(message);
    };
    const move = (i, delta) => changeSteps((next) => {
      const [st] = next.splice(i, 1);
      next.splice(i + delta, 0, st);
      return next;
    }, `Step moved to position ${i + delta + 1}.`);
    // Keep focus with the step that moved (buttons are keyed by position).
    const moveAndFollow = (i, delta) => {
      move(i, delta);
      const to = i + delta;
      const key = (dir) => `[data-focus="${CSS.escape(`${bid}:st-${dir}:${to}`)}"]`;
      const own = document.querySelector(key(delta < 0 ? 'up' : 'down'));
      (own && !own.disabled ? own : document.querySelector(key(delta < 0 ? 'down' : 'up')))?.focus();
    };
    el.append(
      selectInput(ctx, 'layout', {
        label: 'Layout',
        options: [
          ['side', 'Side by side: image beside the text'],
          ['overlay', 'Overlay: text boxes scroll over a full-screen image'],
          ['column', 'Text column: one column of text scrolls while images crossfade behind'],
        ],
      }),
      ctx.block.data.layout === 'column'
        ? selectInput(ctx, 'align', {
          label: 'Text position',
          hint: 'Where the column of text sits over the images. On phones it always fills the width.',
          options: [['left', 'Left'], ['center', 'Centre'], ['right', 'Right']],
        })
        : ctx.block.data.layout === 'side'
          ? selectInput(ctx, 'textSide', {
            label: 'Text position',
            hint: 'Which side of the screen the text is on. On phones the text scrolls over the image instead.',
            options: [['right', 'Text on the right, images on the left'], ['left', 'Text on the left, images on the right']],
          })
          : null,
      ctx.block.data.layout === 'overlay' || ctx.block.data.layout === 'column'
        ? selectInput(ctx, 'backdrop', {
          label: 'Text backdrop',
          fallback: 'solid',
          hint: ctx.block.data.layout === 'column'
            ? 'Vignette fades softly from the edge behind the column into the image, like Shorthand.'
            : 'Vignette puts a soft shaded gradient behind each step instead of a solid box.',
          options: [
            ['solid', ctx.block.data.layout === 'column' ? 'Solid column' : 'Solid card'],
            ['vignette', 'Soft vignette (gradient fade)'],
            ['none', 'No box (text shadow only)'],
          ],
        })
        : null,
      h('ol', { class: 'step-list' }, steps.map((st, i) => {
        const sub = nested(ctx, (d) => d.steps[i], `step${i}`);
        return h('li', {},
          h('fieldset', { class: 'field step-item' },
            h('legend', {}, `Step ${i + 1}`),
            // Two kinds of image in a step: one inside the text, and the one behind or beside it.
            richText(sub, 'text', {
              label: `Step ${i + 1} text (required)`, mode: 'blocks', images: true, rows: 4,
              hint: i === 0 ? 'What should the reader notice first? Keep each step short.' : null,
            }),
            imageDetails(sub, 'text'),
            ctx.block.data.layout === 'overlay'
              ? selectInput(sub, 'align', {
                label: 'Box position',
                fallback: ctx.block.data.align || 'center',
                hint: i === 0 ? 'Where this step\'s text box sits over the image. On phones it always fills the width.' : null,
                options: [['left', 'Left'], ['center', 'Centre'], ['right', 'Right']],
              })
              : null,
            assetPicker(sub, 'media', {
              label: i === 0 ? 'Image or video behind or beside the text' : 'New image or video behind or beside the text (optional)',
              kinds: ['image', 'video'],
            }),
            i > 0 && !st.media ? help('No new file: the previous image or video stays on screen for this step.') : null,
            h('div', { class: 'button-row' },
              h('button', { type: 'button', class: 'btn', disabled: i === 0, 'data-focus': `${bid}:st-up:${i}`, onclick: () => moveAndFollow(i, -1) }, `Move step ${i + 1} up`),
              h('button', { type: 'button', class: 'btn', disabled: i === steps.length - 1, 'data-focus': `${bid}:st-down:${i}`, onclick: () => moveAndFollow(i, 1) }, 'Move down'),
              h('button', {
                type: 'button', class: 'btn btn-danger', disabled: steps.length <= 1, 'data-focus': `${bid}:st-del:${i}`,
                onclick: () => changeSteps((next) => next.filter((_, j) => j !== i), `Step ${i + 1} removed.`),
              }, 'Remove'))));
      })),
      h('button', {
        type: 'button', class: 'btn', 'data-focus': `${bid}:st-add`,
        onclick: () => changeSteps((next) => [...next, { media: null, text: '', align: 'center' }], `Step ${steps.length + 1} added.`),
      }, 'Add a step'),
    );
  },
  validate: (d) => {
    const steps = d.steps || [];
    const issues = [];
    if (steps.length < 2) issues.push('A scroll sequence needs at least two steps.');
    steps.forEach((st, i) => { if (!plainText(st.text).trim()) issues.push(`Step ${i + 1} has no text. Every step needs some.`); });
    if (!steps.some((st) => st.media)) issues.push('Add an image or video: start with step 1.');
    return issues;
  },
};
