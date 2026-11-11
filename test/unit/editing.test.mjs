import test from 'node:test';
import assert from 'node:assert/strict';
import { createStory, createBlock, createAsset, load } from '../../src/model.js';
import { createStore } from '../../src/store.js';
import { mediaTargets, replaceTarget } from '../../src/editor/media-targets.js';
import { reviewKey, reviewEvidence, isReviewed } from '../../src/editor/review-state.js';

function headerStory() {
  const s = createStory(); s.meta.title = 'Original';
  s.blocks = [createBlock('header', { title: 'Original' })]; return s;
}
test('canvas and metadata edits share one headline rule, with reversible undo', () => {
  const store = createStore(headerStory());
  store.update((s) => { s.blocks[0].data.title = 'Canvas'; }, { from: 'canvas-type' });
  assert.equal(store.story.meta.title, 'Canvas');
  store.undo(); assert.equal(store.story.meta.title, 'Original'); assert.equal(store.story.blocks[0].data.title, 'Original');
  store.redo(); assert.equal(store.story.meta.title, 'Canvas');
  store.update((s) => { s.meta.title = 'Details'; }, { from: 'inspector' });
  assert.equal(store.story.blocks[0].data.title, 'Details');
});
test('explicit publication overrides and opened stories are preserved', () => {
  const s = headerStory(); s.meta.title = 'Different publication title';
  const store = createStore(s);
  store.update((d) => { d.blocks[0].data.title = 'Changed'; });
  assert.equal(store.story.meta.title, 'Different publication title');
  const opened = structuredClone(store.story); opened.blocks[0].data.title = 'Imported';
  store.update(() => opened, { keepModified: true });
  assert.equal(store.story.meta.title, 'Different publication title');
});
test('replacement targets one repeated gallery or inline occurrence and keeps placement', () => {
  for (const b of [createBlock('gallery', { items: ['a_x', 'a_x'] }),
    createBlock('text', { body: '![one](asset:a_x)\nWords\n![two](asset:a_x "right")' })]) {
    const s = createStory(); s.blocks = [b];
    const targets = mediaTargets(b);
    assert.equal(replaceTarget(s, targets[1], 'a_new'), true);
    assert.deepEqual(mediaTargets(b).map((t) => t.assetId), ['a_x', 'a_new']);
    if (b.type === 'text') assert.match(b.data.body, /asset:a_new "right"/);
    assert.equal(replaceTarget(s, targets[1], 'a_stale'), false);
  }
});
test('review decisions survive loading but are invalidated by relevant edits', () => {
  const s = createStory(); s.assets.a_x = createAsset({ mime: 'image/png' });
  s.blocks = [createBlock('media', { asset: 'a_x' }), createBlock('text', { body: 'Unrelated' })];
  const it = { blockId: s.blocks[0].id, message: 'Add a credit' }; const pack = { name: 'Course' };
  s.meta.reviewedChecks = { [reviewKey('media', it)]: reviewEvidence(s, it, pack) };
  const reopened = load(s).story;
  assert.equal(isReviewed(reopened, 'media', it, pack), true);
  reopened.blocks[1].data.body = 'Other edits';
  assert.equal(isReviewed(reopened, 'media', it, pack), true);
  reopened.assets.a_x.caption = 'New context';
  assert.equal(isReviewed(reopened, 'media', it, pack), false);
});

test('editing a header that inherits its title updates the publication title too', () => {
  const s = headerStory(); s.blocks[0].data.title = '';
  const store = createStore(s);
  store.update((d) => { d.blocks[0].data.title = 'New headline'; });
  assert.equal(store.story.meta.title, 'New headline');
});
