// A heuristic: a sentence with a percentage or a large number, and no link or
// citation in the same sentence.
import { textSources, sentences, hasLink, hasCitation, snippet } from './util.js';

const PERCENT = /\d(?:[\d,.]*)\s?%|\bper\s?cent\b/i;
const SCALE = /\b(?:million|billion|trillion|bn|m)\b/i;
const GROUPED = /\b\d{1,3}(?:,\d{3})+\b/;           // 1,000 and up, written with commas
const LONG = /\b\d{5,}\b/;                           // 10000 and up
const FOUR = /\b(\d{4})\b/g;                          // 1000–9999, except years

function hasFigure(s) {
  if (PERCENT.test(s) || GROUPED.test(s) || LONG.test(s)) return true;
  if (SCALE.test(s) && /\d/.test(s)) return true;
  for (const m of s.matchAll(FOUR)) {
    const n = Number(m[1]);
    if (n < 1800 || n > 2099) return true; // 1800–2099 is probably a year
  }
  return false;
}

export default {
  id: 'unsourced-stats',
  title: 'Figures without a source',
  run(story) {
    const out = [];
    for (const src of textSources(story)) {
      if (src.kind !== 'body') continue;
      for (const s of sentences(src.text)) {
        if (hasFigure(s) && !hasLink(s) && !hasCitation(s)) {
          out.push({ blockId: src.blockId, message: `Where's this figure from? "${snippet(s, 80)}" Add a link or a citation in the same sentence.` });
        }
      }
    }
    return out;
  },
};
