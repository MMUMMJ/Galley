import { blockDefaults } from '../model.js';
import { textInput, textArea, selectInput, assetPicker, help } from '../editor/fields.js';

export default {
  type: 'embed',
  label: 'Embed',
  description: 'A link card for a web page. YouTube, Vimeo, Spotify and SoundCloud can also play here.',
  defaults: () => blockDefaults('embed'),
  prompt: null,
  summary: (d) => d.title || d.url || '(no link)',
  editorUI(el, ctx) {
    const urlField = textInput(ctx, 'url', { label: 'Web address', type: 'url', placeholder: 'https://…' });
    const note = help('');
    note.setAttribute('aria-live', 'polite');
    const describe = (url) => {
      const info = url ? window.Illuminate?.embedInfo(url) : null;
      note.hidden = !url;
      note.textContent = info
        ? `${info.label} link: readers get a link card and a "Play here" button.`
        : 'Readers get a link card. Only YouTube, Vimeo, Spotify and SoundCloud can play inside the story.';
    };
    urlField.querySelector('input').addEventListener('input', (e) => describe(e.target.value.trim()));
    describe(ctx.block.data.url);
    el.append(
      urlField,
      note,
      textInput(ctx, 'title', { label: 'Title', hint: 'The name of the page or video.' }),
      textArea(ctx, 'description', { label: 'Description', rows: 2 }),
      assetPicker(ctx, 'screenshot', {
        label: 'Archived screenshot',
        kinds: ['image'],
      }),
      help('Web pages change or disappear. A screenshot keeps a record of what you linked to.'),
      selectInput(ctx, 'width', { label: 'Width', options: [['column', 'Column'], ['wide', 'Wide']] }),
    );
  },
  validate: (d) => (/^https?:\/\//i.test(d.url || '') ? [] : ['Add a web address starting with https://']),
};
