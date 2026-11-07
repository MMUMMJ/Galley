// A big number with no source; a before/after side with no label.
export default {
  id: 'showpiece-fields',
  title: 'Big numbers and before/after',
  run(story) {
    const out = [];
    for (const b of story.blocks) {
      const d = b.data || {};
      if (b.type === 'number' && !(d.sourceName || '').trim()) {
        out.push({ blockId: b.id, message: `Where's ${d.value ? `"${d.value}${d.unit ? ` ${d.unit}` : ''}"` : 'this figure'} from? This big number has no source.` });
      }
      if (b.type === 'compare') {
        for (const [key, word] of [['before', 'before'], ['after', 'after']]) {
          if (!(d[key]?.label || '').trim()) out.push({ blockId: b.id, message: `When or what is the ${word} image? Give it a label or date.` });
        }
      }
    }
    return out;
  },
};
