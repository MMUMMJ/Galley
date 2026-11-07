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
  summary: (d) => `${(d.steps || []).length} steps · ${d.layout === 'overlay' || d.layout === 'column'
    ? `${d.layout === 'column' ? 'text column' : 'overlay'}${d.align && d.align !== 'center' ? `, text ${d.align}` : ''}`
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
      ctx.block.data.layout === 'overlay' || ctx.block.data.layout === 'column'
        ? selectInput(ctx, 'align', {
          label: 'Text position',
          hint: ctx.block.data.layout === 'column'
            ? 'Where the column of text sits over the images. On phones it always fills the width.'
            : 'Where the text boxes sit over the image. On phones they always fill the width.',
          options: [['left', 'Left'], ['center', 'Centre'], ['right', 'Right']],
        })
        : selectInput(ctx, 'textSide', {
          label: 'Text position',
          hint: 'Which side of the screen the text is on. On phones the text scrolls over the image instead.',
          options: [['right', 'Text on the right, images on the left'], ['left', 'Text on the left, images on the right']],
        }),
      h('ol', { class: 'step-list' }, steps.map((st, i) => {
        const sub = nested(ctx, (d) => d.steps[i], `step${i}`);
        return h('li', {},
          h('fieldset', { class: 'field step-item' },
            h('legend', {}, `Step ${i + 1}`),
            // Two kinds of image in a step: one inside the text, and the one behind or beside it.
            richText(sub, 'text', {
              label: `Step ${i + 1} text (required)`, mode: 'blocks', images: true, imageLabel: 'Image in text', rows: 4,
              hint: i === 0 ? 'What should the reader notice first? Keep each step short.' : null,
            }),
            imageDetails(sub, 'text'),
            assetPicker(sub, 'media', { label: i === 0 ? 'Image behind or beside the text' : 'New image behind or beside the text (optional)', kinds: ['image'] }),
            i > 0 && !st.media ? help('No new image: the previous one stays on screen for this step.') : null,
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
        onclick: () => changeSteps((next) => [...next, { media: null, text: '' }], `Step ${steps.length + 1} added.`),
      }, 'Add a step'),
    );
  },
  validate: (d) => {
    const steps = d.steps || [];
    const issues = [];
    if (steps.length < 2) issues.push('A scroll sequence needs at least two steps.');
    steps.forEach((st, i) => { if (!plainText(st.text).trim()) issues.push(`Step ${i + 1} has no text. Every step needs some.`); });
    if (!steps.some((st) => st.media)) issues.push('Add an image: start with step 1.');
    return issues;
  },
};
