// Form controls for the inspector. Each one reads its starting value from
// ctx.block.data and writes changes back through ctx (see inspector.js).
import { h } from './dom.js';
import { LICENCES } from '../model.js';
import { formatBytes, kindOfMime } from '../media.js';

let uid = 0;
const nextId = (key) => `f-${key}-${++uid}`;

function wrap(id, label, hint, control) {
  const hintId = hint ? `${id}-hint` : null;
  if (hintId) control.setAttribute('aria-describedby', hintId);
  return h('div', { class: 'field' },
    h('label', { for: id }, label),
    hint ? h('p', { class: 'field-hint', id: hintId }, hint) : null,
    control);
}

export function textInput(ctx, key, { label, hint, placeholder, type = 'text' } = {}) {
  const id = nextId(key);
  const input = h('input', {
    id, type, value: ctx.block.data[key] || '', placeholder, 'data-focus': `${ctx.block.id}:${key}`,
    autocomplete: 'off', oninput: (e) => ctx.set(key, e.target.value),
  });
  return wrap(id, label, hint, input);
}

export function textArea(ctx, key, { label, hint, rows = 4, placeholder, lines = false } = {}) {
  const id = nextId(key);
  const value = ctx.block.data[key];
  const area = h('textarea', {
    id, rows, placeholder, 'data-focus': `${ctx.block.id}:${key}`,
    value: lines && Array.isArray(value) ? value.join('\n') : value || '',
    oninput: (e) => ctx.set(key, lines ? e.target.value.split('\n') : e.target.value),
  });
  return wrap(id, label, hint, area);
}

export function selectInput(ctx, key, { label, hint, options, fallback }) {
  const id = nextId(key);
  const current = ctx.block.data[key] ?? fallback;
  const select = h('select', {
    id, 'data-focus': `${ctx.block.id}:${key}`,
    onchange: (e) => ctx.set(key, e.target.value, { rerender: true }),
  }, options.map(([value, text]) => h('option', { value, selected: value === current }, text)));
  return wrap(id, label, hint, select);
}

export function checkbox(ctx, key, { label, hint }) {
  const id = nextId(key);
  const hintId = hint ? `${id}-hint` : null;
  return h('div', { class: 'field field-check' },
    h('input', {
      id, type: 'checkbox', checked: Boolean(ctx.block.data[key]), 'data-focus': `${ctx.block.id}:${key}`,
      'aria-describedby': hintId, onchange: (e) => ctx.set(key, e.target.checked, { rerender: true }),
    }),
    h('label', { for: id }, label),
    hint ? h('p', { class: 'field-hint', id: hintId }, hint) : null);
}

export function help(text) {
  return h('p', { class: 'inspector-help' }, text);
}

// A hidden file input driven by a normal button, so it works by keyboard and on iPad.
export function fileButton(ctx, { label, accept, multiple = false, focusKey, onFiles }) {
  const input = h('input', {
    type: 'file', accept, multiple, class: 'sr-only', tabindex: '-1', 'aria-hidden': 'true',
    onchange: async (e) => {
      const files = Array.from(e.target.files || []);
      e.target.value = '';
      if (files.length) await onFiles(files);
    },
  });
  const button = h('button', {
    type: 'button', class: 'btn', 'data-focus': focusKey, onclick: () => input.click(),
  }, label);
  return h('span', { class: 'file-button' }, button, input);
}

export const ACCEPT = {
  image: 'image/*',
  imageVideo: 'image/*,video/*,.mov',
  media: 'image/*,video/*,audio/*,.mov,.m4a,.mp3,.wav',
};

export function assetKind(asset) {
  return asset ? kindOfMime(asset.mime) || 'image' : null;
}

export function thumb(ctx, assetId) {
  const asset = ctx.story.assets[assetId];
  const kind = assetKind(asset);
  if (kind === 'image' && ctx.assetUrl(assetId)) {
    return h('img', { class: 'thumb', src: ctx.assetUrl(assetId), alt: '' });
  }
  return h('span', { class: 'thumb thumb-icon', 'aria-hidden': 'true' }, kind === 'video' ? '▶' : kind === 'audio' ? '♪' : '?');
}

// A grid of compact thumbnail cards for choosing a file already in the story.
export function assetBrowser(ctx, entries, { label, focusKey, onPick }) {
  if (!entries.length) return null;
  const labelId = nextId('asset-browser');
  const grid = h('div', { class: 'rte-pick', role: 'group', 'aria-labelledby': label ? labelId : null },
    entries.map(([id, a]) => h('button', {
      type: 'button',
      'data-focus': `${focusKey}:${id}`,
      title: a.name || id,
      onclick: () => onPick(id, a),
    }, thumb(ctx, id), h('span', {}, a.name || id))));
  grid.addEventListener('keydown', (e) => {
    const cards = [...grid.querySelectorAll('button')];
    const i = cards.indexOf(document.activeElement);
    if (i < 0) return;
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (step) { e.preventDefault(); cards[(i + step + cards.length) % cards.length].focus(); }
    else if (e.key === 'Home') { e.preventDefault(); cards[0].focus(); }
    else if (e.key === 'End') { e.preventDefault(); cards[cards.length - 1].focus(); }
  });
  return h('div', { class: 'field asset-browser' },
    label ? h('p', { class: 'field-hint asset-browser-label', id: labelId }, label) : null,
    grid);
}

