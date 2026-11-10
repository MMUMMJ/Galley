// The selected block's toolbar on the canvas: which buttons show, and what each says to a
// screen reader. Arrow keys move along it, as in any toolbar.
//   Settings · Edit text · Image · Play · Up · Down · Duplicate · Delete · "2 to do"
export function labelToolbar(tools, { index, count, label, el, hasText, hasMedia, playable, todo }) {
  const name = `Block ${index + 1}, ${label}`;
  const btn = (act) => tools.querySelector(`[data-act="${act}"]`);
  const set = (act, aria, { hidden = false, disabled = false } = {}) => {
    const b = btn(act);
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
  set('play', `Play ${name} here, moving as readers will see it`, { hidden: !playable });
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

export function toolbarKeys(tools) {
  tools.addEventListener('keydown', (e) => {
    const buttons = [...tools.querySelectorAll('button')].filter((b) => !b.hidden && !b.disabled);
    const i = buttons.indexOf(document.activeElement);
    const to = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: buttons.length - 1 }[e.key];
    if (to === undefined || i < 0) return;
    e.preventDefault();
    buttons[(to + buttons.length) % buttons.length].focus();
  });
}
