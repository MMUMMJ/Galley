// The Checks panel: questions an editor might ask, never marks. Each question
// jumps to its block. Re-runs as the student edits.
import { runChecks, questionCount } from '../checks/index.js';
import { where } from '../checks/util.js';
import { getPack } from '../packs.js';
import { STORY_DETAILS } from '../store.js';
import { h, preserveFocus } from './dom.js';

export function mountChecks(store, { button, panel, announce }) {
  const probe = document.createElement('video');
  const canPlayType = (mime) => probe.canPlayType(mime);
  let results = [];
  let timer = 0;

  function compute() {
    results = runChecks(store.story, { pack: getPack(), canPlayType });
    const n = questionCount(results);
    button.querySelector('.count').textContent = n ? String(n) : '';
    button.setAttribute('aria-label', n ? `Checks: ${n} question${n === 1 ? '' : 's'}` : 'Checks: no questions');
    if (!panel.hidden) preserveFocus(panel, render);
  }

  function jump(blockId) {
    store.select(blockId, 'checks');
    if (window.matchMedia('(max-width: 760px)').matches) close(false);
    const inspector = document.getElementById('inspector');
    inspector.focus();
    inspector.scrollIntoView({ block: 'nearest' });
    announce(blockId === STORY_DETAILS ? 'Showing Story details.' : `Showing ${where(store.story, blockId)}.`);
  }

  function render() {
    const n = questionCount(results);
    const groups = results.filter((r) => r.items.length);
    panel.replaceChildren(...[
      h('div', { class: 'checks-head' },
        h('h2', { id: 'checks-heading' }, 'Checks'),
        h('button', { type: 'button', class: 'btn', 'data-focus': 'chk:close', onclick: () => close(true) }, 'Close')),
      h('p', { class: 'checks-intro' },
        'Questions an editor might ask before publishing. They\'re prompts, not marks: you decide what to change.'),
      n || groups.length ? null : h('p', { class: 'checks-none' }, 'No questions right now.'),
      groups.map((r) => h('section', { class: 'checks-group', 'aria-labelledby': `chk-${r.id}` },
        h('h3', { id: `chk-${r.id}` }, r.title),
        h('ul', {}, r.items.map((it, i) => {
          if (it.kind === 'info' || !it.blockId) {
            return h('li', { class: it.kind === 'info' ? 'check-info' : 'check-story' }, it.message);
          }
          const label = it.blockId === STORY_DETAILS ? 'Story details' : where(store.story, it.blockId);
          return h('li', {}, h('button', {
            type: 'button', class: 'check-item', 'data-focus': `chk:${r.id}:${i}`,
            onclick: () => jump(it.blockId === STORY_DETAILS ? STORY_DETAILS : it.blockId),
          }, h('span', { class: 'check-where' }, `${label} →`), h('span', {}, it.message)));
        })))),
    ].flat().filter(Boolean)); // replaceChildren doesn't flatten arrays or skip nulls
  }

  function open() {
    compute();
    panel.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    render();
    panel.focus();
  }

  function close(refocus) {
    panel.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    if (refocus) button.focus();
  }

  button.addEventListener('click', () => (panel.hidden ? open() : close(true)));
  panel.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); close(true); }
  });
  store.subscribe((change) => {
    if (change.type === 'select') return;
    clearTimeout(timer);
    timer = setTimeout(compute, 300);
  });
  compute();
}
