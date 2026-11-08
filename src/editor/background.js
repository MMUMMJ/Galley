// The Background section of the Look tab: a coloured band behind the block.
// A palette of colour circles: None, Tint, Ink and Accent (which follow the story's colour
// scheme) and Custom (any colour, which stays fixed). A sample shows how the band will read;
// the runtime picks black or white text, so it always does.
import { h } from './dom.js';

const SCHEME_CHOICES = [['tint', 'Tint'], ['ink', 'Ink'], ['accent', 'Accent']];

export function renderBackground(block, story, { setBlock, announce }) {
  const R = window.Illuminate;
  if (!R) return null;
  if (block.type === 'header' && block.data.variant !== 'compact') {
    return h('div', { class: 'field background' }, h('p', { class: 'field-label' }, 'Background'),
      h('p', { class: 'field-hint' }, 'Full-screen headers have their own dark background. Make the header compact to give it a colour.'));
  }
  const scheme = story.meta.theme || 'house';
  const value = block.background;
  const custom = typeof value === 'string' && value.startsWith('#');
  const name = `bg-${block.id}`;

  // The sample: how text will look on the band.
  const sample = h('span', { class: 'band-sample', 'aria-hidden': 'true' }, h('strong', {}, 'Aa'), ' Sample text');
  const verdict = h('span', { class: 'band-verdict' });
  const preview = h('p', { class: 'band-preview', 'aria-live': 'polite' }, sample, verdict);
  const describe = (v) => {
    const colour = v ? R.bandColour(v, scheme) : '';
    preview.hidden = !colour;
    if (!colour) return;
    const ink = R.inkFor(colour);
    sample.style.background = colour;
    sample.style.color = ink;
    verdict.textContent = `Readable: ${ink === '#000000' ? 'black' : 'white'} text, ${R.contrast(colour, ink).toFixed(1)} : 1 contrast`;
  };
  const choose = (v, label) => {
    setBlock('background', v, { rerender: true });
    announce(v ? `${label} background chosen.` : 'Background removed.');
  };

  const option = (v, label) => {
    const id = `${name}-${v || 'none'}`;
    const colour = v ? R.bandColour(v, scheme) : '';
    return h('span', { class: 'palette-option' },
      h('input', { type: 'radio', name, id, value: v || '', checked: (value || null) === v, 'data-focus': `${block.id}:bg:${v || 'none'}`, onchange: () => choose(v, label) }),
      h('label', { for: id },
        h('span', { class: `palette-dot${colour ? '' : ' palette-none'}`, style: colour ? `background:${colour}` : null, 'aria-hidden': 'true' }),
        h('span', { class: 'palette-name' }, label)));
  };
  // Custom: the browser's colour picker, laid over a circle so it looks like the others.
  const pickerId = `${name}-custom`;
  const customOption = h('span', { class: `palette-option palette-custom${custom ? ' is-on' : ''}` },
    h('label', { for: pickerId },
      h('span', { class: 'palette-dot', style: custom ? `background:${value}` : null, 'aria-hidden': 'true' },
        h('input', {
          type: 'color', id: pickerId, value: custom ? value : '#4b7d87', 'data-focus': `${block.id}:bg:custom`,
          'aria-label': custom ? `Custom colour, ${value}` : 'Custom colour',
          // Live while dragging; one undo step per pick thanks to coalescing.
          oninput: (e) => { setBlock('background', e.target.value.toLowerCase()); describe(e.target.value); },
          onchange: (e) => choose(e.target.value.toLowerCase(), 'Custom'),
        })),
      h('span', { class: 'palette-name' }, 'Custom')));

  const field = h('fieldset', { class: 'field background', 'aria-describedby': `${name}-hint` },
    h('legend', {}, 'Background'),
    h('p', { class: 'field-hint', id: `${name}-hint` }, 'A band of colour behind this block, edge to edge. Use it to mark a change of pace, not on every block.'),
    h('div', { class: 'palette' }, option(null, 'None'), ...SCHEME_CHOICES.map(([v, label]) => option(v, label)), customOption),
    h('p', { class: 'field-hint palette-note' }, 'Tint, Ink and Accent follow your colour scheme. Custom stays the same.'),
    preview);
  describe(value);
  return field;
}
