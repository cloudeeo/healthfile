// HTTP routes and static files. JSON bodies are redacted on the way out
// (hosts, keys, invites); document text is the family's own and is not.

import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { redactDeep } from './redact.js';
import { KINDS } from './store.js';
import { ACCEPTED } from './ingest/pages.js';
import { toMeasurement } from './analytes.js';
import { listModels } from './llm/client.js';
import { LANGS } from './config.js';

export const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const PUBLIC_DIR = join(ROOT, 'public');
const PAGES = { '/': 'index.html' };
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data: blob:; style-src 'self'; script-src 'self'; connect-src 'self'; media-src 'self' blob:; base-uri 'none'; frame-ancestors 'none'; form-action 'none'; manifest-src 'self'; worker-src 'self'",
};
const MAX_JSON = 1024 * 1024;

function send(res, status, body, headers = {}) {
  res.writeHead(status, { ...SECURITY_HEADERS, 'Cache-Control': 'no-store', ...headers });
  res.end(res.req?.method === 'HEAD' ? undefined : body);
}
export function sendJson(res, status, obj) {
  send(res, status, JSON.stringify(redactDeep(obj)), { 'Content-Type': 'application/json; charset=utf-8' });
}

function readBody(req, max) {
  return new Promise((resolve, reject) => {
    const parts = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > max) {
        const e = new Error('too big');
        e.code = 'ETOOBIG';
        req.destroy(e);
        reject(e);
        return;
      }
      parts.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(parts)));
    req.on('error', reject);
  });
}

async function jsonBody(req, res, max = MAX_JSON) {
  try {
    const buf = await readBody(req, max);
    return buf.length ? JSON.parse(buf.toString('utf8')) : {};
  } catch (e) {
    if (e?.code === 'ETOOBIG') sendJson(res, 413, { error: 'body too large' });
    else sendJson(res, 400, { error: 'body is not valid JSON' });
    return null;
  }
}

const str = (v, max = 200) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const isoDate = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : null);

/**
 * @param {object} o  { config, store, ingestor, deps, search }
 */
