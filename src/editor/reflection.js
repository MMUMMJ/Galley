// Reflection: story-level questions about how the student made the story.
// The pack supplies questions; students can add their own. Answers reach the
// export only through the optional appendix, which is switched on here.
import { h } from './dom.js';
import { getPack } from '../packs.js';

// update(recipe, { rerender, coalesce }) changes the story.
export function renderReflection(el, { story, update, announce }) {
  const packQuestions = new Set(getPack().reflection);
  const items = story.reflection;

  const list = h('ol', { class: 'reflection-list' }, items.map((r, i) => {
    const fixed = packQuestions.has(r.q);
    const answerId = `refl-a-${i}`;
    const questionId = `refl-q-${i}`;
    return h('li', { class: 'reflection-item' },
      fixed
        ? h('label', { for: answerId, class: 'reflection-q' }, r.q)
        : h('div', { class: 'field' },
          h('label', { for: questionId }, 'Your question'),
          h('input', {
            id: questionId, type: 'text', value: r.q, 'data-focus': `refl:q:${i}`,
            oninput: (e) => update((s) => { s.reflection[i].q = e.target.value; }, { coalesce: `refl:q:${i}` }),
          })),
      fixed ? null : h('label', { for: answerId, class: 'sr-only' }, `Answer to your question ${i + 1}`),
      h('textarea', {
        id: answerId, rows: 5, value: r.a, 'data-focus': `refl:a:${i}`,
        oninput: (e) => update((s) => { s.reflection[i].a = e.target.value; }, { coalesce: `refl:a:${i}` }),
      }),
      fixed ? null : h('button', {
        type: 'button', class: 'btn btn-danger', 'data-focus': `refl:del:${i}`,
        onclick: () => {
          update((s) => { s.reflection.splice(i, 1); }, { rerender: true });
          announce('Question removed.');
        },
      }, 'Remove this question'));
  }));

  const appendixId = 'refl-appendix';
  el.append(
    h('p', { class: 'inspector-help' },
      'Questions about how you made this story: your choices, what worked, what you\'d change. '
      + 'Readers only see your answers if you add the appendix below.'),
    items.length ? list : h('p', { class: 'panel-empty' }, 'No reflection questions yet.'),
    h('button', {
      type: 'button', class: 'btn', 'data-focus': 'refl:add',
      onclick: () => {
        update((s) => { s.reflection.push({ q: '', a: '' }); }, { rerender: true });
        document.querySelector(`[data-focus="refl:q:${items.length}"]`)?.focus();
        announce('Question added. Type your question, then your answer.');
      },
    }, 'Add your own question'),
    h('fieldset', { class: 'field appendix-choice' },
      h('legend', {}, 'Appendix'),
      h('div', { class: 'field-check' },
        h('input', {
          id: appendixId, type: 'checkbox', checked: story.meta.appendix === true, 'data-focus': 'refl:appendix',
          'aria-describedby': `${appendixId}-hint`,
          onchange: (e) => update((s) => { s.meta.appendix = e.target.checked; }, { rerender: true }),
        }),
        h('label', { for: appendixId }, 'Add a maker\'s notes appendix to the export'),
        h('p', { class: 'field-hint', id: `${appendixId}-hint` },
          'A section after the story with your maker\'s notes, effect notes and these answers. Marked as not part of the story.'))),
  );
}
