// Reading one page with the vision model: the prompt, the JSON shape, the
// repair pass, and the merge of pages into one document.

import { complete, extractJson } from '../llm/client.js';
import { KINDS } from '../store.js';
import { toMeasurement } from '../analytes.js';

export const READER_SYSTEM =
  'You read medical and administrative documents for a family archive. ' +
  'You transcribe faithfully, you never invent, and you never give medical advice.';

export const READER_PROMPT = `Read this page of a document and answer with ONE JSON object and nothing else:
{
  "language": "it" | "fr" | "en" | "de" | "other",
  "kind": "lab_report" | "letter" | "prescription" | "vaccination" | "imaging_report" | "discharge" | "invoice" | "insurance" | "other",
  "date": "YYYY-MM-DD" or null (the date of the document, the sample or the visit; not a birth date, not a print date if another date is clearly the document's),
  "person_hint": the patient's or insured person's full name as printed, or null,
  "issuer": the laboratory, practice, hospital, pharmacy or insurer that produced it, or null,
  "title": a short title in the document's language (e.g. "Esami del sangue", "Lettera del pediatra", "Fattura"), max 60 characters,
  "values": every measured value printed with a number, one entry each: in a lab report every analyte; in a visit letter or a paediatric report also weight, height, blood pressure, heart rate, temperature and the like (never prices, amounts, invoice lines, dates or reference numbers): { "name": as printed, "value": as printed (e.g. "5,4" or "< 0.5"), "unit": as printed or null, "reference": the reference range as printed or null, "flag": "H" | "L" | null as printed }; [] when there are none,
  "medications": for a prescription or a letter that prescribes: [{ "name", "dose", "schedule" }], else [],
  "follow_ups": appointments or checks the document asks for: [{ "what", "when" }], else [],
  "amount": for an invoice or a reimbursement statement: { "total": number, "currency": "CHF" | "EUR" | ... } or null,
  "text": the full text of the page, faithfully, in reading order: one line per printed line, table cells separated by " | ", never tabs and never more than one space in a row (do not reproduce the layout with spaces)
}
Rules: "lab_report" is only for laboratory results; a doctor's visit or specialist letter is "letter" even when it lists measurements; numeric dates on these documents are day first, as in Europe: 06.12.2025 and 06/12/2025 are 6 December 2025 ("2025-12-06"); copy numbers, units and ranges exactly as printed, including the decimal mark; do not translate; do not summarise; if a part is unreadable write "[illegible]"; JSON only.`;

export const REPAIR_PROMPT = 'The following text was meant to be one JSON object with the keys language, kind, date, person_hint, issuer, title, text, values, medications, follow_ups, amount. Return the same content as valid JSON and nothing else. Do not change any value.\n\n';

const LANGS = new Set(['it', 'fr', 'en', 'de', 'other']);

/**
 * European documents write dates day first. The model sometimes reads
 * "06.12.2025" as June 12 (seen on omen01 with Qwen3.5-4B). When the page's
 * own transcription has the date only in the order that matches a month-first
 * reading, swap day and month back; when both orders appear, or neither,
 * trust the model.
 */
export function dayFirst(iso, text) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '');
  if (!m || !text) return iso;
  const [, y, mo, d] = m;
  if (mo === d || Number(d) > 12) return iso;
  const printed = (a, b) => new RegExp(`(^|[^0-9])0?${Number(a)}[./-]0?${Number(b)}[./-](${y}|${y.slice(2)})([^0-9]|$)`).test(text);
  // as the model read it, day first: d.mo.y; the misreading shows as mo.d.y on the page
  const asRead = printed(d, mo);
  const swapped = printed(mo, d);
  return swapped && !asRead ? `${y}-${d}-${mo}` : iso;
}

const BP_NAMES = {
  it: ['Pressione sistolica', 'Pressione diastolica'],
  fr: ['Pression systolique', 'Pression diastolique'],
  de: ['Systolischer Blutdruck', 'Diastolischer Blutdruck'],
  en: ['Systolic blood pressure', 'Diastolic blood pressure'],
};

/**
 * "Pressione arteriosa 130/83 mmHg" is two values: the systolic and the
 * diastolic pressure each get their own row, so each has its own series.
 */
export function splitBloodPressure(values, language) {
  const names = BP_NAMES[language] ?? BP_NAMES.en;
  return values.flatMap((v) => {
    const m = /^(\d{2,3})\s*\/\s*(\d{2,3})$/.exec(v.value ?? '');
    if (!m || !/pressi|pressure|blutdruck|^p\.?a\.?$|^bp$|^ta$/i.test(v.name)) return [v];
    return [
      { ...v, name: names[0], value: m[1], reference: null },
      { ...v, name: names[1], value: m[2], reference: null },
    ];
  });
}

