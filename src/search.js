// Chunking and embedding of filed documents, and the retrieval behind Ask
// (M2). Vectors live in SQLite; cosine search in memory is plenty for a
// family's few thousand chunks. A qvac serve vector store can replace it
// later without changing the callers.

import { embed } from './llm/client.js';

export const CHUNK_CHARS = 1800;
export const CHUNK_OVERLAP = 200;

/** Split a document's text into chunks by page, then by length with overlap. */
export function chunkText(text) {
  const out = [];
  const pages = text.split(/\n\[page (\d+)\]\n/);
  // split() leaves [before, n1, text1, n2, text2, ...]; a one-page document has no markers
  const parts = pages.length > 1 ? pages.slice(1).reduce((acc, v, i, a) => (i % 2 === 0 ? acc : [...acc, { page: Number(a[i - 1]), text: v }]), []) : [{ page: 1, text }];
  for (const { page, text: t } of parts) {
    const clean = t.trim();
    if (!clean) continue;
    if (clean.length <= CHUNK_CHARS) {
      out.push({ page, text: clean });
      continue;
    }
    let i = 0;
    while (i < clean.length) {
      let end = Math.min(clean.length, i + CHUNK_CHARS);
      if (end < clean.length) {
        const nl = clean.lastIndexOf('\n', end);
        if (nl > i + CHUNK_CHARS / 2) end = nl;
      }
      out.push({ page, text: clean.slice(i, end).trim() });
      if (end >= clean.length) break;
      i = Math.max(end - CHUNK_OVERLAP, i + 1);
    }
  }
  return out;
}

export function cosine(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

export class Search {
  constructor({ store, config, deps, log = console.log }) {
    this.store = store;
    this.config = config;
    this.deps = deps;
    this.log = log;
  }

  /** Chunk and embed one filed document; failures leave the chunks without vectors. */
  async index(id) {
    const d = this.store.getDocument(id);
    if (!d || !d.text) return { ok: false, error: 'no text' };
    const header = [d.title, d.issuer, d.date].filter(Boolean).join(' · ');
    const chunks = chunkText(d.text).map((c) => ({ ...c, text: header ? `${header}\n${c.text}` : c.text }));
    const r = await embed({ qvac: this.config.qvac, deps: this.deps, texts: chunks.map((c) => c.text) });
    if (!r.ok) {
      this.store.replaceChunks(id, chunks);
      this.log(`[search] ${id}: ${chunks.length} chunk(s) stored without vectors (${r.error})`);
      return { ok: false, error: r.error, chunks: chunks.length };
    }
    this.store.replaceChunks(id, chunks.map((c, i) => ({ ...c, vector: r.vectors[i] })));
    this.log(`[search] ${id}: ${chunks.length} chunk(s) embedded`);
    return { ok: true, chunks: chunks.length };
  }

  /** Top-k chunks for a question, across the family or one person. */
  async query(question, { personId = null, k = 8 } = {}) {
    const r = await embed({ qvac: this.config.qvac, deps: this.deps, texts: [question] });
    if (!r.ok) return { ok: false, error: r.error };
    const q = r.vectors[0];
    const hits = this.store
      .listChunks({ personId })
      .filter((c) => c.vector)
      .map((c) => ({ documentId: c.documentId, page: c.page, text: c.text, score: cosine(q, c.vector) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
    return { ok: true, hits };
  }
}
