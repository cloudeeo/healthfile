// Safe command runner: execFile with an args array (never a shell string),
// a timeout and an output size limit. It never throws and never rejects.

import { execFile } from 'node:child_process';

export const DEFAULT_TIMEOUT_MS = 3000;
export const DEFAULT_MAX_BYTES = 1024 * 1024;

/**
 * @returns {Promise<{ ok: boolean, code: number|null, stdout: string, stderr: string, error?: string }>}
 *   ok is true when the process exited with code 0. error is set when the
 *   command could not run (missing binary, timeout, output too large).
 */
export function run(cmd, args = [], { timeoutMs = DEFAULT_TIMEOUT_MS, maxBytes = DEFAULT_MAX_BYTES, env } = {}) {
  return new Promise((resolve) => {
    let child;
    try {
      child = execFile(
        cmd,
        args,
        {
          timeout: timeoutMs,
          maxBuffer: maxBytes,
          killSignal: 'SIGKILL',
          windowsHide: true,
          encoding: 'utf8',
          env: env ?? { ...process.env, LC_ALL: 'C', SYSTEMD_COLORS: '0', SYSTEMD_PAGER: '' },
        },
        (err, stdout, stderr) => {
          stdout = String(stdout ?? '');
          stderr = String(stderr ?? '');
          if (!err) return resolve({ ok: true, code: 0, stdout, stderr });
          if (err.code === 'ENOENT') {
            return resolve({ ok: false, code: null, stdout, stderr, error: `${cmd} not found` });
          }
          if (err.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') {
            return resolve({ ok: false, code: null, stdout: '', stderr: '', error: `${cmd} output too large` });
          }
          if (err.killed || err.signal) {
            return resolve({ ok: false, code: null, stdout, stderr, error: `${cmd} timed out after ${timeoutMs} ms` });
          }
          if (typeof err.code === 'number') {
            return resolve({ ok: false, code: err.code, stdout, stderr });
          }
          return resolve({ ok: false, code: null, stdout, stderr, error: `${cmd} failed: ${err.message}` });
        },
      );
    } catch (e) {
      return resolve({ ok: false, code: null, stdout: '', stderr: '', error: `${cmd} failed: ${e.message}` });
    }
    child?.on?.('error', () => {}); // handled by the callback; keeps the process from crashing
  });
}

/** First non-empty line of a command's stderr/stdout, for short error messages. */
export function firstLine(...texts) {
  for (const t of texts) {
    const line = String(t ?? '').split('\n').map((s) => s.trim()).find(Boolean);
    if (line) return line.slice(0, 200);
  }
  return '';
}