// Pick a file for data[key]: import a new one, or reuse one already in the story.
// kinds: which asset kinds are allowed, e.g. ['image'].
// onSet(data, asset): optional extra changes when a file is chosen.
export function assetPicker(ctx, key, { label, kinds = ['image'], onSet } = {}) {
  const current = ctx.block.data[key];
  const asset = current ? ctx.story.assets[current] : null;
  const fit = (a) => kinds.includes(assetKind(a));
  // isNew: the file was just imported, so add it to the story in the same undo step.
  const choose = (id, asset2, isNew) => ctx.edit((data, story) => {
    if (isNew) story.assets[id] = asset2;
    data[key] = id;
    if (onSet && asset2) onSet(data, asset2);
  }, { rerender: true });

  const others = Object.entries(ctx.story.assets).filter(([id, a]) => id !== current && fit(a));
  const kindsText = kinds.length === 1 ? `an ${kinds[0]}`
    : kinds.length === 2 && kinds.includes('image') && kinds.includes('video') ? 'an image or video file'
      : 'an image, video or audio file';
  const accept = kinds.length === 1 && kinds[0] === 'image' ? ACCEPT.image
    : kinds.length === 2 && kinds.includes('image') && kinds.includes('video') ? ACCEPT.imageVideo
      : ACCEPT.media;

  return h('fieldset', { class: 'field asset-picker' },
    h('legend', {}, label),
    asset
      ? h('div', { class: 'asset-current' }, thumb(ctx, current),
        h('span', {}, h('strong', {}, asset.name || 'Untitled file'), h('br'), `${assetKind(asset)} · ${formatBytes(asset.bytes)}`))
      : h('p', { class: 'field-hint' }, `No file chosen. Import ${kindsText}.`),
    h('div', { class: 'button-row' },
      fileButton(ctx, {
        label: asset ? 'Replace with a new file…' : 'Import a file…',
        accept,
        focusKey: `${ctx.block.id}:${key}:import`,
        onFiles: async (files) => {
          const [added] = await ctx.importFiles(files.slice(0, 1), kinds);
          if (added) choose(added.id, added.asset, true);
        },
      }),
      asset ? h('button', {
        type: 'button', class: 'btn', 'data-focus': `${ctx.block.id}:${key}:remove`,
        onclick: () => { choose(null); ctx.announce('File removed from this block. It stays in your story\'s files.'); },
      }, 'Remove file') : null),
    assetBrowser(ctx, others, {
      label: 'Or use a file already in this story:',
      focusKey: `${ctx.block.id}:${key}:existing`,
      onPick: (id, a) => { choose(id, a); ctx.announce(`${a.name || 'File'} chosen.`); },
    }),
    asset ? assetDetails(ctx, current) : null);
}

// Alt text, caption, credit and licence belong to the file, so they follow it
// into every block that uses it.
export function assetDetails(ctx, assetId) {
  const asset = ctx.story.assets[assetId];
  if (!asset) return null;
  const kind = assetKind(asset);
  const field = (k, label, hint, multi) => {
    const id = nextId(`${assetId}-${k}`);
    const attrs = {
      id, value: asset[k] || '', 'data-focus': `${ctx.block.id}:${assetId}:${k}`,
      oninput: (e) => ctx.setAsset(assetId, k, e.target.value),
    };
    return wrap(id, label, hint, multi ? h('textarea', { ...attrs, rows: 2 }) : h('input', { ...attrs, type: 'text' }));
  };
  const licenceId = nextId(`${assetId}-licence`);
  return h('div', { class: 'asset-details' },
    field('alt', kind === 'image' ? 'Alt text' : 'Description',
      kind === 'image'
        ? 'Describe what the image shows, for readers who can\'t see it. This is not the caption.'
        : `Describe the ${kind} for readers who can't see or hear it.`, true),
    field('caption', 'Caption', 'Shown under the file. Adds context the image can\'t.', true),
    field('credit', 'Credit', 'Who made it, e.g. "Photo: Sam Example".'),
    wrap(licenceId, 'Licence', null, h('select', {
      id: licenceId, 'data-focus': `${ctx.block.id}:${assetId}:licence`,
      onchange: (e) => ctx.setAsset(assetId, 'licence', e.target.value),
    }, h('option', { value: '' }, 'Not set'), LICENCES.map((l) => h('option', { value: l, selected: l === asset.licence }, l)))));
}

// A context pointed at an object nested inside the block's data, such as
// data.steps[2] or data.before, so the usual fields can edit it.
// get(data) must return that object; focusId keeps focus keys unique.
export function nested(ctx, get, focusId) {
  const id = `${ctx.block.id}:${focusId}`;
  return {
    ...ctx,
    block: { id, data: get(ctx.block.data) || {} },
    edit: (fn, opts = {}) => ctx.edit((data, story) => fn(get(data), story), opts),
    set: (key, value, opts = {}) => ctx.edit((data) => { get(data)[key] = value; }, {
      rerender: opts.rerender,
      coalesce: opts.rerender ? null : `${id}:${key}`,
    }),
  };
}
