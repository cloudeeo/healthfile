#!/usr/bin/env node
// Import every document in a folder (and its subfolders) into a running
// HealthFile, without the page. Files already in the archive are skipped
// (the server compares SHA-256), so the script can be run again on the same
// folder after adding new files.
//
//   node scripts/import-folder.mjs ~/Scansioni/salute
//   node scripts/import-folder.mjs ~/Scansioni/marco --person "Marco Bellandi"
//   node scripts/import-folder.mjs ~/Scansioni --dry-run
//
// Options:
//   --url URL         HealthFile address (default http://127.0.0.1:8096)
//   --person NAME     file everything under this person (must exist); otherwise the reader guesses from the printed name
//   --wait            wait until every document has been read and print what was found
//   --dry-run         list what would be sent, send nothing
//
// Documents land in "To review": nothing is filed without a look. Accepted:
// .pdf .jpg .jpeg .png .webp .heic .heif, up to the server's size limit.

import { readdir, readFile, stat } from 'node:fs/promises';
import { join, extname, basename, resolve } from 'node:path';

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n, d) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : d;
};
const folder = args.find((a, i) => !a.startsWith('--') && !['--url', '--person'].includes(args[i - 1]));
if (!folder) {
  console.error('usage: node scripts/import-folder.mjs <folder> [--person "Name"] [--url URL] [--wait] [--dry-run]');
  process.exit(2);
}
const url = opt('--url', 'http://127.0.0.1:8096').replace(/\/$/, '');
const TYPES = { '.pdf': 'application/pdf', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.heic': 'image/heic', '.heif': 'image/heif' };

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else if (e.isFile() && TYPES[extname(e.name).toLowerCase()]) out.push(p);
  }
  return out.sort();
}

const root = resolve(folder);
const files = await walk(root);
console.log(`${files.length} file(s) in ${root}`);
if (!files.length) process.exit(0);

let personId = null;
const personName = opt('--person', null);
if (personName && !flag('--dry-run')) {
  const people = (await (await fetch(`${url}/api/people`)).json()).people;
  const p = people.find((x) => x.name.toLowerCase() === personName.toLowerCase());
  if (!p) {
    console.error(`no person named "${personName}"; existing: ${people.map((x) => x.name).join(', ') || 'none'}`);
    process.exit(1);
  }
  personId = p.id;
}

const sent = [];
let skipped = 0;
let failed = 0;
for (const f of files) {
  const rel = f.slice(root.length + 1);
  if (flag('--dry-run')) {
    console.log(`  would send ${rel} (${((await stat(f)).size / 1024).toFixed(0)} KB)`);
    continue;
  }
  const buf = await readFile(f);
  const res = await fetch(`${url}/api/documents`, {
    method: 'POST',
    headers: { 'Content-Type': TYPES[extname(f).toLowerCase()], 'X-File-Name': encodeURIComponent(basename(f)), ...(personId ? { 'X-Person-Id': personId } : {}) },
    body: buf,
  });
  const j = await res.json().catch(() => ({}));
  if (res.status === 409) {
    skipped++;
    console.log(`  = ${rel}: already in the archive`);
  } else if (!res.ok) {
    failed++;
    console.log(`  ✗ ${rel}: ${j.error || `HTTP ${res.status}`}`);
  } else {
    sent.push({ id: j.id, rel });
    console.log(`  → ${rel}`);
  }
}
if (flag('--dry-run')) process.exit(0);
console.log(`${sent.length} sent, ${skipped} already there, ${failed} refused.${sent.length ? ' They are read one page at a time; open "To review" on the page to check and file them.' : ''}`);

if (flag('--wait') && sent.length) {
  const left = new Set(sent.map((s) => s.id));
  while (left.size) {
    await new Promise((r) => setTimeout(r, 3000));
    for (const s of sent) {
      if (!left.has(s.id)) continue;
      const d = await (await fetch(`${url}/api/documents/${s.id}`)).json();
      if (d.state === 'reading') continue;
      left.delete(s.id);
      console.log(d.state === 'failed' ? `  ✗ ${s.rel}: ${d.error}` : `  ✓ ${s.rel}: ${d.kind}, ${d.date ?? 'no date'}, ${d.measurements?.length ?? 0} value(s), ${((d.readerMs ?? 0) / 1000).toFixed(0)} s`);
    }
  }
}
