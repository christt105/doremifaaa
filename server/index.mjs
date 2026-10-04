import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { Vault, sniff } from './vault.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));
const env = process.env;
const PORT = Number(env.PORT ?? 8080);
const STATIC_DIR = resolve(env.STATIC_DIR ?? join(here, '..', 'dist'));
const VAULT_DIR = env.VAULT_DIR ?? '';
const PAPERLESS_URL = (env.PAPERLESS_URL ?? '').replace(/\/+$/, '');
const PAPERLESS_TOKEN = env.PAPERLESS_TOKEN ?? '';
const OBSIDIAN_VAULT = env.OBSIDIAN_VAULT ?? '';
const LIBRARY_NAME = env.LIBRARY_NAME ?? '';
const ALLOWED_ORIGINS = (env.ALLOWED_ORIGINS ?? 'https://christt105.github.io').split(',').map((s) => s.trim()).filter(Boolean);

const vault = VAULT_DIR
  ? new Vault({
      root: VAULT_DIR,
      dirs: (env.LIBRARY_DIRS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
      noteType: env.NOTE_TYPE ?? 'partitura',
      ttlMs: Number(env.SCAN_TTL_SECONDS ?? 60) * 1000
    })
  : null;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.musicxml': 'application/vnd.recordare.musicxml+xml',
  '.xml': 'application/xml',
  '.mxl': 'application/vnd.recordare.musicxml',
  '.pdf': 'application/pdf'
};

function cors(req, res) {
  const origin = req.headers.origin;
  if (origin && (ALLOWED_ORIGINS.includes('*') || ALLOWED_ORIGINS.includes(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
  }
}

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': TYPES['.json'], 'Cache-Control': 'no-cache' });
  res.end(JSON.stringify(body));
}

async function sendFile(res, file, headers = {}) {
  const info = await stat(file);
  res.writeHead(200, {
    'Content-Type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
    'Content-Length': info.size,
    ...headers
  });
  createReadStream(file).pipe(res);
}

function allowedRemote(url) {
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) return false;
    return !PAPERLESS_URL || u.origin === new URL(PAPERLESS_URL).origin;
  } catch {
    return false;
  }
}

async function proxy(res, url, headers = {}) {
  const upstream = await fetch(url, { headers, redirect: 'follow' });
  if (!upstream.ok || !upstream.body) return json(res, 502, { error: `upstream ${upstream.status}` });
  res.writeHead(200, {
    'Content-Type': upstream.headers.get('content-type') ?? 'application/pdf',
    'Cache-Control': 'private, max-age=3600'
  });
  Readable.fromWeb(upstream.body).pipe(res);
}

function publicPiece(p) {
  const { scoreFile, pdfFile, ...rest } = p;
  const enc = encodeURIComponent(p.id);
  return {
    ...rest,
    scoreUrl: p.hasScore ? `api/pieces/${enc}/score` : null,
    scoreFormat: scoreFile ? extname(scoreFile).slice(1).toLowerCase() : null,
    pdfUrl: p.hasPdf ? `api/pieces/${enc}/pdf` : null,
    obsidianUrl: OBSIDIAN_VAULT ? `obsidian://open?vault=${encodeURIComponent(OBSIDIAN_VAULT)}&file=${encodeURIComponent(p.notePath.replace(/\.md$/, ''))}` : null
  };
}

async function api(req, res, path) {
  if (path === '/api/health') return json(res, 200, { ok: true, vault: Boolean(vault), pieces: vault ? (await vault.get()).pieces.length : 0 });
  if (!vault) return json(res, 404, { error: 'no library configured' });
  if (path === '/api/library') {
    const { pieces, scannedAt } = await vault.get(new URL(req.url, 'http://x').searchParams.has('refresh'));
    return json(res, 200, { name: LIBRARY_NAME, scannedAt, pieces: pieces.map(publicPiece) });
  }
  const m = /^\/api\/pieces\/([^/]+)\/(score|pdf)$/.exec(path);
  if (!m) return json(res, 404, { error: 'not found' });
  const piece = await vault.piece(decodeURIComponent(m[1]));
  if (!piece) return json(res, 404, { error: 'unknown piece' });
  if (m[2] === 'score') {
    if (!piece.scoreFile || !vault.inside(piece.scoreFile)) return json(res, 404, { error: 'no score' });
    return sendFile(res, piece.scoreFile, { 'Cache-Control': 'no-cache' });
  }
  if (piece.pdfFile && vault.inside(piece.pdfFile)) {
    const kind = await sniff(piece.pdfFile);
    if (kind.kind === 'pdf') return sendFile(res, piece.pdfFile, { 'Cache-Control': 'private, max-age=3600' });
    if (kind.kind === 'url' && allowedRemote(kind.url)) return proxy(res, kind.url);
  }
  if (PAPERLESS_URL && PAPERLESS_TOKEN && piece.paperlessId)
    return proxy(res, `${PAPERLESS_URL}/api/documents/${piece.paperlessId}/download/`, { Authorization: `Token ${PAPERLESS_TOKEN}` });
  return json(res, 404, { error: 'no pdf' });
}

async function serveStatic(req, res, path) {
  const rel = normalize(decodeURIComponent(path)).replace(/^([/\\])+/, '');
  let file = resolve(STATIC_DIR, rel || 'index.html');
  if (file !== STATIC_DIR && !file.startsWith(STATIC_DIR + sep)) return json(res, 403, { error: 'forbidden' });
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
  } catch {
    file = join(STATIC_DIR, 'index.html');
  }
  const name = file.slice(STATIC_DIR.length + 1).split(sep).join('/');
  const cache = name.startsWith('assets/') ? 'public, max-age=31536000, immutable' : 'no-cache';
  try {
    await sendFile(res, file, { 'Cache-Control': cache });
  } catch {
    json(res, 404, { error: 'not found' });
  }
}

const server = createServer(async (req, res) => {
  const path = new URL(req.url ?? '/', 'http://x').pathname;
  try {
    if (path.startsWith('/api/')) {
      cors(req, res);
      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        return res.end();
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'method not allowed' });
      return await api(req, res, path);
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'method not allowed' });
    return await serveStatic(req, res, path);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) json(res, 500, { error: 'internal error' });
    else res.end();
  }
});

server.listen(PORT, () => {
  console.log(`doremifaaa on :${PORT} (static ${STATIC_DIR}${vault ? `, vault ${vault.root}` : ', no vault'})`);
});
