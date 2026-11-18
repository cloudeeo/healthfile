// One streamed chat completion against qvac serve, turned into the
// dashboard's NDJSON events: start, reasoning*, token*, done | error.
// The API key is read from its file per request, sent only in the
// Authorization header, and never logged or echoed.

import { SseParser, readChunk, errorText } from './sse.js';
import { toOpenAIContent, countImages } from './images.js';

export const IDLE_TIMEOUT_MS = 120_000;
const MAX_ERROR_BODY = 16 * 1024;
/** What the dashboard says when a model has no projector for the images it got. */
export const NO_VISION_MESSAGE = 'this model does not accept images';
// qvac serve (CLI 0.18) answers HTTP 500 with this text when a text-only
// model receives an image part; the dashboard maps it to a 400-style error.
const MEDIA_UNSUPPORTED_RE = /media not supported/i;

/**
 * @param {object} o
 * @param {{ baseUrl: string, keyFile?: string }} o.qs       upstream config
 * @param {{ model, messages, reasoning, maxTokens, images? }} o.request validated request
 * @param {{ fetch, readFile }} o.deps
 * @param {AbortSignal} [o.signal]   aborts the upstream request (client went away)
 * @param {(ev: object) => void} o.onEvent
 */
export async function streamChat({ qs, request, deps, signal, onEvent, idleTimeoutMs = IDLE_TIMEOUT_MS, now = Date.now }) {
  const emitted = { done: false };
  const emit = (ev) => {
    if (emitted.done) return;
    if (ev.type === 'done' || ev.type === 'error') emitted.done = true;
    onEvent(ev);
  };

  let key = '';
  if (qs.keyFile) {
    try {
      key = String(await deps.readFile(qs.keyFile)).trim();
    } catch (e) {
      return emit({ type: 'error', message: e?.code === 'ENOENT' ? 'API key file not found' : 'API key file not readable' });
    }
  }

  const ctrl = new AbortController();
  let timedOut = false;
  const abortUpstream = () => ctrl.abort();
  if (signal?.aborted) return;
  signal?.addEventListener('abort', abortUpstream, { once: true });
  let timer = null;
  const armTimer = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      timedOut = true;
      ctrl.abort();
    }, idleTimeoutMs);
  };

  const images = Number.isInteger(request.images) ? request.images : request.messages.reduce((n, m) => n + countImages(m.content), 0);
  const payload = {
    model: request.model,
    messages: request.messages.map((m) => ({ role: m.role, content: toOpenAIContent(m.content) })),
    stream: true,
    max_tokens: request.maxTokens,
  };
  if (!request.reasoning) payload.reasoning_budget = 0;

  const headers = { 'Content-Type': 'application/json', Accept: 'text/event-stream' };
  if (key) headers.Authorization = `Bearer ${key}`;

  const t0 = now();
  let firstAt = null;
  let contentChunks = 0;
  let reasoningChunks = 0;
  let usage = null;
  let finish = null;
  let res;
  armTimer();
  try {
    res = await deps.fetch(new URL('/v1/chat/completions', qs.baseUrl).toString(), {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abortUpstream);
    if (signal?.aborted) return;
    return emit({ type: 'error', message: timedOut ? `no answer within ${idleTimeoutMs / 1000} s` : describeFetchError(e) });
  }

  try {
    if (res.status !== 200) {
      const body = await readLimited(res.body, MAX_ERROR_BODY);
      return emit({ type: 'error', ...upstreamError(res.status, body) });
    }
    emit({ type: 'start', model: request.model, t0: new Date(t0).toISOString() });
    const parser = new SseParser();
    const decoder = new TextDecoder();
    const reader = res.body.getReader();
    const handle = (events) => {
      for (const ev of events) {
        if (ev.done) return true;
        if (!ev.json) continue;
        const c = readChunk(ev.json);
        if (c.error) {
          emit({ type: 'error', message: c.error });
          return true;
        }
        if (c.usage) usage = c.usage;
        if (c.finish) finish = c.finish;
        if (c.reasoning) {
          if (firstAt == null) firstAt = now();
          reasoningChunks++;
          armTimer();
          emit({ type: 'reasoning', text: c.reasoning });
        }
        if (c.content) {
          if (firstAt == null) firstAt = now();
          contentChunks++;
          armTimer();
          emit({ type: 'token', text: c.content });
        }
      }
      return false;
    };
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        handle(parser.end());
        break;
      }
      if (handle(parser.push(decoder.decode(value, { stream: true })))) {
        await reader.cancel().catch(() => {});
        break;
      }
    }
    if (emitted.done) return;
    const t1 = now();
    const totalMs = t1 - t0;
    const ttftMs = firstAt == null ? null : firstAt - t0;
    const tokens = Number.isInteger(usage?.completion_tokens) ? usage.completion_tokens : contentChunks;
    const tokensEstimated = !Number.isInteger(usage?.completion_tokens);
    const genMs = firstAt == null ? 0 : t1 - firstAt;
    const tokPerS = tokens > 1 && genMs > 0 ? Math.round((tokens / (genMs / 1000)) * 10) / 10 : tokens > 0 && totalMs > 0 ? Math.round((tokens / (totalMs / 1000)) * 10) / 10 : 0;
    emit({ type: 'done', ttftMs, tokens, tokensEstimated, reasoningChunks, tokPerS, totalMs, finish, usage, images });
  } catch (e) {
    if (signal?.aborted) return;
    if (timedOut) return emit({ type: 'error', message: `no token within ${idleTimeoutMs / 1000} s` });
    return emit({ type: 'error', message: describeFetchError(e) });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abortUpstream);
  }
}

async function readLimited(body, max) {
  if (!body) return '';
  const reader = body.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      chunks.push(value);
      if (size > max) {
        await reader.cancel().catch(() => {});
        break;
      }
    }
  } catch {
    // partial body is fine for an error message
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8').slice(0, max);
}

/** `{ status, message }` for a non-200 upstream answer. */
export function upstreamError(status, body) {
  const detail = upstreamDetail(body);
  if (detail && MEDIA_UNSUPPORTED_RE.test(detail)) return { status: 400, message: NO_VISION_MESSAGE };
  return { status, message: upstreamErrorMessage(status, body, detail) };
}

function upstreamDetail(body) {
  try {
    const json = JSON.parse(body);
    return json?.error ? errorText(json.error) : typeof json?.message === 'string' ? json.message.slice(0, 200) : null;
  } catch {
    return body ? body.replace(/\s+/g, ' ').trim().slice(0, 200) : null;
  }
}

export function upstreamErrorMessage(status, body, detail = upstreamDetail(body)) {
  if (status === 401 || status === 403) return `qvac serve refused the API key (HTTP ${status})`;
  if (status === 404) return detail || 'model not found upstream (HTTP 404)';
  if (status === 429 || status === 503) return detail && /busy/i.test(detail) ? 'model busy' : detail || `model busy (HTTP ${status})`;
  return detail ? `qvac serve answered HTTP ${status}: ${detail}` : `qvac serve answered HTTP ${status}`;
}

function describeFetchError(e) {
  const code = e?.cause?.code;
  if (code === 'ECONNREFUSED') return 'qvac serve refused the connection';
  if (code === 'ECONNRESET' || code === 'UND_ERR_SOCKET') return 'connection to qvac serve was reset';
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return 'qvac serve host not found';
  if (e?.name === 'AbortError') return 'request aborted';
  return code ? `request to qvac serve failed (${code})` : 'request to qvac serve failed';
}
