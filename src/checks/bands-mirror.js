// A neutral count of coloured bands, like the effects count.
export default {
  id: 'bands-mirror',
  title: 'Coloured bands',
  run(story) {
    const banded = story.blocks.filter((b) => b.background).length;
    if (!banded) return [];
    return [{ blockId: null, kind: 'info', message: `${banded} coloured band${banded === 1 ? '' : 's'} across ${story.blocks.length} blocks.` }];
  },
};
