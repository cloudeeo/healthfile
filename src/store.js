// The family's file: people, documents, pages, extracted values and review
// state, in one SQLite database (node:sqlite, no native dependency). Files
// (originals, page images) live next to it, named by document id.

import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';

export const KINDS = ['lab_report', 'letter', 'prescription', 'vaccination', 'imaging_report', 'discharge', 'invoice', 'insurance', 'other'];
export const DOC_STATES = ['reading', 'review', 'filed', 'failed'];

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS people (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  born TEXT,
  color TEXT,
  created TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  person_id TEXT REFERENCES people(id) ON DELETE SET NULL,
  state TEXT NOT NULL,
  kind TEXT,
  date TEXT,
  title TEXT,
  issuer TEXT,
  language TEXT,
  text TEXT,
  summary TEXT,
  person_hint TEXT,
  original_name TEXT,
  original_type TEXT,
  original_bytes INTEGER,
  pages INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  reader_model TEXT,
  reader_ms INTEGER,
  reviewed_at TEXT,
  edited_fields TEXT,
  created TEXT NOT NULL,
  updated TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS documents_person_date ON documents(person_id, date);
CREATE TABLE IF NOT EXISTS pages (
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  n INTEGER NOT NULL,
  text TEXT,
  raw TEXT,
  reader_ms INTEGER,
  width INTEGER,
  height INTEGER,
  PRIMARY KEY (document_id, n)
);
CREATE TABLE IF NOT EXISTS measurements (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  person_id TEXT REFERENCES people(id) ON DELETE SET NULL,
  date TEXT,
  page INTEGER,
  name TEXT NOT NULL,
  analyte TEXT,
  value TEXT,
  number REAL,
  unit TEXT,
  reference TEXT,
  ref_low REAL,
  ref_high REAL,
  flag TEXT,
  edited INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS measurements_person_analyte ON measurements(person_id, analyte, date);
CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS chunks (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  page INTEGER,
  n INTEGER NOT NULL,
  text TEXT NOT NULL,
  vector BLOB
);
CREATE INDEX IF NOT EXISTS chunks_document ON chunks(document_id);
`;

const nowIso = () => new Date().toISOString();

export class Store {
  /** @param {string} file  path of the database, or ':memory:' */
  constructor(file = ':memory:') {
    this.db = new DatabaseSync(file);
    this.db.exec(SCHEMA);
  }

  close() {
    this.db.close();
  }

  // People -------------------------------------------------------------------

  listPeople() {
    return this.db.prepare('SELECT id, name, born, color, created FROM people ORDER BY created').all();
  }

  getPerson(id) {
    return this.db.prepare('SELECT id, name, born, color, created FROM people WHERE id = ?').get(id) ?? null;
  }

  addPerson({ name, born = null, color = null }) {
    const p = { id: randomUUID(), name: String(name).trim(), born, color, created: nowIso() };
    this.db.prepare('INSERT INTO people (id, name, born, color, created) VALUES (?, ?, ?, ?, ?)').run(p.id, p.name, p.born, p.color, p.created);
    return p;
  }

  updatePerson(id, { name, born, color }) {
    const cur = this.getPerson(id);
    if (!cur) return null;
    const next = { name: name ?? cur.name, born: born === undefined ? cur.born : born, color: color === undefined ? cur.color : color };
    this.db.prepare('UPDATE people SET name = ?, born = ?, color = ? WHERE id = ?').run(next.name, next.born, next.color, id);
    return this.getPerson(id);
  }

  removePerson(id) {
    return this.db.prepare('DELETE FROM people WHERE id = ?').run(id).changes > 0;
  }

  // Documents ----------------------------------------------------------------

  createDocument({ originalName, originalType, originalBytes, personId = null }) {
    const t = nowIso();
    const d = { id: randomUUID(), state: 'reading', original_name: originalName, original_type: originalType, original_bytes: originalBytes, person_id: personId, created: t, updated: t };
    this.db
      .prepare('INSERT INTO documents (id, person_id, state, original_name, original_type, original_bytes, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(d.id, d.person_id, d.state, d.original_name, d.original_type, d.original_bytes, d.created, d.updated);
    return this.getDocument(d.id);
  }

  getDocument(id) {
    const d = this.db.prepare('SELECT * FROM documents WHERE id = ?').get(id);
    return d ? rowToDoc(d) : null;
  }

  /** @param {{ personId?, state?, kind?, limit? }} f */
  listDocuments({ personId, state, kind, limit = 500 } = {}) {
    const where = [];
    const args = [];
    if (personId) {
      where.push('person_id = ?');
      args.push(personId);
    }
    if (state) {
      where.push('state = ?');
      args.push(state);
    }
    if (kind) {
      where.push('kind = ?');
      args.push(kind);
    }
    const sql = `SELECT * FROM documents${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY COALESCE(date, substr(created, 1, 10)) DESC, created DESC LIMIT ?`;
    return this.db.prepare(sql).all(...args, limit).map(rowToDoc);
  }

  /** Set columns of a document (only known ones), bumping `updated`. */
  updateDocument(id, fields) {
    const allowed = ['person_id', 'state', 'kind', 'date', 'title', 'issuer', 'language', 'text', 'summary', 'person_hint', 'pages', 'error', 'reader_model', 'reader_ms', 'reviewed_at', 'edited_fields'];
    const cols = [];
    const vals = [];
    for (const [k, v] of Object.entries(fields)) {
      if (!allowed.includes(k)) continue;
      cols.push(`${k} = ?`);
      vals.push(k === 'edited_fields' && v != null && typeof v !== 'string' ? JSON.stringify(v) : v);
    }
    if (!cols.length) return this.getDocument(id);
    cols.push('updated = ?');
    vals.push(nowIso());
    this.db.prepare(`UPDATE documents SET ${cols.join(', ')} WHERE id = ?`).run(...vals, id);
    return this.getDocument(id);
  }

  removeDocument(id) {
    return this.db.prepare('DELETE FROM documents WHERE id = ?').run(id).changes > 0;
  }

  // Pages --------------------------------------------------------------------

  putPage(documentId, n, { text = null, raw = null, readerMs = null, width = null, height = null }) {
    this.db
      .prepare('INSERT INTO pages (document_id, n, text, raw, reader_ms, width, height) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(document_id, n) DO UPDATE SET text = excluded.text, raw = excluded.raw, reader_ms = excluded.reader_ms, width = excluded.width, height = excluded.height')
      .run(documentId, n, text, raw == null ? null : typeof raw === 'string' ? raw : JSON.stringify(raw), readerMs, width, height);
  }

  listPages(documentId) {
    return this.db.prepare('SELECT n, text, raw, reader_ms AS readerMs, width, height FROM pages WHERE document_id = ? ORDER BY n').all(documentId).map((p) => ({ ...p, raw: p.raw ? safeJson(p.raw) : null }));
  }

  // Measurements and items ---------------------------------------------------

  replaceMeasurements(documentId, rows) {
    const doc = this.getDocument(documentId);
    const del = this.db.prepare('DELETE FROM measurements WHERE document_id = ?');
    const ins = this.db.prepare('INSERT INTO measurements (id, document_id, person_id, date, page, name, analyte, value, number, unit, reference, ref_low, ref_high, flag, edited) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    this.db.exec('BEGIN');
    try {
      del.run(documentId);
      for (const r of rows) {
        ins.run(r.id ?? randomUUID(), documentId, doc?.personId ?? null, doc?.date ?? null, r.page ?? null, r.name, r.analyte ?? null, r.value ?? null, r.number ?? null, r.unit ?? null, r.reference ?? null, r.refLow ?? null, r.refHigh ?? null, r.flag ?? null, r.edited ? 1 : 0);
      }
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  /** Keep measurements' person and date in step with their document. */
  syncMeasurements(documentId) {
    const d = this.getDocument(documentId);
    if (!d) return;
    this.db.prepare('UPDATE measurements SET person_id = ?, date = ? WHERE document_id = ?').run(d.personId, d.date, documentId);
  }

  listMeasurements({ documentId, personId, analyte } = {}) {
    const where = [];
    const args = [];
    if (documentId) {
      where.push('document_id = ?');
      args.push(documentId);
    }
    if (personId) {
      where.push('person_id = ?');
      args.push(personId);
    }
    if (analyte) {
      where.push('analyte = ?');
      args.push(analyte);
    }
    return this.db
      .prepare(`SELECT id, document_id AS documentId, person_id AS personId, date, page, name, analyte, value, number, unit, reference, ref_low AS refLow, ref_high AS refHigh, flag, edited FROM measurements${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY date, name`)
      .all(...args)
      .map((m) => ({ ...m, edited: !!m.edited }));
  }

  /** Latest value per analyte for a person, with how many points exist. */
  analyteSummary(personId) {
    return this.db
      .prepare(
        `SELECT analyte, COUNT(*) AS points, MIN(date) AS first, MAX(date) AS last
         FROM measurements WHERE person_id = ? AND analyte IS NOT NULL AND number IS NOT NULL GROUP BY analyte ORDER BY analyte`,
      )
      .all(personId)
      .map((row) => {
        const latest = this.db.prepare('SELECT value, number, unit, reference, ref_low AS refLow, ref_high AS refHigh, flag, document_id AS documentId, date FROM measurements WHERE person_id = ? AND analyte = ? AND number IS NOT NULL ORDER BY date DESC LIMIT 1').get(personId, row.analyte);
        return { ...row, latest };
      });
  }

  replaceItems(documentId, kind, list) {
    this.db.exec('BEGIN');
    try {
      this.db.prepare('DELETE FROM items WHERE document_id = ? AND kind = ?').run(documentId, kind);
      const ins = this.db.prepare('INSERT INTO items (id, document_id, kind, data) VALUES (?, ?, ?, ?)');
      for (const it of list) ins.run(randomUUID(), documentId, kind, JSON.stringify(it));
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  listItems(documentId, kind) {
    const rows = kind
      ? this.db.prepare('SELECT id, kind, data FROM items WHERE document_id = ? AND kind = ?').all(documentId, kind)
      : this.db.prepare('SELECT id, kind, data FROM items WHERE document_id = ?').all(documentId);
    return rows.map((r) => ({ id: r.id, kind: r.kind, ...safeJson(r.data) }));
  }

  // Chunks -------------------------------------------------------------------

  replaceChunks(documentId, chunks) {
    this.db.exec('BEGIN');
    try {
      this.db.prepare('DELETE FROM chunks WHERE document_id = ?').run(documentId);
      const ins = this.db.prepare('INSERT INTO chunks (id, document_id, page, n, text, vector) VALUES (?, ?, ?, ?, ?, ?)');
      chunks.forEach((c, i) => ins.run(randomUUID(), documentId, c.page ?? null, i, c.text, c.vector ? Buffer.from(new Float32Array(c.vector).buffer) : null));
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  listChunks({ personId } = {}) {
    const sql = personId
      ? 'SELECT c.id, c.document_id AS documentId, c.page, c.n, c.text, c.vector FROM chunks c JOIN documents d ON d.id = c.document_id WHERE d.person_id = ? AND d.state = ?'
      : 'SELECT c.id, c.document_id AS documentId, c.page, c.n, c.text, c.vector FROM chunks c JOIN documents d ON d.id = c.document_id WHERE d.state = ?';
    const rows = personId ? this.db.prepare(sql).all(personId, 'filed') : this.db.prepare(sql).all('filed');
    return rows.map((r) => ({ ...r, vector: r.vector ? new Float32Array(r.vector.buffer, r.vector.byteOffset, r.vector.byteLength / 4) : null }));
  }

  counts() {
    const docs = this.db.prepare('SELECT state, COUNT(*) AS n FROM documents GROUP BY state').all();
    return {
      people: this.db.prepare('SELECT COUNT(*) AS n FROM people').get().n,
      documents: Object.fromEntries(docs.map((r) => [r.state, r.n])),
      measurements: this.db.prepare('SELECT COUNT(*) AS n FROM measurements').get().n,
    };
  }
}

function safeJson(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function rowToDoc(d) {
  return {
    id: d.id,
    personId: d.person_id,
    state: d.state,
    kind: d.kind,
    date: d.date,
    title: d.title,
    issuer: d.issuer,
    language: d.language,
    text: d.text,
    summary: d.summary,
    personHint: d.person_hint,
    originalName: d.original_name,
    originalType: d.original_type,
    originalBytes: d.original_bytes,
    pages: d.pages,
    error: d.error,
    readerModel: d.reader_model,
    readerMs: d.reader_ms,
    reviewedAt: d.reviewed_at,
    editedFields: d.edited_fields ? safeJson(d.edited_fields) : null,
    created: d.created,
    updated: d.updated,
  };
}