/** Make what the model returned safe to store: known keys, right types, nothing else. */
export function normalisePage(raw) {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const str = (v, max = 400) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
  // tabs and runs of spaces are layout, not text (a loop of tabs is how the reader once ran out of tokens)
  const text = typeof o.text === 'string' ? o.text.replace(/\t+/g, ' | ').replace(/ {2,}/g, ' ').replace(/(?: \| )+$/gm, '').trim().slice(0, 40_000) : '';
  const read = typeof o.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.date.trim()) ? o.date.trim() : null;
  const date = dayFirst(read, text);
  const kind = KINDS.includes(o.kind) ? o.kind : 'other';
  const language = LANGS.has(o.language) ? o.language : 'other';
  const arr = (v) => (Array.isArray(v) ? v : []);
  const values = splitBloodPressure(
    arr(o.values)
      .filter((v) => v && typeof v === 'object' && typeof v.name === 'string' && v.name.trim())
      .slice(0, 200)
      .map((v) => ({ name: v.name.trim().slice(0, 120), value: v.value == null ? null : String(v.value).trim().slice(0, 40), unit: str(v.unit, 30), reference: str(v.reference, 60), flag: str(v.flag, 8) })),
    language,
  );
  const medications = arr(o.medications)
    .filter((m) => m && typeof m === 'object' && typeof m.name === 'string' && m.name.trim())
    .slice(0, 50)
    .map((m) => ({ name: m.name.trim().slice(0, 120), dose: str(m.dose, 80), schedule: str(m.schedule, 120) }));
  const followUps = arr(o.follow_ups)
    .filter((f) => f && typeof f === 'object' && typeof f.what === 'string' && f.what.trim())
    .slice(0, 50)
    .map((f) => ({ what: f.what.trim().slice(0, 200), when: str(f.when, 80) }));
  const amount = o.amount && typeof o.amount === 'object' && Number.isFinite(Number(o.amount.total)) ? { total: Number(o.amount.total), currency: str(o.amount.currency, 8) } : null;
  return {
    language,
    kind,
    date,
    personHint: str(o.person_hint, 120),
    issuer: str(o.issuer, 160),
    title: str(o.title, 80),
    text,
    values,
    medications,
    followUps,
    amount,
  };
}

/**
 * Read one page image.
 * @param {object} o
 * @param {string} o.dataUrl  the page as a data URL (JPEG/PNG)
 * @returns {Promise<{ ok: true, page: object, raw: object, ms: number, repaired: boolean } | { ok: false, error: string, ms: number }>}
 */
// Stop generating at a run of tabs in the transcription: that is the loop
// (Qwen3.5-4B right-aligning an invoice total, tab after tab, to the token
// limit). "\\t" is how a tab looks inside the JSON string being written.
export const LOOP_STOPS = ['\\t'.repeat(16), '\t'.repeat(16)];
let stopRefused = false;

export async function readPage({ qvac, deps, dataUrl, timeoutMs, signal }) {
  const t0 = deps.now();
  const ask = async (temperature) => {
    const call = (extra) =>
      complete({
        qvac,
        deps,
        model: qvac.reader,
        messages: [
          { role: 'system', content: READER_SYSTEM },
          { role: 'user', content: [{ type: 'text', text: READER_PROMPT }, { type: 'image', dataUrl }] },
        ],
        maxTokens: 6000,
        temperature,
        timeoutMs,
        signal,
        extra,
      });
    if (stopRefused) return call({});
    const r = await call({ stop: LOOP_STOPS });
    // a server that does not take `stop` gets the request without it, from now on
    if (!r.ok && r.status === 400 && /stop/i.test(r.error)) {
      stopRefused = true;
      return call({});
    }
    return r;
  };
  const done = (raw, extra = {}) => ({ ok: true, page: normalisePage(raw), raw, ms: deps.now() - t0, repaired: false, ...extra });

  let r = await ask(0);
  if (!r.ok) return { ok: false, error: r.error, ms: deps.now() - t0 };
  let raw = extractJson(r.content);
  if (raw) return done(raw, { finish: r.finish ?? null });

  // Cut off in the transcription (stopped at the loop, or at the token limit):
  // everything before "text" is complete, keep it and the text up to the loop.
  let cut = salvagePrefix(r.content);
  if (cut) return done(cut, { repaired: true, partial: true, finish: r.finish ?? null });

  // Cut off at the token limit before "text": one more reading with a little sampling, which breaks most loops.
  if (r.finish === 'length') {
    const again = await ask(0.3);
    if (again.ok) {
      raw = extractJson(again.content);
      if (raw) return done(raw, { repaired: true, finish: again.finish ?? null });
      cut = salvagePrefix(again.content) ?? salvageHeader(again.content);
      if (cut) return done(cut, { repaired: true, partial: true, finish: again.finish ?? null });
    }
    if (r.finish === 'length') {
      const head = salvageHeader(r.content);
      if (head) return done(head, { repaired: true, partial: true, finish: 'length' });
      return { ok: false, error: 'the page is too long for the reader', ms: deps.now() - t0 };
    }
  }
  // Not JSON at all: a second pass with the text model, which only has to fix it.
  const fix = await complete({ qvac, deps, model: qvac.writer, messages: [{ role: 'user', content: REPAIR_PROMPT + r.content.slice(0, 30_000) }], maxTokens: 6000, temperature: 0, timeoutMs, signal });
  raw = fix.ok ? extractJson(fix.content) : null;
  if (raw) return done(raw, { repaired: true, finish: r.finish ?? null });
  return { ok: false, error: 'the reader did not return JSON', ms: deps.now() - t0 };
}

