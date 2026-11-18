// Image parts for /api/chat: a `data:image/png;base64,...` or
// `data:image/jpeg;base64,...` URI, checked by media type, magic bytes and
// decoded size. Error messages name the position of the image, never its
// content, so a data URI cannot end up in a log line or a response.

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export const MAX_IMAGES_PER_MESSAGE = 4;
export const MAX_IMAGES_PER_REQUEST = 8;

const DATA_URL_RE = /^data:(image\/(?:png|jpeg|jpg));base64,([A-Za-z0-9+/]*={0,2})$/;
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);

/** Media type read from the first bytes, or null when neither PNG nor JPEG. */
export function sniffImage(buf) {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(PNG_MAGIC)) return 'image/png';
  if (buf.length >= 3 && buf.subarray(0, 3).equals(JPEG_MAGIC)) return 'image/jpeg';
  return null;
}

/** Decoded size of a base64 payload without decoding it. */
function decodedLength(b64) {
  const pad = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - pad;
}

/**
 * Check one data URI.
 * @returns {{ ok: true, mime: 'image/png'|'image/jpeg', bytes: number } | { ok: false, error: string }}
 */
export function checkImageDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string') return { ok: false, error: 'must be a data URI string' };
  if (dataUrl.length > MAX_IMAGE_BYTES * 2) return { ok: false, error: `larger than ${MAX_IMAGE_BYTES / (1024 * 1024)} MB` };
  const m = DATA_URL_RE.exec(dataUrl);
  if (!m) {
    if (!dataUrl.startsWith('data:')) return { ok: false, error: 'must be a data: URI' };
    if (!/^data:image\/(png|jpe?g)[;,]/i.test(dataUrl)) return { ok: false, error: 'only image/png and image/jpeg are accepted' };
    return { ok: false, error: 'must be base64 encoded' };
  }
  const declared = m[1] === 'image/jpg' ? 'image/jpeg' : m[1];
  const b64 = m[2];
  if (b64.length % 4 !== 0) return { ok: false, error: 'base64 payload is truncated' };
  const bytes = decodedLength(b64);
  if (bytes > MAX_IMAGE_BYTES) return { ok: false, error: `larger than ${MAX_IMAGE_BYTES / (1024 * 1024)} MB` };
  if (bytes < 16) return { ok: false, error: 'too small to be an image' };
  // The magic bytes sit in the first 12 base64 characters (9 bytes).
  const head = Buffer.from(b64.slice(0, 12), 'base64');
  const sniffed = sniffImage(head);
  if (!sniffed) return { ok: false, error: 'the data is not a PNG or JPEG' };
  if (sniffed !== declared) return { ok: false, error: `declared ${declared} but the data is ${sniffed}` };
  return { ok: true, mime: declared, bytes };
}

/** Dashboard parts -> OpenAI content parts for /v1/chat/completions. */
export function toOpenAIContent(content) {
  if (typeof content === 'string') return content;
  return content.map((p) => (p.type === 'image' ? { type: 'image_url', image_url: { url: p.dataUrl } } : { type: 'text', text: p.text }));
}

/** Number of image parts in a message's content. */
export function countImages(content) {
  return Array.isArray(content) ? content.filter((p) => p.type === 'image').length : 0;
}
