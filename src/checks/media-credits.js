// Media with no alt text, credit or licence.
import { assetUses } from './util.js';

export default {
  id: 'media-credits',
  title: 'Alt text, credits and licences',
  run(story) {
    const seen = new Set();
    const out = [];
    for (const { blockId, assetId, role } of assetUses(story)) {
      if (seen.has(assetId)) continue; // ask once per file, at its first use
      seen.add(assetId);
      const a = story.assets[assetId];
      const isImage = /^image\//.test(a.mime || 'image/');
      const name = a.name || 'This file';
      const asks = [];
      if (!(a.alt || '').trim()) asks.push(isImage ? 'What does it show, for readers who can\'t see it? Add alt text.' : 'How would you describe it to someone who can\'t see or hear it?');
      if (!(a.credit || '').trim()) asks.push('Who made it? Add a credit.');
      if (!(a.licence || '').trim()) asks.push('May you use it? Choose a licence.');
      if (asks.length) out.push({ blockId, message: `${name} (${role}): ${asks.join(' ')}` });
    }
    return out;
  },
};
