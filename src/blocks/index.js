// Block registry. Each module: { type, label, description, defaults, prompt, summary, editorUI, validate, badge? }.
// prompt: the default craft prompt shown above the block's fields (a pack can replace it).
import header from './header.js';
import text from './text.js';
import quote from './quote.js';
import media from './media.js';
import gallery from './gallery.js';
import embed from './embed.js';
import divider from './divider.js';
import references from './references.js';
import scrolly from './scrolly.js';
import compare from './compare.js';
import number from './number.js';

export const BLOCKS = Object.fromEntries(
  [header, text, quote, media, gallery, embed, divider, references, scrolly, compare, number].map((b) => [b.type, b]),
);

export const blockLabel = (type) => BLOCKS[type]?.label || type || 'Unknown';
