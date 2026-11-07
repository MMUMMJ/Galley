/*! Illuminate runtime: renders an Illuminate story into a reader-facing page.
 *  Inlined into every export, so it must stay self-contained: no imports, no network.
 *  renderArticle / renderDocument produce static HTML that reads fine without JavaScript.
 *  enhance() then adds the optional extras (gallery lightbox, embed players, print). */
(function (root) {
  'use strict';

  const RUNTIME_VERSION = '1.1.0';

  // ------------------------------------------------------------ helpers

  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ESC[c]);
  const str = (v) => (typeof v === 'string' ? v : '');
  const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  const WIDTHS = ['column', 'wide', 'full'];
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
      const data = info ? ` data-il-embed-src="${esc(info.src)}" data-il-embed-label="${esc(info.label)}"`
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
      try { out.push(fn(b, d, ctx)); } catch (e) { out.push(placeholder(b, ctx, 'This block could not be shown')); }
    }
    if (inPart) out.push('</section>');
    return `<article class="il-story">\n${out.filter(Boolean).join('\n')}\n</article>`;
  }

  // A complete, self-contained page. Pass opts.css / opts.js as text to inline them
  // (what the exporter does), or opts.cssHref / opts.jsSrc to link them.
  function renderDocument(story, opts) {
    const o = opts || {};
    const m = isObj(story && story.meta) ? story.meta : {};
    const firstHeader = (Array.isArray(story && story.blocks) ? story.blocks : [])
      .find((b) => isObj(b) && b.type === 'header' && isObj(b.data) && str(b.data.title));
    const title = str(m.seoTitle) || str(m.title) || (firstHeader ? firstHeader.data.title : '') || 'Untitled story';
    const desc = str(m.seoDescription) || str(m.standfirst);
    const json = JSON.stringify(Object.assign({}, story, { runtimeVersion: RUNTIME_VERSION })).replace(/</g, '\\u003c');
    const boot = '<script>window.Illuminate && window.Illuminate.enhance(document);</' + 'script>';
    const css = o.css != null ? `<style>\n${String(o.css).replace(/<\/style/gi, '<\\/style')}\n</style>`
      : o.cssHref ? `<link rel="stylesheet" href="${esc(o.cssHref)}">` : '';
    const js = o.js != null ? `<script>\n${String(o.js).replace(/<\/script/gi, '<\\/script')}\n</` + `script>\n${boot}`
      : o.jsSrc ? `<script src="${esc(o.jsSrc)}"></` + `script>\n${boot}` : '';
    return '<!doctype html>\n<html lang="en-GB">\n<head>\n<meta charset="utf-8">\n'
      + '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
      + `<title>${esc(title)}</title>\n`
      + (desc ? `<meta name="description" content="${esc(desc)}">\n` : '')
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

  function setupEmbed(fig, doc) {
    const frame = fig.querySelector('.il-embed__frame');
    const card = fig.querySelector('.il-card');
    if (!frame || !card) return;
    const label = fig.getAttribute('data-il-embed-label');
    const btn = doc.createElement('button');
    btn.type = 'button';
    btn.className = 'il-btn il-embed__play';
    btn.textContent = `Play here (loads ${label})`;
    btn.addEventListener('click', () => {
      const f = doc.createElement('iframe');
      f.className = 'il-embed__iframe';
      f.src = fig.getAttribute('data-il-embed-src');
      f.title = `${card.querySelector('.il-card__title').textContent} (${label} player)`;
      f.setAttribute('allow', 'autoplay; encrypted-media; fullscreen; picture-in-picture; clipboard-write');
      f.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
      const h = fig.getAttribute('data-il-embed-height');
      if (h) f.style.height = h + 'px';
      else f.classList.add('il-embed__iframe--video');
      frame.insertBefore(f, card);
      btn.remove();
      f.focus();
    });
    frame.after(btn);
  }

  // Collapsed references open for printing, then close again.
  function setupPrint(doc) {
    const win = doc.defaultView;
    if (!win || doc.ilPrint) return;
    doc.ilPrint = true;
    win.addEventListener('beforeprint', () => {
      doc.querySelectorAll('.il-story details:not([open])').forEach((d) => { d.open = true; d.dataset.ilPrintOpened = ''; });
    });
    win.addEventListener('afterprint', () => {
      doc.querySelectorAll('[data-il-print-opened]').forEach((d) => { d.open = false; delete d.dataset.ilPrintOpened; });
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
    setupPrint(doc);
  }

  const api = Object.freeze({
    RUNTIME_VERSION, renderArticle, renderDocument, enhance, embedInfo, markdown, inline, assetPath,
  });
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  root.Illuminate = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
