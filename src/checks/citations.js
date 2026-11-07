// Author–year citations in the text compared with the References list,
// matched on the first author's surname and the year.
import { textSources, citationsIn, referenceKey, snippet } from './util.js';

export default {
  id: 'citations',
  title: 'Citations and references',
  run(story, { pack }) {
    const refsBlocks = story.blocks.filter((b) => b.type === 'references');
    const refs = refsBlocks.flatMap((b) => (b.data.items || []).filter((r) => r.trim())
      .map((entry) => ({ blockId: b.id, entry, key: referenceKey(entry) })));
    const refKeys = new Set(refs.map((r) => r.key).filter(Boolean));
    const cited = new Set();
    const out = [];
    for (const src of textSources(story)) {
      if (src.kind !== 'body' && src.kind !== 'caption') continue;
      for (const c of citationsIn(src.text)) {
        cited.add(c.key);
        if (!refKeys.has(c.key)) {
          out.push({ blockId: src.blockId, message: `${c.raw} isn't in your References. Is it missing, or is the name or year different there?` });
        }
      }
    }
    // With inline sourcing, the list holds sources you can't link to, which needn't be cited by name.
    if (pack.sourcing !== 'inline') {
      for (const r of refs) {
        if (r.key && !cited.has(r.key)) out.push({ blockId: r.blockId, message: `Is "${snippet(r.entry, 60)}" cited anywhere in your text?` });
      }
    }
    return out;
  },
};
