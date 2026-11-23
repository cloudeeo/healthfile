// The demo copy (DEMO=1): labelled as such, its own manifest, and the reset
// script that empties and refills it but refuses any other archive.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { startServer } from '../src/server.js';

const run = promisify(execFile);
const script = (name) => new URL(`../scripts/${name}`, import.meta.url).pathname;
let demo;
let real;
const dirs = [];

before(async () => {
  for (let i = 0; i < 2; i++) dirs.push(await mkdtemp(join(tmpdir(), 'healthfile-demo-')));
  const common = { MOCK: '1', PORT: '0', MOCK_READER_MS: '5', MOCK_NOISE: '0', MOCK_SEED: '0' };
  demo = await startServer({ ...common, DEMO: '1', DATA_DIR: dirs[0] }, { log: () => {} });
  real = await startServer({ ...common, DATA_DIR: dirs[1] }, { log: () => {} });
});
after(async () => {
  await demo.close();
  await real.close();
  for (const d of dirs) await rm(d, { recursive: true, force: true });
});

const base = (s) => `http://127.0.0.1:${s.port}`;

test('the demo copy says so: status and its own manifest', async () => {
  assert.equal((await (await fetch(`${base(demo)}/api/status`)).json()).demo, true);
  assert.equal((await (await fetch(`${base(real)}/api/status`)).json()).demo, false);
  const m = await (await fetch(`${base(demo)}/manifest.webmanifest`)).json();
  assert.equal(m.name, 'HealthFile Demo');
  assert.equal((await (await fetch(`${base(real)}/manifest.webmanifest`)).json()).name, 'HealthFile');
});

test('reset-demo refuses an archive that is not the demo, and deletes nothing there', async () => {
  await fetch(`${base(real)}/api/people`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Persona Vera' }) });
  await assert.rejects(run(process.execPath, [script('reset-demo.mjs'), '--url', base(real)]), /not the demo copy/);
  assert.equal((await (await fetch(`${base(real)}/api/people`)).json()).people.length, 1);
});

test('reset-demo empties the demo and fills it with the fictional family, every document filed', async () => {
  const truth = JSON.parse(await readFile(new URL('../corpus/truth.json', import.meta.url), 'utf8'));
  await fetch(`${base(demo)}/api/people`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Leftover' }) });
  const { stdout } = await run(process.execPath, [script('reset-demo.mjs'), '--url', base(demo)], { timeout: 120_000 });
  assert.match(stdout, /demo emptied: 0 documents, 1 people/);
  const people = (await (await fetch(`${base(demo)}/api/people`)).json()).people;
  assert.deepEqual(people.map((p) => p.name).sort(), truth.family.people.map((p) => p.name).sort());
  const docs = (await (await fetch(`${base(demo)}/api/documents`)).json()).documents;
  assert.equal(docs.length, truth.documents.length);
  assert.ok(docs.every((d) => d.state === 'filed'), JSON.stringify(docs.filter((d) => d.state !== 'filed').map((d) => [d.originalName, d.state])));
  // a second reset starts from zero again
  const again = await run(process.execPath, [script('reset-demo.mjs'), '--url', base(demo), '--empty']);
  assert.match(again.stdout, new RegExp(`demo emptied: ${truth.documents.length} documents, ${truth.family.people.length} people`));
});
