import { mediaTargets } from './media-targets.js';

export const reviewKey = (checkId, item) => JSON.stringify([checkId, item.blockId || 'story', item.message]);

// Store the evidence reviewed, not just a dismissed message. A changed block or one of its
// media files brings the question back, while unrelated edits and save timestamps don't.
export function reviewEvidence(story, item, pack) {
  const block = story.blocks.find((b) => b.id === item.blockId);
  const ids = [...new Set(mediaTargets(block).map((t) => t.assetId))];
  const meta = { ...story.meta };
  delete meta.reviewedChecks;
  delete meta.modified;
  return JSON.stringify({ block, assets: ids.map((id) => [id, story.assets[id]]),
    meta: block ? undefined : meta, pack });
}

export const isReviewed = (story, checkId, item, pack) =>
  story.meta.reviewedChecks?.[reviewKey(checkId, item)] === reviewEvidence(story, item, pack);
