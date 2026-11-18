import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalisePage, mergePages, readPage, READER_PROMPT } from '../src/ingest/reader.js';
import { extractJson } from '../src/llm/client.js';
import { chunkText, cosine } from '../src/search.js';
import { guessPerson } from '../src/ingest/pipeline.js';

test('extractJson: plain, fenced, with prose around, broken', () => {
  assert.deepEqual(extractJson('{"a":1}'), { a: 1 });
  assert.deepEqual(extractJson('Here:\n```json\n{"a": 1}\n```'), { a: 1 });
  assert.deepEqual(extractJson('Sure. {"a":{"b":2}} done'), { a: { b: 2 } });
  assert.equal(extractJson('{"a":'), null);
  assert.equal(extractJson(null), null);
});

test('normalisePage: keeps known keys with the right types, drops the rest', () => {
  const p = normalisePage({
    language: 'it', kind: 'lab_report', date: '2025-09-05', person_hint: ' Marco Bellandi ', issuer: 'Lab', title: 'Esami', text: 'riga 1\nriga 2',
    values: [{ name: 'TSH', value: 2.1, unit: 'mU/L', reference: '0.4 - 4.0' }, { nope: 1 }, { name: '' }],
    medications: [{ name: 'X', dose: '1 g' }], follow_ups: [{ what: 'controllo', when: 'fra 6 mesi' }], amount: { total: '12.5', currency: 'CHF' }, extra: 'ignored',
  });
  assert.equal(p.personHint, 'Marco Bellandi');
  assert.deepEqual(p.values, [{ name: 'TSH', value: '2.1', unit: 'mU/L', reference: '0.4 - 4.0', flag: null }]);
  assert.deepEqual(p.amount, { total: 12.5, currency: 'CHF' });
  assert.equal('extra' in p, false);
  const bad = normalisePage({ kind: 'spaceship', date: '5/9/2025', language: 'klingon', values: 'none' });
  assert.equal(bad.kind, 'other');
  assert.equal(bad.date, null);
  assert.equal(bad.language, 'other');
  assert.deepEqual(bad.values, []);
});

test('mergePages: header from the first typed page, texts joined, values numbered by page', () => {
  const a = normalisePage({ kind: 'lab_report', date: '2025-01-02', text: 'p1', values: [{ name: 'Glicemia', value: '96', unit: 'mg/dL', reference: '70 - 99' }], title: 'Esami' });
  const b = normalisePage({ kind: 'lab_report', text: 'p2', values: [{ name: 'TSH', value: '2,1', unit: 'mU/L' }] });
  const m = mergePages([a, b]);
  assert.equal(m.kind, 'lab_report');
  assert.equal(m.date, '2025-01-02');
  assert.equal(m.text, '[page 1]\np1\n\n[page 2]\np2');
  assert.deepEqual(m.measurements.map((x) => [x.name, x.page, x.number]), [['Glicemia', 1, 96], ['TSH', 2, 2.1]]);
  assert.equal(mergePages([normalisePage({ text: 'only' })]).text, 'only');
});

function fakeDeps(answers) {
  const seen = [];
  return {
    seen,
    now: () => Date.now(),
    readFile: async () => 'key',
    fetch: async (url, init) => {
      const body = JSON.parse(init.body);
      seen.push(body);
      const a = answers.shift();
      if (typeof a === 'number') return new Response('{"error":{"message":"boom"}}', { status: a });
      return Response.json({ choices: [{ message: { role: 'assistant', content: a }, finish_reason: 'stop' }] });
    },
  };
}
const qvac = { baseUrl: 'http://127.0.0.1:11434/v1', keyFile: '/k', reader: 'qwen35-4b', writer: 'qwen35-4b' };

test('readPage: sends the image and the prompt, parses the JSON', async () => {
  const deps = fakeDeps(['{"kind":"invoice","text":"Fattura","amount":{"total":42,"currency":"CHF"}}']);
  const r = await readPage({ qvac, deps, dataUrl: 'data:image/jpeg;base64,/9j/', timeoutMs: 5000 });
  assert.equal(r.ok, true);
  assert.equal(r.page.kind, 'invoice');
  assert.equal(r.repaired, false);
  const sent = deps.seen[0];
  assert.equal(sent.model, 'qwen35-4b');
  assert.equal(sent.reasoning_budget, 0);
  assert.equal(sent.messages[1].content[0].text, READER_PROMPT);
  assert.equal(sent.messages[1].content[1].image_url.url, 'data:image/jpeg;base64,/9j/');
});

test('readPage: a non-JSON answer goes through the repair pass; an HTTP error is reported', async () => {
  const deps = fakeDeps(['Ecco il documento: kind lab_report', '{"kind":"lab_report","text":"ok","values":[]}']);
  const r = await readPage({ qvac, deps, dataUrl: 'data:image/jpeg;base64,/9j/', timeoutMs: 5000 });
  assert.equal(r.ok, true);
  assert.equal(r.repaired, true);
  assert.equal(deps.seen.length, 2);
  assert.match(deps.seen[1].messages[0].content, /^The following text was meant to be one JSON object/);
  const bad = await readPage({ qvac, deps: fakeDeps([500]), dataUrl: 'data:image/jpeg;base64,/9j/', timeoutMs: 5000 });
  assert.equal(bad.ok, false);
  assert.match(bad.error, /HTTP 500: boom/);
});

test('chunkText splits by page then by length with overlap; cosine', () => {
  const one = chunkText('short');
  assert.deepEqual(one, [{ page: 1, text: 'short' }]);
  const two = chunkText('[page 1]\naaa\n\n[page 2]\nbbb');
  assert.deepEqual(two, [{ page: 1, text: 'aaa' }, { page: 2, text: 'bbb' }]);
  const long = chunkText(Array.from({ length: 200 }, (_, i) => `line ${i} ${'x'.repeat(20)}`).join('\n'));
  assert.ok(long.length > 2);
  assert.ok(long.every((c) => c.text.length <= 1800 + 1));
  assert.equal(cosine([1, 0], [1, 0]), 1);
  assert.equal(cosine([1, 0], [0, 1]), 0);
});

test('guessPerson: exactly one match on all name parts', () => {
  const people = [{ id: 'a', name: 'Marco Bellandi' }, { id: 'b', name: 'Tommaso Bellandi' }, { id: 'c', name: 'Giulia Ferrante' }];
  assert.equal(guessPerson(people, 'Paziente: BELLANDI Marco'), 'a');
  assert.equal(guessPerson(people, 'Bellandi'), null, 'two Bellandi: no guess');
  assert.equal(guessPerson(people, null), null);
});
