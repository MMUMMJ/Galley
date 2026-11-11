// Story details: the newsroom metadata an editor fills in before publishing.
// Title, standfirst and byline appear on the page; the search and sharing fields
// go into the exported page's <head> for search engines and social media.
import { h } from './dom.js';
import { textInput, textArea, thumb, assetBrowser, assetKind } from './fields.js';
import { renderSchemePicker } from './scheme-picker.js';
import { richText } from './rich-text.js';

export const SEO_TITLE_MAX = 60;
export const SEO_DESCRIPTION_MAX = 155;

// Markdown-free text, for previews and fallbacks.
export function plain(text) {
  return String(text || '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\\([\\*_[\]#!().+-])|[*_]/g, (m, c) => c || '').replace(/\s+/g, ' ').trim();
}

const chars = (s) => [...String(s || '')].length;

// What will actually be used, after fallbacks. Mirrors the runtime's head tags.
export function effectiveMeta(story) {
  const m = story.meta;
  const firstHeader = story.blocks.find((b) => b.type === 'header');
  const headerTitle = firstHeader?.data.title || '';
  const headerStand = firstHeader?.data.standfirst || '';
  const headerByline = firstHeader?.data.byline || '';
  const title = m.title || headerTitle;
  const standfirst = m.standfirst || headerStand;
  const byline = m.byline || headerByline;
  const seoTitle = m.seoTitle || title;
  const seoDescription = m.seoDescription || plain(standfirst);
  return { title, standfirst, byline, seoTitle, seoDescription, shareText: m.shareText || seoDescription };
}

let seoOpen = false;

// ctx: the inspector's context, re-pointed at story.meta (see inspector.js).
export function renderMetadata(el, ctx) {
  const story = ctx.story;
  const eff = effectiveMeta(story);
  const firstHeader = story.blocks.find((b) => b.type === 'header');

  const counted = (key, label, max, hint, multiline) => {
    const opts = { label, hint, placeholder: key === 'seoTitle' ? eff.title : plain(story.meta.standfirst) };
    const wrap = multiline ? textArea(ctx, key, { ...opts, rows: 3 }) : textInput(ctx, key, opts);
    const control = wrap.querySelector('input, textarea');
    const counter = h('p', { class: 'char-count', id: `${control.id}-count` });
    const flag = h('p', { class: 'char-flag', role: 'status' });
    control.setAttribute('aria-describedby', `${control.getAttribute('aria-describedby') || ''} ${counter.id}`.trim());
    const update = () => {
      const n = chars(control.value || control.placeholder);
      const usingFallback = !control.value && control.placeholder;
      counter.textContent = `${n} of ${max} characters${usingFallback ? ' (using the fallback)' : ''}`;
      const over = n > max;
      counter.classList.toggle('is-over', over);
      const message = over ? `That's ${n - max} over ${max}. Search results may cut it off. What could go?` : '';
      if (flag.textContent !== message) flag.textContent = message;
    };
    control.addEventListener('input', update);
    update();
    wrap.append(counter, flag);
    return wrap;
  };

  // Share image: chosen from the story's own images.
  const images = Object.entries(story.assets).filter(([, a]) => assetKind(a) === 'image');
  const current = story.meta.shareImage;
  const shareAsset = current ? story.assets[current] : null;
  const otherImages = images.filter(([id]) => id !== current);
  const shareImage = h('div', { class: 'field' },
    h('p', { class: 'field-label' }, 'Share image'),
    h('p', { class: 'field-hint' }, images.length
      ? 'Shown when the story is shared on social media. Choose from your story\'s images.'
      : 'Import images into your blocks first; then choose one here.'),
    shareAsset ? h('div', { class: 'asset-current' }, thumb(ctx, current),
      h('span', {},
        h('strong', {}, shareAsset.name || 'Untitled image'), h('br'),
        shareAsset.alt ? `Alt text: ${shareAsset.alt}` : h('span', { class: 'badge' }, 'This image has no alt text yet')),
      h('button', {
        type: 'button', class: 'btn', 'data-focus': 'meta:shareImage:remove',
        onclick: () => { ctx.set('shareImage', null, { rerender: true }); ctx.announce('Share image removed.'); },
      }, 'Remove')) : null,
    assetBrowser(ctx, otherImages, {
      label: shareAsset ? 'Or use another image in this story:' : null,
      focusKey: 'meta:shareImage',
      onPick: (id, a) => { ctx.set('shareImage', id, { rerender: true }); ctx.announce(`${a.name || 'Share image'} chosen.`); },
    }));

  // Previews: generic, not any one platform's design.
  const searchTitle = h('span', { class: 'serp-title' });
  const searchDesc = h('span', { class: 'serp-desc' });
  const cardTitle = h('strong', {});
  const cardDesc = h('span', {});
  const cardImg = shareAsset && ctx.assetUrl(current) ? h('img', { src: ctx.assetUrl(current), alt: '' }) : h('span', { class: 'share-noimg' }, 'No share image');
  const refresh = () => {
    const e = effectiveMeta(ctx.liveStory());
    searchTitle.textContent = truncate(e.seoTitle || 'Untitled story', SEO_TITLE_MAX);
    searchDesc.textContent = truncate(e.seoDescription || 'No description yet.', SEO_DESCRIPTION_MAX);
    cardTitle.textContent = e.seoTitle || 'Untitled story';
    cardDesc.textContent = truncate(e.shareText || '', 120);
  };
  refresh();

  const hasDifferentHeader = firstHeader && firstHeader.data.title && story.meta.title && firstHeader.data.title !== story.meta.title;
  const headerNote = firstHeader ? h('div', { class: 'meta-header-sync' },
    hasDifferentHeader
      ? h('p', { class: 'field-hint' }, `Your opening Header block currently shows "${firstHeader.data.title}" on the page instead of this title.`)
      : h('p', { class: 'field-hint' }, 'Changes here also update your opening Header block.'),
    h('div', { class: 'button-row' },
      hasDifferentHeader && ctx.syncToHeader ? h('button', {
        type: 'button', class: 'btn-slim',
        onclick: () => { ctx.syncToHeader(); ctx.announce('Updated the opening Header block to match Story details.'); },
      }, 'Use this title on the header too') : null,
      ctx.selectBlock ? h('button', {
        type: 'button', class: 'btn-slim',
        onclick: () => ctx.selectBlock(firstHeader.id),
      }, 'Go to opening Header block →') : null)) : null;

  const seoDetails = h('details', { class: 'meta-seo', open: seoOpen || Boolean(story.meta.seoTitle || story.meta.seoDescription || story.meta.shareImage || story.meta.shareText) },
    h('summary', { 'data-focus': 'meta:seo-summary' }, 'Search & social sharing (optional)'),
    h('div', { class: 'meta-seo-body' },
      h('fieldset', { class: 'field' }, h('legend', {}, 'Search engines'),
        counted('seoTitle', 'SEO title', SEO_TITLE_MAX, 'What a search result shows as the link. Lead with the words people would search for.'),
        counted('seoDescription', 'SEO description', SEO_DESCRIPTION_MAX, 'The line under the link in search results. Leave empty to use the standfirst.', true),
        h('div', { class: 'preview-card serp', 'aria-hidden': 'true' }, h('span', { class: 'preview-label' }, 'Search result preview'), searchTitle, searchDesc)),
      h('fieldset', { class: 'field' }, h('legend', {}, 'Sharing'),
        shareImage,
        textArea(ctx, 'shareText', { label: 'Share text', rows: 3, placeholder: eff.seoDescription, hint: 'The description shown with a shared link. Leave empty to use the SEO description.' }),
        h('div', { class: 'preview-card share', 'aria-hidden': 'true' }, h('span', { class: 'preview-label' }, 'Share card preview'),
          cardImg, h('span', { class: 'share-body' }, cardTitle, cardDesc)))));
  seoDetails.addEventListener('toggle', () => { seoOpen = seoDetails.open; });

  el.append(
    h('p', { class: 'inspector-help' }, 'Your headline, standfirst, byline and colour scheme. Open Search & social sharing below if you want custom link previews.'),
    h('fieldset', { class: 'field' }, h('legend', {}, 'On the page'),
      textInput(ctx, 'title', { label: 'Title', placeholder: firstHeader?.data.title || '', hint: 'Your main headline.' }),
      richText(ctx, 'standfirst', { label: 'Standfirst', mode: 'inline', hint: 'One or two sentences under the headline.' }),
      textInput(ctx, 'byline', { label: 'Byline', placeholder: firstHeader?.data.byline || 'By …' }),
      headerNote),
    renderSchemePicker(story, { set: ctx.set, announce: ctx.announce }),
    seoDetails,
  );
  return refresh;
}

function truncate(s, n) {
  const a = [...s];
  return a.length > n ? `${a.slice(0, n - 1).join('')}…` : s;
}
