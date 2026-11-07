// Total export size against the pack's limit.
const MB = 1024 * 1024;
const PAGE_BYTES = 120 * 1024; // the page itself: runtime, styles and story

export function exportBytes(story) {
  return PAGE_BYTES + Object.values(story.assets).reduce((sum, a) => sum + (Number(a.bytes) || 0), 0);
}

export default {
  id: 'export-size',
  title: 'Export size',
  run(story, { pack }) {
    const bytes = exportBytes(story);
    const limit = pack.maxExportMB;
    if (bytes <= limit * MB) return [];
    const biggest = Object.values(story.assets).sort((a, b) => (b.bytes || 0) - (a.bytes || 0))[0];
    return [{
      blockId: null,
      message: `Your export will be about ${Math.round(bytes / MB)} MB, over the ${limit} MB limit. Which files could be smaller?`
        + `${biggest ? ` The biggest is ${biggest.name || 'a file'} (${Math.round((biggest.bytes || 0) / MB)} MB).` : ''}`,
    }];
  },
};
