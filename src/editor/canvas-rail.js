// The canvas's rail: a numbered button per block (amber when it needs work), the Story details
// and Reflection buttons' pressed state, the course pack's name, and the empty story's welcome.
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
    const mod = BLOCKS[b.type];
    const typeLabel = blockLabel(b.type);
    let summary = '';
    try { summary = mod?.summary ? String(mod.summary(b.data, store.story) || '').trim() : ''; } catch { summary = ''; }
    const issues = mod ? blockIssues(b, store.story) : [];
    const isPart = b.type === 'header' && i > 0;
    const label = `${i + 1}, ${typeLabel}${summary ? `: ${summary.slice(0, 60)}` : ''}${issues.length ? ', needs work' : ''}`;
    return `<li><button type="button" class="rail-item${b.id === sel ? ' is-selected' : ''}${issues.length ? ' needs-work' : ''}${isPart ? ' is-part' : ''}"
      data-id="${esc(b.id)}" aria-label="${esc(label)}" title="${esc(label)}" ${b.id === sel ? 'aria-current="true"' : ''}
      tabindex="${b.id === current ? '0' : '-1'}"><span class="rail-num">${i + 1}</span><span class="rail-detail"><span class="rail-type">${esc(typeLabel)}</span>${summary ? `<span class="rail-sum">${esc(summary.slice(0, 48))}</span>` : ''}</span></button></li>`;
  }).join('');
  $(`[data-open="${STORY_DETAILS}"]`).setAttribute('aria-pressed', String(sel === STORY_DETAILS));
  $(`[data-open="${REFLECTION}"]`).setAttribute('aria-pressed', String(sel === REFLECTION));
  $('.canvas-empty').hidden = list.length > 0;
  // The course pack in use, if any (the Classic view shows it in its block list).
  const pack = getPack();
  const packEl = $('.canvas-pack');
  packEl.hidden = !pack.path;
  packEl.textContent = pack.name || '';
  packEl.title = pack.path ? `Course pack: ${pack.name}. Its prompts, blocks and checks apply to this story.` : '';
}
