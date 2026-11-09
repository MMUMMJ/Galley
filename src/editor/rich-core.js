// Formatted text, behind the scenes: turning what the student sees (bold as bold, headings as
// headings) into the simple Markdown the runtime reads, and back. Shared by the text fields in
// the settings panel (rich-text.js) and typing straight onto the canvas (canvas-text.js).
//
// Modes:
//   'blocks'  paragraphs, subheadings, lists and media (images, videos and embeds)
//   'inline'  one paragraph with bold, italics and links
//   'lines'   one item per line with bold, italics and links (saved as a list)
import { assetKind } from './fields.js';

export const MARK = '⁣'; // invisible marker that keeps the cursor's place while text is rebuilt
// Images, videos and embeds inside the text: locked, with their own small toolbar.
export const MEDIA = 'figure.rte-img';

// ---------------------------------------------------------------- Markdown out
const escapeText = (t) => t.replace(/[\\*_[\]]/g, '\\$&');
// Symbols that would turn a line into a heading or list item if they started it.
const escapeLineStart = (line) => line
  .replace(/^(#)/, '\\$1')
  .replace(/^([-+]) /, '\\$1 ')
  .replace(/^(\d+)([.)]) /, '$1\\$2 ')
  .replace(/^!/, '\\!');

function inlineMd(el, keepMark = false) {
  let out = '';
  for (const n of el.childNodes) {
    if (n.nodeType === 3) {
      const raw = n.textContent.replace(/\s+/g, ' ');
      out += escapeText(keepMark ? raw : raw.replace(new RegExp(MARK, 'g'), ''));
      continue;
    }
    if (n.nodeType !== 1) continue;
    const inner = inlineMd(n, keepMark);
    const wrap = (m) => {
      const t = inner.trim();
      if (!t) return inner;
      const lead = inner.match(/^\s*/)[0];
      const trail = inner.match(/\s*$/)[0];
      return `${lead}${m}${t}${m}${trail}`;
    };
    if (n.tagName === 'STRONG' || n.tagName === 'B') out += wrap('**');
    else if (n.tagName === 'EM' || n.tagName === 'I') out += wrap('*');
    else if (n.tagName === 'A' && n.getAttribute('href')) out += `[${inner.trim()}](${n.getAttribute('href')})`;
    else if (n.tagName === 'BR') out += ' ';
    else out += inner;
  }
  return out;
}

const BLOCKS = /^(P|DIV|H[1-6]|UL|OL|FIGURE|BLOCKQUOTE)$/;

// base: the heading level that "##" is drawn at (subheadings inside a part sit one level lower).
export function serialise(root, mode, keepMark = false, base = 2) {
  const text = (el) => inlineMd(el, keepMark).replace(/\s+/g, ' ').trim();
  // One paragraph typed straight into its own element (a standfirst on the canvas).
  if (mode === 'inline' && ![...root.children].some((c) => BLOCKS.test(c.tagName))) return text(root);
  const lines = [];
  const walk = (parent) => {
    for (const n of parent.childNodes) {
      if (n.nodeType === 3) {
        const raw = keepMark ? n.textContent : n.textContent.replace(new RegExp(MARK, 'g'), '');
        const t = escapeText(raw.trim());
        if (t) lines.push(escapeLineStart(t));
        continue;
      }
      if (n.nodeType !== 1) continue;
      // Browsers sometimes put a list or heading inside a paragraph: read what's inside.
      if ((n.tagName === 'P' || n.tagName === 'DIV') && [...n.children].some((c) => BLOCKS.test(c.tagName))) { walk(n); continue; }
      if (n.matches('figure[data-asset]')) {
        lines.push(`![${(n.dataset.name || 'image').replace(/[[\]\n]/g, '')}](asset:${n.dataset.asset}${n.dataset.pos ? ` "${n.dataset.pos}"` : ''})`);
      } else if (n.matches('figure[data-embed]')) {
        lines.push(`![Embed](${n.dataset.embed})`);
      } else if (mode === 'blocks' && /^H[1-6]$/.test(n.tagName)) {
        lines.push(`${Number(n.tagName[1]) <= base ? '##' : '###'} ${text(n)}`);
      } else if (mode === 'blocks' && (n.tagName === 'UL' || n.tagName === 'OL')) {
        lines.push('');
        [...n.children].forEach((li, i) => { const t = text(li); if (t) lines.push(`${n.tagName === 'UL' ? '-' : `${i + 1}.`} ${t}`); });
        lines.push('');
      } else if (n.tagName === 'UL' || n.tagName === 'OL') {
        [...n.children].forEach((li) => { const t = text(li); if (t) lines.push(escapeLineStart(t)); });
      } else { const t = text(n); if (t) lines.push(escapeLineStart(t)); }
    }
  };
  walk(root);
  if (mode === 'inline') return lines.join(' ');
  if (mode === 'lines') return lines.filter((l) => l.trim());
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+|\n+$/g, '');
}

