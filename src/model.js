// Galley story model: schema, defaults, validation and migrations.
//
// The story is data. Everything the editor and the runtime know about a story
// lives in the object described here; nothing else is saved or exported.

export const SCHEMA_VERSION = 1;

// Must match RUNTIME_VERSION in runtime/galley-runtime.js.
// test/runtime.html flags any mismatch.
export const RUNTIME_VERSION = '1.16.0';

export const BLOCK_TYPES = ['header', 'text', 'columns', 'quote', 'media', 'gallery', 'embed', 'divider', 'references', 'scrolly', 'scrollpoints', 'compare', 'number'];
export const SCROLLY_LAYOUTS = ['side', 'overlay', 'column'];
export const COLUMN_MODES = ['separate', 'flow'];
export const SCROLLY_BACKDROPS = ['solid', 'vignette', 'none'];
export const SCROLLY_ALIGN = ['left', 'center', 'right']; // overlay and text column: where the text sits
export const SCROLLY_TEXT_SIDE = ['right', 'left']; // side by side: which side the text is on
export const EFFECTS = ['none', 'fade', 'rise', 'slide', 'zoom'];
export const HEADER_VARIANTS = ['full', 'compact'];
export const MEDIA_KINDS = ['image', 'video', 'audio'];
export const MEDIA_WIDTHS = ['column', 'wide', 'full'];
// Must match SCHEMES in runtime/galley-runtime.js (test/runtime.html checks).
export const SCHEME_IDS = ['house', 'wire', 'longread', 'magazine', 'nightdesk', 'investigation'];
export const BAND_SCHEME_COLOURS = ['tint', 'ink', 'accent'];
export const LICENCES = ['Own work', 'CC BY', 'CC BY-SA', 'CC BY-NC', 'OGL', 'Used with permission', 'Other'];

const META_STRINGS = ['title', 'standfirst', 'byline', 'seoTitle', 'seoDescription', 'shareText', 'created', 'modified'];
const ASSET_STRINGS = ['name', 'mime', 'alt', 'caption', 'credit', 'licence'];
const ID_PATTERN = /^[A-Za-z0-9_-]+$/;

// ---------------------------------------------------------------- defaults

// Functions, so each call returns fresh objects that are safe to mutate.
const BLOCK_DATA = {
  header: () => ({ variant: 'full', kicker: '', title: '', standfirst: '', byline: '', media: null }),
  text: () => ({ body: '' }),
  quote: () => ({ text: '', cite: '', role: '' }),
  media: () => ({ kind: 'image', asset: null, width: 'column' }),
  gallery: () => ({ items: [], caption: '', width: 'wide' }),
  embed: () => ({ url: '', title: '', description: '', screenshot: null, width: 'column' }),
  columns: () => ({ mode: 'separate', count: 2, width: 'wide', col1: '', col2: '', col3: '', body: '' }),
  divider: () => ({ text: '' }),
  references: () => ({ title: 'References', items: [], collapsed: false }),
  // Showpiece blocks (Phase 5)
  scrolly: () => ({ layout: 'side', align: 'center', textSide: 'right', backdrop: 'solid', steps: [{ media: null, text: '', align: 'center' }, { media: null, text: '', align: 'center' }] }),
  scrollpoints: () => ({
    asset: null,
    steps: [
      { text: '', align: 'auto', focus: false, x: 50, y: 50, w: 30, h: 30 },
      { text: '', align: 'auto', focus: true, x: 40, y: 40, w: 30, h: 30 },
    ],
  }),
  compare: () => ({ before: { asset: null, label: '' }, after: { asset: null, label: '' }, caption: '', width: 'wide' }),
  number: () => ({ value: '', unit: '', context: '', sourceName: '', sourceRef: '' }),
};

export function newId(prefix) {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return `${prefix}_${Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('')}`;
}

export function blockDefaults(type) {
  const make = BLOCK_DATA[type];
  if (!make) throw new Error(`Unknown block type "${type}".`);
  return make();
}

export function createBlock(type, data = {}) {
  return { id: newId('b'), type, effect: 'none', effectNote: '', note: '', background: null, data: { ...blockDefaults(type), ...data } };
}

export function createMeta(now = new Date().toISOString()) {
  return {
    title: '', standfirst: '', byline: '', seoTitle: '', seoDescription: '',
    shareImage: null, shareText: '', pack: null, created: now, modified: now,
    appendix: false, // add maker's notes and reflection to the end of the export (Phase 7)
    theme: 'house', // colour scheme
  };
}

export function createAsset(fields = {}) {
  return {
    name: '', mime: '', bytes: 0, alt: '', caption: '', credit: '', licence: '',
    width: null, height: null, // optional pixel size, for images and video
    ...fields,
  };
}

