// Live preview: the story rendered by the same runtime that goes into exports.
// The iframe is created once; each update replaces only the article, so the
// reader's scroll position survives typing.
import { prefersReducedMotion } from './dom.js';

export function mountPreview(iframe, store, { assetUrl }) {
  const css = new URL('runtime/illuminate.css', document.baseURI).href;
  const js = new URL('runtime/illuminate-runtime.js', document.baseURI).href;
  iframe.srcdoc = `<!doctype html><html lang="en-GB"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <base target="_blank"><link rel="stylesheet" href="${css}"><script src="${js}"></script>
    <style>.il-editor-selected { outline: 3px dashed #6b1f7a; outline-offset: 4px; }
      .il-header.il-editor-selected { outline-offset: -6px; }</style>
    </head><body class="il-page"><main id="preview-root"></main></body></html>`;

  // Each live block remembers the HTML it was drawn from, so a redraw only replaces
  // blocks whose HTML changed. Untouched blocks stay as they are: a video or an
  // embedded player keeps playing while the student edits another block.
  const source = new WeakMap();
  const isPart = (el) => el.classList.contains('il-part');
  const keyOf = (el) => el.id || (isPart(el) ? `part:${el.getAttribute('aria-labelledby') || ''}` : el.tagName);
  function remember(el) {
    source.set(el, el.outerHTML);
    if (isPart(el)) Array.from(el.children).forEach(remember);
  }
  function syncAttributes(live, next) {
    for (const { name } of Array.from(live.attributes)) if (!next.hasAttribute(name)) live.removeAttribute(name);
    for (const { name, value } of Array.from(next.attributes)) if (live.getAttribute(name) !== value) live.setAttribute(name, value);
  }
  function patch(liveParent, nextParent) {
    const live = Array.from(liveParent.children);
    const next = Array.from(nextParent.children);
    if (live.length !== next.length || live.some((el, i) => keyOf(el) !== keyOf(next[i]))) {
      // Blocks added, removed or reordered: redraw this level.
      liveParent.replaceChildren(...next);
      next.forEach(remember);
      return;
    }
    live.forEach((el, i) => {
      const n = next[i];
      const html = n.outerHTML;
      if (source.get(el) === html) return;
      if (isPart(el) && isPart(n)) {
        patch(el, n);
        source.set(el, html);
      } else {
        el.replaceWith(n);
        remember(n);
      }
    });
  }

  let timer = 0;
  let lastHtml = '';
  let lastSelected = null;
  const ready = new Promise((resolve) => iframe.addEventListener('load', resolve, { once: true }));

  async function render() {
    await ready;
    const win = iframe.contentWindow;
    const doc = iframe.contentDocument;
    if (!win || !win.Illuminate || !doc) return;
    const root = doc.getElementById('preview-root');
    const html = win.Illuminate.renderArticle(store.story, { assetUrl, mode: 'preview' });
    if (html !== lastHtml) {
      const fresh = doc.createElement('template');
      fresh.innerHTML = html;
      const next = fresh.content.firstElementChild;
      const live = root.firstElementChild;
      if (live && next) {
        syncAttributes(live, next); // the colour scheme lives on the article itself
        patch(live, next);
      } else { root.replaceChildren(next); remember(next); }
      const scheme = win.Illuminate.SCHEMES[store.story.meta.theme];
      doc.body.style.background = scheme ? scheme.bg : '';
      lastHtml = html;
      win.Illuminate.enhance(root);
    }
    root.querySelectorAll('.il-editor-selected').forEach((el) => el.classList.remove('il-editor-selected'));
    const sel = store.selected ? doc.getElementById(store.selected) : null;
    if (sel) sel.classList.add('il-editor-selected');
    if (sel && store.selected !== lastSelected) {
      sel.scrollIntoView({ block: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    }
    lastSelected = store.selected;
  }

  // At most one redraw every 200ms while the student types, so the preview keeps
  // up during long bursts of typing instead of waiting for a pause.
  store.subscribe((change) => {
    if (change.type === 'select') {
      clearTimeout(timer);
      timer = 0;
      render();
      return;
    }
    if (!timer) timer = setTimeout(() => { timer = 0; render(); }, 200);
  });
  render();
}
