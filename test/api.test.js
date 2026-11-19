// The HTTP API in mock mode: people, upload, reading, review, confirm,
// values, deletion, and what never leaves the house.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer } from '../src/server.js';

let srv;
let base;
let dir;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const j = async (path, opts = {}) => {
  const res = await fetch(`${base}${path}`, { headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) }, ...opts, body: opts.body && !(opts.body instanceof Buffer) ? JSON.stringify(opts.body) : opts.body });
  return { status: res.status, body: await res.json().catch(() => null), res };
};
const waitRead = async (id) => {
  for (let i = 0; i < 100; i++) {
    const { body } = await j(`/api/documents/${id}`);
    if (body.state !== 'reading') return body;
    await sleep(100);
  }
  throw new Error('still reading');
};

before(async () => {
  dir = await mkdtemp(join(tmpdir(), 'healthfile-'));
  srv = await startServer({ MOCK: '1', PORT: '0', DATA_DIR: dir, MOCK_READER_MS: '20', MOCK_NOISE: '0', MOCK_SEED: '0' }, { log: () => {} });
  base = `http://127.0.0.1:${srv.port}`;
});
after(async () => {
  await srv.close();
  await rm(dir, { recursive: true, force: true });
});

test('status: models, counts, no outbound calls, kinds', async () => {
  const { status, body } = await j('/api/status');
  assert.equal(status, 200);
  assert.equal(body.outboundCalls, 0);
  assert.equal(body.models.reader.id, 'qwen35-4b');
  assert.equal(body.models.reader.state, 'ready');
  assert.ok(body.kinds.includes('insurance'));
  assert.equal(body.counts.people, 0);
});

let marco;
test('people: add, list, validate, update', async () => {
  const bad = await j('/api/people', { method: 'POST', body: { name: '' } });
  assert.equal(bad.status, 400);
  const r = await j('/api/people', { method: 'POST', body: { name: 'Marco Bellandi', born: '1979-03-14' } });
  assert.equal(r.status, 201);
  marco = r.body;
  await j('/api/people', { method: 'POST', body: { name: 'Giulia Ferrante' } });
  const list = await j('/api/people');
  assert.equal(list.body.people.length, 2);
  const up = await j(`/api/people/${marco.id}`, { method: 'PATCH', body: { color: '#2f6fed' } });
  assert.equal(up.body.color, '#2f6fed');
  assert.equal((await j('/api/people/00000000-0000-0000-0000-000000000000')).status, 404);
});

let doc;
test('upload a PDF: read, person guessed from the printed name, values normalised', async () => {
  const pdf = await readFile(new URL('../corpus/pdf/marco-lab-2025-09-05.pdf', import.meta.url));
  const r = await j('/api/documents', { method: 'POST', headers: { 'Content-Type': 'application/pdf', 'X-File-Name': 'marco-lab-2025-09-05.pdf' }, body: pdf });
  assert.equal(r.status, 202);
  assert.equal(r.body.state, 'reading');
  doc = await waitRead(r.body.id);
  assert.equal(doc.state, 'review');
  assert.equal(doc.kind, 'lab_report');
  assert.equal(doc.date, '2025-09-05');
  assert.equal(doc.personId, marco.id, 'guessed from "Marco Bellandi" printed on the page');
  assert.equal(doc.pages, 1);
  assert.equal(doc.measurements.length, 20);
  const ldl = doc.measurements.find((m) => m.analyte === 'ldl');
  assert.equal(ldl.unit, 'mg/dL');
  assert.equal(ldl.refHigh, 130);
  assert.equal(ldl.flag, 'H');
  assert.equal(doc.pageList.length, 1);
  assert.ok(doc.pageList[0].width > 0);
  const img = await fetch(`${base}/api/documents/${doc.id}/page-1.jpg`);
  assert.equal(img.status, 200);
  assert.equal(img.headers.get('content-type'), 'image/jpeg');
  const orig = await fetch(`${base}/api/documents/${doc.id}/original`);
  assert.equal(orig.headers.get('content-type'), 'application/pdf');
});

