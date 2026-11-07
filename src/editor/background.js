// The "Background" section of the inspector: a coloured band behind the block.
// Scheme colours (tint, ink, accent) follow the story's scheme; "Any colour" stays fixed.
// The runtime picks black or white text for the band, so it always reads.
import { h } from './dom.js';

const SCHEME_CHOICES = [['tint', 'Scheme tint'], ['ink', 'Scheme ink'], ['accent', 'Scheme accent']];

export function renderBackground(block, story, { setBlock, announce }) {
  const R = window.Illuminate;
  if (!R) return null;
  if (block.type === 'header' && block.data.variant !== 'compact') {
    return h('fieldset', { class: 'field background' }, h('legend', {}, 'Background'),
      h('p', { class: 'field-hint' }, 'Full-screen headers have their own dark background. Make the header compact to give it a colour.'));
  }
  const scheme = story.meta.theme || 'house';
  const value = block.background;
  const custom = typeof value === 'string' && value.startsWith('#');
  const name = `bg-${block.id}`;
  const verdict = h('p', { class: 'field-hint band-verdict', 'aria-live': 'polite' });
  const describe = (v) => {
    const colour = v ? R.bandColour(v, scheme) : '';
    if (!colour) { verdict.textContent = 'No band: the block sits on the page colour.'; return; }
    const ink = R.inkFor(colour);
    verdict.textContent = `Readable: ${ink === '#000000' ? 'black' : 'white'} text, ${R.contrast(colour, ink).toFixed(1)}:1 contrast.`;
  };
  const choose = (v, label) => {
    setBlock('background', v, { rerender: true });
    announce(v ? `${label} background chosen.` : 'Background removed.');
  };
  const option = (v, label) => {
    const id = `${name}-${v || 'none'}`;
    const colour = v ? R.bandColour(v, scheme) : '';
    return h('div', { class: 'swatch-option' },
      h('input', { type: 'radio', name, id, value: v || '', checked: (value || null) === v, 'data-focus': `${block.id}:bg:${v || 'none'}`, onchange: () => choose(v, label) }),
      h('label', { for: id },
        h('span', { class: `swatch${colour ? '' : ' swatch-none'}`, style: colour ? `background:${colour}` : null, 'aria-hidden': 'true' }),
        label));
  };
  const pickerId = `${name}-custom`;
  const field = h('fieldset', { class: 'field background' },
    h('legend', {}, 'Background'),
    h('p', { class: 'field-hint' }, 'A band of colour behind this block, edge to edge. Use it to mark a change of pace, not on every block.'),
    h('div', { class: 'swatch-options' },
      option(null, 'None'),
      ...SCHEME_CHOICES.map(([v, label]) => option(v, label))),
    h('div', { class: 'custom-colour' },
      h('label', { for: pickerId }, 'Any colour'),
      h('input', {
        type: 'color', id: pickerId, value: custom ? value : '#4b7d87', 'data-focus': `${block.id}:bg:custom`,
        'aria-describedby': `${pickerId}-hint`,
        // Live while dragging; one undo step per pick thanks to coalescing.
        oninput: (e) => { setBlock('background', e.target.value.toLowerCase()); describe(e.target.value); },
        onchange: (e) => choose(e.target.value.toLowerCase(), e.target.value),
      }),
      h('span', { id: `${pickerId}-hint`, class: 'field-hint' }, custom ? `Using ${value}` : 'Choose any colour; it won\'t change with the scheme.')),
    verdict);
  describe(value);
  return field;
}
