// The canvas's rail: a numbered button per block (amber when it needs work), the Story details
// and Reflection buttons' pressed state, and the course pack's name.
import { STORY_DETAILS, REFLECTION } from '../store.js';
import { BLOCKS, blockLabel } from '../blocks/index.js';
import { blockIssues, getPack } from '../packs.js';
import { esc } from './dom.js';

export function drawRail(rail, section, store) {
  const $ = (sel) => section.querySelector(sel);
  const sel = store.selected;
  const list = store.story.blocks;
  const current = list.some((b) => b.id === sel) ? sel : list[0]?.id;
  rail.innerHTML = list.map((b, i) => {
    const issues = BLOCKS[b.type] ? blockIssues(b, store.story) : [];
    const label = `${i + 1}, ${blockLabel(b.type)}${issues.length ? ', needs work' : ''}`;
    return `<li><button type="button" class="rail-item${b.id === sel ? ' is-selected' : ''}${issues.length ? ' needs-work' : ''}"
      data-id="${esc(b.id)}" aria-label="${esc(label)}" title="${esc(label)}" ${b.id === sel ? 'aria-current="true"' : ''}
      tabindex="${b.id === current ? '0' : '-1'}">${i + 1}</button></li>`;
  }).join('');
  $(`[data-open="${STORY_DETAILS}"]`).setAttribute('aria-pressed', String(sel === STORY_DETAILS));
  $(`[data-open="${REFLECTION}"]`).setAttribute('aria-pressed', String(sel === REFLECTION));
  // The course pack in use, if any (the Classic view shows it in its block list).
  const pack = getPack();
  const packEl = $('.canvas-pack');
  packEl.hidden = !pack.path;
  packEl.textContent = pack.name || '';
  packEl.title = pack.path ? `Course pack: ${pack.name}. Its prompts, blocks and checks apply to this story.` : '';
}