export function createStory(now = new Date().toISOString()) {
  return {
    schemaVersion: SCHEMA_VERSION,
    runtimeVersion: RUNTIME_VERSION,
    meta: createMeta(now),
    blocks: [],
    assets: {},
    reflection: [],
  };
}

// ---------------------------------------------------------------- migrations

// MIGRATIONS[n] turns a version-n story into a version-(n+1) story.
// Add one entry per schema change; never edit an old entry.
const MIGRATIONS = {
  // 1: (s) => { ...; s.schemaVersion = 2; return s; },
};

export function migrate(input) {
  if (!isObj(input)) throw new Error('This file does not contain a Galley story.');
  const version = input.schemaVersion;
  if (!Number.isInteger(version) || version < 1) {
    throw new Error('This file does not contain a Galley story (no schemaVersion).');
  }
  if (version > SCHEMA_VERSION) {
    throw new Error(`This story was made with a newer version of Galley (schema ${version}). Reload the editor to update it.`);
  }
  let story = structuredClone(input);
  for (let v = version; v < SCHEMA_VERSION; v++) {
    const step = MIGRATIONS[v];
    if (!step) throw new Error(`No migration from schema ${v} to ${v + 1}.`);
    story = step(story);
  }
  return story;
}

// ---------------------------------------------------------------- normalise

// Fills in anything missing so the rest of the editor can rely on the shape.
// Keeps unknown block types and unknown data keys, so nothing a student made is lost.
export function normalise(input) {
  const s = isObj(input) ? input : {};
  const meta = { ...createMeta(''), ...(isObj(s.meta) ? s.meta : {}) };
  if (!SCHEME_IDS.includes(meta.theme)) meta.theme = 'house';

  const seen = new Set();
  const blocks = (Array.isArray(s.blocks) ? s.blocks : []).filter(isObj).map((b) => {
    let id = typeof b.id === 'string' && ID_PATTERN.test(b.id) ? b.id : newId('b');
    if (seen.has(id)) id = newId('b');
    seen.add(id);
    const defaults = BLOCK_DATA[b.type] ? BLOCK_DATA[b.type]() : {};
    return {
      id,
      type: typeof b.type === 'string' ? b.type : '',
      effect: EFFECTS.includes(b.effect) ? b.effect : 'none',
      effectNote: typeof b.effectNote === 'string' ? b.effectNote : '', // why this block moves (Phase 6)
      note: typeof b.note === 'string' ? b.note : '',
      background: isBackground(b.background) ? b.background : null, // band colour behind the block
      data: { ...defaults, ...(isObj(b.data) ? b.data : {}) },
    };
  });

  const assets = {};
  if (isObj(s.assets)) {
    for (const [id, a] of Object.entries(s.assets)) assets[id] = createAsset(isObj(a) ? a : {});
  }

  const reflection = (Array.isArray(s.reflection) ? s.reflection : [])
    .filter(isObj)
    .map((r) => ({ q: str(r.q), a: str(r.a) }));

  return {
    schemaVersion: SCHEMA_VERSION,
    runtimeVersion: str(s.runtimeVersion) || RUNTIME_VERSION,
    meta, blocks, assets, reflection,
  };
}

// ---------------------------------------------------------------- validate

