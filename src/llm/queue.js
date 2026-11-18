// A FIFO of waiting requests per key (a model alias, or "stt:it" for a
// voice language). qvac serve answers one request per model at a time, so
// the dashboard holds one slot per key and lets a few more wait in line
// instead of answering "model busy" at once (v1.4). Nothing here touches
// HTTP: the routes acquire a slot, run the upstream call, release it.

export const CHAT_MAX_WAITING = 4;
export const CHAT_WAIT_MS = 90_000;
export const VOICE_MAX_WAITING = 2;
export const VOICE_WAIT_MS = 20_000;
/** How often a waiting client hears its position again. */
export const QUEUE_TICK_MS = 5_000;

/** Error codes a caller of acquire() can get. */
export const QUEUE_FULL = 'EQUEUEFULL';
export const QUEUE_TIMEOUT = 'EQUEUETIMEOUT';
export const QUEUE_ABORTED = 'EQUEUEABORTED';

function queueError(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

export class SlotQueue {
  /**
   * @param {object} [o]
   * @param {number} [o.maxWaiting]  waiters per key beyond the one running
   * @param {number} [o.waitMs]      longest a waiter stays in line
   * @param {number} [o.tickMs]      interval of the position reminders
   */
  constructor({ maxWaiting = CHAT_MAX_WAITING, waitMs = CHAT_WAIT_MS, tickMs = QUEUE_TICK_MS } = {}) {
    this.maxWaiting = maxWaiting;
    this.waitMs = waitMs;
    this.tickMs = tickMs;
    /** key -> { running: object | null, waiting: object[] } */
    this.keys = new Map();
  }

  lane(key) {
    let l = this.keys.get(key);
    if (!l) {
      l = { running: null, waiting: [] };
      this.keys.set(key, l);
    }
    return l;
  }

  /** True while a request holds the slot of `key`. */
  held(key) {
    return !!this.keys.get(key)?.running;
  }

  /** How many requests wait behind the slot of `key`. */
  waiting(key) {
    return this.keys.get(key)?.waiting.length ?? 0;
  }

  /** Keys whose slot is held right now. */
  busyKeys() {
    return [...this.keys.entries()].filter(([, l]) => l.running).map(([k]) => k);
  }

  /** `{ key: waiting }` for every key with someone in line. */
  snapshot() {
    const out = {};
    for (const [k, l] of this.keys) if (l.waiting.length) out[k] = l.waiting.length;
    return out;
  }

  /**
   * Wait for the slot of `key`. Resolves with a release function once the
   * slot is ours; rejects with code QUEUE_FULL (the line is full, at once),
   * QUEUE_TIMEOUT (waited too long) or QUEUE_ABORTED (the signal fired).
   * `onQueued(position)` is called when the request joins the line
   * (position 1 = next), whenever its position changes, and every tickMs.
   */
  acquire(key, { signal, onQueued } = {}) {
    const lane = this.lane(key);
    if (signal?.aborted) return Promise.reject(queueError(QUEUE_ABORTED, 'request aborted'));
    if (!lane.running) {
      const holder = {};
      lane.running = holder;
      return Promise.resolve(() => this.release(key, holder));
    }
    if (lane.waiting.length >= this.maxWaiting) return Promise.reject(queueError(QUEUE_FULL, 'model busy'));
    return new Promise((resolve, reject) => {
      const w = { onQueued, resolve, reject, position: 0, timer: null, tick: null, onAbort: null };
      const leave = () => {
        clearTimeout(w.timer);
        clearInterval(w.tick);
        signal?.removeEventListener('abort', w.onAbort);
        const i = lane.waiting.indexOf(w);
        if (i >= 0) lane.waiting.splice(i, 1);
        return i >= 0;
      };
      w.leave = leave;
      w.onAbort = () => {
        if (leave()) {
          reject(queueError(QUEUE_ABORTED, 'request aborted'));
          this.notify(lane);
        }
      };
      signal?.addEventListener('abort', w.onAbort, { once: true });
      w.timer = setTimeout(() => {
        if (leave()) {
          reject(queueError(QUEUE_TIMEOUT, `still busy after ${Math.round(this.waitMs / 1000)} s in line`));
          this.notify(lane);
        }
      }, this.waitMs);
      w.tick = setInterval(() => w.onQueued?.(w.position), this.tickMs);
      lane.waiting.push(w);
      this.notify(lane);
    });
  }

  /** Tell every waiter of a lane its current position (1 = next). */
  notify(lane) {
    lane.waiting.forEach((w, i) => {
      const position = i + 1;
      if (w.position !== position) {
        w.position = position;
        w.onQueued?.(position);
      }
    });
  }

  release(key, holder) {
    const lane = this.keys.get(key);
    if (!lane || lane.running !== holder) return;
    lane.running = null;
    const next = lane.waiting.shift();
    if (!next) {
      this.keys.delete(key);
      return;
    }
    next.leave();
    const nextHolder = {};
    lane.running = nextHolder;
    next.resolve(() => this.release(key, nextHolder));
    this.notify(lane);
  }
}
