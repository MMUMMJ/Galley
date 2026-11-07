// Small DOM helpers shared by the editor panels.

export function esc(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// h('button', { class: 'btn', onclick: fn, 'aria-label': 'Close' }, 'Close')
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
    else if (key === 'class') el.className = value;
    else if (['value', 'checked', 'disabled', 'hidden', 'multiple', 'selected'].includes(key)) el[key] = value;
    else el.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

// Redraws a panel without losing the keyboard user's place.
// Elements that can hold focus carry data-focus="<stable key>".
export function preserveFocus(container, render, fallback) {
  const active = document.activeElement;
  const key = active && container.contains(active) ? active.dataset.focus : null;
  const caret = key && typeof active.selectionStart === 'number'
    ? [active.selectionStart, active.selectionEnd] : null;
  const scroll = container.scrollTop;
  render();
  container.scrollTop = scroll;
  if (!key) return;
  const next = container.querySelector(`[data-focus="${CSS.escape(key)}"]`);
  if (next && !next.disabled) {
    next.focus({ preventScroll: true });
    if (caret && typeof next.setSelectionRange === 'function') {
      try { next.setSelectionRange(caret[0], caret[1]); } catch { /* not a text field */ }
    }
  } else if (fallback) {
    fallback();
  }
}

export function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
