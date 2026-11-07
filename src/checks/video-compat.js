// Video likely to play badly on Windows: .mov files, or a format this browser can't play.
import { assetUses } from './util.js';

export default {
  id: 'video-compat',
  title: 'Video on Windows',
  run(story, { canPlayType }) {
    const out = [];
    const seen = new Set();
    for (const { blockId, assetId } of assetUses(story)) {
      const a = story.assets[assetId];
      if (seen.has(assetId) || !/^video\//.test(a.mime || '')) continue;
      seen.add(assetId);
      const mov = a.mime === 'video/quicktime' || /\.mov$/i.test(a.name || '');
      const weak = canPlayType ? canPlayType(a.mime) === '' : false;
      if (mov || weak) {
        out.push({
          blockId,
          message: `Will ${a.name || 'this video'} play for a marker on Windows? ${mov ? '.mov files' : 'Files in this format'} often don't. `
            + 'On an iPhone, choose Settings → Camera → Formats → Most Compatible before filming, or convert the file to MP4 (H.264) first.',
        });
      }
    }
    return out;
  },
};
