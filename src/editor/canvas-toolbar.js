// The selected block's toolbar on the canvas: which buttons show, and what each says to a
// screen reader. Arrow keys move along it, as in any toolbar; secondary block actions (Move up,
// Move down, Duplicate, Delete) live in a compact "More ▾" menu so the bar fits narrow screens.
export function labelToolbar(tools, { index, count, label, el, hasText, hasMedia, hasSteps = false, playable, todo }) {
  const name = `Block ${index + 1}, ${label}`;
  const btn = (act) => tools.querySelector(`[data-act="${act}"]`);
  const set = (act, aria, { hidden = false, disabled = false } = {}) => {
    const b = btn(act);
    if (!b) return null;
    b.hidden = hidden;
    b.disabled = disabled;
    b.setAttribute('aria-label', aria);
    return b;
  };
  tools.setAttribute('aria-label', name);
  tools.querySelector('.canvas-tools-name').textContent = `${index + 1} · ${label}`;
  set('settings', `Settings for ${name}`);
  // Each spoken name starts with the button's visible text, so voice control users can say what they see.
  set('text', `Edit text: ${name}`, { hidden: !hasText });
  const video = el?.querySelector('[data-il-asset]')?.tagName === 'VIDEO';
  set('media', `${video ? 'Video' : 'Image'} tools for ${name}: replace, alt text`, { hidden: !hasMedia }).textContent = video ? 'Video' : 'Image';
  set('add-step', `+ Step: add a step to ${name}`, { hidden: !hasSteps });
  set('play', `Play ${name} here, moving as readers will see it`, { hidden: !playable });
  set('more', `More actions for ${name}: move, duplicate or delete`);
  set('up', `Move ${name} up`, { disabled: index === 0 });
  set('down', `Move ${name} down`, { disabled: index === count - 1 });
  set('dup', `Duplicate ${name}`);
  set('del', `Delete ${name}`);
  // What still needs doing in this block: the same list as the rail's amber dot and the settings.
  const n = todo.length;
  const t = set('todo', `${n} to do in ${name}: ${todo.join(' ')} Opens the settings.`, { hidden: !n });
  t.textContent = `${n} to do`;
  t.title = todo.join('\n');
}

export function closeMore(tools, refocus = false) {
  const menu = tools.querySelector('.canvas-more-menu');
  const btn = tools.querySelector('[data-act="more"]');
  if (!menu || menu.hidden) return;
  menu.hidden = true;
  btn?.setAttribute('aria-expanded', 'false');
  if (refocus) btn?.focus();
}

export function toggleMore(tools) {
  const menu = tools.querySelector('.canvas-more-menu');
  const btn = tools.querySelector('[data-act="more"]');
  if (!menu || !btn) return;
  const open = menu.hidden;
  menu.hidden = !open;
  btn.setAttribute('aria-expanded', String(open));
  if (open) {
    const first = [...menu.querySelectorAll('button')].find((b) => !b.hidden && !b.disabled);
    first?.focus();
  }
}

export function toolbarKeys(tools) {
  tools.addEventListener('keydown', (e) => {
    const menu = tools.querySelector('.canvas-more-menu');
    if (menu && !menu.hidden && menu.contains(document.activeElement)) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeMore(tools, true); return; }
      const items = [...menu.querySelectorAll('button')].filter((b) => !b.hidden && !b.disabled);
      const idx = items.indexOf(document.activeElement);
      const next = { ArrowDown: idx + 1, ArrowRight: idx + 1, ArrowUp: idx - 1, ArrowLeft: idx - 1, Home: 0, End: items.length - 1 }[e.key];
      if (next !== undefined && idx >= 0) {
        e.preventDefault();
        items[(next + items.length) % items.length].focus();
      }
      return;
    }
    if (e.key === 'ArrowDown' && document.activeElement?.dataset.act === 'more') {
      e.preventDefault();
      if (menu?.hidden) toggleMore(tools);
      return;
    }
    const buttons = [...tools.querySelectorAll(':scope > button, .canvas-more-wrap > button')].filter((b) => !b.hidden && !b.disabled);
    const i = buttons.indexOf(document.activeElement);
    const to = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: buttons.length - 1 }[e.key];
    if (to === undefined || i < 0) return;
    e.preventDefault();
    buttons[(to + buttons.length) % buttons.length].focus();
  });
}
