import { blockDefaults } from '../model.js';
import { textInput, textArea, selectInput, assetPicker, help } from '../editor/fields.js';

export default {
  type: 'header',
  label: 'Header',
  description: 'Title, standfirst and byline. Full screen or compact.',
  defaults: () => blockDefaults('header'),
  prompt: "Would your headline make sense on its own, in a news feed or a search result? Does the standfirst add something the headline doesn't?",
  summary: (d, story) => d.title || story.meta.title || '(no title)',
  editorUI(el, ctx) {
    const first = ctx.story.blocks.find((b) => b.type === 'header')?.id === ctx.block.id;
    el.append(
      selectInput(ctx, 'variant', {
        label: 'Style',
        hint: 'Use full screen for the opening header. In a portfolio, give each part a compact header.',
        options: [['full', 'Full screen'], ['compact', 'Compact']],
      }),
      textInput(ctx, 'kicker', { label: 'Kicker', hint: 'A short label above the title, e.g. "Manchester · Feature".' }),
      textInput(ctx, 'title', first
        ? { label: 'Title', placeholder: ctx.story.meta.title, hint: 'Leave empty to use the title from Story details.' }
        : { label: 'Title', hint: 'The heading for this part.' }),
      textArea(ctx, 'standfirst', { label: 'Standfirst', rows: 3, hint: 'One or two sentences that sell the story. *Italics* and links work here.' }),
      textInput(ctx, 'byline', { label: 'Byline', placeholder: 'By …' }),
      assetPicker(ctx, 'media', { label: 'Header image', kinds: ['image'] }),
      first ? null : help('This is not the first header, so it starts a new part of the page.'),
    );
  },
  validate: (d, story) => (d.title || story?.meta.title ? [] : ['This header has no title yet. Add one here or in Story details.']),
};
