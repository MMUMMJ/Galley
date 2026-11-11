// Hand-written ZIP writer. Entries are "stored" (not compressed): photos and
// video are already compressed, and stored entries keep the writer tiny and fast.
// File data is streamed through for the checksum and never copied into one big buffer.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

// The ZIP checksum of a file (zip-read.js checks it when opening).
export async function crc32(blob) {
  let c = 0xFFFFFFFF;
  const update = (bytes) => {
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  };
  if (typeof blob.stream === 'function') {
    const reader = blob.stream().getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      update(value);
    }
  } else {
    update(new Uint8Array(await blob.arrayBuffer()));
  }
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function dosDateTime(d) {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

const LIMIT = 0xFFFFFFFE; // no ZIP64: 4 GB is far beyond any sensible submission

// files: [{ path: 'assets/a_x-photo.jpg', data: Blob | string | Uint8Array }]
// onProgress(done, total) is called after each file.
export async function makeZip(files, { date = new Date(), onProgress } = {}) {
  const enc = new TextEncoder();
  const { time, date: day } = dosDateTime(date);
  const body = [];
  const central = [];
  let offset = 0;
  let centralSize = 0;

  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const blob = f.data instanceof Blob ? f.data : new Blob([f.data]);
    const name = enc.encode(f.path);
    const size = blob.size;
    if (size > LIMIT || offset + size > LIMIT) throw new Error('This story is too big for a ZIP file (over 4 GB).');
    const crc = await crc32(blob);

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); // local file header
    local.setUint16(4, 20, true);          // version needed: 2.0
    local.setUint16(6, 0x0800, true);      // flag: names are UTF-8
    local.setUint16(8, 0, true);           // method: stored
    local.setUint16(10, time, true);
    local.setUint16(12, day, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, size, true);       // compressed size
    local.setUint32(22, size, true);       // uncompressed size
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);          // extra field length
    body.push(local.buffer, name, blob);

    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);     // central directory header
    cd.setUint16(4, 20, true);             // made by: MS-DOS / 2.0
    cd.setUint16(6, 20, true);
    cd.setUint16(8, 0x0800, true);
    cd.setUint16(10, 0, true);
    cd.setUint16(12, time, true);
    cd.setUint16(14, day, true);
    cd.setUint32(16, crc, true);
    cd.setUint32(20, size, true);
    cd.setUint32(24, size, true);
    cd.setUint16(28, name.length, true);
    // 30 extra length, 32 comment length, 34 disk, 36 internal attrs, 38 external attrs: all 0
    cd.setUint32(42, offset, true);        // where the local header starts
    central.push(cd.buffer, name);

    offset += 30 + name.length + size;
    centralSize += 46 + name.length;
    if (onProgress) onProgress(i + 1, files.length);
  }

  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);      // end of central directory
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  return new Blob([...body, ...central, end.buffer], { type: 'application/zip' });
}
