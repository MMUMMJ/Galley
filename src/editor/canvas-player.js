// Play on the canvas: one block, moving as readers will see it, right where it's being edited.
// The canvas draws the story still (so every step can be clicked and typed into); Play lays a
// player over the canvas's visible area with just that block in it, run by the same runtime
// as exports. Scroll inside it to see the block move. Stop or Escape puts the canvas back
// exactly as it was; "Open in preview" shows the whole story in the preview tab.
import { h, prefersReducedMotion } from './dom.js';
import { RUNTIME_VERSION } from '../model.js';

// holder: the canvas's main area (positioned); scroller: the canvas, which the player covers.
// label(id): what to call the block. openPreview(id): the preview tab at the block.
export function canvasPlayer({ holder, scroller, store, assetUrl, announce, label, openPreview }) {
  const bust = `?v=${encodeURIComponent(RUNTIME_VERSION)}`;
  const css = new URL(`runtime/galley.css${bust}`, document.baseURI).href;
  const js = new URL(`runtime/galley-runtime.js${bust}`, document.baseURI).href;
  let cur = null; // { el, blockId, returnTo }

  function open(blockId, returnTo) {
    close(false);
    const block = store.story.blocks.find((b) => b.id === blockId);
    if (!block) return;
    const name = label(blockId);
    const frame = h('iframe', { class: 'canvas-player-frame', title: `${name}, playing` });
    const stop = h('button', { type: 'button', class: 'btn', onclick: () => close(true) }, 'Stop');
    const full = h('button', { type: 'button', class: 'btn-slim', onclick: () => { const id = blockId; close(false); openPreview(id); } },
      'Open in preview ', h('span', { 'aria-hidden': 'true' }, '↗'));
    const still = prefersReducedMotion();
    const el = h('section', { class: 'canvas-player', 'aria-label': `Playing ${name}` },
      h('div', { class: 'canvas-player-bar' },
        h('p', { class: 'canvas-player-name' }, h('strong', {}, `Playing ${name}. `),
          still ? 'Your device is set to reduce motion, so it plays without movement.' : 'Scroll to see it move as readers will.'),
        full, stop),
      frame);
    // Over the canvas's visible area, below its top bar.
    el.style.top = `${scroller.offsetTop}px`;
    holder.append(el);
    cur = { el, blockId, returnTo };

    // The block on its own, with room to scroll into it and out again. The story's title isn't
    // repeated: with no header block, the runtime would otherwise add one.
    const story = { ...store.story, meta: { ...store.story.meta, title: '', standfirst: '' }, blocks: [block] };
    frame.addEventListener('load', () => {
      const win = frame.contentWindow;
      if (!win || !win.Galley || cur?.el !== el) return;
      const doc = win.document;
      const root = doc.getElementById('play-root');
      root.innerHTML = win.Galley.renderArticle(story, { assetUrl, mode: 'export' });
      const scheme = win.Galley.SCHEMES[story.meta.theme];
      if (scheme) { doc.body.style.background = scheme.bg; doc.body.style.color = scheme.text; }
      win.Galley.enhance(root);
      doc.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); close(true); } });
      win.focus();
    }, { once: true });
    frame.srcdoc = `<!doctype html><html lang="en-GB"><head><meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <base target="_blank"><link rel="stylesheet" href="${css}"><script src="${js}"></script>
      <style>.play-space { height: 45vh; display: grid; place-items: center; font: 600 0.9rem system-ui, sans-serif; opacity: 0.6; }</style>
      </head><body class="il-page"><div class="play-space">Scroll down to play ↓</div><main id="play-root"></main>
      <div class="play-space">End of the block. Press Stop to go back to editing.</div></body></html>`;
    announce(`Playing ${name}. ${still ? 'Your device is set to reduce motion, so it plays without movement.' : 'Scroll to see it move.'} Press Escape to stop.`);
  }

  // refocus: put focus back on the button that started it (or wherever it came from).
  function close(refocus) {
    if (!cur) return;
    const { el, returnTo } = cur;
    cur = null;
    el.remove();
    if (refocus) { returnTo?.isConnected ? returnTo.focus() : scroller.focus(); announce('Stopped. Back to editing.'); }
  }

  holder.addEventListener('keydown', (e) => { if (cur && e.key === 'Escape' && cur.el.contains(e.target)) { e.preventDefault(); close(true); } });

  return { open, close, get blockId() { return cur ? cur.blockId : null; } };
}
