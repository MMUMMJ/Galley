// Live preview: the story rendered by the same runtime that goes into exports.
// The iframe is created once; each update replaces only the article, so the
// reader's scroll position survives typing.
import { prefersReducedMotion } from './dom.js';
import { STORY_DETAILS } from '../store.js';
import { RUNTIME_VERSION } from '../model.js';

export function mountPreview(iframe, store, { assetUrl }) {
  const bust = `?v=${encodeURIComponent(RUNTIME_VERSION)}-${Date.now()}`;
  const css = new URL(`runtime/illuminate.css${bust}`, document.baseURI).href;
  const js = new URL(`runtime/illuminate-runtime.js${bust}`, document.baseURI).href;
  iframe.srcdoc = `<!doctype html><html lang="en-GB"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <base target="_blank"><link rel="stylesheet" href="${css}"><script src="${js}"></script>
    <style>.il-story [id] { cursor: pointer; }
      .il-editor-selected { outline: 3px dashed #6b1f7a; outline-offset: 4px; }
      .il-header.il-editor-selected { outline-offset: -6px; }</style>
    </head><body class="il-page"><main id="preview-root"></main></body></html>`;

  const panel = iframe.closest('.panel-preview');
  const appMain = document.getElementById('app');
  const showBtn = document.getElementById('preview-show');
  const hideBtn = document.getElementById('preview-hide');
  const popoutBtn = document.getElementById('preview-popout');

  if (panel) {
    const widthBtns = Array.from(panel.querySelectorAll('[data-preview-width]'));
    widthBtns.forEach((btn) => btn.addEventListener('click', () => {
      const mode = btn.dataset.previewWidth;
      panel.classList.toggle('is-phone-preview', mode === 'phone');
      widthBtns.forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
    }));
  }

  function setPreviewHidden(hidden, refocus) {
    if (!panel || !appMain) return;
    panel.hidden = hidden;
    appMain.classList.toggle('is-preview-hidden', hidden);
    if (showBtn) showBtn.hidden = !hidden;
    if (refocus) (hidden ? showBtn : hideBtn)?.focus();
  }
  hideBtn?.addEventListener('click', () => setPreviewHidden(true, true));
  showBtn?.addEventListener('click', () => setPreviewHidden(false, true));

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
  let boundClick = false;
  let popWin = null;
  let popReady = null;
  let popLastHtml = '';
  const ready = new Promise((resolve) => iframe.addEventListener('load', resolve, { once: true }));

  function openPopout() {
    const w = window.open('', 'illuminate-preview');
    if (!w) return;
    if (w !== popWin || !w.document.getElementById('preview-root')) {
      popWin = w;
      popLastHtml = '';
      w.document.open();
      w.document.write(`<!doctype html><html lang="en-GB"><head><meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Preview · Illuminate</title>
        <base target="_blank"><link rel="stylesheet" href="${css}"><script src="${js}"></script>
        </head><body class="il-page"><main id="preview-root"></main></body></html>`);
      w.document.close();
      popReady = new Promise((resolve) => {
        if (w.Illuminate) resolve();
        else w.addEventListener('load', resolve, { once: true });
      });
    }
    w.focus();
    renderPopout();
  }
  popoutBtn?.addEventListener('click', openPopout);

  async function renderPopout() {
    if (!popWin || popWin.closed) return;
    if (popReady) await popReady;
    if (!popWin || popWin.closed || !popWin.Illuminate || !popWin.document) return;
    const doc = popWin.document;
    const root = doc.getElementById('preview-root');
    if (!root) return;
    const m = store.story.meta;
    const headerTitle = store.story.blocks.find((b) => b.type === 'header' && b.data?.title)?.data.title || '';
    const title = m.seoTitle || m.title || headerTitle || 'Untitled story';
    doc.title = `${title} · Preview`;
    const html = popWin.Illuminate.renderArticle(store.story, { assetUrl, mode: 'export' });
    if (html !== popLastHtml) {
      const fresh = doc.createElement('template');
      fresh.innerHTML = html;
      const next = fresh.content.firstElementChild;
      const live = root.firstElementChild;
      if (live && next) {
        syncAttributes(live, next);
        patch(live, next);
      } else if (next) {
        root.replaceChildren(next);
        remember(next);
      }
      const scheme = popWin.Illuminate.SCHEMES[store.story.meta.theme];
      doc.body.style.background = scheme ? scheme.bg : '';
      popLastHtml = html;
      popWin.Illuminate.enhance(root);
    }
  }

  async function render(from = null) {
    renderPopout();
    await ready;
    const win = iframe.contentWindow;
    const doc = iframe.contentDocument;
    if (!win || !win.Illuminate || !doc) return;
    if (!boundClick) {
      boundClick = true;
      doc.addEventListener('click', (e) => {
        if (e.target.closest('a, button, input, summary, video, audio, iframe, dialog')) return;
        // Walk up past inner ids (a header's title, say) to the block that holds them.
        for (let el = e.target.closest('[id]'); el; el = el.parentElement?.closest('[id]')) {
          if (el.id === 'il-top') return store.select(STORY_DETAILS, 'preview');
          if (store.story.blocks.some((b) => b.id === el.id)) return store.select(el.id, 'preview');
        }
      });
    }
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
    if (sel && store.selected !== lastSelected && from !== 'preview') {
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
      render(change.from);
      return;
    }
    if (!timer) timer = setTimeout(() => { timer = 0; render(); }, 200);
  });
  render();
}
