// Prepares a file the student picked before it is stored.
// Images: downscaled so the longest side is at most 1800px, and re-encoded
// (JPEG, or WebP for PNGs so transparency survives). Re-encoding also strips
// camera metadata such as GPS location. GIFs and SVGs are kept as they are.
// Video and audio: stored untouched, with a warning when they are large.

export const MAX_EDGE = 1800;
const MB = 1024 * 1024;
export const SIZE_WARNING = { video: 50 * MB, audio: 20 * MB };

const EXT_TYPES = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml',
  heic: 'image/heic', heif: 'image/heif', avif: 'image/avif',
  mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm',
  mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav', ogg: 'audio/ogg', oga: 'audio/ogg',
};

export function mimeOf(file) {
  if (file.type) return file.type;
  const ext = (file.name.match(/\.([a-z0-9]+)$/i) || [])[1];
  return EXT_TYPES[(ext || '').toLowerCase()] || '';
}

export function kindOfMime(mime) {
  if (/^image\//.test(mime)) return 'image';
  if (/^video\//.test(mime)) return 'video';
  if (/^audio\//.test(mime)) return 'audio';
  return null;
}

export function formatBytes(n) {
  if (!(n > 0)) return '0 KB';
  if (n < MB) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / MB).toFixed(n < 10 * MB ? 1 : 0)} MB`;
}

// Returns { blob, name, mime, bytes, width, height, kind, warning }.
// Throws an Error with a student-friendly message if the file can't be used.
export async function processFile(file) {
  const mime = mimeOf(file);
  const kind = kindOfMime(mime);
  if (!kind) throw new Error(`"${file.name}" isn't an image, video or audio file.`);

  if (kind === 'image') {
    if (mime === 'image/gif' || mime === 'image/svg+xml') {
      const size = await imageSize(file);
      return { blob: file, name: file.name, mime, bytes: file.size, kind, ...size, warning: '' };
    }
    return downscale(file, mime);
  }

  const size = kind === 'video' ? await videoSize(file) : {};
  const warning = file.size > SIZE_WARNING[kind]
    ? `This ${kind} is ${formatBytes(file.size)}. Large files make your export big and slow to upload, and Moodle may refuse it. Consider trimming or compressing it first.`
    : '';
  return { blob: file, name: file.name, mime, bytes: file.size, kind, width: size.width || null, height: size.height || null, warning };
}

async function decode(file) {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { /* fall back below */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function downscale(file, mime) {
  let source;
  try {
    source = await decode(file);
  } catch {
    throw new Error(`This browser can't read "${file.name}". Save it as a JPEG or PNG and try again.`);
  }
  const w0 = source.width || source.naturalWidth;
  const h0 = source.height || source.naturalHeight;
  const scale = Math.min(1, MAX_EDGE / Math.max(w0, h0));
  const width = Math.max(1, Math.round(w0 * scale));
  const height = Math.max(1, Math.round(h0 * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const target = mime === 'image/png' ? 'image/webp' : 'image/jpeg';
  if (target === 'image/jpeg') {
    ctx.fillStyle = '#fff'; // JPEG has no transparency
    ctx.fillRect(0, 0, width, height);
  }
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, width, height);
  if (typeof source.close === 'function') source.close();

  let blob = await toBlob(canvas, target, 0.85);
  if (!blob || blob.type !== target) blob = await toBlob(canvas, 'image/png'); // e.g. no WebP encoder
  if (!blob) throw new Error(`Couldn't process "${file.name}".`);
  const ext = { 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/png': 'png' }[blob.type];
  const name = file.name.replace(/\.[a-z0-9]+$/i, '') + '.' + ext;
  return { blob, name, mime: blob.type, bytes: blob.size, kind: 'image', width, height, warning: '' };
}

function toBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

async function imageSize(file) {
  try {
    const img = await decode(file);
    return { width: img.width || img.naturalWidth || null, height: img.height || img.naturalHeight || null };
  } catch {
    return { width: null, height: null };
  }
}

function videoSize(file) {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(file);
    let done = false;
    const finish = (result) => {
      if (done) return;
      done = true;
      URL.revokeObjectURL(url);
      resolve(result);
    };
    video.preload = 'metadata';
    video.muted = true;
    video.onloadedmetadata = () => finish({ width: video.videoWidth || null, height: video.videoHeight || null });
    video.onerror = () => finish({});
    setTimeout(() => finish({}), 4000);
    video.src = url;
  });
}
