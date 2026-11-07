// ZIP reader for opening exports. Handles Illuminate's own stored ZIPs and ZIPs
// that Windows or macOS re-compressed (deflate), including ZIP64 and data descriptors.
// Compressed entries are unpacked with the browser's DecompressionStream('deflate-raw').

const u16 = (v, o) => v.getUint16(o, true);
const u32 = (v, o) => v.getUint32(o, true);
const u64 = (v, o) => Number(v.getBigUint64(o, true));

async function view(blob, start, length) {
  return new DataView(await blob.slice(start, start + length).arrayBuffer());
}

function decodeName(bytes, utf8Flag) {
  if (!utf8Flag) {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { return new TextDecoder('windows-1252').decode(bytes); }
  }
  return new TextDecoder('utf-8').decode(bytes);
}

export async function isZip(blob) {
  if (blob.size < 22) return false;
  const v = await view(blob, 0, 4);
  return u32(v, 0) === 0x04034b50 || u32(v, 0) === 0x06054b50;
}

// Returns [{ name, method, size, compressedSize, offset, flags }].
export async function listZip(blob) {
  const tailLen = Math.min(blob.size, 22 + 65535 + 20);
  const tail = await view(blob, blob.size - tailLen, tailLen);
  let eocd = -1;
  for (let i = tailLen - 22; i >= 0; i--) {
    if (u32(tail, i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('This ZIP file is damaged or incomplete.');

  let count = u16(tail, eocd + 10);
  let cdSize = u32(tail, eocd + 12);
  let cdOffset = u32(tail, eocd + 16);
  if (count === 0xFFFF || cdSize === 0xFFFFFFFF || cdOffset === 0xFFFFFFFF) {
    const loc = eocd - 20;
    if (loc < 0 || u32(tail, loc) !== 0x07064b50) throw new Error('This ZIP file is damaged (ZIP64 record missing).');
    const z = await view(blob, u64(tail, loc + 8), 56);
    count = u64(z, 32);
    cdSize = u64(z, 40);
    cdOffset = u64(z, 48);
  }

  const cd = await view(blob, cdOffset, cdSize);
  const entries = [];
  let p = 0;
  for (let i = 0; i < count && p + 46 <= cdSize; i++) {
    if (u32(cd, p) !== 0x02014b50) throw new Error('This ZIP file is damaged (bad directory).');
    const flags = u16(cd, p + 8);
    const nameLen = u16(cd, p + 28);
    const extraLen = u16(cd, p + 30);
    const commentLen = u16(cd, p + 32);
    let compressedSize = u32(cd, p + 20);
    let size = u32(cd, p + 24);
    let offset = u32(cd, p + 42);
    // ZIP64 extra field: only the values that overflowed are present, in this order.
    let e = p + 46 + nameLen;
    const extraEnd = e + extraLen;
    while (e + 4 <= extraEnd) {
      const id = u16(cd, e);
      const len = u16(cd, e + 2);
      if (id === 0x0001) {
        let q = e + 4;
        if (size === 0xFFFFFFFF) { size = u64(cd, q); q += 8; }
        if (compressedSize === 0xFFFFFFFF) { compressedSize = u64(cd, q); q += 8; }
        if (offset === 0xFFFFFFFF) { offset = u64(cd, q); }
      }
      e += 4 + len;
    }
    const nameBytes = new Uint8Array(cd.buffer, cd.byteOffset + p + 46, nameLen);
    const name = decodeName(nameBytes, flags & 0x0800).replace(/\\/g, '/');
    entries.push({ name, method: u16(cd, p + 10), size, compressedSize, offset, flags });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

// Returns the entry's contents as a Blob (of the given MIME type).
export async function readEntry(blob, entry, type = '') {
  if (entry.flags & 0x0001) throw new Error(`"${entry.name}" is password-protected.`);
  const local = await view(blob, entry.offset, 30);
  if (u32(local, 0) !== 0x04034b50) throw new Error('This ZIP file is damaged (bad file header).');
  const start = entry.offset + 30 + u16(local, 26) + u16(local, 28);
  const raw = blob.slice(start, start + entry.compressedSize);
  if (entry.method === 0) return new Blob([raw], { type });
  if (entry.method === 8) {
    if (typeof DecompressionStream !== 'function') {
      throw new Error('This ZIP is compressed and this browser can\'t unpack it. Update your browser, or unzip it and open index.html.');
    }
    const stream = raw.stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Blob([await new Response(stream).arrayBuffer()], { type });
  }
  throw new Error(`"${entry.name}" uses a ZIP compression method Illuminate can't read.`);
}
