// From an upload to a document waiting for review: save the original, render
// the pages, read each one with the vision model (one at a time per model,
// through the slot queue), merge, store. Runs in the background; the page
// polls the document's state. Logs carry ids, counts and timings only.

import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { renderPages, imageSize, sniff, ACCEPTED } from './pages.js';
import { readPage, mergePages } from './reader.js';

export class Ingestor {
  /**
   * @param {object} o
   * @param {import('../store.js').Store} o.store
   * @param {object} o.config
   * @param {object} o.deps
   * @param {import('../llm/queue.js').SlotQueue} o.queue
   * @param {(line: string) => void} [o.log]
   */
  constructor({ store, config, deps, queue, log = console.log }) {
    this.store = store;
    this.config = config;
    this.deps = deps;
    this.queue = queue;
    this.log = log;
    this.running = new Map(); // document id -> AbortController
  }

  docDir(id) {
    return join(this.config.dataDir, 'documents', id);
  }

  /**
   * Accept an upload: checks, saves the original, creates the document and
   * starts reading it. Returns the document or an error.
   * @param {{ buffer: Buffer, name: string, type?: string, personId?: string|null }} up
   */
  async accept({ buffer, name, type, personId = null }) {
    if (!buffer?.length) return { ok: false, status: 400, error: 'empty file' };
    if (buffer.length > this.config.ingest.maxFileBytes) return { ok: false, status: 413, error: `larger than ${Math.round(this.config.ingest.maxFileBytes / 1048576)} MB` };
    const mime = sniff(buffer) ?? (ACCEPTED[type] ? type : null);
    if (!mime || !ACCEPTED[mime]) return { ok: false, status: 415, error: 'send a PDF, JPEG, PNG, WebP or HEIC' };
    if (personId && !this.store.getPerson(personId)) return { ok: false, status: 400, error: 'unknown person' };
    const sha256 = createHash('sha256').update(buffer).digest('hex');
    const same = this.store.findBySha256(sha256);
    if (same) return { ok: false, status: 409, error: 'this file is already in the archive', document: same };
    const doc = this.store.createDocument({ originalName: String(name || 'document').slice(0, 200), originalType: mime, originalBytes: buffer.length, personId, sha256 });
    const dir = this.docDir(doc.id);
    await this.deps.mkdir(dir);
    await this.deps.writeFile(join(dir, `original.${ACCEPTED[mime]}`), buffer, { mode: 0o600 });
    this.read(doc.id, mime).catch((e) => this.log(`[ingest] ${doc.id}: ${e?.message || e}`));
    return { ok: true, document: this.store.getDocument(doc.id) };
  }

  /** Read (or re-read) a document's pages. */
  async read(id, mime) {
    const doc = this.store.getDocument(id);
    if (!doc) return;
    mime = mime ?? doc.originalType;
    const dir = this.docDir(id);
    const original = join(dir, `original.${ACCEPTED[mime]}`);
    const ctrl = new AbortController();
    this.running.set(id, ctrl);
    const t0 = this.deps.now();
    try {
      this.store.updateDocument(id, { state: 'reading', error: null });
      const n = await renderPages({ deps: this.deps, original, mime, dir, ...this.config.ingest, maxPages: this.config.ingest.maxPages });
      this.store.updateDocument(id, { pages: n });
      const pages = [];
      let repaired = 0;
      // time spent reading, not waiting in the queue behind other documents
      let readingMs = 0;
      for (let p = 1; p <= n; p++) {
        if (ctrl.signal.aborted) throw new Error('cancelled');
        const file = join(dir, `page-${p}.jpg`);
        const size = await imageSize(this.deps, file);
        const dataUrl = `data:image/jpeg;base64,${(await this.deps.readFile(file)).toString('base64')}`;
        const release = await this.queue.acquire(this.config.qvac.reader, { signal: ctrl.signal });
        this.deps.setHint?.(`${doc.originalName} page ${p}`); // mock mode only: which page is being read (set inside the slot)
        let r;
        try {
          r = await readPage({ qvac: this.config.qvac, deps: this.deps, dataUrl, timeoutMs: this.config.ingest.readerTimeoutMs, signal: ctrl.signal });
        } finally {
          release();
        }
        if (!r.ok) throw new Error(`page ${p}: ${r.error}`);
        if (r.repaired) repaired++;
        readingMs += r.ms ?? 0;
        this.store.putPage(id, p, { text: r.page.text, raw: r.raw, readerMs: r.ms, width: size?.width ?? null, height: size?.height ?? null });
        pages.push(r.page);
        this.log(`[ingest] ${id} page ${p}/${n} read in ${r.ms} ms${r.repaired ? ' (repaired)' : ''}`);
      }
      const merged = mergePages(pages);
      const current = this.store.getDocument(id);
      this.store.updateDocument(id, {
        state: 'review',
        kind: merged.kind,
        date: merged.date,
        title: merged.title,
        issuer: merged.issuer,
        language: merged.language,
        text: merged.text,
        person_hint: merged.personHint,
        reader_model: this.config.qvac.reader,
        reader_ms: readingMs || this.deps.now() - t0,
        // keep a person the uploader chose; otherwise try to match the printed name
        person_id: current.personId ?? guessPerson(this.store.listPeople(), merged.personHint),
      });
      this.store.replaceMeasurements(id, merged.measurements);
      this.store.replaceItems(id, 'medication', merged.medications);
      this.store.replaceItems(id, 'follow_up', merged.followUps);
      this.store.replaceItems(id, 'amount', merged.amount ? [merged.amount] : []);
      this.log(`[ingest] ${id}: ${n} page(s), ${merged.measurements.length} value(s), read in ${readingMs} ms, ${this.deps.now() - t0} ms with the wait${repaired ? `, ${repaired} repaired` : ''}`);
    } catch (e) {
      const msg = String(e?.message || e).slice(0, 300);
      this.store.updateDocument(id, { state: msg === 'cancelled' ? 'failed' : 'failed', error: msg });
      this.log(`[ingest] ${id} failed: ${msg}`);
    } finally {
      this.running.delete(id);
    }
  }

  cancel(id) {
    const c = this.running.get(id);
    if (!c) return false;
    c.abort();
    return true;
  }

  /** Remove a document and its files. */
  async remove(id) {
    this.cancel(id);
    const ok = this.store.removeDocument(id);
    if (ok) await this.deps.rm(this.docDir(id), { recursive: true, force: true });
    return ok;
  }
}

/** The person whose name appears in the printed hint, when exactly one does. */
export function guessPerson(people, hint) {
  if (!hint) return null;
  const h = hint.toLowerCase();
  const hits = people.filter((p) => {
    const parts = p.name.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
    return parts.length && parts.every((w) => h.includes(w));
  });
  return hits.length === 1 ? hits[0].id : null;
}
