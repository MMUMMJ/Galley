// Formatted text editing. Students see bold as bold and headings as headings, and never
// type Markdown; behind the scenes the text is still saved as the same simple Markdown the
// runtime reads, so stories, exports and checks are unchanged.
//
// Modes:
//   'blocks'  paragraphs, subheadings, lists and (optionally) images: Text blocks, scroll steps
//   'inline'  one paragraph with bold, italics and links: standfirsts
//   'lines'   one item per line with bold, italics and links: references (saved as a list)
import { h } from './dom.js';
import { fileButton, assetBrowser, ACCEPT, assetKind } from './fields.js';

// Page set-up only in a browser: the checks import blocks (and so this file) outside one too.
const HAS_PAGE = typeof document !== 'undefined';
if (HAS_PAGE) document.execCommand('defaultParagraphSeparator', false, 'p');

let uid = 0;
// One page-wide listener; it serves whichever editor the cursor is in.
let active = null;
if (HAS_PAGE) {
  document.addEventListener('selectionchange', () => {
    if (active && active.body.isConnected && active.body.contains(getSelection().anchorNode)) active.onSelection();
  });
}
const MARK = '⁣'; // invisible marker that keeps the cursor's place while the editor is rebuilt

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

function serialise(root, mode, keepMark = false) {
  const lines = [];
  const text = (el) => inlineMd(el, keepMark).replace(/\s+/g, ' ').trim();
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
      } else if (mode === 'blocks' && n.tagName === 'H2') lines.push(`## ${text(n)}`);
      else if (mode === 'blocks' && /^H[3-6]$/.test(n.tagName)) lines.push(`### ${text(n)}`);
      else if (mode === 'blocks' && (n.tagName === 'UL' || n.tagName === 'OL')) {
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
function toHtml(value, mode, figure) {
  const R = window.Illuminate;
  if (!R) return '';
  const strip = (s) => s.replace(/ class="il-autolink"/g, '');
  // An empty paragraph needs a <br>, or browsers can't put the cursor inside it.
  if (mode === 'inline') return `<p>${strip(R.inline(value || '')) || '<br>'}</p>`;
  if (mode === 'lines') return (Array.isArray(value) ? value : String(value || '').split('\n')).filter((l) => l.trim())
    .map((l) => `<p>${strip(R.inline(l))}</p>`).join('') || '<p><br></p>';
  return strip(R.markdown(value || '', 2, figure)) || '<p><br></p>';
}

// Images are locked (contenteditable=false), so the cursor can't go past one unless there is
// an editable line beside it. Make sure there is one before a leading image, after every image,
// and between two images. Empty lines aren't saved, so this adds nothing to the story.
function padImages(root) {
  const editable = (n) => n && n.nodeType === 1 && !n.matches('figure[data-asset]');
  const blank = () => { const p = document.createElement('p'); p.append(document.createElement('br')); return p; };
  for (const fig of root.querySelectorAll(':scope > figure[data-asset]')) {
    if (!editable(fig.nextElementSibling)) fig.after(blank());
    if (!fig.previousElementSibling) fig.before(blank());
  }
}

// Plain text from saved Markdown, for summaries in the block list.
export function plainText(md) {
  return String(md || '').replace(/^\s*!\[[^\]]*\]\(asset:[^)]*\)\s*$/gm, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/^\s*(#{1,6}|[-*•]|\d+[.)])\s*/gm, '')
    .replace(/\\([\\*_[\]#!().+-])/g, '$1').replace(/(\*\*|__|\*|_)/g, '');
}

// ---------------------------------------------------------------- paste
function cleanPaste(html, text, mode) {
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

// ---------------------------------------------------------------- the editor
// ctx: inspector context (block, story, set, edit, importFiles, assetUrl, announce).
// key: the field in ctx.block.data. Options: label, hint, mode, images, imageLabel, rows.
export function richText(ctx, key, { label, hint, mode = 'blocks', images = false, imageLabel = 'Image', imageName = 'Insert image', rows = 8 } = {}) {
  const id = `rte-${++uid}`;
  const focusKey = `${ctx.block.id}:${key}`;
  const figure = (assetId, pos, given) => {
    const a = given || ctx.story.assets[assetId];
    if (!a) return '';
    const name = String(a.name || 'image').replace(/"/g, '');
    return `<figure class="rte-img${pos ? ` rte-img--${pos}` : ''}" contenteditable="false" data-asset="${assetId}" data-pos="${pos}" data-name="${name}">`
      + `<img src="${ctx.assetUrl(assetId)}" alt=""><figcaption>${name}${(a.alt || '').trim() ? '' : ' · <strong>no alt text</strong>'}</figcaption>`
      + '<span class="rte-img-tools" role="group" aria-label="Image position">'
      + `<button type="button" data-pos="left" aria-pressed="${pos === 'left'}">Left</button><button type="button" data-pos="" aria-pressed="${!pos}">Full</button>`
      + `<button type="button" data-pos="right" aria-pressed="${pos === 'right'}">Right</button><button type="button" data-remove>Remove</button></span></figure>`;
  };

  const body = h('div', {
    id, class: `rte-body rte-${mode}`, contenteditable: 'true', role: 'textbox', 'aria-multiline': mode === 'inline' ? 'false' : 'true',
    'aria-labelledby': `${id}-label`, 'aria-describedby': hint ? `${id}-hint` : null, spellcheck: 'true', 'data-focus': focusKey,
    style: `min-height:${mode === 'inline' ? 3 : rows * 1.6 + 1}em`,
  });
  body.innerHTML = toHtml(ctx.block.data[key], mode, figure);
  padImages(body);

  let saved = null;
  const keep = () => { const s = getSelection(); if (s.rangeCount && body.contains(s.anchorNode)) saved = s.getRangeAt(0).cloneRange(); };
  const restore = () => {
    body.focus();
    if (saved && body.contains(saved.startContainer)) { getSelection().removeAllRanges(); getSelection().addRange(saved); }
  };
  const value = () => serialise(body, mode);
  const save = (opts) => ctx.set(key, value(), opts);

  // Rebuild from the clean saved text (browsers add stray styling when pasting or merging lines).
  const tidy = () => {
    const s = getSelection();
    if (s.rangeCount && body.contains(s.anchorNode)) { const r = s.getRangeAt(0).cloneRange(); r.collapse(false); r.insertNode(document.createTextNode(MARK)); }
    body.innerHTML = toHtml(serialise(body, mode, true), mode, figure);
    padImages(body);
    const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const at = n.data.indexOf(MARK);
      if (at < 0) continue;
      n.data = n.data.replace(MARK, '');
      if (!n.data && n.parentElement && !n.parentElement.textContent && !n.parentElement.querySelector('br')) {
        n.after(document.createElement('br'));
      }
      const r = document.createRange(); r.setStart(n, at); r.collapse(true);
      saved = r.cloneRange();
      if (document.activeElement === body) { s.removeAllRanges(); s.addRange(r); }
      break;
    }
  };

  // ---- toolbar
  const tools = [['bold', 'B', 'Bold', 'Ctrl/Cmd+B'], ['italic', 'I', 'Italic', 'Ctrl/Cmd+I'], ['link', 'Link', 'Link', 'Ctrl/Cmd+K']];
  // Short labels so the bar fits on one line; the full name is the button's accessible name and tooltip.
  if (mode === 'blocks') tools.push(null, ['h2', 'H', 'Subheading'], ['h3', 'h', 'Smaller subheading'], null, ['ul', '• List', 'Bullet list'], ['ol', '1. List', 'Numbered list']);
  if (images) tools.push(null, ['image', imageLabel, imageName]);
  // A toolbar is one Tab stop; ← → move between its buttons (Home and End jump to the ends).
  const bar = h('div', { class: 'rte-tools', role: 'toolbar', 'aria-label': `Formatting for ${label}`, 'aria-controls': id },
    tools.map((t, i) => (t ? h('button', {
      type: 'button', 'data-cmd': t[0], 'aria-label': t[2], title: t[3] ? `${t[2]} (${t[3]})` : t[2], tabindex: i === 0 ? '0' : '-1',
      'aria-pressed': ['link', 'image'].includes(t[0]) ? null : 'false', 'data-focus': `${focusKey}:tool:${t[0]}`,
    }, t[0] === 'bold' ? h('b', {}, 'B') : t[0] === 'italic' ? h('i', {}, 'I') : t[1]) : h('span', { class: 'rte-sep', 'aria-hidden': 'true' }))));
  const pop = h('div', { class: 'rte-pop', hidden: true });

  const blockOf = () => {
    let n = getSelection().anchorNode;
    while (n && n !== body) { if (n.nodeType === 1 && /^(H2|H3|P|LI)$/.test(n.tagName)) return n.tagName; n = n.parentNode; }
    return '';
  };
  const refresh = () => {
    const set = (cmd, on) => bar.querySelector(`[data-cmd="${cmd}"]`)?.setAttribute('aria-pressed', on ? 'true' : 'false');
    set('bold', document.queryCommandState('bold'));
    set('italic', document.queryCommandState('italic'));
    if (mode === 'blocks') {
      const b = blockOf();
      set('h2', b === 'H2'); set('h3', b === 'H3');
      set('ul', document.queryCommandState('insertUnorderedList')); set('ol', document.queryCommandState('insertOrderedList'));
    }
  };

  const closePop = (refocus = true) => { pop.hidden = true; pop.replaceChildren(); if (refocus) restore(); };
  const linkAround = () => { let n = getSelection().anchorNode; while (n && n !== body) { if (n.tagName === 'A') return n; n = n.parentNode; } return null; };
  function openLink() {
    keep();
    const existing = linkAround();
    const inputId = `${id}-url`;
    const input = h('input', { id: inputId, type: 'url', placeholder: 'https://…', value: existing ? existing.getAttribute('href') : '' });
    const apply = () => {
      const url = input.value.trim();
      closePop();
      if (/^(https?:|mailto:)/i.test(url)) { document.execCommand('createLink', false, url); save(); }
      else if (url) ctx.announce('Links need to start with https:// or mailto:');
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); apply(); } });
    pop.replaceChildren(h('label', { for: inputId }, 'Link to'), input,
      h('button', { type: 'button', class: 'btn btn-primary', onclick: apply }, 'Apply'),
      existing ? h('button', { type: 'button', class: 'btn', onclick: () => { closePop(); document.execCommand('unlink'); save(); } }, 'Remove link') : null,
      h('button', { type: 'button', class: 'btn', onclick: () => closePop() }, 'Cancel'));
    pop.hidden = false;
    input.focus();
  }
  function insertImage(assetId, asset, isNew) {
    closePop();
    // Mark the images already there, so the new one can be found (and the cursor put below it) after the redraw.
    body.querySelectorAll('figure[data-asset]').forEach((f) => { f.dataset.placed = '1'; });
    document.execCommand('insertHTML', false, `${figure(assetId, '', asset)}<p><br></p>`);
    const index = [...body.querySelectorAll('figure[data-asset]')].findIndex((f) => !f.dataset.placed);
    const md = value();
    ctx.edit((data, story) => { if (isNew) story.assets[assetId] = asset; data[key] = md; }, { rerender: true });
    // The inspector has redrawn: put the cursor on the line below the new image, ready to type.
    const fresh = document.querySelector(`[data-focus="${CSS.escape(focusKey)}"]`);
    const fig = fresh && fresh.querySelectorAll('figure[data-asset]')[index];
    const line = fig && fig.nextElementSibling;
    if (line) {
      fresh.focus();
      const r = document.createRange(); r.selectNodeContents(line); r.collapse(true);
      getSelection().removeAllRanges(); getSelection().addRange(r);
    }
    ctx.announce(`${asset.name || 'Image'} added to the text. You can carry on typing below it.`);
  }
  function openImage() {
    keep();
    const imgs = Object.entries(ctx.story.assets).filter(([, a]) => assetKind(a) === 'image');
    pop.replaceChildren(
      h('p', { class: 'rte-pop-title' }, 'Add an image to the text'),
      fileButton(ctx, {
        label: 'Import a new image…', accept: ACCEPT.image, focusKey: `${focusKey}:img-import`,
        onFiles: async (files) => {
          const [added] = await ctx.importFiles(files.slice(0, 1), ['image']);
          if (added) { restore(); insertImage(added.id, added.asset, true); }
        },
      }),
      assetBrowser(ctx, imgs, {
        label: 'Or use one already in this story:',
        focusKey: `${focusKey}:img-existing`,
        onPick: (aid, a) => { restore(); insertImage(aid, a, false); },
      }),
      h('button', { type: 'button', class: 'btn', onclick: () => closePop() }, 'Cancel'));
    pop.hidden = false;
    pop.querySelector('button')?.focus();
  }

  function command(cmd) {
    restore();
    if (cmd === 'link') return openLink();
    if (cmd === 'image') return openImage();
    if (cmd === 'bold' || cmd === 'italic') document.execCommand(cmd);
    else if (cmd === 'h2' || cmd === 'h3') document.execCommand('formatBlock', false, blockOf() === cmd.toUpperCase() ? 'p' : cmd);
    else if (cmd === 'ul') document.execCommand('insertUnorderedList');
    else if (cmd === 'ol') document.execCommand('insertOrderedList');
    keep(); refresh(); save();
  }

  // ---- events
  // Keep the cursor in the text when a formatting or image button is pressed.
  const holdFocus = (e) => { if (e.target.closest('.rte-tools button, .rte-img-tools button')) e.preventDefault(); };
  bar.addEventListener('mousedown', holdFocus);
  body.addEventListener('mousedown', holdFocus);
  bar.addEventListener('click', (e) => { const b = e.target.closest('[data-cmd]'); if (b) command(b.dataset.cmd); });
  bar.addEventListener('keydown', (e) => {
    const buttons = [...bar.querySelectorAll('button')];
    const i = buttons.indexOf(document.activeElement);
    const to = { ArrowRight: (i + 1) % buttons.length, ArrowLeft: (i - 1 + buttons.length) % buttons.length, Home: 0, End: buttons.length - 1 }[e.key];
    if (to === undefined || i < 0) return;
    e.preventDefault();
    buttons.forEach((b, j) => b.setAttribute('tabindex', j === to ? '0' : '-1'));
    buttons[to].focus();
  });
  body.addEventListener('click', (e) => {
    const b = e.target.closest('.rte-img-tools button');
    if (!b) return;
    const fig = b.closest('figure');
    if (b.hasAttribute('data-remove')) {
      fig.remove();
      save({ rerender: true });
      ctx.announce('Image removed from the text. It stays in your story\'s files.');
    } else {
      fig.dataset.pos = b.dataset.pos;
      fig.className = `rte-img${b.dataset.pos ? ` rte-img--${b.dataset.pos}` : ''}`;
      fig.querySelectorAll('[data-pos]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      save();
    }
  });
  body.addEventListener('input', () => save());
  body.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openLink(); }
    if (mode === 'inline' && e.key === 'Enter') e.preventDefault();
  });
  body.addEventListener('paste', (e) => {
    e.preventDefault();
    const html = e.clipboardData.getData('text/html');
    const text = e.clipboardData.getData('text/plain');
    document.execCommand('insertHTML', false, mode === 'inline' ? cleanPaste('', text.replace(/\n+/g, ' '), mode) : cleanPaste(html, text, mode));
    tidy(); save();
    ctx.announce('Pasted. Only bold, italics, links, subheadings and lists were kept.');
  });
  // Tidy up only when focus really leaves this editor (its toolbar and pop-ups count as inside).
  body.addEventListener('focusout', (e) => {
    if (e.relatedTarget && wrap.contains(e.relatedTarget)) return;
    tidy();
  });
  body.addEventListener('focusin', () => { active = { body, onSelection: () => { keep(); refresh(); } }; });
  pop.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); closePop(); } });

  const wrap = h('div', { class: 'field rte' },
    h('span', { class: 'rte-label', id: `${id}-label` }, label),
    hint ? h('p', { class: 'field-hint', id: `${id}-hint` }, hint) : null,
    bar, pop, body);
  return wrap;
}
