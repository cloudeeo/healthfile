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
      // { loop: text }: an answer cut off at max_tokens
      if (a && typeof a === 'object') return Response.json({ choices: [{ message: { role: 'assistant', content: a.loop }, finish_reason: 'length' }] });
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

import { dayFirst } from '../src/ingest/reader.js';

test('dates: a day-first date read month first is put back, from the page text', () => {
  // the omen01 case: "Data prelievo: 06.12.2025" read as 2025-06-12
  assert.equal(dayFirst('2025-06-12', 'Nato/a il: 30.08.1951\nData prelievo: 06.12.2025'), '2025-12-06');
  assert.equal(dayFirst('2025-06-12', 'Data: 6/12/25'), '2025-12-06');
  // read right: unchanged
  assert.equal(dayFirst('2025-12-06', 'Data prelievo: 06.12.2025'), '2025-12-06');
  // both orders on the page, or none: the model is trusted
  assert.equal(dayFirst('2025-06-12', 'Prelievo 06.12.2025, stampato 12.06.2025'), '2025-06-12');
  assert.equal(dayFirst('2025-06-12', 'no dates here'), '2025-06-12');
  // no ambiguity possible
  assert.equal(dayFirst('2025-10-28', 'Data: 28.10.2025'), '2025-10-28');
  assert.equal(dayFirst('2025-05-05', '05.05.2025'), '2025-05-05');
  assert.equal(dayFirst(null, 'x'), null);
  // a longer number around it is not a date
  assert.equal(dayFirst('2025-06-12', 'Rif. 106.12.20251'), '2025-06-12');
});

import { splitBloodPressure } from '../src/ingest/reader.js';

test('blood pressure "130/83" becomes two values, in the page language', () => {
  const out = splitBloodPressure([{ name: 'Pressione arteriosa', value: '130/83', unit: 'mmHg', reference: null, flag: null }, { name: 'Frequenza cardiaca', value: '69', unit: 'bpm' }], 'it');
  assert.deepEqual(out.map((v) => [v.name, v.value, v.unit]), [['Pressione sistolica', '130', 'mmHg'], ['Pressione diastolica', '83', 'mmHg'], ['Frequenza cardiaca', '69', 'bpm']]);
  assert.equal(splitBloodPressure([{ name: 'PA', value: '120 / 80' }], 'fr')[1].name, 'Pression diastolique');
  // a ratio that is not a pressure stays as it is
  assert.equal(splitBloodPressure([{ name: 'Rapporto albumina/globuline', value: '12/10' }], 'it').length, 1);
  // through normalisePage, as the reader stores it
  const p = normalisePage({ language: 'it', kind: 'letter', values: [{ name: 'Pressione arteriosa', value: '130/83', unit: 'mmHg' }] });
  assert.equal(p.values.length, 2);
});

test('readPage: an answer cut off in a loop is read once more with a little sampling', async () => {
  const loop = '{"kind":"invoice","values":[' + '{"name":"Emocromo","value":"18.50"},'.repeat(200);
  const deps = fakeDeps([{ loop }, '{"kind":"invoice","text":"Fattura","values":[]}']);
  const r = await readPage({ qvac, deps, dataUrl: 'data:image/jpeg;base64,/9j/', timeoutMs: 5000 });
  assert.equal(r.ok, true);
  assert.equal(r.page.kind, 'invoice');
  assert.equal(deps.seen.length, 2);
  assert.equal(deps.seen[0].temperature, 0);
  assert.equal(deps.seen[1].temperature, 0.3);
  // twice in a loop: the header fields written before the loop are kept, no third call
  const head = '{"language":"it","kind":"invoice","date":"2024-09-21","person_hint":"Marco Bellandi","issuer":"Laboratorio Analisi Demo SA","title":"Fattura","values":[' + '{"name":"Emocromo","value":"18.50"},'.repeat(200);
  const d2 = fakeDeps([{ loop: head }, { loop: head }]);
  const part = await readPage({ qvac, deps: d2, dataUrl: 'data:image/jpeg;base64,/9j/', timeoutMs: 5000 });
  assert.equal(part.ok, true);
  assert.equal(part.partial, true);
  assert.deepEqual([part.page.kind, part.page.date, part.page.personHint, part.page.values.length], ['invoice', '2024-09-21', 'Marco Bellandi', 0]);
  assert.equal(d2.seen.length, 2);
  // not even a kind before the loop: the error says why
  const bad = await readPage({ qvac, deps: fakeDeps([{ loop: '{"values":[' + '1,'.repeat(100) }, { loop: '{"values":[' + '1,'.repeat(100) }]), dataUrl: 'data:image/jpeg;base64,/9j/', timeoutMs: 5000 });
  assert.equal(bad.ok, false);
  assert.match(bad.error, /too long for the reader/);
});

test('readPage: a transcription that loops on tabs is stopped, and everything before it is kept', async () => {
  // what qvac serve returned on omen01 for the lab invoice, stopped at the run of tabs
  const answer = '```json\n{\n  "language": "it",\n  "kind": "invoice",\n  "date": "2024-09-21",\n  "person_hint": "Marco Bellandi",\n  "issuer": "Laboratorio Analisi Demo SA",\n  "title": "Fattura",\n  "values": [],\n  "medications": [],\n  "follow_ups": [],\n  "amount": { "total": 86.1, "currency": "CHF" },\n  "text": "Fattura\\nEmocromo completo\\t\\t\\t\\t\\t18.50\\nPrelievo\\t\\t\\t\\t\\t12.00\\n';
  const deps = fakeDeps([answer]);
  const r = await readPage({ qvac, deps, dataUrl: 'data:image/jpeg;base64,/9j/', timeoutMs: 5000 });
  assert.equal(r.ok, true);
  assert.equal(r.partial, true);
  assert.equal(deps.seen.length, 1, 'no second reading: everything that matters was before the text');
  assert.ok(Array.isArray(deps.seen[0].stop) && deps.seen[0].stop[0].startsWith('\\t'));
  assert.deepEqual([r.page.kind, r.page.date, r.page.personHint, r.page.amount.total], ['invoice', '2024-09-21', 'Marco Bellandi', 86.1]);
  assert.equal(r.page.text, 'Fattura\nEmocromo completo | 18.50\nPrelievo | 12.00');
});

test('readPage: a server that refuses "stop" is asked again without it', async () => {
  const seen = [];
  const deps = {
    now: () => Date.now(),
    readFile: async () => 'key',
    fetch: async (url, init) => {
      const body = JSON.parse(init.body);
      seen.push(body);
      if (body.stop) return new Response('{"error":{"message":"unknown parameter: stop"}}', { status: 400 });
      return Response.json({ choices: [{ message: { role: 'assistant', content: '{"kind":"letter","text":"ok"}' }, finish_reason: 'stop' }] });
    },
  };
  const r = await readPage({ qvac, deps, dataUrl: 'data:image/jpeg;base64,/9j/', timeoutMs: 5000 });
  assert.equal(r.ok, true);
  assert.equal(seen.length, 2);
  assert.equal(seen[1].stop, undefined);
});
