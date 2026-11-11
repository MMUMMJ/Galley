// The Checks panel: questions an editor might ask, never marks. Each question
// jumps to its block. Re-runs as the student edits.
import { runChecks, questionCount, failedCount } from '../checks/index.js';
import { where } from '../checks/util.js';
import { getPack } from '../packs.js';
import { STORY_DETAILS } from '../store.js';
import { h, preserveFocus } from './dom.js';
import { openMediaEditor } from './media-editor.js';
import { reviewKey, reviewEvidence, isReviewed } from './review-state.js';

// reveal(blockId, returnTo, focusTarget): shows the block's settings in a view that keeps them in a sheet (the
// canvas); returns false when they're already on screen (Panels/Classic).
export function mountChecks(store, { button, panel, announce, reveal = () => false, focusTarget = () => {} }) {
  const probe = document.createElement('video');
  const canPlayType = (mime) => probe.canPlayType(mime);
  let results = [];
  let timer = 0;
  const noted = (checkId, it) => isReviewed(store.story, checkId, it, getPack());

  function activeQuestions() {
    let count = 0;
    for (const r of results) {
      for (const it of r.items) {
        if (it.kind === 'question' && !noted(r.id, it)) count++;
      }
    }
    return count;
  }

  function compute() {
    results = runChecks(store.story, { pack: getPack(), canPlayType });
    const n = activeQuestions();
    button.querySelector('.count').textContent = n ? String(n) : '';
    const failed = failedCount(results);
    button.setAttribute('aria-label', `${n ? `Checks: ${n} question${n === 1 ? '' : 's'}` : 'Checks: no questions'}${failed ? `, ${failed} check${failed === 1 ? '' : 's'} couldn't run` : ''}`);
    if (!panel.hidden) preserveFocus(panel, render);
  }

  function jump(blockId, target = null) {
    store.select(blockId, 'checks');
    if (target?.assetId) {
      close(false);
      if (openMediaEditor({ blockId, assetId: target.assetId, focusField: target.field, returnFocus: button })) return;
    }
    // The canvas's settings sheet opens where this panel is, so the panel closes; Close on the
    // sheet comes back to the Checks button.
    if (reveal(blockId, button, target)) close(false);
    else {
      if (window.matchMedia('(max-width: 760px)').matches) close(false);
      focusTarget(target);
      const inspector = document.getElementById('inspector');
      inspector.scrollIntoView({ block: 'nearest' });
    }
    announce(blockId === STORY_DETAILS ? 'Showing Story details.' : `Showing ${where(store.story, blockId)}.`);
  }

  function toggleNoted(checkId, item) {
    const wasNoted = noted(checkId, item);
    store.update((s) => {
      const reviews = { ...(s.meta.reviewedChecks || {}) };
      const key = reviewKey(checkId, item);
      if (wasNoted) delete reviews[key];
      else reviews[key] = reviewEvidence(s, item, getPack());
      // Drop obsolete questions when making a new decision, keeping exports bounded.
      const currentKeys = new Set(results.flatMap((r) => r.items.map((it) => reviewKey(r.id, it))));
      s.meta.reviewedChecks = Object.fromEntries(Object.entries(reviews).filter(([k]) => currentKeys.has(k)));
    }, { from: 'checks' });
    announce(wasNoted ? 'Question unmarked.' : 'Marked as noted. This is saved with the story and will be reviewed again if its content changes.');
    compute();
  }

  function render() {
    const n = questionCount(results);
    const groups = results.filter((r) => r.items.length);
    panel.replaceChildren(...[
      h('div', { class: 'checks-head' },
        h('h2', { id: 'checks-heading' }, 'Checks'),
        h('button', { type: 'button', class: 'btn', 'data-focus': 'chk:close', onclick: () => close(true) }, 'Close')),
      h('p', { class: 'checks-intro' },
        'Questions an editor might ask before publishing. They\'re prompts, not marks: click any item to go straight to that field, or mark a prompt as Noted once you\'ve considered it.'),
      n || groups.length ? null : h('p', { class: 'checks-none' }, 'No questions right now.'),
      groups.map((r) => h('section', { class: 'checks-group', 'aria-labelledby': `chk-${r.id}` },
        h('h3', { id: `chk-${r.id}` }, r.title),
        h('ul', {}, r.items.map((it, i) => {
          if (it.kind === 'info' || it.kind === 'error' || !it.blockId) {
            return h('li', { class: { info: 'check-info', error: 'check-error' }[it.kind] || 'check-story' }, it.message);
          }
          const isNoted = noted(r.id, it);
          const label = it.blockId === STORY_DETAILS ? 'Story details' : where(store.story, it.blockId);
          return h('li', { class: `check-row${isNoted ? ' is-noted' : ''}` },
            h('button', {
              type: 'button', class: 'check-item', 'data-focus': `chk:${r.id}:${i}`,
              onclick: () => jump(it.blockId === STORY_DETAILS ? STORY_DETAILS : it.blockId, { tab: it.tab, focusKey: it.focusKey, assetId: it.assetId, field: it.field }),
            }, h('span', { class: 'check-where' }, `${label} →`), h('span', {}, it.message)),
            h('button', {
              type: 'button', class: 'btn-slim check-note-btn', 'data-focus': `chk:${r.id}:${i}:note`,
              'aria-pressed': String(isNoted),
              title: isNoted ? 'Bring this question back into your active count' : 'Mark that you have considered this prompt',
              onclick: () => toggleNoted(r.id, it),
            }, isNoted ? 'Noted ✓' : 'Noted'));
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
