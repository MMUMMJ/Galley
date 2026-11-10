// Long runs of text with no break, and scroll steps that are too long.
import { wordCount } from './util.js';

export const RUN_WORDS = 450;
export const STEP_WORDS = 60;

export default {
  id: 'long-text',
  title: 'Long stretches',
  run(story) {
    const out = [];
    let run = 0;
    let start = null;
    const finish = () => {
      if (run > RUN_WORDS) {
        out.push({ blockId: start, message: `About ${run} words run on without a break from here. Could a subheading, image or quote give the reader a pause?` });
      }
      run = 0;
      start = null;
    };
    const HEADING = /^\s*(?:#{2,6}\s*\S|#\s+\S|!\[[^\]]*\]\((?:asset:|https?:\/\/)).*$/m;
    for (const b of story.blocks) {
      if (b.type !== 'text') { finish(); continue; }
      // A subheading, image or embed inside the text counts as a break.
      (b.data.body || '').split(HEADING).forEach((chunk, k) => {
        if (k > 0) finish();
        if (start === null) start = b.id;
        run += wordCount(chunk);
      });
    }
    finish();
    for (const b of story.blocks.filter((x) => x.type === 'scrolly' || x.type === 'scrollpoints')) {
      (b.data.steps || []).forEach((st, i) => {
        const n = wordCount(st && st.text);
        if (n > STEP_WORDS) out.push({ blockId: b.id, message: `Step ${i + 1} is ${n} words. Scroll steps work best short, about ${STEP_WORDS} at most: could it be split or trimmed?` });
      });
    }
    return out;
  },
};
