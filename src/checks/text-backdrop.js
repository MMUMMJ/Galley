// Scroll text with no box behind it: a text shadow alone can't promise contrast on a pale or busy image.
export default {
  id: 'text-backdrop',
  title: 'Text over images',
  run(story) {
    return story.blocks
      .filter((b) => b.data.backdrop === 'none' && ((b.type === 'scrolly' && b.data.layout === 'overlay') || b.type === 'textcolumn'))
      .map((b) => ({
        blockId: b.id,
        message: `This ${b.type === 'textcolumn' ? 'text column' : 'scroll sequence'} has no box behind its text, only a shadow. On a pale or busy image the words can be hard to read. Check every image, or choose Solid or Soft vignette under Text backdrop.`,
      }));
  },
};