// ---------------------------------------------------------------- Markdown in
// bare: an 'inline' paragraph typed into its own element, so no <p> round it.
export function toHtml(value, mode, figure, { base = 2, bare = false } = {}) {
  const R = window.Galley;
  if (!R) return '';
  const strip = (s) => s.replace(/ class="il-autolink"/g, '');
  if (mode === 'inline' && bare) return strip(R.inline(value || ''));
  // An empty paragraph needs a <br>, or browsers can't put the cursor inside it.
  if (mode === 'inline') return `<p>${strip(R.inline(value || '')) || '<br>'}</p>`;
  if (mode === 'lines') return (Array.isArray(value) ? value : String(value || '').split('\n')).filter((l) => l.trim())
    .map((l) => `<p>${strip(R.inline(l))}</p>`).join('') || '<p><br></p>';
  return strip(R.markdown(value || '', base, figure)) || '<p><br></p>';
}

// Media are locked (contenteditable=false), so the cursor can't go past one unless there is
// an editable line beside it. Make sure there is one before a leading image, after every image,
// and between two images. Empty lines aren't saved, so this adds nothing to the story.
export function padImages(root) {
  const editable = (n) => n && n.nodeType === 1 && !n.matches(MEDIA);
  const blank = () => { const p = document.createElement('p'); p.append(document.createElement('br')); return p; };
  for (const fig of root.querySelectorAll(`:scope > ${MEDIA}`)) {
    if (!editable(fig.nextElementSibling)) fig.after(blank());
    if (!fig.previousElementSibling) fig.before(blank());
  }
}

