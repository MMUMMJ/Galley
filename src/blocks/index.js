// Block registry. Each module: { type, label, description, defaults, prompt, summary, editorUI, validate }.
import header from './header.js';
import text from './text.js';
import quote from './quote.js';
import media from './media.js';
import gallery from './gallery.js';
import embed from './embed.js';
import divider from './divider.js';
import references from './references.js';

export const BLOCKS = Object.fromEntries(
  [header, text, quote, media, gallery, embed, divider, references].map((b) => [b.type, b]),
);

export const blockLabel = (type) => BLOCKS[type]?.label || type || 'Unknown';
