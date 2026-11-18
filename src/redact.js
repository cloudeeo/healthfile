// Server-side redaction. Every string that leaves the server goes through
// redact() (see sendJson in app.js). The rules err on the side of hiding too
// much: a version string that looks like an IPv4 address is hidden as well.

import { isIPv6 } from 'node:net';

export const REDACTED = '[redacted]';

// qvac:// invites: the whole token up to whitespace or a quote/bracket.
const QVAC_INVITE = /qvac:\/\/[^\s"'<>`)\]]*/gi;

// Authorization: Bearer <token>
const BEARER = /\b(Bearer)\s+[A-Za-z0-9._~+/=-]+/gi;

// key=..., api_key=..., api-key=..., apikey=... (also token/secret/password),
// and the JSON form "api_key": "...".
const KEY_VALUE = /\b((?:api[_-]?)?key|apikey|access[_-]?token|token|secret|password)=(?!\[redacted\])([^\s&"',;)\]}]+)/gi;
const KEY_JSON = /("(?:api[_-]?key|apikey|key|token|secret|password)"\s*:\s*")([^"]*)(")/gi;

// Host names under the Tailscale MagicDNS domain.
const TS_NET = /\b(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\.)*ts\.net\b\.?/gi;

// IPv6 candidates (validated with net.isIPv6 below). Optional %zone.
const IPV6_CANDIDATE = /(?<![0-9A-Za-z.])(?:[0-9A-Fa-f]{0,4}:){2,7}(?:\d{1,3}(?:\.\d{1,3}){3}|[0-9A-Fa-f]{0,4})(?:%[0-9A-Za-z._-]+)?(?![0-9A-Za-z])/g;

// IPv4: four groups of 1-3 digits, not part of a longer dotted number.
const IPV4 = /(?<![\d.])\d{1,3}(?:\.\d{1,3}){3}(?!\.?\d)/g;

// Hex runs of 32 characters or more (public keys, device ids, hashes).
const LONG_HEX = /[0-9A-Fa-f]{32,}/g;

const IPV4_ALLOWED = new Set(['127.0.0.1', '0.0.0.0']);
const IPV6_ALLOWED = new Set(['::1', '::']);

function redactIPv6Candidate(cand) {
  // Try the whole candidate, then shorter prefixes (handles a trailing ":"
  // or ":port"-like tail). The tail that is not part of the address is kept.
  for (let end = cand.length; end >= 2; end--) {
    const piece = cand.slice(0, end);
    const addr = piece.split('%')[0];
    if (isIPv6(addr)) {
      if (IPV6_ALLOWED.has(addr.toLowerCase()) && end === cand.length) return cand;
      if (IPV6_ALLOWED.has(addr.toLowerCase())) return piece + redactIPv6Tail(cand.slice(end));
      return REDACTED + cand.slice(end);
    }
  }
  return cand;
}

function redactIPv6Tail(tail) {
  return tail.replace(IPV6_CANDIDATE, redactIPv6Candidate);
}

/** Redact one string. Non-strings are returned unchanged. */
export function redact(value) {
  if (typeof value !== 'string' || value.length === 0) return value;
  let s = value;
  s = s.replace(QVAC_INVITE, REDACTED);
  s = s.replace(BEARER, (_m, word) => `${word} ${REDACTED}`);
  s = s.replace(KEY_JSON, (_m, a, _v, c) => `${a}${REDACTED}${c}`);
  s = s.replace(KEY_VALUE, (_m, k) => `${k}=${REDACTED}`);
  s = s.replace(TS_NET, REDACTED);
  s = s.replace(IPV6_CANDIDATE, redactIPv6Candidate);
  s = s.replace(IPV4, (m) => (IPV4_ALLOWED.has(m) ? m : REDACTED));
  s = s.replace(LONG_HEX, REDACTED);
  return s;
}

/** Deep copy of a JSON-like value with every string (keys included) redacted. */
export function redactDeep(value, depth = 0) {
  if (depth > 50) return null;
  if (typeof value === 'string') return redact(value);
  if (Array.isArray(value)) return value.map((v) => redactDeep(v, depth + 1));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[redact(k)] = redactDeep(v, depth + 1);
    return out;
  }
  return value;
}
