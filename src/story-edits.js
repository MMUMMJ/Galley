// Rules shared by every editing surface. Explicitly different publication/header values stay
// separate; linked values follow edits in either direction, including direct canvas typing.
export function syncOpeningFields(previous, next) {
  const before = previous.blocks.find((b) => b.type === 'header');
  const after = next.blocks.find((b) => b.type === 'header');
  if (!before || !after || before.id !== after.id) return;
  for (const key of ['title', 'standfirst', 'byline']) {
    const oldMeta = previous.meta[key] || '';
    const oldHeader = before.data[key] || '';
    const metaChanged = next.meta[key] !== previous.meta[key];
    const headerChanged = after.data[key] !== before.data[key];
    if (headerChanged && !metaChanged && (!oldMeta || !oldHeader || oldMeta === oldHeader)) next.meta[key] = after.data[key];
    if (metaChanged && !headerChanged && (!oldHeader || oldHeader === oldMeta)) after.data[key] = next.meta[key];
  }
}
