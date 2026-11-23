#!/usr/bin/env node
// Empty the demo copy and fill it again with the fictional family: every
// document and person is deleted, then the corpus is uploaded, read by the
// real model and confirmed as read (scripts/load-corpus.mjs).
//
// Usage: node scripts/reset-demo.mjs [--url http://127.0.0.1:8098] [--pdf] [--empty]
//   --empty   only empty it
//
// It refuses any HealthFile that is not the demo copy (DEMO=1): this script
// deletes everything it finds.

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : dflt;
};
const url = (opt('--url', 'http://127.0.0.1:8098') || '').replace(/\/$/, '');
const api = async (path, init) => {
  const res = await fetch(`${url}/api/${path}`, init);
  if (!res.ok) throw new Error(`${init?.method || 'GET'} /api/${path}: HTTP ${res.status}`);
  return res.json();
};

let status;
try {
  status = await api('status');
} catch (e) {
  console.error(`no HealthFile at ${url}: ${e.cause?.code || e.message}`);
  process.exit(1);
}
if (!status.demo) {
  console.error(`${url} is not the demo copy (DEMO=1): nothing deleted.`);
  process.exit(1);
}

const { documents } = await api('documents');
for (const d of documents) await api(`documents/${d.id}`, { method: 'DELETE' });
const { people } = await api('people');
for (const p of people) await api(`people/${p.id}`, { method: 'DELETE' });
console.log(`demo emptied: ${documents.length} documents, ${people.length} people`);
if (args.includes('--empty')) process.exit(0);

const load = join(dirname(fileURLToPath(import.meta.url)), 'load-corpus.mjs');
const child = spawn(process.execPath, [load, '--url', url, ...(args.includes('--pdf') ? ['--pdf'] : [])], { stdio: 'inherit' });
child.on('exit', (code) => process.exit(code ?? 1));
