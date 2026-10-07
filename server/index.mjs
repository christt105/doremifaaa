import { createReadStream, realpathSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Vault, sniff } from './vault.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));

const list = (value) => value.split(',').map((s) => s.trim()).filter(Boolean);

export function loadConfig(env = process.env) {
  return {
    port: Number(env.PORT ?? 8080),
    staticDir: resolve(env.STATIC_DIR ?? join(here, '..', 'dist')),
    vaultDir: env.VAULT_DIR ?? '',
    libraryDirs: list(env.LIBRARY_DIRS ?? ''),
    excludeDirs: list(env.EXCLUDE_DIRS ?? 'Templates'),
    noteType: env.NOTE_TYPE ?? 'partitura',
    scanTtlMs: Number(env.SCAN_TTL_SECONDS ?? 60) * 1000,
    paperlessUrl: (env.PAPERLESS_URL ?? '').replace(/\/+$/, ''),
    paperlessToken: env.PAPERLESS_TOKEN ?? '',
    obsidianVault: env.OBSIDIAN_VAULT ?? '',
    libraryName: env.LIBRARY_NAME ?? '',
    allowedOrigins: list(env.ALLOWED_ORIGINS ?? 'https://christt105.github.io')
  };
}

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

async function proxy(res, url, headers = {}) {
  const upstream = await fetch(url, { headers, redirect: 'follow' });
  if (!upstream.ok || !upstream.body) return json(res, 502, { error: `upstream ${upstream.status}` });
  res.writeHead(200, {
    'Content-Type': upstream.headers.get('content-type') ?? 'application/pdf',
    'Cache-Control': 'private, max-age=3600'
  });
  Readable.fromWeb(upstream.body).pipe(res);
}

export function createApp(config) {
  const { staticDir, paperlessUrl, paperlessToken, obsidianVault, allowedOrigins } = config;
  const vault = config.vaultDir
    ? new Vault({ root: config.vaultDir, dirs: config.libraryDirs, exclude: config.excludeDirs, noteType: config.noteType, ttlMs: config.scanTtlMs })
    : null;

  function cors(req, res) {
    const origin = req.headers.origin;
    res.setHeader('Vary', 'Origin');
    if (origin && (allowedOrigins.includes('*') || allowedOrigins.includes(origin))) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.setHeader('Access-Control-Allow-Private-Network', 'true');
    }
  }

  function allowedRemote(url) {
    try {
      const u = new URL(url);
      if (!/^https?:$/.test(u.protocol)) return false;
      return Boolean(paperlessUrl) && u.origin === new URL(paperlessUrl).origin;
    } catch {
      return false;
    }
  }

  function publicPiece(p) {
    const { scoreFile, pdfFile, ...rest } = p;
    const enc = encodeURIComponent(p.id);
    return {
      ...rest,
      scoreUrl: p.hasScore ? `api/pieces/${enc}/score` : null,
      scoreFormat: scoreFile ? extname(scoreFile).slice(1).toLowerCase() : null,
      pdfUrl: p.hasPdf ? `api/pieces/${enc}/pdf` : null,
      obsidianUrl: obsidianVault ? `obsidian://open?vault=${encodeURIComponent(obsidianVault)}&file=${encodeURIComponent(p.notePath.replace(/\.md$/, ''))}` : null
    };
  }

  async function api(req, res, path) {
    if (path === '/api/health') return json(res, 200, { ok: true, vault: Boolean(vault), pieces: vault ? (await vault.get()).pieces.length : 0 });
    if (!vault) return json(res, 404, { error: 'no library configured' });
    if (path === '/api/library') {
      const { pieces, scannedAt } = await vault.get(new URL(req.url, 'http://x').searchParams.has('refresh'));
      return json(res, 200, { name: config.libraryName, scannedAt, pieces: pieces.map(publicPiece) });
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
    if (paperlessUrl && paperlessToken && piece.paperlessId)
      return proxy(res, `${paperlessUrl}/api/documents/${piece.paperlessId}/download/`, { Authorization: `Token ${paperlessToken}` });
    return json(res, 404, { error: 'no pdf' });
  }

  async function serveStatic(req, res, path) {
    const rel = normalize(decodeURIComponent(path)).replace(/^([/\\])+/, '');
    let file = resolve(staticDir, rel || 'index.html');
    if (file !== staticDir && !file.startsWith(staticDir + sep)) return json(res, 403, { error: 'forbidden' });
    try {
      if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    } catch {
      file = join(staticDir, 'index.html');
    }
    const name = file.slice(staticDir.length + 1).split(sep).join('/');
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
      decodeURIComponent(path);
    } catch {
      return json(res, 400, { error: 'bad request' });
    }
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
  return server;
}

function isMain() {
  try {
    return Boolean(process.argv[1]) && pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url;
  } catch {
    return false;
  }
}

if (isMain()) {
  const config = loadConfig();
  const server = createApp(config);
  server.listen(config.port, () => {
    console.log(`doremifaaa on :${config.port} (static ${config.staticDir}${config.vaultDir ? `, vault ${resolve(config.vaultDir)}` : ', no vault'})`);
  });
}
