// The settings sheet on the canvas: the usual Write / Look / Notes inspector, sliding in from
// the right. Close (or Esc) puts focus back where it was opened from.
//   active(): the canvas is showing; fallback(): where focus goes if that place has gone.
export function canvasSheet({ app, sheet, inspector, active, fallback }) {
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'btn sheet-close';
  closeBtn.textContent = 'Close';
  closeBtn.setAttribute('aria-label', 'Close settings');
  sheet.prepend(closeBtn);
  let returnTo = null;
  const isOpen = () => app.classList.contains('sheet-open');
  function open(from, { focusField = false } = {}) {
    returnTo = from || document.activeElement;
    app.classList.add('sheet-open');
    sheet.removeAttribute('inert');
    if (focusField) inspector.focusFirstField();
    else sheet.focus();
  }
  function close() {
    if (!isOpen()) return;
    app.classList.remove('sheet-open');
    sheet.setAttribute('inert', '');
    const back = returnTo && returnTo.isConnected ? returnTo : fallback();
    back?.focus();
  }
  closeBtn.addEventListener('click', close);
  sheet.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && active() && !e.defaultPrevented && !e.target.closest('dialog, .rte-pop')) { e.preventDefault(); close(); }
  });
  return { open, close, isOpen };
}
