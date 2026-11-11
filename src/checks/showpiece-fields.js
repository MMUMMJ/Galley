// A big number with no source; a before/after side with no label; a text column too short for its images.
import { wordsIn } from '../blocks/textcolumn.js';

const MIN_WORDS_PER_IMAGE = 40;

export default {
  id: 'showpiece-fields',
  title: 'Big numbers and before/after',
  run(story) {
    const out = [];
    for (const b of story.blocks) {
      const d = b.data || {};
      if (b.type === 'number' && !(d.sourceName || '').trim()) {
        out.push({ blockId: b.id, focusKey: `${b.id}:sourceName`, message: `Where's ${d.value ? `"${d.value}${d.unit ? ` ${d.unit}` : ''}"` : 'this figure'} from? This big number has no source.` });
      }
      // Text column: the images share the text evenly, so a short text flicks through them.
      if (b.type === 'textcolumn' && (d.images || []).length > 1) {
        const per = Math.round(wordsIn(d.body) / d.images.length);
        if (per < MIN_WORDS_PER_IMAGE) {
          out.push({ blockId: b.id, focusKey: `${b.id}:body`, message: `Each image in this text column is on screen for only about ${per} words, so they will change quickly. Add more text, or use fewer images.` });
        }
      }
      if (b.type === 'compare') {
        for (const [key, word] of [['before', 'before'], ['after', 'after']]) {
          if (!(d[key]?.label || '').trim()) out.push({ blockId: b.id, focusKey: `${b.id}:${key}:label`, message: `When or what is the ${word} image? Give it a label or date.` });
        }
      }
    }
    return out;
  },
};