/**
 * An answer cut off inside "text" (the last key): parse everything before
 * it, and keep the transcription up to where it started looping. Null when
 * the cut came before "text".
 */
export function salvagePrefix(content) {
  const c = String(content ?? '');
  const start = c.indexOf('{');
  const k = c.search(/"text"\s*:\s*"/);
  if (start < 0 || k <= start) return null;
  let head;
  try {
    head = JSON.parse(c.slice(start, k).replace(/,\s*$/, '') + '}');
  } catch {
    return null;
  }
  if (!head || typeof head !== 'object' || !head.kind) return null;
  // the text written before the loop: up to the first long run of tabs or spaces
  let body = c.slice(c.indexOf('"', c.indexOf(':', k) + 1) + 1);
  const loop = body.search(/(?:\\t){6,}|\t{6,}|(?:\\n){6,}| {12,}/);
  body = loop >= 0 ? body.slice(0, loop) : body.replace(/"\s*}\s*(?:```)?\s*$/, '');
  body = body.replace(/\\+$/, '');
  try {
    head.text = JSON.parse(`"${body}"`);
  } catch {
    head.text = body.replace(/\\n/g, '\n').replace(/\\t/g, ' ').replace(/\\"/g, '"');
  }
  return head;
}

/**
 * The simple fields of an answer cut off before its end: string values of
 * the header keys, and the amount. Null when not even the kind is there.
 */
export function salvageHeader(content) {
  const text = String(content ?? '');
  const out = { values: [], medications: [], follow_ups: [] };
  for (const k of ['language', 'kind', 'date', 'person_hint', 'issuer', 'title']) {
    const m = new RegExp(`"${k}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(text);
    if (m) out[k] = m[1].replace(/\\"/g, '"');
  }
  const total = /"amount"\s*:\s*\{\s*"total"\s*:\s*([0-9.]+)\s*,\s*"currency"\s*:\s*"([A-Z]{3})"/.exec(text);
  if (total) out.amount = { total: Number(total[1]), currency: total[2] };
  return out.kind ? out : null;
}

/** Join the pages of one document: first page's header fields, all texts, all values. */
export function mergePages(pages) {
  const first = pages.find((p) => p.kind !== 'other') ?? pages[0] ?? normalisePage({});
  const dates = pages.map((p) => p.date).filter(Boolean);
  const kinds = pages.map((p) => p.kind).filter((k) => k !== 'other');
  const kind = kinds.length ? mostCommon(kinds) : 'other';
  const measurements = [];
  pages.forEach((p, i) => {
    for (const v of p.values) {
      const m = toMeasurement(v, i + 1);
      if (m) measurements.push(m);
    }
  });
  return {
    language: first.language,
    kind,
    date: dates[0] ?? null,
    personHint: pages.map((p) => p.personHint).find(Boolean) ?? null,
    issuer: pages.map((p) => p.issuer).find(Boolean) ?? null,
    title: first.title ?? pages.map((p) => p.title).find(Boolean) ?? null,
    text: pages.map((p, i) => (pages.length > 1 ? `[page ${i + 1}]\n${p.text}` : p.text)).join('\n\n'),
    measurements,
    medications: pages.flatMap((p) => p.medications),
    followUps: pages.flatMap((p) => p.followUps),
    amount: pages.map((p) => p.amount).find(Boolean) ?? null,
  };
}

function mostCommon(list) {
  const n = new Map();
  for (const x of list) n.set(x, (n.get(x) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1])[0][0];
}