// Structural validation only: is this a well-formed story?
// Editorial questions (missing alt text, unsourced figures) belong in src/checks/.
export function validate(story) {
  const errors = [];
  const warnings = [];
  const err = (path, message) => errors.push({ path, message });
  const warn = (path, message) => warnings.push({ path, message });

  if (!isObj(story)) return { errors: [{ path: '', message: 'A story must be an object.' }], warnings };
  if (story.schemaVersion !== SCHEMA_VERSION) err('schemaVersion', `Expected schema ${SCHEMA_VERSION}.`);
  if (typeof story.runtimeVersion !== 'string') err('runtimeVersion', 'Must be a version string.');

  const assets = isObj(story.assets) ? story.assets : {};
  const ref = (id, path) => {
    if (id === null || id === undefined || id === '') return;
    if (typeof id !== 'string' || !Object.hasOwn(assets, id)) err(path, `Asset "${id}" isn't in this story.`);
  };
  const oneOf = (value, list, path) => {
    if (!list.includes(value)) err(path, `Must be one of: ${list.join(', ')}.`);
  };
  const isString = (value, path) => {
    if (typeof value !== 'string') err(path, 'Must be text.');
  };

  if (!isObj(story.meta)) err('meta', 'Must be an object.');
  else {
    for (const k of META_STRINGS) isString(story.meta[k], `meta.${k}`);
    ref(story.meta.shareImage, 'meta.shareImage');
    if (story.meta.pack !== null && typeof story.meta.pack !== 'string') err('meta.pack', 'Must be null or text.');
    if (typeof story.meta.appendix !== 'boolean') err('meta.appendix', 'Must be true or false.');
    oneOf(story.meta.theme, SCHEME_IDS, 'meta.theme');
  }

  if (!Array.isArray(story.blocks)) err('blocks', 'Must be a list.');
  else {
    const ids = new Set();
    let headers = 0;
    story.blocks.forEach((b, i) => {
      const p = `blocks[${i}]`;
      if (!isObj(b)) return err(p, 'Each block must be an object.');
      if (typeof b.id !== 'string' || !ID_PATTERN.test(b.id)) err(`${p}.id`, 'Missing or malformed block id.');
      else if (ids.has(b.id)) err(`${p}.id`, `Duplicate block id "${b.id}".`);
      ids.add(b.id);
      if (!BLOCK_TYPES.includes(b.type)) err(`${p}.type`, `Unknown block type "${b.type}".`);
      oneOf(b.effect, EFFECTS, `${p}.effect`);
      isString(b.effectNote, `${p}.effectNote`);
      isString(b.note, `${p}.note`);
      if (b.background !== null && !isBackground(b.background)) err(`${p}.background`, 'Must be empty, a scheme colour, or #rrggbb.');
      if (!isObj(b.data)) return err(`${p}.data`, 'Must be an object.');
      const rule = BLOCK_RULES[b.type];
      if (rule) rule(b.data, `${p}.data`, { err, ref, oneOf, isString });
      if (b.type === 'header') {
        headers++;
        if (headers > 1 && b.data.variant === 'full') {
          warn(`${p}.data.variant`, 'A full-screen header works best as the first header. Later headers are usually compact.');
        }
      }
    });
  }

  if (!isObj(story.assets)) err('assets', 'Must be an object.');
  else {
    for (const [id, a] of Object.entries(story.assets)) {
      const p = `assets.${id}`;
      if (!ID_PATTERN.test(id)) err(p, 'Malformed asset id.');
      if (!isObj(a)) { err(p, 'Must be an object.'); continue; }
      for (const k of ASSET_STRINGS) isString(a[k], `${p}.${k}`);
      if (typeof a.bytes !== 'number' || a.bytes < 0) err(`${p}.bytes`, 'Must be a number of bytes.');
      if (a.licence && !LICENCES.includes(a.licence)) err(`${p}.licence`, `Must be one of: ${LICENCES.join(', ')}.`);
    }
  }

  if (!Array.isArray(story.reflection)) err('reflection', 'Must be a list.');
  else story.reflection.forEach((r, i) => {
    if (!isObj(r) || typeof r.q !== 'string' || typeof r.a !== 'string') err(`reflection[${i}]`, 'Must have text fields q and a.');
  });

  return { errors, warnings };
}

