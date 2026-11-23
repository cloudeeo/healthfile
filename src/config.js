// Configuration from the environment. Nothing here is secret: the API key
// stays in its file and is read per request by the LLM client.

import { homedir } from 'node:os';
import { join } from 'node:path';

export function expandHome(p) {
  if (!p) return p;
  if (p === '~') return homedir();
  if (p.startsWith('~/')) return join(homedir(), p.slice(2));
  return p;
}

function intEnv(v, dflt, min, max) {
  const n = Number.parseInt(v ?? '', 10);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(max, Math.max(min, n));
}

export const LANGS = ['it', 'fr', 'en'];

/**
 * @param {NodeJS.ProcessEnv} env
 */
export function loadConfig(env = process.env) {
  const mock = env.MOCK === '1';
  return {
    mock,
    port: intEnv(env.PORT, 8097, 0, 65535),
    host: env.HOST || '127.0.0.1',
    /** Where originals, previews and the database live (mode 0700). */
    dataDir: expandHome(env.DATA_DIR || (mock ? join(process.cwd(), '.mock-data') : '~/.local/share/healthfile')),
    qvac: {
      baseUrl: env.QVAC_URL || 'http://127.0.0.1:11434/v1',
      keyFile: env.QVAC_KEY_FILE === '' || (mock && !env.QVAC_KEY_FILE) ? null : expandHome(env.QVAC_KEY_FILE || '~/qvac-lab/api-key.txt'),
      /** The vision model that reads pages. */
      reader: env.READER_MODEL || 'qwen35-4b',
      /** The text model that answers and repairs JSON. */
      writer: env.WRITER_MODEL || 'qwen35-4b',
      /** The medical model for "explain" (M3); null hides the feature. */
      explainer: env.EXPLAIN_MODEL === '' ? null : env.EXPLAIN_MODEL || 'medpsy',
      embedder: env.EMBED_MODEL || 'embgemma',
      stt: { it: 'whisper-it', fr: 'whisper-fr', en: 'whisper-en' },
      tts: { it: 'tts-it', fr: 'tts-fr', en: 'tts-en' },
    },
    ingest: {
      maxFileBytes: intEnv(env.MAX_FILE_MB, 20, 1, 200) * 1024 * 1024,
      maxPages: intEnv(env.MAX_PAGES, 30, 1, 200),
      /** DPI for PDF pages and the long side of page images sent to the reader. */
      dpi: 150,
      readerLongSide: 1600,
      previewLongSide: 1200,
      readerTimeoutMs: intEnv(env.READER_TIMEOUT_MS, 180_000, 10_000, 900_000),
    },
    /** The default UI language for the family; each browser can change it. */
    lang: LANGS.includes(env.LANG_DEFAULT) ? env.LANG_DEFAULT : 'it',
    familyName: env.FAMILY_NAME || '',
    // a second copy with the fictional family: labelled DEMO everywhere, its own data folder and port
    demo: env.DEMO === '1',
    pollMs: intEnv(env.POLL_MS, 2000, 500, 60_000),
  };
}
