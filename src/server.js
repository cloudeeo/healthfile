// Entry point: config, store, ingestor, HTTP server. `startServer` is used
// by the tests too. In mock mode (MOCK=1) no qvac serve is needed: the
// reader answers from the synthetic corpus, and the family of the corpus is
// created on first start so the page has something to show.

import http from 'node:http';
import { join } from 'node:path';
import { mkdirSync, chmodSync } from 'node:fs';
import { loadConfig } from './config.js';
import { realDeps } from './deps.js';
import { Store } from './store.js';
import { SlotQueue } from './llm/queue.js';
import { Ingestor } from './ingest/pipeline.js';
import { Search } from './search.js';
import { createHandler } from './app.js';

export async function startServer(env = process.env, { log = console.log } = {}) {
  const config = loadConfig(env);
  mkdirSync(config.dataDir, { recursive: true, mode: 0o700 });
  try {
    chmodSync(config.dataDir, 0o700);
  } catch {
    /* not ours to change */
  }
  let deps;
  if (config.mock) {
    const { mockDeps } = await import('./mock/deps.js');
    deps = mockDeps({ readerMs: Number(env.MOCK_READER_MS ?? 1200), noise: Number(env.MOCK_NOISE ?? 0.1) });
  } else {
    deps = realDeps();
  }
  const store = new Store(env.DB_FILE || join(config.dataDir, 'healthfile.db'));
  if (config.mock && !store.listPeople().length && env.MOCK_SEED !== '0') {
    const { loadTruth } = await import('./mock/deps.js');
    const colors = ['#2f6fed', '#d9480f', '#2b8a3e', '#862e9c'];
    loadTruth().family.people.forEach((p, i) => store.addPerson({ name: p.name, born: p.born, color: colors[i % colors.length] }));
  }
  const queue = new SlotQueue({ maxWaiting: 50, waitMs: 30 * 60_000 });
  const ingestor = new Ingestor({ store, config, deps, queue, log });
  const search = new Search({ store, config, deps, log });
  const handler = createHandler({ config, store, ingestor, deps, search });
  const server = http.createServer(handler);
  server.requestTimeout = 10 * 60_000;
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.port, config.host, resolve);
  });
  const port = server.address().port;
  log(`healthfile listening on http://${config.host}:${port}${config.mock ? ' (mock mode)' : ''} · data in ${config.dataDir}`);
  return {
    port,
    config,
    store,
    deps,
    ingestor,
    search,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections?.();
        server.close(() => {
          store.close();
          resolve();
        });
      }),
  };
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  startServer().catch((e) => {
    console.error(e?.message || e);
    process.exit(1);
  });
}