const BLOCK_RULES = {
  header(d, p, v) {
    v.oneOf(d.variant, HEADER_VARIANTS, `${p}.variant`);
    for (const k of ['kicker', 'title', 'standfirst', 'byline']) v.isString(d[k], `${p}.${k}`);
    v.ref(d.media, `${p}.media`);
  },
  text(d, p, v) {
    v.isString(d.body, `${p}.body`);
    checkInlineImages(d.body, `${p}.body`, v);
  },
  columns(d, p, v) {
    v.oneOf(d.mode, COLUMN_MODES, `${p}.mode`);
    if (d.count !== 2 && d.count !== 3) v.err(`${p}.count`, 'Must be 2 or 3.');
    v.oneOf(d.width, ['column', 'wide'], `${p}.width`);
    for (const k of ['col1', 'col2', 'col3', 'body']) {
      v.isString(d[k], `${p}.${k}`);
      checkInlineImages(d[k], `${p}.${k}`, v);
    }
  },
  quote(d, p, v) { for (const k of ['text', 'cite', 'role']) v.isString(d[k], `${p}.${k}`); },
  media(d, p, v) {
    v.oneOf(d.kind, MEDIA_KINDS, `${p}.kind`);
    v.oneOf(d.width, MEDIA_WIDTHS, `${p}.width`);
    v.ref(d.asset, `${p}.asset`);
  },
  gallery(d, p, v) {
    if (!Array.isArray(d.items)) v.err(`${p}.items`, 'Must be a list of asset ids.');
    else d.items.forEach((id, i) => v.ref(id, `${p}.items[${i}]`));
    v.isString(d.caption, `${p}.caption`);
    v.oneOf(d.width, MEDIA_WIDTHS, `${p}.width`);
  },
  embed(d, p, v) {
    for (const k of ['url', 'title', 'description']) v.isString(d[k], `${p}.${k}`);
    v.ref(d.screenshot, `${p}.screenshot`);
    v.oneOf(d.width, MEDIA_WIDTHS, `${p}.width`);
  },
  divider(d, p, v) { v.isString(d.text, `${p}.text`); },
  scrolly(d, p, v) {
    v.oneOf(d.layout, SCROLLY_LAYOUTS, `${p}.layout`);
    v.oneOf(d.align, SCROLLY_ALIGN, `${p}.align`);
    v.oneOf(d.textSide, SCROLLY_TEXT_SIDE, `${p}.textSide`);
    if (d.backdrop !== undefined) v.oneOf(d.backdrop, SCROLLY_BACKDROPS, `${p}.backdrop`);
    if (!Array.isArray(d.steps)) return v.err(`${p}.steps`, 'Must be a list of steps.');
    d.steps.forEach((step, i) => {
      if (!step || typeof step !== 'object') return v.err(`${p}.steps[${i}]`, 'Each step must be an object.');
      v.isString(step.text, `${p}.steps[${i}].text`);
      checkInlineImages(step.text, `${p}.steps[${i}].text`, v);
      v.ref(step.media, `${p}.steps[${i}].media`);
      if (step.align !== undefined) v.oneOf(step.align, SCROLLY_ALIGN, `${p}.steps[${i}].align`);
    });
  },
  scrollpoints(d, p, v) {
    v.ref(d.asset, `${p}.asset`);
    if (!Array.isArray(d.steps)) return v.err(`${p}.steps`, 'Must be a list of steps.');
    d.steps.forEach((step, i) => {
      const sp = `${p}.steps[${i}]`;
      if (!step || typeof step !== 'object') return v.err(sp, 'Each step must be an object.');
      v.isString(step.text, `${sp}.text`);
      checkInlineImages(step.text, `${sp}.text`, v);
      if (step.align !== undefined) v.oneOf(step.align, [...SCROLLY_ALIGN, 'auto'], `${sp}.align`); // auto: away from the highlight
      if (step.focus !== undefined && typeof step.focus !== 'boolean') v.err(`${sp}.focus`, 'Must be true or false.');
      for (const [k, min, max] of [['x', 0, 100], ['y', 0, 100], ['w', 5, 100], ['h', 5, 100]]) {
        if (step[k] !== undefined && (typeof step[k] !== 'number' || !Number.isFinite(step[k]) || step[k] < min || step[k] > max)) {
          v.err(`${sp}.${k}`, `Must be a number between ${min} and ${max}.`);
        }
      }
    });
  },
  compare(d, p, v) {
    for (const side of ['before', 'after']) {
      const s = d[side];
      if (!s || typeof s !== 'object') { v.err(`${p}.${side}`, 'Must be an object.'); continue; }
      v.ref(s.asset, `${p}.${side}.asset`);
      v.isString(s.label, `${p}.${side}.label`);
    }
    v.isString(d.caption, `${p}.caption`);
    v.oneOf(d.width, MEDIA_WIDTHS, `${p}.width`);
  },
  number(d, p, v) {
    for (const k of ['value', 'unit', 'context', 'sourceName', 'sourceRef']) v.isString(d[k], `${p}.${k}`);
  },
  references(d, p, v) {
    v.isString(d.title, `${p}.title`);
    if (!Array.isArray(d.items) || d.items.some((x) => typeof x !== 'string')) v.err(`${p}.items`, 'Must be a list of text.');
    if (typeof d.collapsed !== 'boolean') v.err(`${p}.collapsed`, 'Must be true or false.');
  },
};

// ---------------------------------------------------------------- load

// The one entry point for anything coming from outside (IndexedDB, a file, a fixture).
export function load(input) {
  const story = normalise(migrate(input));
  return { story, ...validate(story) };
}

// A block background: null, a scheme colour that follows the story's scheme, or any #rrggbb colour.
export function isBackground(v) {
  return v === null || BAND_SCHEME_COLOURS.includes(v) || (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v));
}

const INLINE_IMAGE = /^\s*!\[[^\]]*\]\(asset:([A-Za-z0-9_-]+)(?:\s+"(?:left|right)")?\)\s*$/gm;
function checkInlineImages(text, path, v) {
  if (typeof text !== 'string') return;
  for (const m of text.matchAll(INLINE_IMAGE)) v.ref(m[1], path);
}

function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function str(v) { return typeof v === 'string' ? v : ''; }
