// The checks: questions for the student, never marks. Each lives in its own module:
//   { id, title, run(story, { pack, canPlayType }) -> [{ blockId, message, kind? }] }
// blockId may be a block's id, 'story-details', or null for the whole story.
import mediaCredits from './media-credits.js';
import searchLinks from './search-links.js';
import citations from './citations.js';
import unsourcedStats from './unsourced-stats.js';
import showpieceFields from './showpiece-fields.js';
import effectsMirror from './effects-mirror.js';
import videoCompat from './video-compat.js';
import longText from './long-text.js';
import exportSize from './export-size.js';
import bandsMirror from './bands-mirror.js';
import textBackdrop from './text-backdrop.js';

export const CHECKS = [mediaCredits, searchLinks, citations, unsourcedStats, showpieceFields, effectsMirror, videoCompat, longText, exportSize, bandsMirror, textBackdrop];

export function runChecks(story, ctx) {
  return CHECKS.map((check) => {
    let items = [];
    try {
      items = check.run(story, ctx) || [];
    } catch (e) {
      // A check that breaks says so: "no questions" would look like a clean story.
      console.error(`Galley: the "${check.id}" check couldn't run`, e);
      items = [{ kind: 'error', blockId: null, message: 'This check couldn\'t run, so it can\'t say whether anything here needs a look. Reload Galley to try again.' }];
    }
    return { id: check.id, title: check.title, items: items.map((it) => ({ kind: 'question', ...it })) };
  });
}

export const failedCount = (results) => results.filter((r) => r.items.some((i) => i.kind === 'error')).length;

export const questionCount = (results) => results.reduce((n, r) => n + r.items.filter((i) => i.kind === 'question').length, 0);
