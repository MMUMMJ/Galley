// The working parts of a formatted-text editor: its toolbar (bold, italics, links, subheadings,
// lists, media), the small pop-ups for links and media, paste clean-up and tidying.
// Attached to any editable element: a text field in the settings panel (rich-text.js) or a
// piece of text on the canvas (canvas-text.js).
import { h } from './dom.js';
import { fileButton, assetBrowser, ACCEPT, assetKind } from './fields.js';
import { MARK, MEDIA, toHtml, padImages, cleanPaste, serialise, setFigurePos } from './rich-core.js';

// Page set-up only in a browser: the checks import blocks (and so this file) outside one too.
const HAS_PAGE = typeof document !== 'undefined';
if (HAS_PAGE) document.execCommand('defaultParagraphSeparator', false, 'p');

// One page-wide listener; it serves whichever editor the cursor is in.
let active = null;
if (HAS_PAGE) {
  document.addEventListener('selectionchange', () => {
    if (active && active.body.isConnected && active.body.contains(getSelection().anchorNode)) active.onSelection();
  });
}

// body: the contenteditable element. o:
//   id, label, mode, images, imageLabel, imageName  as for richText()
//   ctx        story, edit(fn, opts), importFiles, assetUrl, announce
//   key        the field in the block's data the text is saved to
//   focusKey   names the toolbar's buttons so focus survives a redraw
//   figure     how media look while editing (rich-core mediaFigure)
//   base, bare toHtml options (heading level; inline text without a <p>)
//   save(opts) saves the text; findBody() the element after a structural save (default: body)
//   inside(el) also counts as part of this editor (the toolbar and pop-up always do)
// Returns { bar, pop, tidy, value }.
export function attachRichEditing(body, o) {
  const { id, label, mode, images = false, imageLabel = 'Media', imageName = 'Add an image, video or embed', ctx, key, focusKey, figure } = o;
  const shape = { base: o.base || 2, bare: Boolean(o.bare) };
  const findBody = o.findBody || (() => body);
  let saved = null;
  const keep = () => { const s = getSelection(); if (s.rangeCount && body.contains(s.anchorNode)) saved = s.getRangeAt(0).cloneRange(); };
  const restore = () => {
    body.focus();
    if (saved && body.contains(saved.startContainer)) { getSelection().removeAllRanges(); getSelection().addRange(saved); }
  };
  const value = () => serialise(body, mode, false, shape.base);
  const save = (opts) => o.save(opts);

  // Rebuild from the clean saved text (browsers add stray styling when pasting or merging lines).
  const tidy = () => {
    const s = getSelection();
    if (s.rangeCount && body.contains(s.anchorNode)) { const r = s.getRangeAt(0).cloneRange(); r.collapse(false); r.insertNode(document.createTextNode(MARK)); }
    body.innerHTML = toHtml(serialise(body, mode, true, shape.base), mode, figure, shape);
    padImages(body);
    const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const at = n.data.indexOf(MARK);
      if (at < 0) continue;
      n.data = n.data.replace(MARK, '');
      if (!n.data && n.parentElement && n.parentElement !== body && !n.parentElement.textContent && !n.parentElement.querySelector('br')) {
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
  if (mode === 'blocks') tools.push(null, ['h2', 'H', 'Subheading'], ['h3', 'h', 'Smaller subheading'], null, ['ul', '• List', 'Bullet list'], ['ol', '1. List', '1. List: numbered list']);
  // Spoken names start with the visible text, so voice control users can say what they see.
  if (images) tools.push(null, ['image', imageLabel, imageName.startsWith(imageLabel) ? imageName : `${imageLabel}: ${imageName}`]);
  // A toolbar is one Tab stop; ← → move between its buttons (Home and End jump to the ends).
  const bar = h('div', { class: 'rte-tools', role: 'toolbar', 'aria-label': `Formatting for ${label}`, 'aria-controls': id },
    tools.map((t, i) => (t ? h('button', {
      type: 'button', 'data-cmd': t[0], 'aria-label': t[2], title: t[3] ? `${t[2]} (${t[3]})` : t[2], tabindex: i === 0 ? '0' : '-1',
      'aria-pressed': ['link', 'image'].includes(t[0]) ? null : 'false', 'data-focus': `${focusKey}:tool:${t[0]}`,
    }, t[0] === 'bold' ? h('b', {}, 'B') : t[0] === 'italic' ? h('i', {}, 'I') : t[1]) : h('span', { class: 'rte-sep', 'aria-hidden': 'true' }))));
  const pop = h('div', { class: 'rte-pop', hidden: true });
  const inside = (el) => Boolean(el) && (body.contains(el) || bar.contains(el) || pop.contains(el) || Boolean(o.inside?.(el)));

  const blockOf = () => {
    let n = getSelection().anchorNode;
    while (n && n !== body) { if (n.nodeType === 1 && /^(H[2-6]|P|LI)$/.test(n.tagName)) return n.tagName; n = n.parentNode; }
    return '';
  };
  // The heading tags for "H" and "h": one and two levels below the base.
  const tagFor = (cmd) => `H${Math.min(6, shape.base + (cmd === 'h2' ? 0 : 1))}`;
  const refresh = () => {
    const set = (cmd, on) => bar.querySelector(`[data-cmd="${cmd}"]`)?.setAttribute('aria-pressed', on ? 'true' : 'false');
    set('bold', document.queryCommandState('bold'));
    set('italic', document.queryCommandState('italic'));
    if (mode === 'blocks') {
      const b = blockOf();
      set('h2', b === tagFor('h2')); set('h3', b === tagFor('h3'));
      set('ul', document.queryCommandState('insertUnorderedList')); set('ol', document.queryCommandState('insertOrderedList'));
    }
  };

  const closePop = (refocus = true) => { pop.hidden = true; pop.replaceChildren(); if (refocus) restore(); };
  const linkAround = () => { let n = getSelection().anchorNode; while (n && n !== body) { if (n.tagName === 'A') return n; n = n.parentNode; } return null; };
  // Alt text, caption and credit for an image or video in the text. They belong to the file,
  // so they follow it into every block that uses it. Saved as they're typed.
  function openDetails(fig) {
    const assetId = fig.dataset.asset;
    const a = ctx.story.assets[assetId];
    if (!a || !ctx.setAsset) return;
    const video = assetKind(a) === 'video';
    const field = (k, labelText, hint, rows) => {
      const fid = `${id}-${k}-${assetId}`;
      const box = h(rows ? 'textarea' : 'input', { id: fid, ...(rows ? { rows } : { type: 'text' }), value: a[k] || '', oninput: (e) => ctx.setAsset(assetId, k, e.target.value) });
      if (rows) box.value = a[k] || '';
      return h('div', { class: 'rte-details-field' }, h('label', { for: fid }, labelText), hint ? h('p', { class: 'field-hint' }, hint) : null, box);
    };
    const index = [...body.querySelectorAll(MEDIA)].indexOf(fig);
    // Back to the text, with the cursor on the line after the picture (tidying redraws the figure).
    const done = () => {
      closePop(false);
      tidy();
      save();
      body.focus();
      const line = body.querySelectorAll(MEDIA)[index]?.nextElementSibling;
      if (line) { const r = document.createRange(); r.selectNodeContents(line); r.collapse(false); getSelection().removeAllRanges(); getSelection().addRange(r); }
    };
    pop.replaceChildren(h('div', { class: 'rte-details' },
      h('p', { class: 'rte-pop-title' }, a.name || (video ? 'Video' : 'Image')),
      field('alt', video ? 'Description' : 'Alt text', video ? 'Describe the video for readers who can\'t see or hear it.' : 'Describe what the image shows, for readers who can\'t see it. This is not the caption.', 2),
      field('caption', 'Caption', 'Shown under it. Adds context the picture can\'t.', 2),
      field('credit', 'Credit', 'Who made it, e.g. "Photo: Sam Example".'),
      h('div', { class: 'button-row' }, h('button', { type: 'button', class: 'btn btn-primary', onclick: done }, 'Done'))));
    pop.hidden = false;
    pop.querySelector('textarea').focus();
  }

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
  // Puts an image, video or embed at the cursor. html: the editor figure; isNew: an asset to add to the story.
  function insertMedia(html, { assetId, asset, isNew, said }) {
    closePop();
    // Mark the media already there, so the new one can be found (and the cursor put below it) after a redraw.
    body.querySelectorAll(MEDIA).forEach((f) => { f.dataset.placed = '1'; });
    document.execCommand('insertHTML', false, `${html}<p><br></p>`);
    const index = [...body.querySelectorAll(MEDIA)].findIndex((f) => !f.dataset.placed);
    body.querySelectorAll(MEDIA).forEach((f) => { delete f.dataset.placed; });
    const md = value();
    ctx.edit((data, story) => { if (isNew) story.assets[assetId] = asset; data[key] = md; }, { rerender: true });
    // Put the cursor on the line below the new one, ready to type.
    const fresh = findBody();
    const fig = fresh && fresh.querySelectorAll(MEDIA)[index];
    const line = fig && fig.nextElementSibling;
    if (line) {
      fresh.focus();
      const r = document.createRange(); r.selectNodeContents(line); r.collapse(true);
      getSelection().removeAllRanges(); getSelection().addRange(r);
    }
    ctx.announce(`${said} added to the text. You can carry on typing below it.`);
  }
  const insertAsset = (assetId, asset, isNew) => insertMedia(figure(assetId, '', '', asset),
    { assetId, asset, isNew, said: asset.name || (assetKind(asset) === 'video' ? 'Video' : 'Image') });
  function openImage() {
    keep();
    const files = Object.entries(ctx.story.assets).filter(([, a]) => ['image', 'video'].includes(assetKind(a)));
    const urlId = `${id}-embed`;
    const url = h('input', { id: urlId, type: 'url', placeholder: 'https://www.youtube.com/watch?v=…', 'data-focus': `${focusKey}:embed-url` });
    const addEmbed = () => {
      const u = url.value.trim();
      if (!/^https?:\/\/[^\s)]+$/i.test(u)) { ctx.announce('Paste a web address that starts with https://'); url.focus(); return; }
      const info = window.Galley?.embedInfo(u);
      restore();
      insertMedia(figure(u, '', 'embed'), { said: info ? `${info.label} embed` : 'Link card' });
    };
    url.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addEmbed(); } });
    pop.replaceChildren(...[
      h('p', { class: 'rte-pop-title' }, 'Add to the text'),
      fileButton(ctx, {
        label: 'Import an image or video…', accept: ACCEPT.imageVideo, focusKey: `${focusKey}:img-import`,
        onFiles: async (picked) => {
          const [added] = await ctx.importFiles(picked.slice(0, 1), ['image', 'video']);
          if (added) { restore(); insertAsset(added.id, added.asset, true); }
        },
      }),
      assetBrowser(ctx, files, {
        label: 'Or use one already in this story:',
        focusKey: `${focusKey}:img-existing`,
        onPick: (aid, a) => { restore(); insertAsset(aid, a, false); },
      }),
      h('div', { class: 'rte-embed-row' },
        h('label', { for: urlId }, 'Or embed a link: YouTube, Vimeo, Spotify, SoundCloud and more. Other sites show as a link card.'),
        h('div', { class: 'rte-embed-input' }, url, h('button', { type: 'button', class: 'btn', onclick: addEmbed }, 'Embed'))),
      h('button', { type: 'button', class: 'btn', onclick: () => closePop() }, 'Cancel'),
    ].filter(Boolean)); // no "use one already in this story" when the story has no files yet
    pop.hidden = false;
    pop.querySelector('button')?.focus();
  }

  function command(cmd) {
    restore();
    if (cmd === 'link') return openLink();
    if (cmd === 'image') return openImage();
    if (cmd === 'bold' || cmd === 'italic') document.execCommand(cmd);
    else if (cmd === 'h2' || cmd === 'h3') document.execCommand('formatBlock', false, blockOf() === tagFor(cmd) ? 'p' : tagFor(cmd).toLowerCase());
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
    if (b.hasAttribute('data-details')) openDetails(fig);
    else if (b.hasAttribute('data-remove')) {
      fig.remove();
      save({ rerender: true });
      ctx.announce(fig.dataset.embed ? 'Embed removed from the text.' : 'Removed from the text. The file stays in your story\'s files.');
    } else {
      setFigurePos(fig, b.dataset.pos);
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
    if (inside(e.relatedTarget)) return;
    tidy();
  });
  body.addEventListener('focusin', () => { active = { body, onSelection: () => { keep(); refresh(); } }; });
  pop.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closePop(); } });

  return { bar, pop, tidy, value, inside };
}
