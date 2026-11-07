// Exporter: one self-contained .html file with every asset inlined as a data: URL.
// Handy for small stories; big ones (and video) are better as a ZIP.
import { registerExporter } from './registry.js';
import { runtimeFiles, runtime, exportName, formatMB } from './export-shared.js';

const WARN_BYTES = 25 * 1024 * 1024;

function dataUrl(blob, type) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(type && blob.type !== type ? new Blob([blob], { type }) : blob);
  });
}

registerExporter({
  id: 'html',
  label: 'Single web page (.html)',
  description: 'One file with everything inside. Fine for short stories; not for video.',
  async export(story, { getBlob, onProgress }) {
    const R = runtime();
    const { css, js } = await runtimeFiles();
    const urls = new Map();
    const missing = [];
    const ids = Object.keys(story.assets);
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const blob = getBlob(id);
      if (blob) urls.set(id, await dataUrl(blob, story.assets[id].mime));
      else missing.push(story.assets[id].name || id);
      if (onProgress) onProgress(i + 1, ids.length);
    }
    const used = new Set();
    const assetUrl = (id) => { used.add(id); return urls.get(id) || ''; };
    // Render once to learn which assets appear on the page; files only in the story's
    // library go in a separate JSON block so re-opening the page restores them too.
    R.renderArticle(story, { assetUrl, inline: true });
    const spare = Object.fromEntries([...urls].filter(([id]) => !used.has(id)));
    const bodyEnd = Object.keys(spare).length
      ? `<script type="application/json" id="illuminate-assets">${JSON.stringify(spare).replace(/</g, '\\u003c')}</` + 'script>'
      : '';
    const html = R.renderDocument(story, { css, js, assetUrl, inline: true, bodyEnd });
    const blob = new Blob([html], { type: 'text/html' });

    const warnings = [];
    if (blob.size > WARN_BYTES) {
      warnings.push(`This page is ${formatMB(blob.size)}. Single pages over 25 MB are slow to open and may be too big for Moodle. Use the ZIP export instead.`);
    }
    if (Object.values(story.assets).some((a) => /^video\//.test(a.mime))) {
      warnings.push('This story has video. Video inside a single page can be slow and may not play everywhere. The ZIP export is better for video.');
    }
    if (missing.length) warnings.push(`${missing.length} file(s) missing from this browser weren't included: ${missing.join(', ')}.`);
    return { blob, filename: exportName(story, 'html'), warnings };
  },
});