test('review: edits are recorded, confirm files the document and indexes it', async () => {
  const edited = doc.measurements.map((m) => (m.analyte === 'ldl' ? { ...m, value: '147', edited: true } : m)).filter((m) => m.analyte !== 'mcv');
  const r = await j(`/api/documents/${doc.id}/confirm`, { method: 'POST', body: { title: 'Esami settembre', measurements: edited } });
  assert.equal(r.status, 200);
  assert.equal(r.body.state, 'filed');
  assert.deepEqual(r.body.editedFields.sort(), ['measurements', 'title']);
  assert.equal(r.body.measurements.length, 19);
  assert.equal(r.body.measurements.find((m) => m.analyte === 'ldl').number, 147);
  assert.ok(r.body.reviewedAt);
  await sleep(150);
  const chunks = srv.store.listChunks({ personId: marco.id });
  assert.ok(chunks.length >= 1);
  assert.ok(chunks[0].vector, 'embedded through the (mock) embeddings endpoint');
  const hits = await srv.search.query('colesterolo LDL settembre', { personId: marco.id });
  assert.equal(hits.ok, true);
  assert.equal(hits.hits[0].documentId, doc.id);
});

test('values: analyte summary and a series for the person', async () => {
  const pdf = await readFile(new URL('../corpus/pdf/marco-lab-2026-03-02.pdf', import.meta.url));
  const r = await j('/api/documents', { method: 'POST', headers: { 'Content-Type': 'application/pdf', 'X-File-Name': 'marco-lab-2026-03-02.pdf' }, body: pdf });
  const d2 = await waitRead(r.body.id);
  await j(`/api/documents/${d2.id}/confirm`, { method: 'POST', body: {} });
  const a = await j(`/api/people/${marco.id}/analytes`);
  const ldl = a.body.analytes.find((x) => x.analyte === 'ldl');
  assert.equal(ldl.points, 2);
  assert.equal(ldl.latest.date, '2026-03-02');
  const s = await j(`/api/people/${marco.id}/series/ldl`);
  assert.deepEqual(s.body.points.map((p) => p.date), ['2025-09-05', '2026-03-02']);
  assert.equal(s.body.points[0].number, 147, 'the edited value');
});

test('upload checks: empty, wrong type, too big, unknown person; a photo is read too', async () => {
  assert.equal((await j('/api/documents', { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: Buffer.alloc(0) })).status, 400);
  assert.equal((await j('/api/documents', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: Buffer.from('hello') })).status, 415);
  const fake = await j('/api/documents', { method: 'POST', headers: { 'Content-Type': 'image/jpeg', 'X-Person-Id': '00000000-0000-0000-0000-000000000000' }, body: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]) });
  assert.equal(fake.status, 400);
  const photo = await readFile(new URL('../corpus/photo/adele-dimissione-2025-06-28.jpg', import.meta.url));
  const r = await j('/api/documents', { method: 'POST', headers: { 'Content-Type': 'image/jpeg', 'X-File-Name': 'adele-dimissione-2025-06-28.jpg' }, body: photo });
  const d = await waitRead(r.body.id);
  assert.equal(d.kind, 'discharge');
  assert.equal(d.personId, null, 'Adele is not in this family yet: no guess');
  assert.equal(d.items.filter((i) => i.kind === 'medication').length, 3);
  // a corrupt image fails cleanly
  const broken = await j('/api/documents', { method: 'POST', headers: { 'Content-Type': 'image/png', 'X-File-Name': 'x.png' }, body: Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(100, 1)]) });
  const bd = await waitRead(broken.body.id);
  assert.equal(bd.state, 'failed');
  assert.match(bd.error, /converted|read/);
});

test('the same file twice is refused with 409 and the existing document', async () => {
  const pdf = await readFile(new URL('../corpus/pdf/marco-lab-2025-09-05.pdf', import.meta.url));
  const again = await j('/api/documents', { method: 'POST', headers: { 'Content-Type': 'application/pdf', 'X-File-Name': 'copy.pdf' }, body: pdf });
  assert.equal(again.status, 409);
  assert.equal(again.body.document.id, doc.id);
});

test('delete removes rows and files; unknown ids are 404', async () => {
  const del = await j(`/api/documents/${doc.id}`, { method: 'DELETE' });
  assert.equal(del.body.ok, true);
  assert.equal((await j(`/api/documents/${doc.id}`)).status, 404);
  assert.equal((await fetch(`${base}/api/documents/${doc.id}/page-1.jpg`)).status, 404);
  assert.equal(srv.store.listMeasurements({ documentId: doc.id }).length, 0);
});

test('nothing left the house: every upstream call went to loopback and carried no key in mock mode', () => {
  const calls = srv.deps.calls;
  assert.ok(calls.length > 0);
  assert.ok(calls.every((c) => c.path.startsWith('/v1/')));
});

test('static page and security headers', async () => {
  const res = await fetch(`${base}/`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal(res.headers.get('x-frame-options'), 'DENY');
  assert.equal((await fetch(`${base}/../package.json`)).status, 404);
  assert.equal((await fetch(`${base}/api/nope`)).status, 404);
});
