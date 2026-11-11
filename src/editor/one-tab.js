// One tab edits at a time. Every Galley tab saves to the same place in this browser, so two tabs
// editing at once would overwrite each other: a forgotten tab could save over newer work.
//   - The first tab holds a lock (Web Locks).
//   - Another tab says so, and offers "Use Galley here". That asks the first tab to save and step
//     aside (BroadcastChannel), then loads the story it saved. If the first tab doesn't answer
//     (frozen, say), it's taken over anyway.
//   - The tab that stepped aside stops saving and says where Galley went.
// Browsers without Web Locks (very old ones) carry on as before.
import { h } from './dom.js';

const NAME = 'galley-editor';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Resolves once this tab may edit. dialog: a <dialog> for the messages.
// Returns { onLost(fn) }: fn(saved) runs when another tab takes over; it should save if it can,
// stop saving, and must finish before the other tab loads the story.
export async function claimTab(dialog) {
  if (!globalThis.navigator?.locks) return { onLost() {} };
  const channel = 'BroadcastChannel' in globalThis ? new BroadcastChannel(NAME) : null;
  let release = () => {};
  let lost = async () => {};
  let gone = false;
  const stepAside = async (saved) => {
    if (gone) return;
    gone = true;
    await lost(saved);
    show(dialog, {
      title: 'Galley is open in another tab',
      text: saved ? 'Your work was saved, and it carries on there. This tab no longer saves changes.'
        : 'Another tab took over, and carries on with the story. This tab no longer saves changes.',
      button: 'Use Galley here instead',
    }).then(() => location.reload());
  };

  // Asks for the lock. Resolves true once held (and keeps it until released), false if not got.
  const ask = (opts) => new Promise((resolve) => {
    navigator.locks.request(NAME, opts, (lock) => {
      if (!lock) { resolve(false); return null; }
      resolve(true);
      return new Promise((r) => { release = r; });
    }).catch((err) => {
      // Stolen by a tab that couldn't reach this one, or our own wait given up (below).
      if (err?.name === 'AbortError' && opts.signal?.aborted) resolve(false);
      else stepAside(false);
    });
  });

  if (!(await ask({ ifAvailable: true }))) {
    await show(dialog, {
      title: 'Galley is already open in another tab',
      text: 'Only one tab can edit at a time, so neither saves over the other. Carry on in that tab, or use Galley here: the other tab saves your work first.',
      button: 'Use Galley here',
    });
    dialog.querySelector('p').textContent = 'Opening your story…';
    channel?.postMessage('handover');
    const stop = new AbortController();
    const got = await Promise.race([ask({ signal: stop.signal }), wait(4000).then(() => false)]);
    if (!got) { stop.abort(); await ask({ steal: true }); }
    dialog.close();
  }
  channel?.addEventListener('message', async (e) => {
    if (e.data !== 'handover') return;
    await stepAside(true);
    release();
  });
  return { onLost(fn) { lost = fn; } };
}

// A message the tab can't be used past; resolves when its button is pressed.
function show(dialog, { title, text, button }) {
  return new Promise((resolve) => {
    const btn = h('button', { type: 'button', class: 'btn btn-primary', onclick: () => resolve() }, button);
    dialog.replaceChildren(h('h2', { id: 'tab-dialog-title' }, title), h('p', {}, text), btn);
    dialog.setAttribute('aria-labelledby', 'tab-dialog-title');
    dialog.addEventListener('cancel', (e) => e.preventDefault()); // Escape doesn't dismiss it
    if (!dialog.open) dialog.showModal();
    btn.focus();
  });
}
