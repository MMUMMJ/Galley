// Screen-reader announcements, toasts and alerts.
//   toast: a short message (optionally with an Undo button); stays until dismissed or replaced,
//          or for 10 seconds; never vanishes on hover.
//   alert: a warning that stays under the header until it's dealt with (work at risk, say).
//          One per key; alert(key, null) clears it.
import { h } from './dom.js';

export function createStatus(announcer, toastRegion, alertRegion) {
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

  const alerts = new Map();
  function alert(key, message, { action, onAction } = {}) {
    alerts.get(key)?.remove();
    alerts.delete(key);
    if (!message || !alertRegion) return;
    const el = h('div', { class: 'alert', role: 'alert' },
      h('p', {}, message),
      action ? h('button', { type: 'button', class: 'btn', onclick: onAction }, action) : null);
    alerts.set(key, el);
    alertRegion.append(el);
  }

  return { announce, toast, alert };
}
