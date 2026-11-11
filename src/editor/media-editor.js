// One media editor for the canvas, block settings, text editors and Checks.
// Only the occurrence changes on Replace; descriptive metadata belongs to the reusable file.
import { h, preserveFocus } from './dom.js';
import { LICENCES } from '../model.js';
import { kindOfMime } from '../media.js';
import { mediaTargets, sameTarget, replaceTarget } from './media-targets.js';

let controller = null;
export const openMediaEditor = (options) => controller?.open(options) || false;
export const closeMediaEditor = () => controller?.close();
export const mediaEditorContains = (el) => Boolean(controller?.contains(el));

export function mountMediaEditor(store, { importFiles, assetUrl, announce, toast, openSettings }) {
  const dialog = h('dialog', { class: 'media-editor', 'aria-labelledby': 'media-editor-title' });
  document.body.append(dialog);
  let current = null;
  let returnTo = null;
  let session = 0;
  let replacing = false;
  const block = () => store.story.blocks.find((b) => b.id === current?.blockId);
  const resolve = () => mediaTargets(block()).find((t) => sameTarget(t, current));
  const nameOf = (b) => ({ textcolumn: 'Text column', scrollpoints: 'Scrollpoints', scrolly: 'Scroll sequence', compare: 'Before and after' }[b?.type]
    || (b?.type ? b.type[0].toUpperCase() + b.type.slice(1) : 'Block'));

  function restoreFocus() {
    const focusKey = returnTo?.dataset.focus;
    const mediaPath = returnTo?.dataset.mediaPath;
    const next = returnTo?.isConnected ? returnTo : focusKey
      ? document.querySelector(`[data-focus="${CSS.escape(focusKey)}"]`) : null;
    const sameOccurrence = mediaPath !== undefined
      ? document.querySelector(`#inspector [data-media-path="${CSS.escape(mediaPath)}"]`) : null;
    const fallback = document.querySelector(`.rail-item[data-id="${CSS.escape(store.selected || '')}"]`)
      || document.querySelector('#inspector');
    const back = next || sameOccurrence;
    (back && !back.closest('[inert]') ? back : fallback)?.focus({ preventScroll: true });
  }
  function close(refocus = true) {
    if (!dialog.open) return;
    dialog.close();
    current = null;
    session++;
    replacing = false;
    document.querySelectorAll('.media-selected').forEach((el) => el.classList.remove('media-selected'));
    if (refocus) restoreFocus();
  }
  dialog.addEventListener('cancel', (e) => { e.preventDefault(); close(); });

  function render() {
    const target = current && resolve();
    const asset = target && store.story.assets[target.assetId];
    if (!asset) { close(); return; }
    current = target;
    const b = block();
    const kind = kindOfMime(asset.mime) || 'image';
    const id = target.assetId;
    const uses = store.story.blocks.flatMap(mediaTargets).filter((t) => t.assetId === id).length;
    const set = (key, value) => store.update((s) => {
      if (s.assets[id]) s.assets[id][key] = value;
    }, { from: 'media-editor', coalesce: `media:${session}:${id}:${key}` });
    const field = (key, label, hint, multiline = false) => {
      const fid = `media-editor-${key}`;
      return h('div', { class: 'field' }, h('label', { for: fid }, label),
        h('p', { class: 'field-hint', id: `${fid}-hint` }, hint),
        h(multiline ? 'textarea' : 'input', { id: fid, ...(multiline ? { rows: 2 } : { type: 'text' }),
          value: asset[key] || '', 'data-focus': key, 'aria-describedby': `${fid}-hint`,
          oninput: (e) => set(key, e.target.value) }));
    };
    const input = h('input', { type: 'file', class: 'sr-only', tabindex: '-1', 'aria-hidden': 'true',
      accept: target.kinds.map((k) => `${k}/*`).join(','), onchange: async (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file || replacing) return;
        const started = session;
        const original = { ...target };
        replacing = true;
        replace.disabled = true;
        replace.textContent = 'Importing…';
        try {
          const [added] = await importFiles([file], target.kinds);
          if (!added || session !== started || !dialog.open) return;
          const now = mediaTargets(block()).find((t) => sameTarget(t, original));
          if (!now || now.assetId !== original.assetId) {
            toast('This media changed while the file was importing. Select it again to replace it.', { tone: 'warning' }); return;
          }
          const before = store.story.assets[original.assetId];
          const sameKind = kindOfMime(before.mime) === kindOfMime(added.asset.mime);
          const keys = sameKind ? ['alt', 'caption', 'credit', 'licence'] : ['caption', 'credit', 'licence'];
          store.update((s) => {
            s.assets[added.id] = { ...added.asset, ...Object.fromEntries(keys.map((k) => [k, before[k] || ''])) };
            replaceTarget(s, original, added.id);
          }, { from: 'media-replace' });
          announce('Replaced this occurrence. Check its description, caption and credit.');
        } finally {
          if (session === started && dialog.open) {
            replacing = false; render(); dialog.querySelector('#media-editor-alt')?.focus();
          }
        }
      } });
    const replace = h('button', { type: 'button', class: 'btn', disabled: replacing, 'data-focus': 'replace', onclick: () => input.click() }, 'Replace file…');
    const targets = mediaTargets(b);
    const index = targets.findIndex((t) => sameTarget(t, target));
    const step = (delta) => { current = targets[index + delta]; session++; render(); dialog.querySelector('#media-editor-alt')?.focus(); };
    dialog.replaceChildren(
      h('div', { class: 'media-editor-head' },
        h('div', {}, h('p', { class: 'field-hint' }, `${nameOf(b)} · ${target.label}`), h('h2', { id: 'media-editor-title' }, 'Media details')),
        h('button', { type: 'button', class: 'btn', 'data-focus': 'done', onclick: () => close() }, 'Done')),
      h('div', { class: 'media-editor-body' },
        h('div', { class: 'media-editor-file' }, kind === 'image' && assetUrl(id) ? h('img', { src: assetUrl(id), alt: '', class: 'thumb' }) : null,
          h('strong', {}, asset.name || 'Untitled file'), replace, input),
        h('p', { class: 'field-hint media-editor-scope' }, uses > 1
          ? `This file is used ${uses} times. These details change everywhere it is used. Replace changes only this occurrence.`
          : 'These details follow this file if you reuse it. Replace changes only this occurrence.'),
        field('alt', kind === 'image' ? 'Alt text' : 'Description', kind === 'image'
          ? 'Describe what the image shows, for readers who can’t see it. This is not the caption.'
          : `Describe the ${kind} for readers who can’t see or hear it.`, true),
        field('caption', 'Caption', 'Shown with the media where this layout supports a caption.', true),
        field('credit', 'Credit', 'Who made it, e.g. “Photo: Sam Example”.'),
        h('div', { class: 'field' }, h('label', { for: 'media-editor-licence' }, 'Licence'),
          h('select', { id: 'media-editor-licence', 'data-focus': 'licence', onchange: (e) => set('licence', e.target.value) },
            h('option', { value: '' }, 'Not set'), LICENCES.map((l) => h('option', { value: l, selected: l === asset.licence }, l)))),
        h('p', { class: 'field-hint' }, 'Changes save as you type. Undo works here too.')),
      h('div', { class: 'media-editor-foot' },
        h('button', { type: 'button', class: 'btn', 'data-focus': 'block-settings', onclick: () => { const bid = current.blockId; close(false); openSettings(bid); } }, `Back to ${nameOf(b)} settings`),
        targets.length > 1 ? h('div', { class: 'button-row', role: 'group', 'aria-label': 'Media in this block' },
          h('button', { type: 'button', class: 'btn', disabled: index === 0 || replacing, onclick: () => step(-1) }, 'Previous'),
          h('span', {}, `${index + 1} of ${targets.length}`),
          h('button', { type: 'button', class: 'btn', disabled: index === targets.length - 1 || replacing, onclick: () => step(1) }, 'Next')) : null));
  }

  controller = {
    open({ blockId, assetId, path, line, occurrence = 0, focusField = 'alt', returnFocus } = {}) {
      const b = store.story.blocks.find((x) => x.id === blockId);
      const targets = mediaTargets(b).filter((t) => (!assetId || t.assetId === assetId)
        && (!path || t.path.join('.') === path.join('.')) && (line === undefined || t.line === line));
      const target = targets[occurrence];
      if (!target || !store.story.assets[target.assetId]) return false;
      if (dialog.open) close(false);
      store.select(blockId, 'media');
      returnTo = returnFocus || document.activeElement;
      current = target;
      session++;
      render();
      dialog.showModal();
      dialog.querySelector(`#media-editor-${CSS.escape(focusField)}`)?.focus();
      announce(`${nameOf(b)}, ${target.label}. Media details.`);
      return true;
    },
    close,
    contains: (el) => Boolean(el && dialog.open && dialog.contains(el)),
  };
  store.subscribe((change) => {
    if (!dialog.open) return;
    if (store.selected !== current?.blockId || !resolve()) { close(); return; }
    if (change.from !== 'media-editor') preserveFocus(dialog, render);
  });
  return controller;
}
