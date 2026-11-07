/*! Illuminate runtime: renders an Illuminate story into a reader-facing page.
 *  Inlined into every export, so it must stay self-contained: no imports, no network.
 *  renderArticle / renderDocument produce static HTML that reads fine without JavaScript.
 *  enhance() then adds the optional extras (gallery lightbox, embed players, print). */
(function (root) {
  'use strict';

  const RUNTIME_VERSION = '1.6.0';

  // ------------------------------------------------------------ helpers

  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ESC[c]);
  const str = (v) => (typeof v === 'string' ? v : '');
  const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  const WIDTHS = ['column', 'wide', 'full'];
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
  function markdown(text, level) {
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

  function placeholder(b, ctx, message) {
    return ctx.preview ? `<div class="il-placeholder" id="${esc(b.id)}" role="note">${esc(message)}</div>` : '';
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
      const img = a && kindOf(a) === 'image'
        ? `<div class="il-header__media"><img src="${esc(ctx.url(d.media))}" alt="${esc(a.alt)}"${dims(a)}${mark(d.media)}></div>` : '';
      const credit = a && img ? [str(a.credit), str(a.licence)].filter(Boolean).join(' · ') : '';
      return `<header class="il-header il-header--${variant}${img ? ' il-header--media' : ''}" id="${esc(b.id)}">${img}`
        + '<div class="il-header__text">'
        + (str(d.kicker) ? `<p class="il-kicker">${esc(d.kicker)}</p>` : '')
        + (title ? `<h${lvl} class="il-title" id="${esc(b.id)}-title">${esc(title)}</h${lvl}>` : '')
        + (standfirst ? `<p class="il-standfirst">${inline(standfirst)}</p>` : '')
        + (byline ? `<p class="il-byline">${esc(byline)}</p>` : '')
        + '</div>'
        + (credit ? `<p class="il-header__credit">${esc(credit)}</p>` : '')
        + '</header>';
    },

    text(b, d, ctx) {
      const html = markdown(d.body, 2 + ctx.offset);
      return html ? `<div class="il-text" id="${esc(b.id)}">${html}</div>` : placeholder(b, ctx, 'Empty text block');
    },

    quote(b, d, ctx) {
      const lines = str(d.text).split(/\n+/).map((s) => s.trim()).filter(Boolean);
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
      const info = embedInfo(url);
      let host = '';
      try { host = new URL(url).hostname.replace(/^www\./, ''); } catch (e) { host = url; }
      const title = str(d.title) || (info ? `${info.label}: ${host}` : host);
      const shot = ctx.asset(d.screenshot);
      const data = info ? ` data-il-embed-src="${esc(info.src)}" data-il-embed-label="${esc(info.label)}" data-il-embed-provider="${info.provider}"`
        + (info.height ? ` data-il-embed-height="${info.height}"` : '') : '';
      return `<figure class="il-embed ${widthClass(d.width)}" id="${esc(b.id)}"${data}><div class="il-embed__frame">`
        + `<a class="il-card" href="${esc(url)}">`
        + (shot ? `<img class="il-card__img" src="${esc(ctx.url(d.screenshot))}" alt="${esc(shot.alt)}"${dims(shot)}${mark(d.screenshot)}>` : '')
        + `<span class="il-card__body"><span class="il-card__title">${esc(title)}</span>`
        + (str(d.description) ? `<span class="il-card__desc">${esc(d.description)}</span>` : '')
        + `<span class="il-card__host">${esc(host)}</span><span class="il-card__url">${esc(url)}</span></span></a></div>`
        + (shot ? figcaption(shot) : '') + '</figure>';
    },

    divider(b, d) {
      const text = str(d.text).trim();
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
      const layout = d.layout === 'overlay' ? 'overlay' : 'side';
      const html = steps.map((st, i) => {
        const a = ctx.asset(st.media);
        const fig = a && kindOf(a) === 'image'
          ? `<figure class="il-scrolly__media"><img src="${esc(ctx.url(st.media))}" alt="${esc(a.alt)}" decoding="async"${dims(a)}${mark(st.media)}>${figcaption(a)}</figure>`
          : '';
        const text = markdown(st.text, 2 + ctx.offset);
        return `<div class="il-scrolly__step" data-il-step="${i}">${fig}<div class="il-scrolly__card">${text || (ctx.preview ? '<p class="il-placeholder">This step has no text yet</p>' : '')}</div></div>`;
      }).join('');
      return `<section class="il-scrolly il-scrolly--${layout}" id="${esc(b.id)}" data-il-scrolly aria-label="Scroll sequence">`
        + `<div class="il-scrolly__steps">${html}</div></section>`;
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
      preview: o.mode === 'preview',
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
      out.push(html);
    }
    if (inPart) out.push('</section>');
    if (isObj(ctx.meta) && ctx.meta.appendix === true) out.push(appendix(blocks, s.reflection));
    return `<article class="il-story">\n${out.filter(Boolean).join('\n')}\n</article>`;
  }

  // The maker's notes appendix (Phase 7): the student's notes on blocks and effects, and
  // their reflection answers, after the story and clearly marked as not part of it.
  const TYPE_LABELS = {
    header: 'Header', text: 'Text', quote: 'Quote', media: 'Media', gallery: 'Gallery', embed: 'Embed',
    divider: 'Divider', references: 'References', scrolly: 'Scroll sequence', compare: 'Before/after slider', number: 'Big number',
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
  const plain = (text) => str(text).replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_]/g, '').replace(/\s+/g, ' ').trim();

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
      + `<body class="il-page">\n<main>\n${renderArticle(story, o)}\n</main>\n`
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
    const show = (i) => {
      const f = Math.max(0, frameFor[i]);
      frames.forEach((fr, j) => fr.classList.toggle('is-active', j === f));
      steps.forEach((st, j) => st.classList.toggle('is-active', j === i));
    };
    show(0);
    const io = new win.IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) show(steps.indexOf(e.target)); });
    }, { rootMargin: '-50% 0px -50% 0px' });
    steps.forEach((st) => io.observe(st));
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
    fresh('[data-il-compare]').forEach((el) => setupCompare(el, doc));
    fresh('[data-il-count]').forEach((el) => setupNumber(el, doc));
    setupEffects(Array.from(rootNode.querySelectorAll('[data-il-effect]:not(.il-fx)')), doc);
    setupPrint(doc);
  }

  const api = Object.freeze({
    RUNTIME_VERSION, renderArticle, renderDocument, enhance, embedInfo, markdown, inline, assetPath,
  });
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  root.Illuminate = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
