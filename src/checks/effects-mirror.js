// A neutral count of effects, so students see how much is moving. If the pack
// requires effect notes, it also lists the effects that have none.
import { assetUses } from './util.js';

export default {
  id: 'effects-mirror',
  title: 'Movement',
  run(story, { pack }) {
    const moving = story.blocks.filter((b) => b.effect && b.effect !== 'none');
    if (!moving.length) return [];
    const uses = assetUses(story);
    const onUncaptioned = moving.filter((b) => uses.some((u) => u.blockId === b.id
      && /^image\//.test(story.assets[u.assetId].mime || 'image/') && !(story.assets[u.assetId].caption || '').trim())).length;
    const out = [{
      blockId: null,
      kind: 'info',
      message: `${moving.length} effect${moving.length === 1 ? '' : 's'} across ${story.blocks.length} blocks`
        + `${onUncaptioned ? `; ${onUncaptioned} on images with no caption` : ''}.`,
    }];
    if (pack.effectNotes === 'required') {
      for (const b of moving.filter((x) => !(x.effectNote || '').trim())) {
        out.push({ blockId: b.id, tab: 'look', focusKey: `ef-note-${b.id}`, message: `This block moves (${b.effect}). What does this movement do for the reader?` });
      }
    }
    return out;
  },
};
