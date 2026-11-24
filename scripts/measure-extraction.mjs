#!/usr/bin/env node
// Extraction accuracy of the reader on the synthetic corpus, against a
// running HealthFile (real qvac serve or mock). For every document: upload
// (photo by default, --pdf for the PDFs), wait for the reading, compare with
// the ground truth, and write a report. Nothing is confirmed: the documents
// are deleted afterwards unless --keep.
//
// A document already in the archive (409, e.g. the demo after reset-demo) is
// measured as it was read there, unless it was edited by hand, and left alone.
//
// Usage: node scripts/measure-extraction.mjs [--url http://127.0.0.1:8097] [--pdf] [--keep] [--out MEASUREMENTS-extraction.md] [--only marco-lab]

import { analyteOf } from '../src/analytes.js';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : dflt;
};
const url = (opt('--url', 'http://127.0.0.1:8097') || '').replace(/\/$/, '');
const usePdf = args.includes('--pdf');
const keep = args.includes('--keep');
const only = opt('--only', null);
const out = opt('--out', `measure-extraction-${usePdf ? 'pdf' : 'photo'}.md`);
const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'corpus');
const truth = JSON.parse(await readFile(join(root, 'truth.json'), 'utf8'));
const status = await (await fetch(`${url}/api/status`)).json();

