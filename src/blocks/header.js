import { blockDefaults } from '../model.js';
import { textInput, selectInput, assetPicker, help } from '../editor/fields.js';
import { richText } from '../editor/rich-text.js';

export default {
  type: 'header',
  label: 'Header',
  description: 'Title, standfirst and byline. Full screen or compact.',
  defaults: () => blockDefaults('header'),
  prompt: "Would your headline make sense on its own, in a news feed or a search result? Does the standfirst add something the headline doesn't?",
  summary: (d, story) => d.title || story.meta.title || '(no title)',
  editorUI(el, ctx) {
    const first = ctx.story.blocks.find((b) => b.type === 'header')?.id === ctx.block.id;
    // When editing the opening header's headline, standfirst or byline, keep Story details in step
    // unless Story details was given a separate value.
    const hCtx = first ? {
      ...ctx,
      get story() { return ctx.story; },
      set: (key, value, o = {}) => ctx.edit((data, s) => {
        const prev = data[key];
        data[key] = value;
        if ((key === 'title' || key === 'standfirst' || key === 'byline') && (!s.meta[key] || s.meta[key] === prev)) {
          s.meta[key] = value;
        }
      }, { ...o, coalesce: `${ctx.block.id}:${key}` }),
    } : ctx;
    el.append(
      selectInput(hCtx, 'variant', {
        label: 'Style',
        hint: 'Use full screen for the opening header. In a portfolio, give each part a compact header.',
        options: [['full', 'Full screen'], ['compact', 'Compact']],
      }),
      textInput(hCtx, 'kicker', { label: 'Kicker', hint: 'A short label above the title, e.g. "Manchester · Feature".' }),
      textInput(hCtx, 'title', first
        ? { label: 'Title', placeholder: ctx.story.meta.title, hint: 'Your opening headline (also updates Story details).' }
        : { label: 'Title', hint: 'The heading for this part.' }),
      richText(hCtx, 'standfirst', { label: 'Standfirst', mode: 'inline', hint: 'One or two sentences that sell the story.' }),
      textInput(hCtx, 'byline', { label: 'Byline', placeholder: 'By …' }),
      assetPicker(hCtx, 'media', { label: 'Header image or background video', kinds: ['image', 'video'] }),
      first ? null : help('This is not the first header, so it starts a new part of the page.'),
    );
  },
  validate: (d, story) => (d.title || story?.meta.title ? [] : ['This header has no title yet. Add one here or in Story details.']),
};
