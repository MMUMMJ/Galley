// Scroll text with no box behind it: a text shadow alone can't promise contrast on a pale or busy image.
export default {
  id: 'text-backdrop',
  title: 'Text over images',
  run(story) {
    return story.blocks
      .filter((b) => b.type === 'scrolly' && b.data.backdrop === 'none' && (b.data.layout === 'overlay' || b.data.layout === 'column'))
      .map((b) => ({
        blockId: b.id,
        message: 'This scroll sequence has no box behind its text, only a shadow. On a pale or busy image the words can be hard to read. Check every image, or choose Solid or Soft vignette under Text backdrop.',
      }));
  },
};
