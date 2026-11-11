// An occurrence has a stable data path, not just an asset id: the same image can appear twice.
// Text occurrences also record their line, so replacing one never changes another copy.
const INLINE = /^\s*!\[[^\]]*\]\(asset:([A-Za-z0-9_-]+)(?:\s+"(left|right)")?\)\s*$/;
export const valueAt = (data, path) => path.reduce((v, key) => v?.[key], data);
export function setAt(data, path, value) {
  const parent = valueAt(data, path.slice(0, -1));
  if (parent) parent[path.at(-1)] = value;
}

export function mediaTargets(block) {
  if (!block) return [];
  const out = [];
  const d = block.data;
  const add = (path, label, kinds = ['image', 'video']) => {
    const assetId = valueAt(d, path);
    if (assetId) out.push({ blockId: block.id, assetId, path, label, kinds });
  };
  const text = (path, label = 'In the text') => {
    String(valueAt(d, path) || '').split('\n').forEach((line, lineIndex) => {
      const match = INLINE.exec(line);
      if (match) out.push({ blockId: block.id, assetId: match[1], path, line: lineIndex,
        position: match[2] || '', label, kinds: ['image', 'video'] });
    });
  };
  switch (block.type) {
    case 'header': add(['media'], 'Opening media'); break;
    case 'media': add(['asset'], 'Media', ['image', 'video', 'audio']); break;
    case 'gallery': (d.items || []).forEach((_, i) => add(['items', i], `Image ${i + 1} of ${d.items.length}`, ['image'])); break;
    case 'embed': add(['screenshot'], 'Link image', ['image']); break;
    case 'compare': for (const side of ['before', 'after']) add([side, 'asset'], side === 'before' ? 'Before image' : 'After image', ['image']); break;
    case 'scrollpoints': add(['asset'], 'Background image', ['image']);
      (d.steps || []).forEach((_, i) => text(['steps', i, 'text'], `Step ${i + 1} · In the text`)); break;
    case 'scrolly': (d.steps || []).forEach((_, i) => {
      add(['steps', i, 'media'], `Step ${i + 1}`); text(['steps', i, 'text'], `Step ${i + 1} · In the text`);
    }); break;
    case 'textcolumn': (d.images || []).forEach((_, i) => add(['images', i], `Image ${i + 1} of ${d.images.length}`)); text(['body']); break;
    case 'text': text(['body']); break;
    case 'columns': (d.mode === 'flow' ? ['body'] : ['col1', 'col2', 'col3'].slice(0, d.count === 3 ? 3 : 2))
      .forEach((key) => text([key], key === 'body' ? 'In the text' : `Column ${key.at(-1)} · In the text`)); break;
  }
  return out;
}

export function sameTarget(a, b) {
  return a.blockId === b.blockId && a.path.join('.') === b.path.join('.') && a.line === b.line;
}

export function replaceTarget(story, target, id) {
  const block = story.blocks.find((b) => b.id === target.blockId);
  const current = mediaTargets(block).find((t) => sameTarget(t, target));
  if (!current || current.assetId !== target.assetId) return false;
  if (target.line === undefined) setAt(block.data, target.path, id);
  else {
    const lines = valueAt(block.data, target.path).split('\n');
    lines[target.line] = lines[target.line].replace(`asset:${target.assetId}`, `asset:${id}`);
    setAt(block.data, target.path, lines.join('\n'));
  }
  if (block.type === 'media' && target.path[0] === 'asset') {
    block.data.kind = story.assets[id]?.mime?.split('/')[0] || 'image';
  }
  return true;
}

export function objectPath(root, object) {
  if (root === object) return [];
  if (!root || typeof root !== 'object') return null;
  for (const key of Object.keys(root)) {
    const sub = objectPath(root[key], object);
    if (sub) return [key, ...sub];
  }
  return null;
}
