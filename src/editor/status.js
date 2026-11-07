// Screen-reader announcements and toasts (short messages, optionally with an Undo button).
// Toasts stay until dismissed or replaced, or for 10 seconds; they never vanish on hover.
import { h } from './dom.js';

export function createStatus(announcer, toastRegion) {
  let toastTimer = 0;

  function announce(message) {
    announcer.textContent = '';
    // A fresh text node makes screen readers read repeated messages too.
    requestAnimationFrame(() => { announcer.textContent = message; });
  }

  function toast(message, { action, onAction, tone } = {}) {
    clearTimeout(toastTimer);
    const close = () => toastRegion.replaceChildren();
    const el = h('div', { class: `toast${tone ? ` toast-${tone}` : ''}` },
      h('p', {}, message),
      action ? h('button', { type: 'button', class: 'btn', onclick: () => { close(); onAction(); } }, action) : null,
      h('button', { type: 'button', class: 'btn btn-icon', 'aria-label': 'Dismiss message', onclick: close }, '✕'));
    toastRegion.replaceChildren(el);
    toastTimer = setTimeout(close, tone === 'warning' ? 20000 : 10000);
  }

  return { announce, toast };
}
