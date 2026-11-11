// The story model: loading, repairing and migrating stories from anywhere.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load, createStory, SCHEMA_VERSION } from '../../src/model.js';

test('a new story is valid', () => {
  const { errors } = load(createStory());
  assert.deepEqual(errors, []);
});

test('schema 1: a scroll sequence with the column layout becomes a Text column', () => {
  const v1 = {
    schemaVersion: 1, runtimeVersion: '1.0.0', meta: { title: 'Old' }, assets: { a1: { name: 'a.jpg', mime: 'image/jpeg' }, a2: { name: 'b.jpg', mime: 'image/jpeg' } },
    blocks: [{ id: 'b1', type: 'scrolly', data: { layout: 'column', align: 'left', steps: [{ media: 'a1', text: 'One.' }, { media: 'a1', text: 'Two.' }, { media: 'a2', text: 'Three.' }] } }],
  };
  const { story } = load(v1);
  assert.equal(story.schemaVersion, SCHEMA_VERSION);
  const b = story.blocks[0];
  assert.equal(b.type, 'textcolumn');
  assert.equal(b.data.body, 'One.\n\nTwo.\n\nThree.');
  assert.deepEqual(b.data.images, ['a1', 'a2']);
  assert.equal(b.data.align, 'left');
});

test('a story from a newer Galley is refused, not half-read', () => {
  assert.throws(() => load({ ...createStory(), schemaVersion: SCHEMA_VERSION + 1 }), /newer version/);
});

test('not a story at all is refused', () => {
  assert.throws(() => load({ hello: 'world' }), /schemaVersion/);
  assert.throws(() => load(null), /Galley story/);
});

test('a reference to a missing file is reported, not hidden', () => {
  const s = createStory();
  s.blocks.push({ id: 'b1', type: 'media', data: { kind: 'image', asset: 'a_gone', width: 'column' } });
  const { errors } = load(s);
  assert.ok(errors.some((e) => /a_gone/.test(e.message) && e.path.startsWith('blocks[0]')), JSON.stringify(errors));
});

test('bad values are repaired: an unknown theme becomes house', () => {
  const s = createStory();
  s.meta.theme = 'neon';
  assert.equal(load(s).story.meta.theme, 'house');
});
