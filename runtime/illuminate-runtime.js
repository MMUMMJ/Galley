/*! Illuminate runtime: renders an Illuminate story into a reader-facing page.
 *  Inlined into every export, so it must stay self-contained: no imports, no network.
 *  renderArticle / renderDocument produce static HTML that reads fine without JavaScript.
 *  enhance() then adds the optional extras (gallery lightbox, embed players, print). */
(function (root) {
  'use strict';

  const RUNTIME_VERSION = '1.15.0';

  // ------------------------------------------------------------ helpers

  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ESC[c]);
  const str = (v) => (typeof v === 'string' ? v : '');
  const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  const WIDTHS = ['column', 'wide', 'full'];

  // ------------------------------------------------------------ colour schemes and bands
  // Every scheme passes 4.5:1 contrast for body text, muted text, accent and links.
  // The colours are written into the page as inline CSS variables, so this is the only copy.
  const SCHEMES = {
    house: { name: 'House', dark: false, mood: 'Warm paper, ink, a deep claret accent.',
      bg: '#fdfcfa', text: '#1a1a1a', muted: '#575757', accent: '#8a1c3c', link: '#0b5394', rule: '#d9d5cc', surface: '#ffffff' },
    wire: { name: 'Wire', dark: false, mood: 'Crisp white, slate type, a signal-orange accent.',
      bg: '#ffffff', text: '#1b2330', muted: '#55606f', accent: '#b93d0c', link: '#1d4fd0', rule: '#dde2ea', surface: '#f5f7fa' },
    longread: { name: 'Long read', dark: false, mood: 'Soft green-grey paper, a forest accent.',
      bg: '#f2f5f0', text: '#1c2420', muted: '#525d56', accent: '#2c6a4d', link: '#1d5a8c', rule: '#d0d9d0', surface: '#fbfcfa' },
    magazine: { name: 'Magazine', dark: false, mood: 'Pure white, black type, a red that shouts once.',
      bg: '#ffffff', text: '#111111', muted: '#545454', accent: '#c4161c', link: '#b0151a', rule: '#e2e2e2', surface: '#f6f6f6' },
    nightdesk: { name: 'Night desk', dark: true, mood: 'Charcoal, warm off-white, an amber lamp.',
      bg: '#15181d', text: '#ece8e1', muted: '#aab0b8', accent: '#f0b429', link: '#8db9ff', rule: '#353b45', surface: '#1e2229' },
    investigation: { name: 'Investigation', dark: true, mood: 'Deep navy, cool type, a coral alarm.',
      bg: '#0f1a2b', text: '#e7edf6', muted: '#a6b3c6', accent: '#ff7a6b', link: '#9fc6ff', rule: '#2a3a55', surface: '#16243a' },
  };
  const schemeOf = (meta) => (isObj(meta) && Object.prototype.hasOwnProperty.call(SCHEMES, meta.theme) ? meta.theme : 'house');
  const schemeVars = (id) => {
    const c = SCHEMES[id];
    return `--il-bg:${c.bg};--il-text:${c.text};--il-muted:${c.muted};--il-accent:${c.accent};`
      + `--il-link:${c.link};--il-rule:${c.rule};--il-surface:${c.surface}`;
  };

  const isHex = (v) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
  const channel = (c) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  function luminance(hex) {
    const n = parseInt(hex.slice(1), 16);
    return 0.2126 * channel(n >> 16) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
  }
  function contrast(a, b) {
    const x = luminance(a);
    const y = luminance(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  }
  // Black or white, whichever reads better. Every colour gets at least 4.5:1 this way.
  const inkFor = (bg) => (contrast(bg, '#000000') >= contrast(bg, '#ffffff') ? '#000000' : '#ffffff');
  function mixHex(a, b, t) {
    const pa = parseInt(a.slice(1), 16);
    const pb = parseInt(b.slice(1), 16);
    return '#' + [16, 8, 0].map((sh) => Math.round(((pa >> sh) & 255) * t + ((pb >> sh) & 255) * (1 - t))
      .toString(16).padStart(2, '0')).join('');
  }
  // A block's background: 'tint', 'ink' or 'accent' follow the scheme; '#rrggbb' is any colour.
  function bandColour(value, schemeId) {
    const c = SCHEMES[schemeId] || SCHEMES.house;
    if (value === 'tint') return mixHex(c.accent, c.bg, 0.14);
    if (value === 'ink') return c.text;
    if (value === 'accent') return c.accent;
    return isHex(value) ? value.toLowerCase() : '';
  }
  const EFFECTS = ['fade', 'rise', 'slide', 'zoom'];
  const widthClass = (w, fallback) => 'il-w-' + (WIDTHS.includes(w) ? w : fallback || 'column');

  // Allows http(s), mailto and relative links. Drops javascript:, data: and friends.
  function safeUrl(url) {
    const u = str(url).trim();
    if (!u) return '';
    const scheme = u.match(/^([a-z][a-z0-9+.-]*):/i);
    if (scheme && !/^(https?|mailto)$/i.test(scheme[1])) return '';
    return u;
  }

  const MIME_EXT = {
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg',
    'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov',
    'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/ogg': 'ogg',
  };

  // Where an asset lives inside an export: assets/<id>-<safe file name>.
  function assetPath(id, asset) {
    let name = str(asset && asset.name).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
      .replace(/[^a-z0-9.]+/g, '-').replace(/-+\./g, '.').replace(/^[-.]+|[-.]+$/g, '').slice(-80);
    if (!/\.[a-z0-9]{2,5}$/.test(name)) {
      const ext = MIME_EXT[str(asset && asset.mime)];
      name = (name || 'file') + (ext ? '.' + ext : '');
    }
    return 'assets/' + id + '-' + name;
  }

  function kindOf(asset, fallback) {
    const m = str(asset && asset.mime);
    if (m.startsWith('video/')) return 'video';
    if (m.startsWith('audio/')) return 'audio';
    if (m.startsWith('image/')) return 'image';
    return ['image', 'video', 'audio'].includes(fallback) ? fallback : 'image';
  }

  // Records which asset an element shows, so a single-file export can be re-opened.
  const mark = (id) => ` data-il-asset="${esc(id)}"`;
  const dims = (a) => (a && a.width > 0 && a.height > 0 ? ` width="${+a.width}" height="${+a.height}"` : '');

  // ------------------------------------------------------------ mini-markdown
  // Every non-empty line is a paragraph. "##" and "###" start headings (space optional).
  // "- " / "* " and "1. " start list items. Inline: **bold**, *italic*, [text](url), bare URLs.

  function emphasis(s) {
    return s
      .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '<strong>$1</strong>')
      .replace(/__(?=\S)([\s\S]*?\S)__/g, '<strong>$1</strong>')
      .replace(/(^|[^\w*])\*(?=\S)([^*]*?\S)\*(?!\w)/g, '$1<em>$2</em>')
      .replace(/(^|[^\w_])_(?=\S)([^_]*?\S)_(?!\w)/g, '$1<em>$2</em>');
  }

  function inline(text) {
    const slots = [];
    const hold = (html) => '\u0000' + (slots.push(html) - 1) + '\u0000';
    let s = str(text).replace(/\u0000/g, '');
    // A backslash makes the next symbol literal, e.g. \* for a real asterisk.
    // The editor writes these when a student types symbols that would otherwise format text.
    s = s.replace(/\\([\\*_[\]#!().+\-])/g, (m, c) => hold(esc(c)));
    s = s.replace(/\[([^\]\n]+)\]\(\s*([^)\s]+)\s*\)/g, (m, label, href) => {
      const url = safeUrl(href);
      const inner = emphasis(esc(label));
      return hold(url ? `<a href="${esc(url)}">${inner}</a>` : inner);
    });
    s = s.replace(/\bhttps?:\/\/[^\s<]+/g, (m) => {
      const trail = (m.match(/[.,;:!?)\]'"]+$/) || [''])[0];
      const url = m.slice(0, m.length - trail.length);
      return hold(`<a class="il-autolink" href="${esc(url)}">${esc(url)}</a>`) + trail;
    });
    return emphasis(esc(s)).replace(/\u0000(\d+)\u0000/g, (m, i) => slots[+i]);
  }

  // level: the heading level that "##" maps to.
  // An image on its own line: ![file name](asset:<id>) or ![file name](asset:<id> "left"|"right").
  const IMAGE_LINE = /^!\[([^\]]*)\]\(asset:([A-Za-z0-9_-]+)(?:\s+"(left|right)")?\)$/;
  // An embed in running text: ![Embed](https://…) on a line of its own.
  const EMBED_LINE = /^!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)$/;

  // image(ref, position, kind): renders an image, video (an asset id) or embed (kind 'embed',
  // ref is the web address) line. Without it, those lines are left out.
  function markdown(text, level, image) {
    const base = level || 2;
    const out = [];
    let list = null;
    const closeList = () => {
      if (!list) return;
      out.push(`<${list.tag}>${list.items.map((i) => `<li>${inline(i)}</li>`).join('')}</${list.tag}>`);
      list = null;
    };
    const addItem = (tag, text) => {
      if (list && list.tag !== tag) closeList();
      if (!list) list = { tag, items: [] };
      list.items.push(text);
    };
    for (const raw of str(text).replace(/\r\n?/g, '\n').split('\n')) {
      const line = raw.trim();
      let m;
      if (!line) closeList();
      else if ((m = line.match(IMAGE_LINE))) {
        closeList();
        if (image) out.push(image(m[2], m[3] || ''));
      } else if ((m = line.match(EMBED_LINE))) {
        closeList();
        if (image) out.push(image(m[2], '', 'embed'));
      }
      // "## Heading" or "##Heading". A single "#" needs a space, so "#hashtag" and "#1" stay text.
      else if ((m = line.match(/^(#{2,6})\s*([^#\s].*)$/) || line.match(/^(#)\s+(.+)$/))) {
        closeList();
        const h = Math.min(6, base + Math.max(0, m[1].length - 2));
        out.push(`<h${h}>${inline(m[2])}</h${h}>`);
      } else if ((m = line.match(/^[-*•]\s+(.+)$/))) addItem('ul', m[1]);
      else if ((m = line.match(/^\d+[.)]\s+(.+)$/))) addItem('ol', m[1]);
      else { closeList(); out.push(`<p>${inline(line)}</p>`); }
    }
    closeList();
    return out.join('\n');
  }

  // ------------------------------------------------------------ embeds
  // Only these four providers get an inline player; everything else is a link card.

  function embedInfo(url) {
    let u;
    try { u = new URL(url); } catch (e) { return null; }
    if (!/^https?:$/.test(u.protocol)) return null;
    const host = u.hostname.replace(/^(www|m)\./, '');
    const p = u.pathname.split('/').filter(Boolean);
    const yt = (id) => (/^[\w-]{6,20}$/.test(id || '')
      ? { provider: 'youtube', label: 'YouTube', src: 'https://www.youtube-nocookie.com/embed/' + id } : null);

    if (/^(music\.)?youtube(-nocookie)?\.com$/.test(host)) {
      return yt(u.searchParams.get('v') || (['embed', 'shorts', 'live', 'v'].includes(p[0]) ? p[1] : ''));
    }
    if (host === 'youtu.be') return yt(p[0]);
    if (host === 'vimeo.com' || host === 'player.vimeo.com') {
      const i = p.findIndex((s) => /^\d+$/.test(s));
      if (i < 0) return null;
      const hash = /^[0-9a-f]{6,}$/i.test(p[i + 1] || '') ? '?h=' + p[i + 1] : '';
      return { provider: 'vimeo', label: 'Vimeo', src: `https://player.vimeo.com/video/${p[i]}${hash}` };
    }
    if (host === 'open.spotify.com') {
      const q = p.filter((s) => s !== 'embed' && !/^intl-/.test(s));
      if (['track', 'album', 'playlist', 'episode', 'show', 'artist'].includes(q[0]) && /^[A-Za-z0-9]+$/.test(q[1] || '')) {
        return { provider: 'spotify', label: 'Spotify', src: `https://open.spotify.com/embed/${q[0]}/${q[1]}`,
          height: q[0] === 'track' || q[0] === 'episode' ? 152 : 352 };
      }
      return null;
    }
    if (host === 'soundcloud.com' && p.length >= 2) {
      return { provider: 'soundcloud', label: 'SoundCloud',
        src: 'https://w.soundcloud.com/player/?url=' + encodeURIComponent('https://soundcloud.com/' + p.join('/')),
        height: p[1] === 'sets' ? 450 : 166 };
    }
    return null;
  }

  // ------------------------------------------------------------ blocks

  function figcaption(a, cls) {
    if (!a) return '';
    const caption = str(a.caption).trim();
    const credit = [str(a.credit).trim(), str(a.licence).trim()].filter(Boolean).join(' · ');
    if (!caption && !credit) return '';
    return `<figcaption${cls ? ` class="${cls}"` : ''}>${caption ? `<span class="il-caption">${inline(caption)}</span>` : ''}`
      + `${caption && credit ? ' ' : ''}${credit ? `<span class="il-credit">${esc(credit)}</span>` : ''}</figcaption>`;
  }

  // An image placed inside running text (text blocks and scroll steps): full width,
  // or floated left or right with the text wrapping round it. Alt text, caption and
  // credit come from the file, as everywhere else.
  // Images, videos and embeds placed in running text (text blocks, columns and scroll steps).
  function inlineImage(ctx) {
    return (ref, position, kind) => {
      if (kind === 'embed') {
        const url = safeUrl(ref);
        return /^https?:\/\//i.test(url) ? embedFigure(url, ctx, { cls: 'il-inline-embed' }) : '';
      }
      const a = ctx.asset(ref);
      const k = a ? kindOf(a) : '';
      const cls = position ? ' il-inline-img--' + position : '';
      if (k === 'video') {
        const src = esc(ctx.url(ref));
        const label = str(a.alt) ? ` aria-label="${esc(a.alt)}"` : '';
        const fallback = ctx.inline ? "Your browser can't play this video." : `<a href="${src}">Download the video</a>`;
        return `<figure class="il-inline-img il-inline-video${cls}">`
          + `<video controls playsinline preload="metadata" src="${src}"${label}${dims(a)}${mark(ref)}>${fallback}</video>${figcaption(a)}</figure>`;
      }
      if (k !== 'image') return ctx.preview ? '<p class="il-placeholder">Missing image or video</p>' : '';
      return `<figure class="il-inline-img${cls}">`
        + `<img src="${esc(ctx.url(ref))}" alt="${esc(a.alt)}" decoding="async"${dims(a)}${mark(ref)}>${figcaption(a)}</figure>`;
    };
  }

  // A link card for a web address; enhance() swaps in the provider's player where there is one.
  function embedFigure(url, ctx, { id = '', cls = '', title = '', description = '', shot = null } = {}) {
    const info = embedInfo(url);
    let host = '';
    try { host = new URL(url).hostname.replace(/^www\./, ''); } catch (e) { host = url; }
    const name = title || (info ? `${info.label}: ${host}` : host);
    const a = shot ? ctx.asset(shot) : null;
    const data = info ? ` data-il-embed-src="${esc(info.src)}" data-il-embed-label="${esc(info.label)}" data-il-embed-provider="${info.provider}"`
      + (info.height ? ` data-il-embed-height="${info.height}"` : '') : '';
    return `<figure class="il-embed${cls ? ' ' + cls : ''}"${id ? ` id="${esc(id)}"` : ''}${data}><div class="il-embed__frame">`
      + `<a class="il-card" href="${esc(url)}">`
      + (a ? `<img class="il-card__img" src="${esc(ctx.url(shot))}" alt="${esc(a.alt)}"${dims(a)}${mark(shot)}>` : '')
      + `<span class="il-card__body"><span class="il-card__title">${esc(name)}</span>`
      + (description ? `<span class="il-card__desc">${esc(description)}</span>` : '')
      + `<span class="il-card__host">${esc(host)}</span><span class="il-card__url">${esc(url)}</span></span></a></div>`
      + (a ? figcaption(a) : '') + '</figure>';
  }

  function placeholder(b, ctx, message) {
    return ctx.preview ? `<div class="il-placeholder" id="${esc(b.id)}" role="note">${esc(message)}</div>` : '';
  }

  // A piece of text in a block. On the editor's canvas (opts.editable) it is always drawn, even
  // when empty, and marked with the field it comes from so the student can type straight onto
  // the page: e = { field, mode: plain|inline|lines|blocks, ph: hint when empty, opt: only shown
  // while the block is selected, meta: the text comes from Story details, base: heading level }.
  // Exports and the preview never get these marks.
  function slot(ctx, tag, attrs, value, html, e) {
    if (!ctx.edit || !e) return value ? `<${tag}${attrs}>${html}</${tag}>` : '';
    const marks = ` data-il-edit="${e.field}" data-il-mode="${e.mode}" data-il-ph="${esc(e.ph)}"`
      + (e.meta ? ' data-il-meta' : '') + (e.base ? ` data-il-base="${e.base}"` : '')
      + (value ? '' : ' data-il-empty' + (e.opt ? ' data-il-opt' : ''));
    return `<${tag}${attrs}${marks}>${value ? html : ''}</${tag}>`;
  }

  const BLOCKS = {
    header(b, d, ctx) {
      const m = ctx.meta;
      const first = ctx.headers === 0;
      ctx.headers++;
      ctx.offset = first ? 0 : 1;
      const lvl = first ? 1 : 2;
      const variant = d.variant === 'full' || d.variant === 'compact' ? d.variant : (first ? 'full' : 'compact');
      const title = str(d.title) || (first ? str(m.title) : '');
      const standfirst = str(d.standfirst) || (first ? str(m.standfirst) : '');
      const byline = str(d.byline) || (first ? str(m.byline) : '');
      const a = ctx.asset(d.media);
      const kind = a ? kindOf(a) : '';
      const label = a && str(a.alt) ? ` aria-label="${esc(a.alt)}"` : '';
      const media = a && kind === 'image'
        ? `<div class="il-header__media"><img src="${esc(ctx.url(d.media))}" alt="${esc(a.alt)}"${dims(a)}${mark(d.media)}></div>`
        : a && kind === 'video'
          ? `<div class="il-header__media"><video muted loop playsinline preload="metadata" data-il-bg-video src="${esc(ctx.url(d.media))}"${label}${dims(a)}${mark(d.media)}></video></div>`
          : '';
      const credit = a && media ? [str(a.credit), str(a.licence)].filter(Boolean).join(' · ') : '';
      // Text shown from Story details (the opening header, or a story with no header block).
      const top = b.id === 'il-top';
      const meta = (key) => top || (first && !str(d[key]) && Boolean(str(m[key])));
      return `<header class="il-header il-header--${variant}${media ? ' il-header--media' : ''}" id="${esc(b.id)}">${media}`
        + '<div class="il-header__text">'
        + slot(ctx, 'p', ' class="il-kicker"', str(d.kicker), esc(d.kicker), top ? null : { field: 'kicker', mode: 'plain', ph: 'Kicker', opt: true })
        + slot(ctx, `h${lvl}`, ` class="il-title" id="${esc(b.id)}-title"`, title, esc(title), { field: 'title', mode: 'plain', ph: 'Headline', meta: meta('title') })
        + slot(ctx, 'p', ' class="il-standfirst"', standfirst, inline(standfirst), { field: 'standfirst', mode: 'inline', ph: 'Standfirst: one or two sentences that sell the story', meta: meta('standfirst') })
        + slot(ctx, 'p', ' class="il-byline"', byline, esc(byline), { field: 'byline', mode: 'plain', ph: 'By …', opt: true, meta: meta('byline') })
        + '</div>'
        + (credit ? `<p class="il-header__credit">${esc(credit)}</p>` : '')
        + '</header>';
    },

    text(b, d, ctx) {
      const html = markdown(d.body, 2 + ctx.offset, inlineImage(ctx));
      if (!html && !ctx.edit) return placeholder(b, ctx, 'Empty text block');
      return slot(ctx, 'div', ` class="il-text" id="${esc(b.id)}"`, html, html, { field: 'body', mode: 'blocks', ph: 'Start writing…', base: 2 + ctx.offset });
    },

    // Columns: separate columns written one by one, or one text flowing across columns like print.
    // Phones always get one column.
    columns(b, d, ctx) {
      const n = d.count === 3 ? 3 : 2;
      const width = d.width === 'column' ? 'il-w-column' : 'il-w-wide';
      const media = inlineImage(ctx);
      const lvl = 2 + ctx.offset;
      if (d.mode === 'flow') {
        const html = markdown(d.body, lvl, media);
        if (!html && !ctx.edit) return placeholder(b, ctx, 'Empty columns block');
        return slot(ctx, 'div', ` class="il-text il-columns il-columns--flow il-columns--${n} ${width}" id="${esc(b.id)}"`, html, html,
          { field: 'body', mode: 'blocks', ph: 'Start writing: the text flows from one column into the next', base: lvl });
      }
      const cols = [d.col1, d.col2, d.col3].slice(0, n).map((t) => markdown(t, lvl, media));
      if (ctx.edit) {
        return `<div class="il-columns il-columns--${n} ${width}" id="${esc(b.id)}">`
          + cols.map((c, i) => slot(ctx, 'div', ' class="il-text il-columns__col"', c, c, { field: `col${i + 1}`, mode: 'blocks', ph: `Column ${i + 1}`, base: lvl })).join('')
          + '</div>';
      }
      if (!cols.some(Boolean)) return placeholder(b, ctx, 'Empty columns block');
      return `<div class="il-columns il-columns--${n} ${width}" id="${esc(b.id)}">`
        + cols.map((c) => (c || ctx.preview ? `<div class="il-text il-columns__col">${c || '<p class="il-placeholder">This column is empty</p>'}</div>` : '')).join('')
        + '</div>';
    },

    quote(b, d, ctx) {
      const lines = str(d.text).split(/\n+/).map((s) => s.trim()).filter(Boolean);
      if (ctx.edit) {
        const cite = str(d.cite).trim();
        const role = str(d.role).trim();
        return `<figure class="il-quote" id="${esc(b.id)}">`
          + slot(ctx, 'blockquote', '', lines.length, lines.map((l) => `<p>${inline(l)}</p>`).join(''), { field: 'text', mode: 'lines', ph: 'Type the quote, without quotation marks' })
          + '<figcaption class="il-quote__cite">'
          + slot(ctx, 'span', '', cite, esc(cite), { field: 'cite', mode: 'plain', ph: 'Who said it' })
          + `<span class="il-quote__sep">${cite && role ? ', ' : ' '}</span>`
          + slot(ctx, 'span', '', role, esc(role), { field: 'role', mode: 'plain', ph: 'Their role', opt: true })
          + '</figcaption></figure>';
      }
      if (!lines.length) return placeholder(b, ctx, 'Empty quote');
      const who = [str(d.cite).trim(), str(d.role).trim()].filter(Boolean).map(esc).join(', ');
      return `<figure class="il-quote" id="${esc(b.id)}"><blockquote>${lines.map((l) => `<p>${inline(l)}</p>`).join('')}</blockquote>`
        + (who ? `<figcaption class="il-quote__cite">${who}</figcaption>` : '') + '</figure>';
    },

    media(b, d, ctx) {
      const a = ctx.asset(d.asset);
      if (!a) return placeholder(b, ctx, 'Choose a file for this media block');
      const src = esc(ctx.url(d.asset));
      const kind = kindOf(a, d.kind);
      const m = mark(d.asset);
      // Single-file pages hold the file once only, so no download link repeating it.
      const fallback = (what) => (ctx.inline ? `Your browser can't play this ${what}.` : `<a href="${src}">Download the ${what}</a>`);
      const label = str(a.alt) ? ` aria-label="${esc(a.alt)}"` : '';
      let el;
      if (kind === 'video') {
        el = `<video controls playsinline preload="metadata" src="${src}"${label}${dims(a)}${m}>${fallback('video')}</video>`;
      } else if (kind === 'audio') {
        el = `<audio controls preload="metadata" src="${src}"${label}${m}>${fallback('audio')}</audio>`;
      } else {
        el = `<img src="${src}" alt="${esc(a.alt)}" decoding="async"${dims(a)}${m}>`;
      }
      const width = kind === 'audio' ? 'il-w-column' : widthClass(d.width);
      return `<figure class="il-media il-media--${kind} ${width}" id="${esc(b.id)}">${el}${figcaption(a)}</figure>`;
    },

    gallery(b, d, ctx) {
      const items = (Array.isArray(d.items) ? d.items : [])
        .map((id) => ({ id, a: ctx.asset(id) }))
        .filter((x) => x.a && kindOf(x.a) === 'image');
      if (!items.length) return placeholder(b, ctx, 'Add images to this gallery');
      const n = items.length;
      const lis = items.map((x, i) => {
        const src = esc(ctx.url(x.id));
        const name = `View image ${i + 1} of ${n} full size` + (str(x.a.alt) ? ': ' + x.a.alt : '');
        const img = `<img src="${src}" alt="${esc(x.a.alt)}" decoding="async"${dims(x.a)}${mark(x.id)}>`;
        // Single-file pages: no link (it would store the image twice); enhance() adds a button instead.
        const inner = ctx.inline ? img : `<a class="il-gallery__link" href="${src}" aria-label="${esc(name)}">${img}</a>`;
        return `<li class="il-gallery__item"><figure>${inner}${figcaption(x.a)}</figure></li>`;
      }).join('');
      return `<figure class="il-gallery ${widthClass(d.width, 'wide')}" id="${esc(b.id)}" data-il-gallery>`
        + `<ul class="il-gallery__grid" role="list">${lis}</ul>`
        + (str(d.caption) ? `<figcaption class="il-gallery__caption">${inline(d.caption)}</figcaption>` : '') + '</figure>';
    },

    embed(b, d, ctx) {
      const url = safeUrl(d.url);
      if (!/^https?:\/\//i.test(url)) return placeholder(b, ctx, 'Add a web address to this embed');
      return embedFigure(url, ctx, {
        id: b.id, cls: widthClass(d.width), title: str(d.title), description: str(d.description), shot: d.screenshot,
      });
    },

    divider(b, d, ctx) {
      const text = str(d.text).trim();
      if (ctx.edit) {
        const label = slot(ctx, 'p', ' class="il-divider__label"', text, inline(text), { field: 'text', mode: 'inline', ph: 'Add a label (optional)', opt: true });
        return text ? `<div class="il-divider il-divider--label" id="${esc(b.id)}"><hr>${label}</div>`
          : `<div class="il-divider-edit" id="${esc(b.id)}"><hr class="il-divider">${label}</div>`;
      }
      if (!text) return `<hr class="il-divider" id="${esc(b.id)}">`;
      return `<div class="il-divider il-divider--label" id="${esc(b.id)}"><hr><p class="il-divider__label">${inline(text)}</p></div>`;
    },

    references(b, d, ctx) {
      const items = (Array.isArray(d.items) ? d.items : str(d.items).split('\n'))
        .map((s) => str(s).trim()).filter(Boolean);
      if (!items.length) return placeholder(b, ctx, 'No references yet');
      const lvl = 2 + ctx.offset;
      const hid = esc(b.id) + '-title';
      return `<section class="il-references" id="${esc(b.id)}" aria-labelledby="${hid}"><details${d.collapsed === true ? '' : ' open'}>`
        + `<summary><h${lvl} class="il-references__title" id="${hid}">${esc(str(d.title) || 'References')}</h${lvl}></summary>`
        + `<ul class="il-references__list">${items.map((i) => `<li>${inline(i)}</li>`).join('')}</ul></details></section>`;
    },

    // ---- Showpiece blocks. Each renders complete, readable HTML; enhance() adds the effect.

    // Scroll sequence: steps of text, each optionally bringing in a new image.
    // Static: image then text, step by step. Enhanced: sticky image panel, steps scroll past.
    scrolly(b, d, ctx) {
      const steps = (Array.isArray(d.steps) ? d.steps : []).filter(isObj);
      if (!steps.some((st) => str(st.text).trim() || ctx.asset(st.media))) return placeholder(b, ctx, 'Add steps to this scroll sequence');
      // side: image beside the text; overlay: text cards over a full-screen image;
      // column: one continuous column of text over full-screen images that crossfade.
      const layout = d.layout === 'overlay' || d.layout === 'column' ? d.layout : 'side';
      const fallbackAlign = d.align === 'left' || d.align === 'right' ? d.align : 'center';
      const html = steps.map((st, i) => {
        const a = ctx.asset(st.media);
        const kind = a ? kindOf(a) : '';
        const label = a && str(a.alt) ? ` aria-label="${esc(a.alt)}"` : '';
        const fig = a && kind === 'image'
          ? `<figure class="il-scrolly__media"><img src="${esc(ctx.url(st.media))}" alt="${esc(a.alt)}" decoding="async"${dims(a)}${mark(st.media)}>${figcaption(a)}</figure>`
          : a && kind === 'video'
            ? `<figure class="il-scrolly__media"><video muted loop playsinline preload="metadata" data-il-bg-video src="${esc(ctx.url(st.media))}"${label}${dims(a)}${mark(st.media)}></video>${figcaption(a)}</figure>`
            : '';
        const text = markdown(st.text, 2 + ctx.offset, inlineImage(ctx));
        const stAlign = layout === 'overlay'
          ? (st.align === 'left' || st.align === 'center' || st.align === 'right' ? st.align : fallbackAlign)
          : '';
        const stepCls = stAlign && stAlign !== 'center' ? ` il-scrolly__step--${stAlign}` : '';
        // An empty step draws no card (an empty card is a stray box over the image). With no
        // image either, the step is left out of the page; the editor preview still flags it.
        const card = text || (ctx.preview ? '<p class="il-placeholder">This step has no text yet</p>' : '');
        if (!fig && !card) return '';
        return `<div class="il-scrolly__step${stepCls}" data-il-step="${i}">${fig}${card ? `<div class="il-scrolly__card">${card}</div>` : ''}</div>`;
      }).join('');
      // Overlay: each step's card can sit on the left, centre or right.
      // Text column: the column sits on the left, centre or right. Side by side: text on the right (default) or left.
      const position = layout === 'column'
        ? (d.align === 'left' || d.align === 'right' ? ` il-scrolly--align-${d.align}` : '')
        : layout === 'side'
          ? (d.textSide === 'left' ? ' il-scrolly--text-left' : '')
          : '';
      const backdrop = (layout === 'overlay' || layout === 'column') && (d.backdrop === 'vignette' || d.backdrop === 'none')
        ? ` il-scrolly--backdrop-${d.backdrop}`
        : '';
      return `<section class="il-scrolly il-scrolly--${layout}${position}${backdrop}" id="${esc(b.id)}" data-il-scrolly aria-label="Scroll sequence">`
        + `<div class="il-scrolly__steps">${html}</div></section>`;
    },

    // Scrollpoints: one image stays on screen and zooms/pans to highlighted regions as steps scroll past.
    scrollpoints(b, d, ctx) {
      const a = ctx.asset(d.asset);
      const steps = (Array.isArray(d.steps) ? d.steps : []).filter(isObj);
      if ((!a || kindOf(a) !== 'image') && !steps.some((st) => str(st.text).trim())) {
        return placeholder(b, ctx, 'Choose an image and add steps to these scrollpoints');
      }
      const fig = a && kindOf(a) === 'image'
        ? `<figure class="il-scrollpoints__media"><img src="${esc(ctx.url(d.asset))}" alt="${esc(a.alt)}" decoding="async"${dims(a)}${mark(d.asset)}>${figcaption(a)}</figure>`
        : (ctx.preview ? '<div class="il-placeholder">Choose an image to explore</div>' : '');
      const clampNum = (v, min, max, fb) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : fb);
      const html = steps.map((st, i) => {
        const text = markdown(st.text, 2 + ctx.offset, inlineImage(ctx));
        // 'auto': the text goes on the side away from the highlighted area.
        const away = st.focus && clampNum(st.x, 0, 100, 40) + clampNum(st.w, 5, 100, 30) / 2 < 50 ? 'right' : 'left';
        const stAlign = st.align === 'auto' ? away : st.align === 'left' || st.align === 'right' ? st.align : 'center';
        const stepCls = stAlign !== 'center' ? ` il-scrolly__step--${stAlign}` : '';
        const focusAttr = st.focus
          ? ` data-il-focus="${clampNum(st.x, 0, 100, 40)},${clampNum(st.y, 0, 100, 40)},${clampNum(st.w, 5, 100, 30)},${clampNum(st.h, 5, 100, 30)}"`
          : '';
        // As in scroll sequences: no card for an empty step, and no step at all if it doesn't zoom either.
        const card = text || (ctx.preview ? '<p class="il-placeholder">This step has no text yet</p>' : '');
        if (!focusAttr && !card) return '';
        return `<div class="il-scrolly__step il-scrollpoints__step${stepCls}" data-il-step="${i}"${focusAttr}>${card ? `<div class="il-scrolly__card">${card}</div>` : ''}</div>`;
      }).join('');
      return `<section class="il-scrolly il-scrolly--overlay il-scrollpoints" id="${esc(b.id)}" data-il-scrollpoints aria-label="Scrollpoints">`
        + `${fig}<div class="il-scrolly__steps">${html}</div></section>`;
    },

    // Before/after: two labelled images. Static: side by side. Enhanced: one slider.
    compare(b, d, ctx) {
      const side = (key, word) => {
        const s = isObj(d[key]) ? d[key] : {};
        const a = ctx.asset(s.asset);
        if (!a || kindOf(a) !== 'image') return '';
        const credit = [str(a.credit), str(a.licence)].filter(Boolean).join(' · ');
        const label = str(s.label).trim();
        return `<figure class="il-compare__side il-compare__${key}"><img src="${esc(ctx.url(s.asset))}" alt="${esc(a.alt)}" decoding="async"${dims(a)}${mark(s.asset)}>`
          + `<figcaption><strong class="il-compare__label">${esc(word)}${label ? ': ' + esc(label) : ''}</strong>`
          + (credit ? ` <span class="il-credit">${esc(credit)}</span>` : '') + '</figcaption></figure>';
      };
      const before = side('before', 'Before');
      const after = side('after', 'After');
      if (!before || !after) return placeholder(b, ctx, 'Choose a before and an after image');
      return `<figure class="il-compare ${widthClass(d.width, 'wide')}" id="${esc(b.id)}" data-il-compare>`
        + `<div class="il-compare__pair">${before}${after}</div>`
        + (str(d.caption) ? `<figcaption class="il-compare__caption">${inline(d.caption)}</figcaption>` : '') + '</figure>';
    },

    // Big number: always in the HTML at its final value; enhance() may count up to it.
    number(b, d, ctx) {
      const value = str(d.value).trim();
      if (ctx.edit) {
        const unitText = str(d.unit).trim();
        return `<figure class="il-number" id="${esc(b.id)}"><p class="il-number__figure">`
          + slot(ctx, 'span', ` class="il-number__value" data-il-count="${esc(value)}"`, value, esc(value), { field: 'value', mode: 'plain', ph: '0' })
          + slot(ctx, 'span', ' class="il-number__unit"', unitText, esc(unitText), { field: 'unit', mode: 'plain', ph: 'unit', opt: true })
          + '</p><figcaption>'
          + slot(ctx, 'p', ' class="il-number__context"', str(d.context).trim(), inline(d.context), { field: 'context', mode: 'inline', ph: 'Why does this number matter?' })
          + '<p class="il-number__source">Source: '
          + slot(ctx, 'span', '', str(d.sourceName).trim(), esc(d.sourceName), { field: 'sourceName', mode: 'plain', ph: 'Who published the figure' })
          + '<span class="il-number__sep">, </span>'
          + slot(ctx, 'span', '', str(d.sourceRef).trim(), esc(d.sourceRef), { field: 'sourceRef', mode: 'plain', ph: 'link or reference', opt: true })
          + '</p></figcaption></figure>';
      }
      if (!value) return placeholder(b, ctx, 'Add a number');
      const unit = str(d.unit).trim();
      const name = str(d.sourceName).trim();
      const ref = str(d.sourceRef).trim();
      const refUrl = /^https?:\/\//i.test(ref) ? safeUrl(ref) : '';
      const source = name
        ? (refUrl ? `<a href="${esc(refUrl)}">${esc(name)}</a>` : esc(name) + (ref ? `, ${inline(ref)}` : ''))
        : (ref ? inline(ref) : '');
      return `<figure class="il-number" id="${esc(b.id)}">`
        + `<p class="il-number__figure"><span class="il-number__value" aria-hidden="true" data-il-count="${esc(value)}">${esc(value)}</span>`
        + (unit ? `<span class="il-number__unit" aria-hidden="true">${esc(unit)}</span>` : '')
        + `<span class="il-sr">${esc(value)}${unit ? ' ' + esc(unit) : ''}</span></p>`
        + '<figcaption>'
        + (str(d.context).trim() ? `<p class="il-number__context">${inline(d.context)}</p>` : '')
        + (source ? `<p class="il-number__source">Source: ${source}</p>` : (ctx.preview ? '<p class="il-number__source"><span class="il-badge">Unsourced</span></p>' : ''))
        + '</figcaption></figure>';
    },
  };

  // ------------------------------------------------------------ article + document

  // opts.assetUrl(id, asset) -> URL string. Defaults to the export layout (assets/...).
  // opts.mode 'preview' shows placeholders for empty or broken blocks; 'export' (default) skips them.
  function renderArticle(story, opts) {
    const o = opts || {};
    const s = isObj(story) ? story : {};
    const assets = isObj(s.assets) ? s.assets : {};
    const ctx = {
      meta: isObj(s.meta) ? s.meta : {},
      scheme: schemeOf(s.meta),
      preview: o.mode === 'preview',
      edit: o.mode === 'preview' && o.editable === true, // the editor's canvas: see slot()
      inline: o.inline === true, // single-file export: assets are data: URLs
      headers: 0,
      offset: 0,
      asset: (id) => (typeof id === 'string' && isObj(assets[id]) ? assets[id] : null),
      url: (id) => (o.assetUrl ? o.assetUrl(id, assets[id]) : assetPath(id, assets[id])),
    };
    const blocks = (Array.isArray(s.blocks) ? s.blocks : []).filter(isObj);
    const out = [];
    if (!blocks.some((b) => b.type === 'header') && (str(ctx.meta.title) || str(ctx.meta.standfirst))) {
      out.push(BLOCKS.header({ id: 'il-top' }, { variant: 'compact' }, ctx));
    }
    let inPart = false;
    for (const b of blocks) {
      const fn = BLOCKS[b.type];
      if (!fn) { out.push(placeholder(b, ctx, `Unknown block type "${b.type}"`)); continue; }
      const d = isObj(b.data) ? b.data : {};
      if (b.type === 'header' && ctx.headers > 0) {
        if (inPart) out.push('</section>');
        out.push(str(d.title) ? `<section class="il-part" aria-labelledby="${esc(b.id)}-title">` : '<section class="il-part">');
        inPart = true;
      }
      let html;
      try { html = fn(b, d, ctx); } catch (e) { html = placeholder(b, ctx, 'This block could not be shown'); }
      // Effects are only a marker in the HTML; the runtime's CSS and IntersectionObserver do the rest.
      if (html && EFFECTS.includes(b.effect)) {
        html = html.replace(` id="${esc(b.id)}"`, ` id="${esc(b.id)}" data-il-effect="${b.effect}"`);
      }
      // A coloured band behind the block. Full-screen headers keep their own dark background.
      const band = b.type === 'header' && d.variant !== 'compact' ? '' : bandColour(b.background, ctx.scheme);
      if (html && band) {
        html = html.replace(` id="${esc(b.id)}"`, ` id="${esc(b.id)}" data-il-band style="--il-band:${band};--il-band-ink:${inkFor(band)}"`);
      }
      out.push(html);
    }
    if (inPart) out.push('</section>');
    if (isObj(ctx.meta) && ctx.meta.appendix === true) out.push(appendix(blocks, s.reflection));
    const scheme = ctx.scheme === 'house' ? '' : ` data-il-scheme="${ctx.scheme}" style="${schemeVars(ctx.scheme)}"`;
    return `<article class="il-story"${scheme}>\n${out.filter(Boolean).join('\n')}\n</article>`;
  }

  // The maker's notes appendix (Phase 7): the student's notes on blocks and effects, and
  // their reflection answers, after the story and clearly marked as not part of it.
  const TYPE_LABELS = {
    header: 'Header', text: 'Text', columns: 'Columns', quote: 'Quote', media: 'Media', gallery: 'Gallery', embed: 'Embed',
    divider: 'Divider', references: 'References', scrolly: 'Scroll sequence', scrollpoints: 'Scrollpoints', compare: 'Before/after slider', number: 'Big number',
  };
  function appendix(blocks, reflection) {
    const notes = blocks.map((b, i) => {
      const note = str(b.note).trim();
      const fx = EFFECTS.includes(b.effect) ? str(b.effectNote).trim() : '';
      if (!note && !fx) return '';
      return `<li><p class="il-appendix__block">Block ${i + 1}: ${esc(TYPE_LABELS[b.type] || b.type)}</p>`
        + (note ? markdown(note, 4) : '')
        + (fx ? `<p><em>Movement (${esc(b.effect)}):</em> ${inline(fx)}</p>` : '') + '</li>';
    }).filter(Boolean);
    const answers = (Array.isArray(reflection) ? reflection : [])
      .filter((r) => isObj(r) && str(r.q).trim() && str(r.a).trim())
      .map((r) => `<dt>${esc(r.q)}</dt><dd>${markdown(r.a, 4)}</dd>`);
    if (!notes.length && !answers.length) return '';
    return '<aside class="il-appendix" aria-labelledby="il-appendix-title">'
      + '<h2 id="il-appendix-title">Maker\'s notes</h2>'
      + '<p class="il-appendix__intro">Notes from the maker about how this story was made. Not part of the story.</p>'
      + (notes.length ? `<h3>Notes on blocks</h3><ol class="il-appendix__notes">${notes.join('')}</ol>` : '')
      + (answers.length ? `<h3>Reflection</h3><dl class="il-appendix__reflection">${answers.join('')}</dl>` : '')
      + '</aside>';
  }

  // Markdown-free text for meta tags.
  // Formatting marks go; escaped symbols (\*) stay as the symbol.
  const plain = (text) => str(text).replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\\([\\*_[\]#!().+\-])|[*_]/g, (m, c) => c || '').replace(/\s+/g, ' ').trim();

  // Description, author, Open Graph and Twitter-card tags.
  // og:url is left out: an offline submission has no public address.
  function headTags(story, o, title) {
    const m = isObj(story && story.meta) ? story.meta : {};
    const assets = isObj(story && story.assets) ? story.assets : {};
    const desc = plain(m.seoDescription) || plain(m.standfirst);
    const share = plain(m.shareText) || desc;
    const author = str(m.byline).replace(/^\s*by\s+/i, '').trim();
    const img = typeof m.shareImage === 'string' && isObj(assets[m.shareImage]) ? assets[m.shareImage] : null;
    // A single-file page would have to repeat the whole image as a data: URL; leave it out there.
    const imgUrl = img && !o.inline ? (o.assetUrl ? o.assetUrl(m.shareImage, img) : assetPath(m.shareImage, img)) : '';
    const tag = (attr, name, content) => (content ? `<meta ${attr}="${name}" content="${esc(content)}">\n` : '');
    const time = (v) => (str(v) && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : '');
    return tag('name', 'description', desc)
      + tag('name', 'author', author)
      + tag('property', 'og:type', 'article')
      + tag('property', 'og:title', title)
      + tag('property', 'og:description', share)
      + tag('property', 'og:locale', 'en_GB')
      + tag('property', 'og:image', imgUrl)
      + (imgUrl ? tag('property', 'og:image:alt', str(img.alt))
        + (img.width > 0 && img.height > 0 ? tag('property', 'og:image:width', String(+img.width)) + tag('property', 'og:image:height', String(+img.height)) : '') : '')
      + tag('property', 'article:published_time', time(m.created))
      + tag('property', 'article:modified_time', time(m.modified))
      + tag('name', 'twitter:card', imgUrl ? 'summary_large_image' : 'summary')
      + tag('name', 'twitter:title', title)
      + tag('name', 'twitter:description', share)
      + tag('name', 'twitter:image', imgUrl)
      + (imgUrl ? tag('name', 'twitter:image:alt', str(img.alt)) : '');
  }

  // A complete, self-contained page. Pass opts.css / opts.js as text to inline them
  // (what the exporter does), or opts.cssHref / opts.jsSrc to link them.
  function renderDocument(story, opts) {
    const o = opts || {};
    const m = isObj(story && story.meta) ? story.meta : {};
    const firstHeader = (Array.isArray(story && story.blocks) ? story.blocks : [])
      .find((b) => isObj(b) && b.type === 'header' && isObj(b.data) && str(b.data.title));
    const title = str(m.seoTitle) || str(m.title) || (firstHeader ? firstHeader.data.title : '') || 'Untitled story';
    const json = JSON.stringify(Object.assign({}, story, { runtimeVersion: RUNTIME_VERSION })).replace(/</g, '\\u003c');
    const boot = '<script>window.Illuminate && window.Illuminate.enhance(document);</' + 'script>';
    const css = o.css != null ? `<style>\n${String(o.css).replace(/<\/style/gi, '<\\/style')}\n</style>`
      : o.cssHref ? `<link rel="stylesheet" href="${esc(o.cssHref)}">` : '';
    const js = o.js != null ? `<script>\n${String(o.js).replace(/<\/script/gi, '<\\/script')}\n</` + `script>\n${boot}`
      : o.jsSrc ? `<script src="${esc(o.jsSrc)}"></` + `script>\n${boot}` : '';
    return '<!doctype html>\n<html lang="en-GB">\n<head>\n<meta charset="utf-8">\n'
      + '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
      + `<title>${esc(title)}</title>\n`
      + headTags(story, o, title)
      + `<meta name="generator" content="Illuminate ${RUNTIME_VERSION}">\n${css}\n</head>\n`
      + `<body class="il-page"${schemeOf(m) === 'house' ? '' : ` style="background:${SCHEMES[schemeOf(m)].bg}"`}>\n<main>\n${renderArticle(story, o)}\n</main>\n`
      + `<script type="application/json" id="illuminate-source">${json}</` + 'script>\n'
      + (o.bodyEnd ? o.bodyEnd + '\n' : '')
      + `${js}\n</body>\n</html>\n`;
  }

  // ------------------------------------------------------------ enhancements

  function lightbox(doc) {
    if (doc.ilLightbox) return doc.ilLightbox;
    const dlg = doc.createElement('dialog');
    dlg.className = 'il-lightbox';
    dlg.setAttribute('aria-label', 'Image viewer');
    dlg.innerHTML = '<figure class="il-lightbox__figure"><img class="il-lightbox__img" alt="">'
      + '<figcaption class="il-lightbox__caption"></figcaption></figure>'
      + '<div class="il-lightbox__bar"><p class="il-lightbox__count" aria-live="polite"></p>'
      + '<button type="button" class="il-btn" data-il="prev">Previous</button>'
      + '<button type="button" class="il-btn" data-il="next">Next</button>'
      + '<button type="button" class="il-btn" data-il="close">Close</button></div>';
    doc.body.appendChild(dlg);
    const $ = (sel) => dlg.querySelector(sel);
    const st = { items: [], i: 0, opener: null };
    const show = (i) => {
      const n = st.items.length;
      st.i = (i + n) % n;
      const it = st.items[st.i];
      $('.il-lightbox__img').src = it.src;
      $('.il-lightbox__img').alt = it.alt;
      $('.il-lightbox__caption').innerHTML = it.caption;
      $('.il-lightbox__count').textContent = `Image ${st.i + 1} of ${n}`;
    };
    dlg.addEventListener('click', (e) => {
      if (e.target === dlg) return dlg.close();
      const btn = e.target.closest('[data-il]');
      if (!btn) return;
      const act = btn.getAttribute('data-il');
      if (act === 'close') dlg.close();
      else show(st.i + (act === 'next' ? 1 : -1));
    });
    dlg.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); show(st.i + 1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); show(st.i - 1); }
    });
    dlg.addEventListener('close', () => { if (st.opener) st.opener.focus(); });
    doc.ilLightbox = {
      open(items, i, opener) {
        st.items = items;
        st.opener = opener;
        const single = items.length < 2;
        $('[data-il="prev"]').hidden = single;
        $('[data-il="next"]').hidden = single;
        show(i);
        dlg.showModal();
        $(single ? '[data-il="close"]' : '[data-il="next"]').focus();
      },
    };
    return doc.ilLightbox;
  }

  function setupGallery(g, doc) {
    const win = doc.defaultView;
    if (!win || typeof win.HTMLDialogElement !== 'function') return; // plain links still open each image
    const figures = Array.from(g.querySelectorAll('.il-gallery__item > figure'));
    const n = figures.length;
    const items = [];
    const links = figures.map((fig, i) => {
      const img = fig.querySelector('img');
      const alt = img ? img.getAttribute('alt') : '';
      let a = fig.querySelector('.il-gallery__link');
      if (!a && img) {
        // Single-file pages have no link around each image; a button opens the viewer instead.
        a = doc.createElement('button');
        a.type = 'button';
        a.className = 'il-gallery__link';
        a.setAttribute('aria-label', `View image ${i + 1} of ${n} full size` + (alt ? ': ' + alt : ''));
        img.replaceWith(a);
        a.appendChild(img);
      }
      const fc = fig.querySelector('figcaption');
      items.push({ src: (a && a.getAttribute('href')) || (img ? img.currentSrc || img.src : ''), alt, caption: fc ? fc.innerHTML : '' });
      return a;
    }).filter(Boolean);
    links.forEach((a, i) => {
      a.setAttribute('aria-haspopup', 'dialog');
      a.addEventListener('click', (e) => {
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        lightbox(doc).open(items, i, a);
      });
    });
  }

  // Embedded players for YouTube, Vimeo, Spotify and SoundCloud. The link card (with its
  // archived screenshot) is in the HTML; the player is added on top of it when the page opens.
  // Without JavaScript, offline, and in print, the card is what readers get.
  function setupEmbed(fig, doc) {
    const frame = fig.querySelector('.il-embed__frame');
    const card = fig.querySelector('.il-card');
    const win = doc.defaultView;
    if (!frame || !card || !win) return;
    const label = fig.getAttribute('data-il-embed-label');
    // YouTube refuses to play inside a page opened from a file (it shows "Error 153"),
    // so readers get the link there, with a note saying why.
    if (fig.getAttribute('data-il-embed-provider') === 'youtube' && doc.location && doc.location.protocol === 'file:') {
      const note = doc.createElement('p');
      note.className = 'il-embed__note';
      note.textContent = 'YouTube doesn\'t play videos inside a story opened from a file. Use the link to watch it on YouTube.';
      frame.after(note);
      return;
    }
    const insert = () => {
      if (fig.querySelector('.il-embed__iframe')) return;
      const f = doc.createElement('iframe');
      f.className = 'il-embed__iframe';
      f.src = fig.getAttribute('data-il-embed-src');
      f.title = `${card.querySelector('.il-card__title').textContent} (${label} player)`;
      f.setAttribute('loading', 'lazy');
      f.setAttribute('allow', 'autoplay; encrypted-media; fullscreen; picture-in-picture; clipboard-write');
      f.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
      const h = fig.getAttribute('data-il-embed-height');
      if (h) f.style.height = h + 'px';
      else f.classList.add('il-embed__iframe--video');
      frame.insertBefore(f, card);
      fig.classList.add('has-player');
    };
    // Offline, a player would only show an error page: keep the card until the connection is back.
    if (win.navigator && win.navigator.onLine === false) win.addEventListener('online', insert, { once: true });
    else insert();
  }


  // Collapsed references open for printing, then close again.
  function setupPrint(doc) {
    const win = doc.defaultView;
    if (!win || doc.ilPrint) return;
    doc.ilPrint = true;
    win.addEventListener('beforeprint', () => {
      (doc.ilFinalisers || []).forEach((finish) => finish());
      doc.querySelectorAll('.il-story details:not([open])').forEach((d) => { d.open = true; d.dataset.ilPrintOpened = ''; });
    });
    win.addEventListener('afterprint', () => {
      doc.querySelectorAll('[data-il-print-opened]').forEach((d) => { d.open = false; delete d.dataset.ilPrintOpened; });
    });
  }

  const reducedMotion = (doc) => {
    const win = doc.defaultView;
    return !win || !win.matchMedia || win.matchMedia('(prefers-reduced-motion: reduce)').matches;
  };

  // Scroll sequence: copies each step's image into one sticky panel and shows the image
  // for whichever step is in the middle of the screen. The step's own image stays in the
  // page (hidden on screen, shown in print), so nothing depends on the effect.
  function setupScrolly(section, doc) {
    const win = doc.defaultView;
    if (!win || typeof win.IntersectionObserver !== 'function') return;
    const steps = Array.from(section.querySelectorAll('.il-scrolly__step'));
    const panel = doc.createElement('div');
    panel.className = 'il-scrolly__panel';
    const frames = [];
    let current = -1;
    const frameFor = steps.map((step) => {
      const fig = step.querySelector('.il-scrolly__media');
      if (fig) {
        const frame = fig.cloneNode(true);
        frame.className = 'il-scrolly__frame';
        frame.setAttribute('aria-hidden', 'true'); // the step's own figure is the accessible copy
        panel.appendChild(frame);
        frames.push(frame);
        current = frames.length - 1;
      }
      return current; // steps without an image keep the previous one
    });
    if (!frames.length) return;
    section.insertBefore(panel, section.firstChild);
    section.classList.add('is-enhanced');
    const motionOk = !reducedMotion(doc);
    const show = (i) => {
      const f = Math.max(0, frameFor[i]);
      frames.forEach((fr, j) => {
        const active = j === f;
        fr.classList.toggle('is-active', active);
        const vid = fr.querySelector('video');
        if (vid) {
          if (active && motionOk) vid.play?.().catch(() => {});
          else vid.pause?.();
        }
      });
      steps.forEach((st, j) => st.classList.toggle('is-active', j === i));
      // Which side the step on screen sits: an overlay's vignette darkens that side of the image.
      const cls = steps[i] ? steps[i].classList : null;
      section.setAttribute('data-il-side', cls && cls.contains('il-scrolly__step--left') ? 'left'
        : cls && cls.contains('il-scrolly__step--right') ? 'right' : 'center');
    };
    show(0);
    const io = new win.IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) show(steps.indexOf(e.target)); });
    }, { rootMargin: '-50% 0px -50% 0px' });
    steps.forEach((st) => io.observe(st));
  }

  // Scrollpoints: one sticky image panel zooms and pans to each step's highlighted region.
  function setupScrollpoints(section, doc) {
    const win = doc.defaultView;
    if (!win || typeof win.IntersectionObserver !== 'function') return;
    const fig = section.querySelector('.il-scrollpoints__media');
    const steps = Array.from(section.querySelectorAll('.il-scrollpoints__step'));
    if (!fig || !steps.length) return;
    const panel = doc.createElement('div');
    panel.className = 'il-scrolly__panel il-scrollpoints__panel';
    const stage = doc.createElement('div');
    stage.className = 'il-scrollpoints__stage';
    const clone = fig.querySelector('img')?.cloneNode(true);
    if (!clone) return;
    clone.setAttribute('aria-hidden', 'true');
    const box = doc.createElement('div');
    box.className = 'il-scrollpoints__box';
    box.setAttribute('aria-hidden', 'true');
    stage.appendChild(clone);
    stage.appendChild(box);
    panel.appendChild(stage);
    const cap = fig.querySelector('figcaption');
    if (cap) panel.appendChild(cap.cloneNode(true));
    section.insertBefore(panel, section.firstChild);
    section.classList.add('is-enhanced');

    const show = (i) => {
      steps.forEach((st, j) => st.classList.toggle('is-active', j === i));
      const raw = steps[i]?.getAttribute('data-il-focus');
      if (!raw) {
        box.classList.remove('is-visible');
        stage.style.transform = 'none';
        stage.style.setProperty('--il-sp-scale', '1');
        return;
      }
      const [x, y, w, h] = raw.split(',').map(Number);
      box.style.left = `${x}%`;
      box.style.top = `${y}%`;
      box.style.width = `${w}%`;
      box.style.height = `${h}%`;
      box.classList.add('is-visible');
      // Zoom so the highlighted area sits in the free part of the screen: beside the text box
      // when the box is on the left or right, otherwise in the middle. Under reduced motion the
      // image jumps there without animating (the transition is only set when motion is allowed).
      const W = stage.offsetWidth;
      const H = stage.offsetHeight;
      if (!W || !H) return;
      const pw = panel.clientWidth;
      const ph = panel.clientHeight;
      const region = { left: 0, right: pw, top: 0, bottom: ph };
      const card = steps[i].querySelector('.il-scrolly__card');
      const side = steps[i].classList.contains('il-scrolly__step--left') ? 'left'
        : steps[i].classList.contains('il-scrolly__step--right') ? 'right' : '';
      if (card && side && pw >= 700) {
        const pr = panel.getBoundingClientRect();
        const cr = card.getBoundingClientRect();
        const gap = 32;
        if (side === 'left') region.left = Math.min(pw * 0.7, cr.right - pr.left + gap);
        else region.right = Math.max(pw * 0.3, cr.left - pr.left - gap);
      } else if (pw < 700) {
        // Phones: the text box is full width and rests low on the screen (see the CSS), so the
        // highlighted area goes in the top half.
        region.bottom = ph * 0.52;
      }
      const rw = region.right - region.left;
      const rh = region.bottom - region.top;
      const hw = (w / 100) * W;
      const hh = (h / 100) * H;
      // Fill about three-quarters of the free space; shrink the image if the area is too big for it.
      const scale = Math.max(0.5, Math.min(2.8, (rw * 0.75) / hw, (rh * 0.75) / hh));
      // Where the highlight's centre should land, in the stage's own coordinates.
      const tx = region.left + rw / 2 - stage.offsetLeft;
      const ty = region.top + rh / 2 - stage.offsetTop;
      // transform-origin is the stage's centre (cx, cy): a point p lands at c + scale × (p − c + shift).
      const cx = W / 2;
      const cy = H / 2;
      const dx = (tx - cx) / scale - ((x + w / 2) / 100) * W + cx;
      const dy = (ty - cy) / scale - ((y + h / 2) / 100) * H + cy;
      stage.style.transform = `scale(${scale.toFixed(3)}) translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`;
      stage.style.setProperty('--il-sp-scale', scale.toFixed(3)); // keeps the highlight's border the same width
    };
    let current = 0;
    show(0);
    const io = new win.IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { current = steps.indexOf(e.target); show(current); } });
    }, { rootMargin: '-50% 0px -50% 0px' });
    steps.forEach((st) => io.observe(st));
    // The free space changes with the window (or a phone turning sideways).
    let resizeTimer = 0;
    win.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => show(current), 150); });
    if (!clone.complete) clone.addEventListener('load', () => show(current), { once: true }); // its size is known only once loaded
  }

  function setupBgVideos(videos, doc) {
    const win = doc.defaultView;
    if (!videos.length || !win) return;
    if (reducedMotion(doc)) {
      videos.forEach((v) => v.pause?.());
      return;
    }
    if (typeof win.IntersectionObserver !== 'function') {
      videos.forEach((v) => v.play?.().catch(() => {}));
      return;
    }
    const io = new win.IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) e.target.play?.().catch(() => {});
        else e.target.pause?.();
      });
    });
    videos.forEach((v) => io.observe(v));
  }

  // Before/after slider. Skipped under reduced motion: the images stay side by side.
  function setupCompare(fig, doc) {
    if (reducedMotion(doc)) return;
    const pair = fig.querySelector('.il-compare__pair');
    const before = fig.querySelector('.il-compare__before');
    const after = fig.querySelector('.il-compare__after');
    if (!pair || !before || !after) return;
    const label = (el) => {
      const name = (el.querySelector('.il-compare__label') || {}).textContent || '';
      const credit = (el.querySelector('.il-credit') || {}).textContent || '';
      return credit ? `${name} (${credit})` : name;
    };
    const bar = doc.createElement('p');
    bar.className = 'il-compare__labels';
    bar.setAttribute('aria-hidden', 'true'); // the figcaptions stay as the accessible labels
    bar.innerHTML = `<span>◀ ${esc(label(before))}</span><span>${esc(label(after))} ▶</span>`;
    const input = doc.createElement('input');
    input.type = 'range';
    input.min = '0';
    input.max = '100';
    input.value = '50';
    input.className = 'il-compare__range';
    input.setAttribute('aria-label', 'Before and after comparison. Move left to see more of the after image, right to see more of the before image.');
    const update = () => {
      pair.style.setProperty('--il-pos', input.value + '%');
      input.setAttribute('aria-valuetext', `${input.value}% before, ${100 - input.value}% after`);
    };
    input.addEventListener('input', update);
    update();
    pair.after(bar, input);
    fig.classList.add('is-slider');
  }

  // Big number: counts up from zero each time it scrolls into view.
  // Skipped under reduced motion; printing always shows the final value.
  function parseCount(text) {
    const m = String(text).match(/^(.*?)(\d[\d,]*(?:\.\d+)?)(.*)$/);
    if (!m) return null;
    const decimals = (m[2].split('.')[1] || '').length;
    const commas = m[2].includes(',');
    const target = parseFloat(m[2].replace(/,/g, ''));
    if (!Number.isFinite(target)) return null;
    const fmt = (x) => m[1] + (commas
      ? x.toLocaleString('en-GB', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
      : x.toFixed(decimals)) + m[3];
    return { target, fmt };
  }

  function setupNumber(el, doc) {
    const win = doc.defaultView;
    const final = el.getAttribute('data-il-count');
    const parsed = parseCount(final);
    if (!parsed || !win || reducedMotion(doc) || typeof win.IntersectionObserver !== 'function') return;
    let frame = 0;
    let armed = true; // ready to count the next time the number comes into view
    const finish = () => { win.cancelAnimationFrame(frame); el.textContent = final; };
    (doc.ilFinalisers = doc.ilFinalisers || []).push(finish);
    el.textContent = parsed.fmt(0);
    const count = () => {
      const start = win.performance.now();
      const tick = (now) => {
        const t = Math.min(1, (now - start) / 1200);
        const eased = 1 - Math.pow(1 - t, 3);
        el.textContent = t < 1 ? parsed.fmt(parsed.target * eased) : final;
        if (t < 1) frame = win.requestAnimationFrame(tick);
      };
      frame = win.requestAnimationFrame(tick);
    };
    // Counts up each time it comes into view. Once it has left the screen completely,
    // it quietly resets to zero (out of sight) so it can count again next time.
    const io = new win.IntersectionObserver((entries) => {
      const e = entries[entries.length - 1];
      if (e.intersectionRatio >= 0.6 && armed) {
        armed = false;
        count();
      } else if (!e.isIntersecting && !armed) {
        win.cancelAnimationFrame(frame);
        el.textContent = parsed.fmt(0);
        armed = true;
      }
    }, { threshold: [0, 0.6] });
    io.observe(el);
  }

  // Effects: a block with data-il-effect fades, rises, slides or zooms in the first time it
  // scrolls into view. The hidden starting state only exists in CSS under
  // prefers-reduced-motion: no-preference, and only once this has added .il-fx,
  // so without JavaScript, with reduced motion, or in print, nothing is ever hidden.
  function setupEffects(elements, doc) {
    const win = doc.defaultView;
    if (!elements.length || !win || reducedMotion(doc) || typeof win.IntersectionObserver !== 'function') return;
    const io = new win.IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        e.target.classList.add('is-in');
        io.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px -8% 0px' });
    elements.forEach((el) => {
      el.classList.add('il-fx');
      io.observe(el);
    });
  }

  // Single-file pages hold video and audio as data: URLs, which some browsers
  // (notably Safari) can't seek in or play. A blob: URL of the same bytes plays everywhere.
  function dataToBlobUrl(media) {
    if (typeof fetch !== 'function' || typeof URL.createObjectURL !== 'function') return;
    fetch(media.getAttribute('src'))
      .then((r) => r.blob())
      .then((blob) => { media.src = URL.createObjectURL(blob); })
      .catch(() => { /* keep the data: URL */ });
  }

  // Safe to call more than once: each element is only enhanced the first time.
  function enhance(scope) {
    const rootNode = scope || root.document;
    if (!rootNode) return;
    const doc = rootNode.ownerDocument || rootNode;
    doc.documentElement.classList.add('il-js');
    const fresh = (sel) => Array.from(rootNode.querySelectorAll(sel + ':not([data-il-ready])'))
      .map((el) => { el.setAttribute('data-il-ready', ''); return el; });
    fresh('[data-il-gallery]').forEach((g) => setupGallery(g, doc));
    fresh('[data-il-embed-src]').forEach((e) => setupEmbed(e, doc));
    fresh('video[src^="data:"], audio[src^="data:"]').forEach(dataToBlobUrl);
    fresh('[data-il-scrolly]').forEach((el) => setupScrolly(el, doc));
    fresh('[data-il-scrollpoints]').forEach((el) => setupScrollpoints(el, doc));
    fresh('.il-header__media [data-il-bg-video]').forEach((v) => setupBgVideos([v], doc));
    fresh('[data-il-compare]').forEach((el) => setupCompare(el, doc));
    fresh('[data-il-count]').forEach((el) => setupNumber(el, doc));
    setupEffects(Array.from(rootNode.querySelectorAll('[data-il-effect]:not(.il-fx)')), doc);
    setupPrint(doc);
  }

  const api = Object.freeze({
    RUNTIME_VERSION, renderArticle, renderDocument, enhance, embedInfo, markdown, inline, assetPath,
    SCHEMES, bandColour, inkFor, contrast,
  });
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  root.Illuminate = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
