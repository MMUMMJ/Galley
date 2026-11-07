// Prompt packs: a course's settings for the editor, loaded with ?pack=packs/<name>.json.
// Every key is optional. A pack can limit the block menu, replace craft prompts, set
// reflection questions, switch maker's notes on or off, require effect notes, and give
// an empty story a skeleton to start from.
import { BLOCK_TYPES, createStory, createBlock } from './model.js';
import { BLOCKS } from './blocks/index.js';

const PACK_PATH = /^packs\/[A-Za-z0-9_-]+\.json$/; // packs live in this site's packs/ folder only
const EFFECT_NOTES = ['off', 'optional', 'required'];
const SOURCING = ['inline', 'references', 'both'];

const DEFAULT_PACK = Object.freeze({
  path: null, name: '', blocks: BLOCK_TYPES, prompts: {}, reflection: [], includeNotes: true,
  skeleton: [], effectNotes: 'optional', sourcing: 'both', requireShowpiece: 0, maxExportMB: 100,
});

let current = DEFAULT_PACK;

export const getPack = () => current;
export const SHOWPIECES = ['scrolly', 'compare', 'number'];

export function isPackPath(path) {
  return typeof path === 'string' && PACK_PATH.test(path);
}

// Keeps only well-formed values, so a typo in a pack can't break the editor.
export function normalisePack(raw, path = null) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const str = (v) => (typeof v === 'string' ? v.trim() : '');
  const blocks = Array.isArray(r.blocks) ? r.blocks.filter((t) => BLOCK_TYPES.includes(t)) : [];
  const prompts = {};
  if (r.prompts && typeof r.prompts === 'object') {
    for (const [type, text] of Object.entries(r.prompts)) if (BLOCK_TYPES.includes(type) && str(text)) prompts[type] = str(text);
  }
  const reflection = (Array.isArray(r.reflection) ? r.reflection : [])
    .map((q) => str(typeof q === 'string' ? q : q && q.q)).filter(Boolean);
  const skeleton = (Array.isArray(r.skeleton) ? r.skeleton : [])
    .filter((item) => item && typeof item === 'object' && BLOCK_TYPES.includes(item.type));
  const num = (v, fallback) => (Number.isFinite(v) && v >= 0 ? v : fallback);
  return Object.freeze({
    path,
    name: str(r.name),
    blocks: blocks.length ? blocks : BLOCK_TYPES,
    prompts,
    reflection,
    includeNotes: r.includeNotes !== false,
    skeleton,
    effectNotes: EFFECT_NOTES.includes(r.effectNotes) ? r.effectNotes : 'optional',
    sourcing: SOURCING.includes(r.sourcing) ? r.sourcing : 'both',
    requireShowpiece: Math.floor(num(r.requireShowpiece, 0)),
    maxExportMB: num(r.maxExportMB, 100),
  });
}

// Fetches a pack from this site. Throws with a readable message if it can't.
export async function loadPack(path) {
  if (!isPackPath(path)) throw new Error(`"${path}" isn't a pack in this site's packs folder.`);
  const res = await fetch(new URL(path, document.baseURI));
  if (!res.ok) throw new Error(`The pack "${path}" couldn't be loaded (HTTP ${res.status}).`);
  let raw;
  try { raw = await res.json(); } catch { throw new Error(`The pack "${path}" isn't valid JSON.`); }
  return normalisePack(raw, path);
}

export function setPack(pack) {
  current = pack || DEFAULT_PACK;
}

// The craft prompt for a block type: the pack's own, or the block's default.
export function promptFor(type) {
  return current.prompts[type] || BLOCKS[type]?.prompt || '';
}

export const allowedBlocks = () => current.blocks;

// Turns a skeleton entry into a block. Keys other than "type" go into the block's data;
// "heading" on a text block becomes a "## " subheading line.
function skeletonBlock(item) {
  const { type, heading, ...data } = item;
  if (type === 'text' && typeof heading === 'string' && heading.trim() && data.body === undefined) {
    data.body = `## ${heading.trim()}\n`;
  }
  return createBlock(type, data);
}

// Adds the pack's reflection questions that the story doesn't already have.
export function withReflection(story, pack = current) {
  const have = new Set(story.reflection.map((r) => r.q));
  for (const q of pack.reflection) if (!have.has(q)) story.reflection.push({ q, a: '' });
  return story;
}

// Brings a story in line with the pack: records the pack, adds its reflection
// questions, and fills in the skeleton only if the story has no blocks.
export function applyPack(story, pack = current) {
  story.meta.pack = pack.path;
  if (!story.blocks.length && pack.skeleton.length) story.blocks = pack.skeleton.map(skeletonBlock);
  return withReflection(story, pack);
}

export function startStory(pack = current) {
  return applyPack(createStory(), pack);
}

export const showpieceCount = (story) => story.blocks.filter((b) => SHOWPIECES.includes(b.type)).length;

// Everything still to do for a block: the block's own checks, plus the pack's rules.
export function blockIssues(block, story) {
  const mod = BLOCKS[block.type];
  let issues = [];
  try { issues = (mod && mod.validate(block.data, story)) || []; } catch { issues = []; }
  if (current.effectNotes === 'required' && block.effect && block.effect !== 'none' && !(block.effectNote || '').trim()) {
    issues = [...issues, 'What does this movement do for the reader? Add an effect note.'];
  }
  return issues;
}
