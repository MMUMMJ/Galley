// Helpers shared by the checks. Checks are pure functions of the story, so they
// can run in the editor and in test/checks.html alike.
import { blockLabel } from '../blocks/index.js';

export const where = (story, blockId) => {
  const i = story.blocks.findIndex((b) => b.id === blockId);
  return i < 0 ? '' : `Block ${i + 1} · ${blockLabel(story.blocks[i].type)}`;
};

// Every piece of student-written prose, with the block it belongs to.
// kind: 'body' (running text, where facts live), 'caption', 'quote', 'reference', 'url'.
export function textSources(story) {
  const out = [];
  const add = (block, text, kind, extra = {}) => {
    if (typeof text === 'string' && text.trim()) out.push({ blockId: block.id, text, kind, ...extra });
  };
  for (const b of story.blocks) {
    const d = b.data || {};
    if (b.type === 'text') add(b, d.body, 'body');
    if (b.type === 'header') add(b, d.standfirst, 'body');
    if (b.type === 'quote') add(b, d.text, 'quote');
    if (b.type === 'scrolly') (d.steps || []).forEach((st, i) => add(b, st && st.text, 'body', { step: i }));
    if (b.type === 'gallery' || b.type === 'compare') add(b, d.caption, 'caption');
    if (b.type === 'number') { add(b, d.context, 'caption'); add(b, d.sourceRef, 'url'); }
    if (b.type === 'embed') add(b, d.url, 'url');
    if (b.type === 'references') (d.items || []).forEach((r) => add(b, r, 'reference'));
  }
  for (const use of assetUses(story)) add({ id: use.blockId }, story.assets[use.assetId]?.caption, 'caption');
  add({ id: 'story-details' }, story.meta.standfirst, 'body');
  return out;
}

// Which asset each block shows, and how.
export function assetUses(story) {
  const uses = [];
  const use = (b, assetId, role) => { if (assetId && story.assets[assetId]) uses.push({ blockId: b.id, assetId, role }); };
  for (const b of story.blocks) {
    const d = b.data || {};
    if (b.type === 'header') use(b, d.media, 'header image');
    if (b.type === 'media') use(b, d.asset, 'media');
    if (b.type === 'gallery') (d.items || []).forEach((id) => use(b, id, 'gallery image'));
    if (b.type === 'embed') use(b, d.screenshot, 'screenshot');
    if (b.type === 'scrolly') (d.steps || []).forEach((st) => use(b, st && st.media, 'scroll image'));
    if (b.type === 'compare') { use(b, d.before?.asset, 'before image'); use(b, d.after?.asset, 'after image'); }
    // Images placed inside running text: ![name](asset:<id>)
    const texts = b.type === 'text' ? [d.body] : b.type === 'scrolly' ? (d.steps || []).map((st) => st && st.text) : [];
    for (const t of texts) for (const m of String(t || '').matchAll(INLINE_IMAGE)) use(b, m[1], 'image in the text');
  }
  return uses;
}

export const INLINE_IMAGE = /^\s*!\[[^\]]*\]\(asset:([A-Za-z0-9_-]+)(?:\s+"(?:left|right)")?\)\s*$/gm;
const stripImages = (text) => String(text || '').replace(INLINE_IMAGE, '');

const MD_LINK = /\[[^\]]*\]\(\s*([^)\s]+)\s*\)/g;
const BARE_URL = /\bhttps?:\/\/[^\s<>)\]]+/g;

export function linksIn(text) {
  const urls = [];
  const s = stripImages(text);
  for (const m of s.matchAll(MD_LINK)) urls.push(m[1]);
  for (const m of s.replace(MD_LINK, ' ').matchAll(BARE_URL)) urls.push(m[0].replace(/[.,;:!?'"]+$/, ''));
  return urls;
}

export const hasLink = (text) => linksIn(text).length > 0;

// Splits prose into sentences: each line on its own, then on . ! ? followed by a space.
export function sentences(text) {
  return stripImages(text).split('\n')
    .map((l) => l.replace(/^\s*(#{1,6}|[-*•]|\d+[.)])\s*/, '').trim())
    .filter(Boolean)
    .flatMap((l) => l.split(/(?<=[.!?])\s+(?=[A-Z0-9"“‘(\[*_])/));
}

export const plain = (text) => stripImages(text)
  .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_#]/g, '').replace(/\s+/g, ' ').trim();

export const wordCount = (text) => (plain(text).match(/[\p{L}\p{N}][\p{L}\p{N}'’.-]*/gu) || []).length;

export const snippet = (text, n = 70) => {
  const p = plain(text);
  return p.length > n ? `${p.slice(0, n - 1)}…` : p;
};

// Author–year citations. Matching uses the first author's surname and the year.
const NAME = "[A-Z][\\p{L}'’-]+(?:\\s+[A-Z][\\p{L}'’-]+)*";
const PAGES = '(?:,?\\s*pp?\\.\\s*[\\d–-]+)?';
const NARRATIVE = new RegExp(`(${NAME})(?:\\s+(?:and|&)\\s+${NAME}|\\s+et al\\.?)?\\s+\\((\\d{4})[a-z]?${PAGES}\\)`, 'gu');
const PAREN_PART = new RegExp(`^(${NAME})(?:\\s+(?:and|&)\\s+${NAME}|\\s+et al\\.?)?,?\\s+(\\d{4})[a-z]?${PAGES}$`, 'u');

export const keyOf = (surname, year) => `${surname.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()}|${year}`;
const firstWord = (name) => name.trim().split(/\s+/)[0];

export function citationsIn(text) {
  const out = [];
  const s = String(text || '');
  for (const m of s.matchAll(/\(([^()]*\d{4}[^()]*)\)/g)) {
    for (const part of m[1].split(';')) {
      const p = part.trim().match(PAREN_PART);
      if (p) out.push({ raw: `(${part.trim()})`, key: keyOf(firstWord(p[1]), p[2]) });
    }
  }
  for (const m of s.matchAll(NARRATIVE)) out.push({ raw: m[0], key: keyOf(firstWord(m[1]), m[2]) });
  return out;
}

export const hasCitation = (text) => citationsIn(text).length > 0;

// A Harvard reference: "Surname, I. (2021) Title…" or "Organisation (2021) Title…".
export function referenceKey(entry) {
  const s = plain(entry);
  const year = (s.match(/\((\d{4})[a-z]?\)/) || s.match(/\b(\d{4})\b/) || [])[1];
  const author = s.split(/[,(]/)[0].trim();
  return year && author ? keyOf(firstWord(author), year) : null;
}
