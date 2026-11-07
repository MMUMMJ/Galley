// Helpers shared by the exporters. The runtime (window.Illuminate) renders the page;
// its CSS and JS are fetched once and inlined, so exports never depend on this site.

let runtimeText = null;

export async function runtimeFiles() {
  if (!runtimeText) {
    const get = async (path) => {
      const res = await fetch(new URL(path, document.baseURI));
      if (!res.ok) throw new Error(`Couldn't load ${path} (HTTP ${res.status}).`);
      return res.text();
    };
    const [css, js] = await Promise.all([get('runtime/illuminate.css'), get('runtime/illuminate-runtime.js')]);
    runtimeText = { css, js };
  }
  return runtimeText;
}

export function runtime() {
  if (!window.Illuminate) throw new Error('The Illuminate runtime did not load. Reload the page and try again.');
  return window.Illuminate;
}

export function exportName(story, ext) {
  const slug = (story.meta.title || firstHeaderTitle(story) || 'illuminate-story')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'illuminate-story';
  const d = new Date();
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return `${slug}-${date}.${ext}`;
}

function firstHeaderTitle(story) {
  return story.blocks.find((b) => b.type === 'header' && b.data.title)?.data.title || '';
}

// Words a reader reads in the body: text blocks, headers and quotes.
// Not counted: references, captions, credits, alt text.
export function countWords(story) {
  const parts = [];
  for (const b of story.blocks) {
    const d = b.data || {};
    if (b.type === 'text') parts.push(d.body);
    if (b.type === 'header') parts.push(d.kicker, d.title, d.standfirst);
    if (b.type === 'quote') parts.push(d.text);
  }
  const text = parts.filter(Boolean).join('\n')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')   // [text](url) -> text
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/^\s*(#{1,6}|[-*\u2022]|\d+[.)])\s*/gm, ' ')
    .replace(/[*_]/g, '');
  return (text.match(/[\p{L}\p{N}][\p{L}\p{N}'’.-]*/gu) || []).length;
}

export function formatMB(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
