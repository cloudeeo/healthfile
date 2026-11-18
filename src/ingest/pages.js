// Turning an upload into page images: PDF pages through pdftoppm, photos
// through ImageMagick (auto-orient, resize, JPEG). Two sizes per page: the
// one the reader sees and the preview the page shows.

import { join } from 'node:path';

export const ACCEPTED = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heic' };

const PDF_MAGIC = Buffer.from('%PDF');
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

/** Media type from the first bytes, or null. */
export function sniff(buf) {
  if (buf.subarray(0, 4).equals(PDF_MAGIC)) return 'application/pdf';
  if (buf.subarray(0, 3).equals(JPEG_MAGIC)) return 'image/jpeg';
  if (buf.subarray(0, 4).equals(PNG_MAGIC)) return 'image/png';
  if (buf.length > 12 && buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  if (buf.length > 12 && buf.subarray(4, 8).toString('ascii') === 'ftyp' && /^(heic|heix|hevc|mif1|msf1|heif)/.test(buf.subarray(8, 12).toString('ascii'))) return 'image/heic';
  return null;
}

/** How many pages a PDF has, from pdfinfo. */
export async function pdfPageCount(deps, file) {
  const r = await deps.run('pdfinfo', [file], { timeoutMs: 15_000 });
  if (!r.ok) return null;
  const m = /^Pages:\s+(\d+)/m.exec(r.stdout);
  return m ? Number(m[1]) : null;
}

/**
 * Render the pages of an original into `dir/page-<n>.jpg` (reader size) and
 * `dir/preview-<n>.jpg`. Returns the page count or throws with a readable message.
 * @param {object} o  { deps, original, mime, dir, dpi, readerLongSide, previewLongSide, maxPages }
 */
export async function renderPages({ deps, original, mime, dir, dpi = 150, readerLongSide = 1600, previewLongSide = 1200, maxPages = 30 }) {
  await deps.mkdir(dir);
  let sources = [];
  if (mime === 'application/pdf') {
    const n = await pdfPageCount(deps, original);
    if (n == null) throw new Error('the PDF could not be read');
    if (n > maxPages) throw new Error(`the PDF has ${n} pages, the limit is ${maxPages}`);
    const r = await deps.run('pdftoppm', ['-r', String(dpi), '-jpeg', '-jpegopt', 'quality=90', original, join(dir, 'src')], { timeoutMs: 120_000 });
    if (!r.ok) throw new Error('pdftoppm failed');
    const files = (await deps.readdir(dir)).filter((f) => /^src-\d+\.jpg$/.test(f)).sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
    sources = files.map((f) => join(dir, f));
  } else if (mime === 'image/heic') {
    const out = join(dir, 'src-1.jpg');
    const r = await deps.run('heif-convert', [original, out], { timeoutMs: 60_000 });
    if (!r.ok) throw new Error('HEIC photos need heif-convert on the server; send a JPEG');
    sources = [out];
  } else {
    sources = [original];
  }
  let n = 0;
  for (const src of sources) {
    n++;
    const reader = join(dir, `page-${n}.jpg`);
    const preview = join(dir, `preview-${n}.jpg`);
    const a = await deps.run('convert', [src, '-auto-orient', '-strip', '-resize', `${readerLongSide}x${readerLongSide}>`, '-quality', '88', reader], { timeoutMs: 60_000 });
    if (!a.ok) throw new Error('the image could not be converted');
    const b = await deps.run('convert', [reader, '-resize', `${previewLongSide}x${previewLongSide}>`, '-quality', '82', preview], { timeoutMs: 60_000 });
    if (!b.ok) throw new Error('the preview could not be made');
  }
  // the intermediate renders are not needed any more
  for (const f of await deps.readdir(dir)) if (/^src-\d+\.jpg$/.test(f)) await deps.rm(join(dir, f), { force: true });
  return n;
}

/** Width and height of an image, from ImageMagick's identify. */
export async function imageSize(deps, file) {
  const r = await deps.run('identify', ['-format', '%w %h', file], { timeoutMs: 15_000 });
  if (!r.ok) return null;
  const [w, h] = r.stdout.trim().split(/\s+/).map(Number);
  return Number.isFinite(w) && Number.isFinite(h) ? { width: w, height: h } : null;
}
