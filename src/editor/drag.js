// Drag to reorder, using pointer events so mouse, pen and touch (iPad) all work.
// Dragging starts only from the handle, so the list still scrolls normally by touch.
// Every drag action also has a button (Move up / Move down), as required.

export function enableDrag(list, { onDrop }) {
  list.addEventListener('pointerdown', (e) => {
    const handle = e.target.closest('.drag-handle');
    if (!handle || e.button > 0) return;
    const item = handle.closest('[data-id]');
    if (!item) return;
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);

    const others = Array.from(list.children).filter((el) => el !== item && el.dataset.id);
    const from = Array.from(list.children).indexOf(item);
    const marker = document.createElement('li');
    marker.className = 'drop-marker';
    marker.setAttribute('aria-hidden', 'true');
    item.classList.add('is-dragging');
    const scroller = list.closest('.panel') || document.scrollingElement;
    let to = from;
    let frame = 0;
    let lastY = e.clientY;

    const place = () => {
      to = others.filter((el) => {
        const r = el.getBoundingClientRect();
        return r.top + r.height / 2 < lastY;
      }).length;
      const before = others[to] || null;
      if (marker.nextSibling !== before || !marker.parentNode) list.insertBefore(marker, before);
    };

    // Scroll the panel when dragging near its top or bottom edge.
    const autoscroll = () => {
      const r = scroller.getBoundingClientRect();
      const edge = 48;
      if (lastY < r.top + edge) scroller.scrollTop -= 12;
      else if (lastY > r.bottom - edge) scroller.scrollTop += 12;
      place();
      frame = requestAnimationFrame(autoscroll);
    };

    const move = (ev) => { lastY = ev.clientY; };
    const end = (ev) => {
      cancelAnimationFrame(frame);
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', end);
      handle.removeEventListener('pointercancel', end);
      item.classList.remove('is-dragging');
      marker.remove();
      if (ev.type === 'pointerup' && to !== from) onDrop(item.dataset.id, to);
    };

    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
    place();
    frame = requestAnimationFrame(autoscroll);
  });
}
