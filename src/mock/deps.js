// Mock mode: no qvac serve. The reader answers from the corpus's ground
// truth when it recognises the page (by the document id hidden in the
// original's file name), with a little realistic noise; otherwise it
// returns a plausible "other" document. Embeddings are a cheap hash.
// Everything on disk (pdftoppm, convert) is real, so the pipeline is the
// same as in production.

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { realDeps } from '../deps.js';

let TRUTH = null;
export function loadTruth(file = new URL('../../corpus/truth.json', import.meta.url)) {
  if (!TRUTH) {
    try {
      TRUTH = JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      TRUTH = { family: { people: [] }, documents: [] };
    }
  }
  return TRUTH;
}

const sleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => (clearTimeout(t), reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))), { once: true });
  });

/** A fake reading of one page from a truth document (page 1 carries the header and values). */
export function fakePage(truth, page = 1, noise = 0) {
  const lines = [truth.issuer, truth.title, `Paziente: ${truth.person_hint}`, `Data: ${truth.date}`];
  const values = (truth.values ?? []).map((v) => ({ name: v.name, value: v.value, unit: v.unit, reference: v.reference, flag: v.flag }));
  // noise: one value in ten loses its unit, the way a real reader sometimes does
  if (noise) for (const v of values) if (Math.random() < noise) v.unit = null;
  for (const v of values) lines.push(`${v.name} | ${v.value} | ${v.unit ?? ''} | ${v.reference ?? ''}${v.flag ? ` | ${v.flag}` : ''}`);
  for (const m of truth.medications ?? []) lines.push(`${m.name} ${m.dose ?? ''} ${m.schedule ?? ''}`.trim());
  for (const f of truth.follow_ups ?? []) lines.push(`${f.what}${f.when ? `: ${f.when}` : ''}`);
  if (truth.amount) lines.push(`Totale ${truth.amount.currency} ${truth.amount.total}`);
  lines.push('Documento fittizio a scopo dimostrativo');
  return {
    language: truth.language,
    kind: truth.kind,
    date: truth.date,
    person_hint: truth.person_hint,
    issuer: truth.issuer,
    title: truth.title,
    text: lines.join('\n'),
    values: page === 1 ? values : [],
    medications: page === 1 ? truth.medications ?? [] : [],
    follow_ups: page === 1 ? truth.follow_ups ?? [] : [],
    amount: page === 1 ? truth.amount ?? null : null,
  };
}

const UNKNOWN_PAGE = {
  language: 'it',
  kind: 'other',
  date: null,
  person_hint: null,
  issuer: null,
  title: 'Documento',
  text: 'Testo non riconosciuto dal lettore di prova.',
  values: [],
  medications: [],
  follow_ups: [],
  amount: null,
};

export function mockDeps({ readerMs = 1200, noise = 0.1, truthFile } = {}) {
  const real = realDeps();
  const truth = loadTruth(truthFile);
  const byId = new Map(truth.documents.map((d) => [d.id, d]));
  const calls = [];
  // the pipeline tells us which document a page belongs to through the file name
  // of the original it saved; the mock reader cannot see that, so the app passes
  // the original name in a header the mock reads back (see pipeline/mock bridge)
  let currentHint = null;
  const deps = {
    ...real,
    calls,
    setHint: (name) => (currentHint = name),
    async fetch(url, init = {}) {
      const u = new URL(url);
      calls.push({ path: u.pathname, hasAuth: !!init.headers?.Authorization });
      if (u.pathname.endsWith('/models')) {
        return Response.json({ object: 'list', data: ['qwen35-4b', 'embgemma', 'medpsy', 'botpsy', 'whisper-it', 'tts-it'].map((id) => ({ id, object: 'model', state: 'ready' })) });
      }
      if (u.pathname.endsWith('/embeddings')) {
        const body = JSON.parse(init.body);
        const input = Array.isArray(body.input) ? body.input : [body.input];
        return Response.json({ object: 'list', data: input.map((t, index) => ({ index, embedding: hashVector(t) })) });
      }
      if (u.pathname.endsWith('/chat/completions')) {
        const body = JSON.parse(init.body);
        await sleep(readerMs, init.signal);
        const last = body.messages.at(-1);
        const hasImage = Array.isArray(last?.content) && last.content.some((p) => p.type === 'image_url');
        let content;
        if (hasImage) {
          const id = currentHint && [...byId.keys()].find((k) => currentHint.includes(k));
          const t = id ? byId.get(id) : null;
          const n = Number(/page (\d+)/.exec(currentHint ?? '')?.[1] ?? 1);
          content = JSON.stringify(t ? fakePage(t, n, noise) : UNKNOWN_PAGE);
        } else {
          const text = typeof last?.content === 'string' ? last.content : last?.content?.map((p) => p.text ?? '').join('\n') ?? '';
          content = text.startsWith('The following text was meant to be one JSON object') ? '{}' : 'Risposta di prova del modello: ' + text.slice(0, 80);
        }
        return Response.json({ id: 'chatcmpl-mock', object: 'chat.completion', model: body.model, choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }], usage: { prompt_tokens: 900, completion_tokens: 300 } });
      }
      return new Response('not found', { status: 404 });
    },
  };
  return deps;
}

function hashVector(text, dim = 64) {
  const v = new Array(dim).fill(0);
  for (const w of String(text).toLowerCase().split(/\W+/).filter(Boolean)) {
    const h = createHash('sha1').update(w).digest();
    for (let i = 0; i < 4; i++) v[h[i] % dim] += ((h[i + 4] % 7) - 3) / 3;
  }
  const n = Math.hypot(...v) || 1;
  return v.map((x) => x / n);
}
