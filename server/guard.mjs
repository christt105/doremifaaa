import { createHash, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';

export function isIpHost(hostname) {
  return isIP(hostname.replace(/^\[(.*)\]$/, '$1')) !== 0;
}

function parseOrigin(value) {
  try {
    const u = new URL(value);
    return /^https?:$/.test(u.protocol) ? u : null;
  } catch {
    return null;
  }
}

export function originAllowed(origin, host, allowedOrigins) {
  if (origin === undefined || origin === '') return true;
  if (origin === 'null' || origin === '*') return false;
  if (allowedOrigins.includes(origin)) return true;
  const u = parseOrigin(origin);
  if (!u || !host || u.host !== host.toLowerCase()) return false;
  const listed = allowedOrigins.map(parseOrigin).filter(Boolean).map((o) => o.host);
  return isIpHost(u.hostname) || u.hostname === 'localhost' || listed.includes(u.host);
}

const digest = (value) => createHash('sha256').update(value).digest();

export function tokenMatches(authorization, token) {
  if (!token) return true;
  const m = /^Bearer\s+(.+)$/i.exec(authorization ?? '');
  return Boolean(m) && timingSafeEqual(digest(m[1].trim()), digest(token));
}

export function writeDenied(headers, { allowedOrigins, writeToken }) {
  if (!originAllowed(headers.origin, headers.host, allowedOrigins)) return { status: 403, error: 'origin not allowed' };
  if (!tokenMatches(headers.authorization, writeToken)) return { status: 401, error: 'token required' };
  return null;
}
