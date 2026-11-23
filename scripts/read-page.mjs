#!/usr/bin/env node
// Debug one reading: render the first page of a file the way the app does,
// send it to the reader with the app's prompt, and print how the answer
// starts and ends, its length and why it stopped. Nothing is stored.
//
//   node scripts/read-page.mjs corpus/pdf/marco-fattura-lab-2024-09.pdf [--temperature 0.3] [--no-stop]
//
// It prints the page's content: use it on the corpus or the demo, not on a
// family's real documents in a shared terminal.

import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { loadConfig } from '../src/config.js';
import { realDeps } from '../src/deps.js';
import { renderPages, sniff } from '../src/ingest/pages.js';
import { READER_SYSTEM, READER_PROMPT, LOOP_STOPS, salvagePrefix, readPage } from '../src/ingest/reader.js';
import { complete } from '../src/llm/client.js';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const ti = args.indexOf('--temperature');
const temperature = ti >= 0 ? Number(args[ti + 1]) : 0;
if (!file) {
  console.error('usage: node scripts/read-page.mjs <pdf or image> [--temperature 0.3]');
  process.exit(2);
}
const config = loadConfig();
const deps = realDeps();
const dir = await mkdtemp(join(tmpdir(), 'healthfile-read-'));
try {
  const buf = await readFile(resolve(file));
  const mime = sniff(buf);
  const n = await renderPages({ deps, original: resolve(file), mime, dir, ...config.ingest });
  const page = await readFile(join(dir, 'page-1.jpg'));
  console.log(`${file}: ${mime}, ${n} page(s); reading page 1 with ${config.qvac.reader} at temperature ${temperature}…`);
  const t0 = Date.now();
  const r = await complete({
    qvac: config.qvac,
    deps,
    model: config.qvac.reader,
    messages: [
      { role: 'system', content: READER_SYSTEM },
      { role: 'user', content: [{ type: 'text', text: READER_PROMPT }, { type: 'image', dataUrl: `data:image/jpeg;base64,${page.toString('base64')}` }] },
    ],
    maxTokens: 6000,
    temperature,
    timeoutMs: 600_000,
    extra: args.includes('--no-stop') ? {} : { stop: LOOP_STOPS },
  });
  if (!r.ok) {
    console.log(`error: ${r.error}`);
    process.exit(1);
  }
  const c = r.content;
  console.log(`finish: ${r.finish}, ${c.length} characters, usage ${JSON.stringify(r.usage)}, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  console.log('\n--- first 1200 characters ---\n' + c.slice(0, 1200));
  if (c.length > 1200) console.log('\n--- last 800 characters ---\n' + c.slice(-800));
  // and the way the app reads it now: streamed, cut off at the loop
  const t1 = Date.now();
  const app = await readPage({ qvac: config.qvac, deps, dataUrl: `data:image/jpeg;base64,${page.toString('base64')}`, timeoutMs: 600_000 });
  console.log(`\nthe app's reading: ${app.ok ? `kind ${app.page.kind}, date ${app.page.date}, ${app.page.values.length} values, finish ${app.finish}${app.partial ? ', kept before the loop' : ''}` : app.error}, ${((Date.now() - t1) / 1000).toFixed(1)} s`);
  const cut = salvagePrefix(c);
  if (cut) console.log(`\nkept before the transcription: kind ${cut.kind}, date ${cut.date}, ${cut.values?.length ?? 0} values, text ${cut.text?.length ?? 0} characters`);
} finally {
  await rm(dir, { recursive: true, force: true });
}