export function createHandler({ config, store, ingestor, deps, search }) {
  let modelsCache = { at: 0, value: null };
  async function models() {
    if (deps.now() - modelsCache.at < 5000 && modelsCache.value) return modelsCache.value;
    const r = await listModels({ qvac: config.qvac, deps });
    modelsCache = { at: deps.now(), value: r };
    return r;
  }

  function fullDocument(id) {
    const d = store.getDocument(id);
    if (!d) return null;
    return { ...d, pageList: store.listPages(id).map(({ raw, ...p }) => p), measurements: store.listMeasurements({ documentId: id }), items: store.listItems(id) };
  }

  async function status() {
    const m = await models();
    const want = { reader: config.qvac.reader, writer: config.qvac.writer, embedder: config.qvac.embedder, explainer: config.qvac.explainer };
    const state = (id) => (!id ? null : !m.ok ? 'unknown' : (m.models.find((x) => x.id === id)?.state ?? 'missing'));
    return {
      app: 'healthfile',
      version: '0.1.0',
      mock: config.mock,
      lang: config.lang,
      familyName: config.familyName,
      demo: config.demo,
      counts: store.counts(),
      models: Object.fromEntries(Object.entries(want).map(([k, id]) => [k, id ? { id, state: state(id) } : null])),
      qvac: m.ok ? 'up' : m.error,
      /** The app has no web tools: this is always 0 and is shown as a promise kept. */
      outboundCalls: 0,
      kinds: KINDS,
      langs: LANGS,
    };
  }

  async function serveStatic(res, pathname) {
    // the demo installs as its own app, with its own name and colour
    if (config.demo && pathname === '/manifest.webmanifest') {
      const m = JSON.parse(await readFile(join(PUBLIC_DIR, 'manifest.webmanifest'), 'utf8'));
      Object.assign(m, { name: 'HealthFile Demo', short_name: 'HF Demo', description: 'HealthFile with a fictional family, for demos.', theme_color: '#9a5b00' });
      return send(res, 200, JSON.stringify(m), { 'Content-Type': TYPES['.webmanifest'], 'Cache-Control': 'no-cache' });
    }
    const rel = PAGES[pathname] ?? decodeURIComponent(pathname).replace(/^\/+/, '');
    const file = normalize(join(PUBLIC_DIR, rel));
    if (!file.startsWith(PUBLIC_DIR + sep)) return send(res, 404, 'not found', { 'Content-Type': 'text/plain' });
    try {
      const st = await stat(file);
      if (!st.isFile()) throw new Error('not a file');
      return send(res, 200, await readFile(file), { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    } catch {
      return send(res, 404, 'not found', { 'Content-Type': 'text/plain' });
    }
  }

  async function serveDocFile(res, id, name) {
    const d = store.getDocument(id);
    if (!d) return sendJson(res, 404, { error: 'not found' });
    const dir = ingestor.docDir(id);
    let file;
    let type;
    const page = /^page-(\d+)\.jpg$/.exec(name);
    if (page) {
      file = join(dir, `preview-${Number(page[1])}.jpg`);
      type = 'image/jpeg';
    } else if (name === 'original') {
      file = join(dir, `original.${ACCEPTED[d.originalType]}`);
      type = d.originalType;
    } else return sendJson(res, 404, { error: 'not found' });
    try {
      return send(res, 200, await readFile(file), { 'Content-Type': type, 'Cache-Control': 'private, max-age=3600', 'Content-Disposition': name === 'original' ? `inline; filename="${d.originalName.replace(/[^\w.-]+/g, '_')}"` : 'inline' });
    } catch {
      return sendJson(res, 404, { error: 'file not found' });
    }
  }

  // Review edits: header fields, person, and the measurement rows
  function applyEdits(id, body) {
    const d = store.getDocument(id);
    if (!d) return { status: 404, body: { error: 'not found' } };
    const fields = {};
    const edited = new Set(d.editedFields ?? []);
    const set = (k, v, col = k) => {
      if (v === undefined) return;
      fields[col] = v;
      edited.add(k);
    };
    if ('personId' in body) {
      if (body.personId !== null && !store.getPerson(body.personId)) return { status: 400, body: { error: 'unknown person' } };
      set('personId', body.personId, 'person_id');
    }
    if ('date' in body) {
      if (body.date !== null && !isoDate(body.date)) return { status: 400, body: { error: 'date must be YYYY-MM-DD' } };
      set('date', body.date);
    }
    if ('kind' in body) {
      if (!KINDS.includes(body.kind)) return { status: 400, body: { error: `kind must be one of ${KINDS.join(', ')}` } };
      set('kind', body.kind);
    }
    if ('title' in body) set('title', str(body.title, 80));
    if ('issuer' in body) set('issuer', str(body.issuer, 160));
    if ('summary' in body) set('summary', str(body.summary, 2000));
    if (Array.isArray(body.measurements)) {
      if (body.measurements.length > 300) return { status: 400, body: { error: 'too many values' } };
      const rows = [];
      for (const m of body.measurements) {
        const row = toMeasurement({ name: m.name, value: m.value, unit: m.unit, reference: m.reference, flag: m.flag }, Number.isInteger(m.page) ? m.page : null);
        if (!row) continue;
        if (typeof m.analyte === 'string' && m.analyte) row.analyte = m.analyte.slice(0, 40);
        rows.push({ ...row, id: typeof m.id === 'string' ? m.id : undefined, edited: !!m.edited });
      }
      store.replaceMeasurements(id, rows);
      edited.add('measurements');
    }
    fields.edited_fields = [...edited];
    store.updateDocument(id, fields);
    store.syncMeasurements(id);
    return { status: 200, body: fullDocument(id) };
  }

  return async function handler(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const p = url.pathname;
    const m = req.method;
    try {
      if (p === '/api/status' && m === 'GET') return sendJson(res, 200, await status());

      // People
      if (p === '/api/people') {
        if (m === 'GET') return sendJson(res, 200, { people: store.listPeople() });
        if (m === 'POST') {
          const b = await jsonBody(req, res);
          if (!b) return;
          const name = str(b.name, 80);
          if (!name) return sendJson(res, 400, { error: 'name is required' });
          if (b.born != null && !isoDate(b.born)) return sendJson(res, 400, { error: 'born must be YYYY-MM-DD' });
          return sendJson(res, 201, store.addPerson({ name, born: b.born ?? null, color: str(b.color, 20) }));
        }
        return send(res, 405, 'method not allowed', { Allow: 'GET, POST', 'Content-Type': 'text/plain' });
      }
      let mm = /^\/api\/people\/([0-9a-f-]{36})(?:\/(analytes|series\/([a-z0-9_]+)|documents))?$/.exec(p);
      if (mm) {
        const id = mm[1];
        if (!store.getPerson(id)) return sendJson(res, 404, { error: 'not found' });
        if (mm[2] === 'analytes' && m === 'GET') return sendJson(res, 200, { analytes: store.analyteSummary(id) });
        if (mm[2]?.startsWith('series/') && m === 'GET') return sendJson(res, 200, { points: store.listMeasurements({ personId: id, analyte: mm[3] }).filter((x) => x.number != null) });
        if (mm[2] === 'documents' && m === 'GET') return sendJson(res, 200, { documents: store.listDocuments({ personId: id }) });
        if (!mm[2] && m === 'GET') return sendJson(res, 200, store.getPerson(id));
        if (!mm[2] && m === 'PATCH') {
          const b = await jsonBody(req, res);
          if (!b) return;
          if (b.born != null && !isoDate(b.born)) return sendJson(res, 400, { error: 'born must be YYYY-MM-DD' });
          return sendJson(res, 200, store.updatePerson(id, { name: b.name !== undefined ? str(b.name, 80) ?? undefined : undefined, born: b.born, color: b.color !== undefined ? str(b.color, 20) : undefined }));
        }
        if (!mm[2] && m === 'DELETE') return sendJson(res, 200, { ok: store.removePerson(id) });
        return send(res, 405, 'method not allowed', { 'Content-Type': 'text/plain' });
      }

      // Documents
      if (p === '/api/documents') {
        if (m === 'GET') {
          const personId = url.searchParams.get('person');
          const state = url.searchParams.get('state');
          const kind = url.searchParams.get('kind');
          return sendJson(res, 200, { documents: store.listDocuments({ personId: personId || undefined, state: state || undefined, kind: kind || undefined }) });
        }
        if (m === 'POST') {
          // raw body upload: the file bytes, with its name, type and person in headers
          let buffer;
          try {
            buffer = await readBody(req, config.ingest.maxFileBytes + 1024);
          } catch (e) {
            return sendJson(res, e?.code === 'ETOOBIG' ? 413 : 400, { error: e?.code === 'ETOOBIG' ? `larger than ${Math.round(config.ingest.maxFileBytes / 1048576)} MB` : 'upload failed' });
          }
          const name = decodeURIComponent(req.headers['x-file-name'] || 'document');
          const personId = str(req.headers['x-person-id'], 36);
          const r = await ingestor.accept({ buffer, name, type: req.headers['content-type']?.split(';')[0], personId });
          if (!r.ok) return sendJson(res, r.status, { error: r.error, ...(r.document ? { document: { id: r.document.id, state: r.document.state, title: r.document.title } } : {}) });
          return sendJson(res, 202, r.document);
        }
        return send(res, 405, 'method not allowed', { Allow: 'GET, POST', 'Content-Type': 'text/plain' });
      }
      mm = /^\/api\/documents\/([0-9a-f-]{36})(?:\/(confirm|reread|original|page-\d+\.jpg|ask))?$/.exec(p);
      if (mm) {
        const id = mm[1];
        const sub = mm[2];
        if (!store.getDocument(id)) return sendJson(res, 404, { error: 'not found' });
        if (!sub && m === 'GET') return sendJson(res, 200, fullDocument(id));
        if (!sub && m === 'PATCH') {
          const b = await jsonBody(req, res);
          if (!b) return;
          const r = applyEdits(id, b);
          return sendJson(res, r.status, r.body);
        }
        if (!sub && m === 'DELETE') return sendJson(res, 200, { ok: await ingestor.remove(id) });
        if (sub === 'confirm' && m === 'POST') {
          const b = await jsonBody(req, res);
          if (!b) return;
          const d = store.getDocument(id);
          if (d.state !== 'review' && d.state !== 'filed') return sendJson(res, 409, { error: `document is ${d.state}` });
          const r = applyEdits(id, b);
          if (r.status !== 200) return sendJson(res, r.status, r.body);
          store.updateDocument(id, { state: 'filed', reviewed_at: new Date(deps.now()).toISOString() });
          search?.index(id).catch(() => {});
          return sendJson(res, 200, fullDocument(id));
        }
        if (sub === 'reread' && m === 'POST') {
          ingestor.read(id).catch(() => {});
          return sendJson(res, 202, store.getDocument(id));
        }
        if ((sub === 'original' || sub?.startsWith('page-')) && (m === 'GET' || m === 'HEAD')) return serveDocFile(res, id, sub);
        return send(res, 405, 'method not allowed', { 'Content-Type': 'text/plain' });
      }

      if (p.startsWith('/api/')) return sendJson(res, 404, { error: 'not found' });
      if (m !== 'GET' && m !== 'HEAD') return send(res, 405, 'method not allowed', { Allow: 'GET, HEAD', 'Content-Type': 'text/plain' });
      return serveStatic(res, p);
    } catch (e) {
      console.error(`[http] ${m} ${p}: ${e?.message || e}`);
      if (!res.headersSent) sendJson(res, 500, { error: 'internal error' });
      else res.end();
    }
  };
}
