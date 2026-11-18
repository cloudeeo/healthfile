// Everything that touches the outside of the process goes through this
// object, so tests and mock mode can replace it. The app has no web tools:
// the only network destination is qvac serve on loopback.

import { readFile as fsReadFile, writeFile as fsWriteFile, mkdir, rename, stat, readdir, rm } from 'node:fs/promises';
import { run } from './lib/exec.js';

export function realDeps() {
  return {
    fetch: (url, init) => globalThis.fetch(url, init),
    readFile: (p, enc) => fsReadFile(p, enc),
    writeFile: (p, data, opts) => fsWriteFile(p, data, opts),
    mkdir: (p, opts) => mkdir(p, { recursive: true, mode: 0o700, ...opts }),
    rename,
    stat,
    readdir,
    rm,
    run,
    now: () => Date.now(),
  };
}
