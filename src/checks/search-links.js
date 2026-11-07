// Links to search results pages instead of the source itself.
import { textSources, linksIn } from './util.js';

const SEARCH = [
  (u) => /(^|\.)google\.[a-z.]+$/.test(u.hostname) && u.pathname.startsWith('/search'),
  (u) => /(^|\.)bing\.com$/.test(u.hostname) && u.pathname.startsWith('/search'),
  (u) => /(^|\.)duckduckgo\.com$/.test(u.hostname) && u.searchParams.has('q'),
  (u) => /(^|\.)search\.yahoo\.com$/.test(u.hostname),
  (u) => /(^|\.)ecosia\.org$/.test(u.hostname) && u.pathname.startsWith('/search'),
];

export function isSearchUrl(url) {
  let u;
  try { u = new URL(url); } catch { return false; }
  return SEARCH.some((test) => test(u));
}

export default {
  id: 'search-links',
  title: 'Search results used as sources',
  run(story) {
    const out = [];
    for (const src of textSources(story)) {
      const urls = src.kind === 'url' ? [src.text.trim()] : linksIn(src.text);
      for (const url of urls.filter(isSearchUrl)) {
        out.push({ blockId: src.blockId, message: `This is a search results page, not a source. Which page did you find? (${url.slice(0, 60)}${url.length > 60 ? '…' : ''})` });
      }
    }
    return out;
  },
};