// Plain text from saved Markdown, for summaries in the block list.
export function plainText(md) {
  return String(md || '').replace(/^\s*!\[[^\]]*\]\((asset:|https?:)[^)]*\)\s*$/gm, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/^\s*(#{1,6}|[-*•]|\d+[.)])\s*/gm, '')
    .replace(/\\([\\*_[\]#!().+-])/g, '$1').replace(/(\*\*|__|\*|_)/g, '');
}

// ---------------------------------------------------------------- paste
export function cleanPaste(html, text, mode) {
  const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  if (!html) return text.split(/\n+/).filter((l) => l.trim()).map((l) => `<p>${esc(l)}</p>`).join('');
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const out = document.createElement('div');
  const blockTags = mode === 'blocks'
    ? { P: 'p', DIV: 'p', H1: 'h2', H2: 'h2', H3: 'h3', H4: 'h3', H5: 'h3', H6: 'h3', UL: 'ul', OL: 'ol', LI: 'li' }
    : { P: 'p', DIV: 'p', H1: 'p', H2: 'p', H3: 'p', H4: 'p', H5: 'p', H6: 'p', LI: 'p' };
  const walk = (from, to) => {
    for (const n of [...from.childNodes]) {
      if (n.nodeType === 3) { to.append(n.textContent); continue; }
      if (n.nodeType !== 1 || ['SCRIPT', 'STYLE', 'IMG', 'META', 'TITLE', 'svg', 'IFRAME', 'OBJECT'].includes(n.tagName)) continue;
      const style = n.getAttribute('style') || '';
      let tag = blockTags[n.tagName] || { STRONG: 'strong', B: 'strong', EM: 'em', I: 'em', A: 'a', BR: 'br' }[n.tagName] || null;
      if (!tag && /font-weight:\s*(bold|[6-9]00)/.test(style)) tag = 'strong';
      if (!tag && /font-style:\s*italic/.test(style)) tag = 'em';
      if (tag === 'a' && !/^(https?:|mailto:)/i.test(n.getAttribute('href') || '')) tag = null;
      if (!tag) { walk(n, to); continue; }
      const el = document.createElement(tag);
      if (tag === 'a') el.setAttribute('href', n.getAttribute('href'));
      walk(n, el);
      to.append(el);
    }
  };
  walk(doc.body, out);
  return out.innerHTML;
}

// ---------------------------------------------------------------- media inside the text
const attr = (s) => String(s).replace(/[&"<>]/g, (c) => ({ '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;' }[c]));

// How an image, video or embed looks while the text is being edited: locked, with its own small
// toolbar. look 'panel': a small card in the settings panel; 'page': as readers see it (canvas).
// Returns (ref, pos, kind, given) => html; ref is an asset id, or a web address when kind is 'embed'.
export function mediaFigure(ctx, look = 'panel') {
  return (ref, pos, kind, given) => {
    const remove = '<button type="button" data-remove>Remove</button>';
    if (kind === 'embed') {
      const info = window.Galley?.embedInfo(ref);
      let host = ref;
      try { host = new URL(ref).hostname.replace(/^www\./, ''); } catch { /* keep the address */ }
      return `<figure class="rte-img rte-embed" contenteditable="false" data-embed="${attr(ref)}">`
        + `<span class="rte-embed-card"><span class="rte-embed-play" aria-hidden="true">${info ? '▶' : '↗'}</span>`
        + `<span><strong>${attr(info ? `${info.label} embed` : 'Link card')}</strong><span>${attr(host)}</span></span></span>`
        + `<span class="rte-img-tools" role="group" aria-label="Embed">${remove}</span></figure>`;
    }
    const a = given || ctx.story.assets[ref];
    if (!a) return '';
    const video = assetKind(a) === 'video';
    const name = String(a.name || (video ? 'video' : 'image')).replace(/"/g, '');
    const media = video ? `<video src="${ctx.assetUrl(ref)}" muted preload="metadata"></video>` : `<img src="${ctx.assetUrl(ref)}" alt="">`;
    const missing = (a.alt || '').trim() ? '' : ` · <strong>${video ? 'no description' : 'no alt text'}</strong>`;
    const caption = look === 'page'
      ? ((a.caption || '').trim() || missing ? `<figcaption>${attr((a.caption || '').trim())}${missing}</figcaption>` : '')
      : `<figcaption>${video ? '▶ ' : ''}${name}${missing}</figcaption>`;
    return `<figure class="rte-img${look === 'page' ? ' il-inline-img' : ''}${figureClass(look, pos)}${video ? ' rte-video' : ''}" contenteditable="false"`
      + ` data-look="${look}" data-asset="${ref}" data-pos="${pos}" data-name="${name}">`
      + `${media}${caption}`
      + `<span class="rte-img-tools" role="group" aria-label="${video ? 'Video' : 'Image'}">`
      + `<button type="button" data-details>${video ? 'Description' : 'Alt text'}</button>`
      + `<button type="button" data-pos="left" aria-pressed="${pos === 'left'}">Left</button><button type="button" data-pos="" aria-pressed="${!pos}">Full</button>`
      + `<button type="button" data-pos="right" aria-pressed="${pos === 'right'}">Right</button>${remove}</span></figure>`;
  };
}
const figureClass = (look, pos) => (pos ? ` ${look === 'page' ? 'il-inline-img' : 'rte-img'}--${pos}` : '');

// Moves a figure left, right or back to full width.
export function setFigurePos(fig, pos) {
  fig.dataset.pos = pos;
  [...fig.classList].filter((c) => /--(left|right)$/.test(c)).forEach((c) => fig.classList.remove(c));
  const cls = figureClass(fig.dataset.look, pos).trim();
  if (cls) fig.classList.add(cls);
}
