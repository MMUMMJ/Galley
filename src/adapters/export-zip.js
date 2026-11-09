// Exporter: a ZIP of the unzipped site. index.html (runtime inlined, story JSON embedded),
// assets/ with the original files, and README.txt. The best choice for Moodle.
import { registerExporter } from './registry.js';
import { runtimeFiles, runtime, exportName, countWords, formatMB } from './export-shared.js';
import { makeZip } from '../zip-write.js';

function readme(story, assetCount, assetBytes) {
  const title = story.meta.title || story.blocks.find((b) => b.type === 'header')?.data.title || 'Untitled story';
  return [
    title,
    `Made with Galley (runtime ${runtime().RUNTIME_VERSION}) on ${new Date().toLocaleString('en-GB')}.`,
    '',
    'HOW TO OPEN THIS STORY',
    '1. Unzip (extract) the ZIP file first.',
    '   Windows: right-click the ZIP file and choose "Extract All".',
    '   Mac: double-click the ZIP file.',
    '2. Open the folder and double-click index.html.',
    '   It opens in your web browser and works without the internet.',
    '   Keep index.html and the assets folder together.',
    '',
    'TO EDIT IT AGAIN',
    'Open Galley, choose Open, and pick this ZIP file.',
    '',
    'CONTENTS',
    `Words: ${countWords(story)} (text, headers, quotes and scroll steps; not references or captions)`,
    `Media files in assets/: ${assetCount} (${formatMB(assetBytes)})`,
    '',
  ].join('\r\n');
}

registerExporter({
  id: 'zip',
  label: 'ZIP folder (.zip)',
  description: 'For Moodle. Works offline once unzipped. Best for stories with video.',
  async export(story, { getBlob, onProgress }) {
    const R = runtime();
    const { css, js } = await runtimeFiles();
    const files = [{ path: 'index.html', data: R.renderDocument(story, { css, js }) }];
    const missing = [];
    let bytes = 0;
    for (const [id, asset] of Object.entries(story.assets)) {
      const blob = getBlob(id);
      if (!blob) { missing.push(asset.name || id); continue; }
      files.push({ path: R.assetPath(id, asset), data: blob });
      bytes += blob.size;
    }
    files.push({ path: 'README.txt', data: readme(story, files.length - 1, bytes) });
    const blob = await makeZip(files, { onProgress });
    const warnings = missing.length
      ? [`${missing.length} file${missing.length === 1 ? ' is' : 's are'} missing from this browser and weren't exported: ${missing.join(', ')}.`]
      : [];
    return { blob, filename: exportName(story, 'zip'), warnings };
  },
});
