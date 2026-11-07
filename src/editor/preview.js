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
      root.innerHTML = html;
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

  store.subscribe((change) => {
    clearTimeout(timer);
    timer = setTimeout(render, change.type === 'select' ? 0 : 200);
  });
  render();
}
