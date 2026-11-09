// The "Add a block" picker: a dialog over the editor with a card for each block type the
// pack allows, each with a small looping animation of what the block does. The animations
// are decoration (hidden from screen readers) and become still pictures under reduced motion.
import { BLOCKS } from '../blocks/index.js';
import { allowedBlocks } from '../packs.js';
import { h } from './dom.js';

const GROUPS = [
  ['Writing', ['header', 'text', 'columns', 'quote', 'divider', 'references']],
  ['Media', ['media', 'gallery', 'embed']],
  ['Showpiece', ['scrolly', 'textcolumn', 'scrollpoints', 'compare', 'number']],
];

// Little pictures made of plain elements; editor.css draws and animates them.
const ART = {
  header: '<i class="a-img"></i><i class="a-title"></i><i class="a-sub"></i>',
  text: '<i class="a-line l1"></i><i class="a-line l2"></i><i class="a-line l3"></i><i class="a-line l4"></i>',
  columns: '<i class="a-col c1"><i class="a-line l1"></i><i class="a-line l2"></i><i class="a-line l3"></i></i><i class="a-col c2"><i class="a-line l1"></i><i class="a-line l2"></i><i class="a-line l3"></i></i>',
  quote: '<i class="a-mark">“</i><i class="a-line l1"></i><i class="a-line l2"></i><i class="a-cite"></i>',
  divider: '<i class="a-line l1"></i><i class="a-dots"><i></i><i></i><i></i></i><i class="a-line l2"></i>',
  references: '<i class="a-ref r1"></i><i class="a-ref r2"></i><i class="a-ref r3"></i>',
  media: '<i class="a-frame"><i class="a-sun"></i><i class="a-hill"></i></i>',
  gallery: '<i class="a-tile t1"></i><i class="a-tile t2"></i><i class="a-tile t3"></i><i class="a-tile t4"></i>',
  embed: '<i class="a-card"><i class="a-play"></i></i><i class="a-line l1"></i>',
  scrolly: '<i class="a-bg b1"></i><i class="a-bg b2"></i><i class="a-step"></i>',
  textcolumn: '<i class="a-bg b1"></i><i class="a-bg b2"></i><i class="a-col"><b></b><b></b><b></b><b></b><b></b><b></b></i>',
  scrollpoints: '<i class="a-bg b1"></i><i class="a-spot"></i><i class="a-step"></i>',
  compare: '<i class="a-before"></i><i class="a-after"></i><i class="a-handle"></i>',
  number: '<i class="a-count"><i>0</i><i>480</i><i>960</i><i>1,240</i></i><i class="a-line l1"></i>',
};

let dialog = null;

function build() {
  dialog = h('dialog', { class: 'block-picker', 'aria-labelledby': 'picker-title', 'aria-describedby': 'picker-where' });
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
  // Arrow keys move between cards, like a grid.
  dialog.addEventListener('keydown', (e) => {
    const cards = [...dialog.querySelectorAll('.add-option')];
    const i = cards.indexOf(document.activeElement);
    if (i < 0) return;
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (step) { e.preventDefault(); cards[(i + step + cards.length) % cards.length].focus(); }
    if (e.key === 'Home') { e.preventDefault(); cards[0].focus(); }
    if (e.key === 'End') { e.preventDefault(); cards[cards.length - 1].focus(); }
  });
  document.body.append(dialog);
}

// where: e.g. "Adds after block 3". onChoose(type) is called as soon as a card is chosen.
export function openBlockPicker({ where, onChoose, returnFocus }) {
  if (!dialog) build();
  const allowed = allowedBlocks();
  dialog.replaceChildren(
    h('div', { class: 'picker-head' },
      h('div', {}, h('h2', { id: 'picker-title' }, 'Add a block'), h('p', { id: 'picker-where' }, where)),
      h('button', { type: 'button', class: 'btn', onclick: () => dialog.close() }, 'Close')),
    ...GROUPS.map(([title, types]) => {
      const shown = types.filter((t) => allowed.includes(t) && BLOCKS[t]);
      if (!shown.length) return null;
      return h('section', { class: 'picker-group', 'aria-label': title },
        h('h3', {}, title),
        h('div', { class: 'picker-grid' }, shown.map((t) => {
          const card = h('button', {
            type: 'button', class: 'add-option pick-card', 'data-type': t,
            // Add the block straight away, not on the dialog's later "close" event.
            onclick: () => { chosen = t; dialog.close(); onChoose(t); },
          });
          const art = h('span', { class: `pick-art pick-art--${t}`, 'aria-hidden': 'true' });
          art.innerHTML = ART[t] || '';
          card.append(art, h('strong', {}, BLOCKS[t].label), h('span', { class: 'pick-desc' }, BLOCKS[t].description));
          return card;
        })));
    }).filter(Boolean));
  let chosen = null;
  dialog.addEventListener('close', () => {
    if (!chosen && returnFocus) returnFocus.focus(); // closed without choosing: back to "+ Add block"
  }, { once: true });
  dialog.showModal();
  dialog.querySelector('.add-option')?.focus();
}
