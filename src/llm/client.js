// Non-streaming calls to qvac serve: one chat completion that must return
// JSON (the page reader, the repair pass), embeddings, and the model list.
// The API key is read from its file per call and never logged.

import { toOpenAIContent } from './images.js';

export const DEFAULT_TIMEOUT_MS = 120_000;

async function bearer(qvac, deps) {
  if (!qvac.keyFile) return {};
  let key;
  try {
    key = String(await deps.readFile(qvac.keyFile, 'utf8')).trim();
  } catch (e) {
    const err = new Error(e?.code === 'ENOENT' ? 'API key file not found' : 'API key file not readable');
    err.keyFile = true;
    throw err;
  }
  return key ? { Authorization: `Bearer ${key}` } : {};
}

function describe(e, timeoutMs) {
  if (e?.keyFile) return e.message;
  if (e?.name === 'TimeoutError' || e?.name === 'AbortError') return `no answer within ${Math.round(timeoutMs / 1000)} s`;
  const code = e?.cause?.code || e?.code;
  if (code === 'ECONNREFUSED') return 'qvac serve is not running';
  return 'qvac serve not reachable';
}

/**
 * One chat completion, not streamed.
 * @returns {Promise<{ ok: true, content: string, usage?: object, ms: number } | { ok: false, error: string, status?: number }>}
 */
export async function complete({ qvac, deps, model, messages, maxTokens = 2048, temperature = 0.1, json = false, reasoning = false, timeoutMs = DEFAULT_TIMEOUT_MS, signal, extra = {} }) {
  const t0 = deps.now();
  const payload = {
    model,
    stream: false,
    max_tokens: maxTokens,
    temperature,
    messages: messages.map((m) => ({ role: m.role, content: toOpenAIContent(m.content) })),
    ...(json ? { response_format: { type: 'json_object' } } : {}),
    ...(reasoning ? {} : { reasoning_budget: 0, chat_template_kwargs: { enable_thinking: false } }),
    ...extra,
  };
  const ctrl = AbortSignal.any([signal ?? new AbortController().signal, AbortSignal.timeout(timeoutMs)]);
  let res;
  try {
    res = await deps.fetch(new URL('chat/completions', qvac.baseUrl.replace(/\/?$/, '/')).toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(await bearer(qvac, deps)) },
      body: JSON.stringify(payload),
      signal: ctrl,
    });
  } catch (e) {
    return { ok: false, error: describe(e, timeoutMs) };
  }
  const text = await res.text().catch(() => '');
  if (res.status !== 200) {
    let msg = `qvac serve answered HTTP ${res.status}`;
    try {
      const j = JSON.parse(text);
      const m = j?.error?.message || j?.message || j?.error;
      if (typeof m === 'string' && m) msg = `${msg}: ${m.slice(0, 200)}`;
    } catch {
      /* not JSON */
    }
    return { ok: false, error: msg, status: res.status };
  }
  let j;
  try {
    j = JSON.parse(text);
  } catch {
    return { ok: false, error: 'qvac serve sent no JSON' };
  }
  const msg = j?.choices?.[0]?.message;
  const content = typeof msg?.content === 'string' ? msg.content : '';
  return { ok: true, content, finish: j?.choices?.[0]?.finish_reason ?? null, usage: j?.usage ?? null, ms: deps.now() - t0 };
}

/** Embeddings for a list of texts, in order. */
export async function embed({ qvac, deps, texts, timeoutMs = DEFAULT_TIMEOUT_MS, signal }) {
  const ctrl = AbortSignal.any([signal ?? new AbortController().signal, AbortSignal.timeout(timeoutMs)]);
  let res;
  try {
    res = await deps.fetch(new URL('embeddings', qvac.baseUrl.replace(/\/?$/, '/')).toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(await bearer(qvac, deps)) },
      body: JSON.stringify({ model: qvac.embedder, input: texts }),
      signal: ctrl,
    });
  } catch (e) {
    return { ok: false, error: describe(e, timeoutMs) };
  }
  if (res.status !== 200) {
    await res.body?.cancel().catch(() => {});
    return { ok: false, error: `embeddings: HTTP ${res.status}` };
  }
  const j = await res.json().catch(() => null);
  const data = Array.isArray(j?.data) ? j.data : null;
  if (!data || data.length !== texts.length) return { ok: false, error: 'embeddings: unexpected answer' };
  return { ok: true, vectors: data.sort((a, b) => a.index - b.index).map((d) => d.embedding) };
}

/** The models qvac serve exposes, as [{ id, state }]. */
export async function listModels({ qvac, deps, timeoutMs = 5000 }) {
  try {
    const res = await deps.fetch(new URL('models', qvac.baseUrl.replace(/\/?$/, '/')).toString(), {
      headers: { Accept: 'application/json', ...(await bearer(qvac, deps)) },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.status !== 200) {
      await res.body?.cancel().catch(() => {});
      return { ok: false, error: `HTTP ${res.status}` };
    }
    const j = await res.json();
    return { ok: true, models: (j?.data ?? []).map((m) => ({ id: String(m.id), state: m.state ?? 'ready' })) };
  } catch (e) {
    return { ok: false, error: describe(e, timeoutMs) };
  }
}

/** Pull the first JSON object out of a model answer (code fences, prose around it). */
export function extractJson(text) {
  if (typeof text !== 'string') return null;
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const candidates = [fenced?.[1], text];
  for (const c of candidates) {
    if (!c) continue;
    const start = c.indexOf('{');
    const end = c.lastIndexOf('}');
    if (start < 0 || end <= start) continue;
    try {
      return JSON.parse(c.slice(start, end + 1));
    } catch {
      /* try the next candidate */
    }
  }
  return null;
}
