// Incremental parser for the Server-Sent Events stream that an
// OpenAI-compatible server sends for `stream: true` chat completions.
// Only `data:` lines matter: each one carries a JSON chunk, and the stream
// ends with `data: [DONE]`. Other fields (event:, id:, retry:, comments)
// are ignored.

export class SseParser {
  constructor() {
    this.buf = '';
    this.data = [];
    this.done = false;
  }

  /**
   * Feed a piece of the response body and get back the events that were
   * completed by it: `{ done: true }` for `[DONE]`, `{ json }` for a parsed
   * chunk, `{ raw }` for a data payload that is not JSON.
   */
  push(text) {
    this.buf += text;
    const out = [];
    let nl;
    while ((nl = this.buf.indexOf('\n')) >= 0) {
      let line = this.buf.slice(0, nl);
      this.buf = this.buf.slice(nl + 1);
      if (line.endsWith('\r')) line = line.slice(0, -1);
      this.line(line, out);
    }
    return out;
  }

  /** Flush whatever is left when the body ends without a final newline. */
  end() {
    const out = [];
    if (this.buf) {
      const rest = this.buf;
      this.buf = '';
      this.line(rest, out);
    }
    this.line('', out);
    return out;
  }

  line(line, out) {
    if (line === '') {
      if (this.data.length) {
        const payload = this.data.join('\n');
        this.data = [];
        this.emit(payload, out);
      }
      return;
    }
    if (line.startsWith(':')) return;
    const colon = line.indexOf(':');
    const field = colon < 0 ? line : line.slice(0, colon);
    let value = colon < 0 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'data') this.data.push(value);
  }

  emit(payload, out) {
    if (payload.trim() === '[DONE]') {
      this.done = true;
      out.push({ done: true });
      return;
    }
    try {
      out.push({ json: JSON.parse(payload) });
    } catch {
      out.push({ raw: payload });
    }
  }
}

/**
 * Read one chat completion chunk: reasoning and content deltas, the finish
 * reason and `usage` when the server includes it (qvac serve CLI 0.18 does
 * not; it is null or absent).
 */
export function readChunk(json) {
  const choice = Array.isArray(json?.choices) ? json.choices[0] : null;
  const delta = choice?.delta ?? {};
  const reasoning = pickText(delta.reasoning_content) ?? pickText(delta.reasoning) ?? null;
  const content = pickText(delta.content) ?? null;
  const usage = json?.usage && typeof json.usage === 'object' ? json.usage : null;
  const finish = typeof choice?.finish_reason === 'string' ? choice.finish_reason : null;
  const error = json?.error ? errorText(json.error) : null;
  return { reasoning, content, usage, finish, error };
}

function pickText(v) {
  return typeof v === 'string' && v.length ? v : undefined;
}

/** A short message out of an OpenAI-style error payload. */
export function errorText(err) {
  const msg = typeof err === 'string' ? err : typeof err?.message === 'string' ? err.message : null;
  return msg ? msg.slice(0, 200) : 'upstream error';
}