import { implausible } from '../public/plausible.js';
const idOf = (name) => { const a = analyteOf(name); return a?.id ?? a ?? null; };
const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9.,<>%-]+/g, ' ').trim();
const numOf = (s) => {
  const m = /[-+]?\d+(?:[.,]\d+)?/.exec(String(s ?? '').replace(/\s/g, ''));
  return m ? Number(m[0].replace(',', '.')) : null;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const rows = [];
const totals = { docs: 0, kind: 0, date: 0, person: 0, issuer: 0, values: 0, valueName: 0, valueNumber: 0, valueUnit: 0, valueRef: 0, valueFlag: 0, extra: 0, wrong: 0, wrongFlagged: 0, meds: 0, medsFound: 0, ms: 0, failed: 0 };

for (const d of truth.documents) {
  if (only && !d.id.includes(only)) continue;
  const rel = usePdf || !d.photo ? d.file : d.photo;
  const buf = await readFile(join(root, rel));
  const type = rel.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg';
  // the file name must not leak the answer to a real reader; the mock needs it, so keep it in mock mode only
  const name = status.mock ? rel.split('/').pop() : `doc-${rows.length + 1}.${rel.split('.').pop()}`;
  const res = await fetch(`${url}/api/documents`, { method: 'POST', headers: { 'Content-Type': type, 'X-File-Name': encodeURIComponent(name) }, body: buf });
  let doc = await res.json();
  // already in this archive (the demo, filled by reset-demo): measure that reading, and leave it there
  let ours = true;
  if (res.status === 409 && doc.document?.id) {
    doc = await (await fetch(`${url}/api/documents/${doc.document.id}`)).json();
    ours = false;
    const touched = (doc.editedFields ?? []).filter((f) => f !== 'personId');
    if (touched.length) {
      rows.push({ id: d.id, error: `already in the archive, edited by hand (${touched.join(', ')})` });
      totals.failed++;
      console.log(`✗ ${d.id}: already in the archive and edited by hand, not measured`);
      continue;
    }
  } else if (!res.ok) {
    rows.push({ id: d.id, error: doc.error });
    totals.failed++;
    console.log(`✗ ${d.id}: ${doc.error}`);
    continue;
  }
  let cur = doc;
  const t0 = Date.now();
  while (cur.state === 'reading' && Date.now() - t0 < 30 * 60_000) {
    await sleep(1000);
    cur = await (await fetch(`${url}/api/documents/${doc.id}`)).json();
  }
  if (cur.state !== 'review' && cur.state !== 'filed') {
    rows.push({ id: d.id, error: cur.error || cur.state });
    totals.failed++;
    console.log(`✗ ${d.id}: ${cur.error || cur.state}`);
    if (!keep && ours) await fetch(`${url}/api/documents/${doc.id}`, { method: 'DELETE' });
    continue;
  }
  totals.docs++;
  totals.ms += cur.readerMs ?? Date.now() - t0;
  const r = { id: d.id, kind: cur.kind === d.kind, date: cur.date === d.date, person: norm(cur.personHint).includes(norm(d.person_hint).split(' ')[1] ?? '') && norm(cur.personHint).includes(norm(d.person_hint).split(' ')[0]), issuer: norm(cur.issuer).includes(norm(d.issuer).split(' ').slice(0, 2).join(' ')), ms: cur.readerMs, pages: cur.pages, kindGot: cur.kind, dateGot: cur.date };
  totals.kind += r.kind;
  totals.date += r.date;
  totals.person += r.person;
  totals.issuer += r.issuer;
  const issuerMiss = r.issuer ? null : `issuer: ${cur.issuer ?? '-'} ≠ ${d.issuer}`;
  // values: match each truth value to a read value by name (normalised, first 12 chars)
  const got = cur.measurements.slice();
  const vt = { n: d.values.length, name: 0, number: 0, unit: 0, ref: 0, flag: 0, misses: issuerMiss ? [issuerMiss] : [] };
  for (const v of d.values) {
    const key = norm(v.name).slice(0, 12);
    // the same analyte under another printed or read name ("Piastre" for "Piastrine") counts as found
    const want = idOf(v.name);
    // a read row that is known to be another analyte ("Emoglobina glicata" for "Emoglobina") never counts as this one
    const other = (g) => want && (g.analyte ?? idOf(g.name)) && (g.analyte ?? idOf(g.name)) !== want;
    const i = got.findIndex((g) => (want && (g.analyte ?? idOf(g.name)) === want) || (!other(g) && (norm(g.name).slice(0, 12) === key || (norm(g.name).includes(key.split(' ')[0]) && key.split(' ')[0].length > 3))));
    if (i < 0) {
      vt.misses.push(`${v.name} (missing)`);
      continue;
    }
    const g = got.splice(i, 1)[0];
    vt.name++;
    const okNum = numOf(g.value) != null && Math.abs(numOf(g.value) - v.number) < 1e-9;
    vt.number += okNum;
    vt.unit += norm(g.unit).replace(/\s/g, '') === norm(v.unit).replace(/\s/g, '');
    const okRef = norm(g.reference).replace(/\s/g, '') === norm(v.reference).replace(/\s/g, '');
    vt.ref += okRef;
    if (!okRef) vt.misses.push(`${v.name} range: ${g.reference ?? '-'} ≠ ${v.reference ?? '-'}`);
    vt.flag += (g.flag ?? null) === (v.flag ?? null);
    if (!okNum) {
      const flagged = implausible(want, g.value, g.unit);
      totals.wrong++;
      totals.wrongFlagged += flagged;
      vt.misses.push(`${v.name}: ${g.value} ≠ ${v.value}${flagged ? ' (flagged as impossible)' : ''}`);
    }
  }
  r.values = vt;
  r.extra = got.length;
  totals.values += vt.n;
  totals.valueName += vt.name;
  totals.valueNumber += vt.number;
  totals.valueUnit += vt.unit;
  totals.valueRef += vt.ref;
  totals.valueFlag += vt.flag;
  totals.extra += got.length;
  const meds = cur.items.filter((i) => i.kind === 'medication');
  totals.meds += (d.medications ?? []).length;
  const medsHit = (d.medications ?? []).filter((m) => meds.some((x) => norm(x.name).includes(norm(m.name).split(' ')[0])));
  totals.medsFound += medsHit.length;
  for (const m of d.medications ?? []) if (!medsHit.includes(m)) vt.misses.push(`medication ${m.name} (missing; read: ${meds.map((x) => x.name).join(', ') || 'none'})`);
  rows.push(r);
  console.log(`${r.kind && r.date ? '✓' : '~'} ${d.id}: kind ${r.kindGot}${r.kind ? '' : ` (want ${d.kind})`}, date ${r.dateGot}${r.date ? '' : ` (want ${d.date})`}, values ${vt.number}/${vt.n} exact, ${vt.name}/${vt.n} found, +${got.length} extra, ${((r.ms ?? 0) / 1000).toFixed(1)} s`);
  if (!keep && ours) await fetch(`${url}/api/documents/${doc.id}`, { method: 'DELETE' });
}

const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(0)} %` : '-');
const md = [
  `# Extraction on the synthetic corpus (${usePdf ? 'PDF' : 'photo'} input)`,
  '',
  `Reader: \`${status.models?.reader?.id ?? '?'}\`${status.mock ? ' (mock)' : ''}, ${new Date().toISOString().slice(0, 10)}, ${totals.docs} documents read, ${totals.failed} failed. One run.`,
  '',
  '| Field | Right | Of | Share |',
  '| --- | --- | --- | --- |',
  `| kind | ${totals.kind} | ${totals.docs} | ${pct(totals.kind, totals.docs)} |`,
  `| date | ${totals.date} | ${totals.docs} | ${pct(totals.date, totals.docs)} |`,
  `| person (printed name) | ${totals.person} | ${totals.docs} | ${pct(totals.person, totals.docs)} |`,
  `| issuer | ${totals.issuer} | ${totals.docs} | ${pct(totals.issuer, totals.docs)} |`,
  `| lab values found (by name) | ${totals.valueName} | ${totals.values} | ${pct(totals.valueName, totals.values)} |`,
  `| lab values exact (number) | ${totals.valueNumber} | ${totals.values} | ${pct(totals.valueNumber, totals.values)} |`,
  `| unit as printed | ${totals.valueUnit} | ${totals.values} | ${pct(totals.valueUnit, totals.values)} |`,
  `| wrong numbers flagged as impossible in review | ${totals.wrongFlagged} | ${totals.wrong} | ${totals.wrong ? pct(totals.wrongFlagged, totals.wrong) : '-'} |`,
  `| reference range as printed | ${totals.valueRef} | ${totals.values} | ${pct(totals.valueRef, totals.values)} |`,
  `| flag (H/L/none) | ${totals.valueFlag} | ${totals.values} | ${pct(totals.valueFlag, totals.values)} |`,
  `| extra values (not in the truth) | ${totals.extra} | | |`,
  `| medications found | ${totals.medsFound} | ${totals.meds} | ${pct(totals.medsFound, totals.meds)} |`,
  `| time per document (mean) | ${totals.docs ? (totals.ms / totals.docs / 1000).toFixed(1) : '-'} s | | |`,
  '',
  '## Per document',
  '',
  '| document | kind | date | person | issuer | values exact | found | extra | s | misses |',
  '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ...rows.map((r) => (r.error ? `| ${r.id} | failed: ${r.error} | | | | | | | | |` : `| ${r.id} | ${r.kind ? '✓' : r.kindGot} | ${r.date ? '✓' : r.dateGot ?? '-'} | ${r.person ? '✓' : '✗'} | ${r.issuer ? '✓' : '✗'} | ${r.values.number}/${r.values.n} | ${r.values.name}/${r.values.n} | ${r.extra} | ${((r.ms ?? 0) / 1000).toFixed(1)} | ${r.values.misses.slice(0, 8).join('; ')} |`)),
  '',
];
await writeFile(out, md.join('\n'));
console.log(`\n${md.slice(4, 18).join('\n')}\n\nwritten to ${out}`);
