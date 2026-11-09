// Colour scheme choice for Story details. Schemes come from the runtime, so the
// editor always offers exactly what the export can draw. A pack can lock one.
import { h } from './dom.js';
import { getPack } from '../packs.js';

export function renderSchemePicker(story, { set, announce }) {
  const R = window.Galley;
  const schemes = R ? Object.entries(R.SCHEMES) : [];
  const locked = getPack().scheme;
  const current = locked || story.meta.theme || 'house';
  const swatch = (c) => h('span', { class: 'scheme-swatch', 'aria-hidden': 'true' },
    ...[c.bg, c.text, c.accent, c.link].map((colour) => h('span', { style: `background:${colour}` })));

  if (locked && R) {
    const c = R.SCHEMES[locked];
    return h('fieldset', { class: 'field scheme-picker' },
      h('legend', {}, 'Colour scheme'),
      h('p', { class: 'scheme-locked' }, swatch(c), h('span', {}, h('strong', {}, c.name), ` is your course's house style, set by the ${getPack().name || 'course'} pack.`)));
  }
  return h('fieldset', { class: 'field scheme-picker' },
    h('legend', {}, 'Colour scheme'),
    h('p', { class: 'field-hint' }, 'What does this colour scheme say about the tone of your story? Every scheme is checked for readable contrast.'),
    h('div', { class: 'scheme-options' }, schemes.map(([id, c]) => {
      const inputId = `scheme-${id}`;
      return h('div', { class: 'scheme-option' },
        h('input', {
          type: 'radio', name: 'scheme', id: inputId, value: id, checked: id === current, 'data-focus': `meta:scheme:${id}`,
          onchange: () => { set('theme', id, { rerender: true }); announce(`${c.name} colour scheme chosen.`); },
        }),
        h('label', { for: inputId }, swatch(c),
          h('span', { class: 'scheme-text' }, h('strong', {}, c.name), h('span', {}, `${c.dark ? 'Dark' : 'Light'}. ${c.mood}`))));
    })));
}
