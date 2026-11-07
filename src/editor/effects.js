// The "Movement" section of the inspector: a block's scroll effect, plus an optional
// note on why it moves. Effects run once, as the reader reaches the block, and never
// for readers who have asked their device for reduced motion.
import { h } from './dom.js';

export const EFFECT_LABELS = {
  none: 'None',
  fade: 'Fade in',
  rise: 'Rise: moves up as it fades in',
  slide: 'Slide in from the left',
  zoom: 'Zoom: grows slightly as it fades in',
};

export const effectBadge = (effect) => (effect && effect !== 'none' ? EFFECT_LABELS[effect].split(':')[0] : '');

// setBlock(key, value, opts) changes a block-level field (not block.data).
// noteMode comes from the pack: 'off' hides the note, 'required' asks for it.
export function renderEffects(block, { setBlock, announce, noteMode = 'optional' }) {
  const selectId = `fx-${block.id}`;
  const noteId = `fx-note-${block.id}`;
  const moving = block.effect && block.effect !== 'none';
  return h('fieldset', { class: 'field movement' },
    h('legend', {}, 'Movement'),
    h('p', { class: 'field-hint', id: `${selectId}-hint` },
      'Happens once, as the reader scrolls to this block. Readers who turn off motion see no movement. Use it sparingly.'),
    h('label', { for: selectId, class: 'sr-only' }, 'Effect'),
    h('select', {
      id: selectId, 'data-focus': `${block.id}:effect`, 'aria-describedby': `${selectId}-hint`,
      onchange: (e) => {
        const value = e.target.value;
        setBlock('effect', value, { rerender: true });
        announce(value === 'none'
          ? 'Movement removed.'
          : `${EFFECT_LABELS[value].split(':')[0]} chosen.${noteMode === 'off' ? ''
            : noteMode === 'required' ? ' Below, say what this movement does for the reader.'
              : ' Below, you can note what this movement does for the reader.'}`);
      },
    }, Object.entries(EFFECT_LABELS).map(([value, label]) => h('option', { value, selected: value === (block.effect || 'none') }, label))),
    moving && noteMode !== 'off' ? h('div', { class: 'field effect-note' },
      h('label', { for: noteId }, `What does this movement do for the reader? (${noteMode === 'required' ? 'required' : 'optional'})`),
      h('p', { class: 'field-hint', id: `${noteId}-hint` }, 'For example: "The quote rises in to slow the reader down before the turn in the story."'),
      h('textarea', {
        id: noteId, rows: 3, value: block.effectNote || '', 'data-focus': `${block.id}:effectNote`, 'aria-describedby': `${noteId}-hint`,
        oninput: (e) => setBlock('effectNote', e.target.value),
      })) : null);
}
