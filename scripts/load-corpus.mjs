#!/usr/bin/env node
// Upload the synthetic corpus to a running HealthFile and confirm every
// document as read (the demo family in one go). Photos by default; --pdf
// sends the PDFs instead. Usage: node scripts/load-corpus.mjs [--url http://127.0.0.1:8097] [--pdf] [--no-confirm] [--force]
//
// Only into the demo copy (DEMO=1) or a mock server: the fictional family
// must not end up in a family's real archive. --force overrides.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : dflt;
};
const url = (opt('--url', 'http://127.0.0.1:8097') || '').replace(/\/$/, '');
const usePdf = args.includes('--pdf');
const confirm = !args.includes('--no-confirm');
const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'corpus');
const truth = JSON.parse(await readFile(join(root, 'truth.json'), 'utf8'));

let status;
try {
  status = await (await fetch(`${url}/api/status`)).json();
} catch (e) {
  console.error(`no HealthFile at ${url}: ${e.cause?.code || e.message}`);
  process.exit(1);
}
if (!status.demo && !status.mock && !args.includes('--force')) {
  console.error(`${url} is a real archive (not DEMO=1, not mock): the fictional family stays out of it. Use the demo copy (port 8098) or --force.`);
  process.exit(1);
}

const people = (await (await fetch(`${url}/api/people`)).json()).people;
const byName = new Map(people.map((p) => [p.name, p.id]));
for (const p of truth.family.people) {
  if (!byName.has(p.name)) {
    const r = await fetch(`${url}/api/people`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: p.name, born: p.born }) });
    byName.set(p.name, (await r.json()).id);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = 0;
for (const d of truth.documents) {
  const rel = usePdf || !d.photo ? d.file : d.photo;
  const buf = await readFile(join(root, rel));
  const type = rel.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg';
  const res = await fetch(`${url}/api/documents`, { method: 'POST', headers: { 'Content-Type': type, 'X-File-Name': encodeURIComponent(rel.split('/').pop()) }, body: buf });
  const doc = await res.json();
  if (!res.ok) {
    console.log(`✗ ${rel}: ${doc.error}`);
    continue;
  }
  let cur = doc;
  const t0 = Date.now();
  while (cur.state === 'reading' && Date.now() - t0 < 20 * 60_000) {
    await sleep(1000);
    cur = await (await fetch(`${url}/api/documents/${doc.id}`)).json();
  }
  if (cur.state === 'failed') {
    console.log(`✗ ${rel}: ${cur.error}`);
    continue;
  }
  const personId = cur.personId ?? byName.get(d.person_hint) ?? null;
  if (confirm) {
    const r = await fetch(`${url}/api/documents/${doc.id}/confirm`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ personId }) });
    if (!r.ok) console.log(`! ${rel}: confirm ${r.status}`);
  }
  ok++;
  console.log(`✓ ${rel}: ${cur.kind} ${cur.date ?? '-'} ${cur.measurements?.length ?? 0} values ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}
console.log(`${ok}/${truth.documents.length} documents loaded`);
