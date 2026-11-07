import { blockDefaults } from '../model.js';
import { textInput, textArea, selectInput, assetPicker, help } from '../editor/fields.js';

export default {
  type: 'header',
  label: 'Header',
  description: 'Title, standfirst and byline. Full screen or compact.',
  defaults: () => blockDefaults('header'),
  prompt: null, // craft prompt: Phase 7
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
      textInput(ctx, 'title', { label: 'Title', hint: first ? 'The headline. This is the main heading of the page.' : 'The heading for this part.' }),
      textArea(ctx, 'standfirst', { label: 'Standfirst', rows: 3, hint: 'One or two sentences that sell the story. *Italics* and links work here.' }),
      textInput(ctx, 'byline', { label: 'Byline', placeholder: 'By …' }),
      assetPicker(ctx, 'media', { label: 'Header image', kinds: ['image'] }),
      first ? null : help('This is not the first header, so it starts a new part of the page.'),
    );
  },
  validate: (d) => (d.title ? [] : ['This header has no title yet.']),
};
