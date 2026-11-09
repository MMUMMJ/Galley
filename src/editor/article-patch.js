// Redraws a rendered story in place, replacing only the blocks whose HTML changed.
// Untouched blocks stay as they are, so a playing video or an embedded player keeps going
// and images don't flicker while the student edits another block.
// Used by the preview (and its pop-out window) and by the canvas.
export function articlePatcher() {
  // Each live block remembers the HTML it was drawn from.
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
  // root: the element that holds the article; html: renderArticle()'s output.
  return function draw(root, html) {
    const doc = root.ownerDocument;
    const fresh = doc.createElement('template');
    fresh.innerHTML = html;
    const next = fresh.content.firstElementChild;
    const live = root.firstElementChild;
    if (live && next) {
      syncAttributes(live, next); // the colour scheme lives on the article itself
      patch(live, next);
    } else {
      root.replaceChildren(...(next ? [next] : []));
      if (next) remember(next);
    }
  };
}
