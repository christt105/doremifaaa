import { createReadStream, realpathSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { writeDenied } from './guard.mjs';
import { Store, StoreError, isPieceId } from './store.mjs';
import { mergeSync, readSync } from './sync.mjs';
import { Vault, sniff } from './vault.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));

const list = (value) => value.split(',').map((s) => s.trim()).filter(Boolean);
const positive = (value, fallback) => (Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : fallback);

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
    allowedOrigins: list(env.ALLOWED_ORIGINS ?? 'https://christt105.github.io'),
    dataDir: env.DATA_DIR ?? '',
    writeToken: env.WRITE_TOKEN ?? '',
    maxUploadBytes: positive(env.MAX_UPLOAD_MB ?? 50, 50) * 1024 * 1024
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

async function readJson(req, limit = 64 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > limit) throw new StoreError(413, 'body too large');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new StoreError(400, 'invalid JSON');
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

export function createApp(config) {
  const { staticDir, paperlessUrl, paperlessToken, obsidianVault, allowedOrigins } = config;
  const vault = config.vaultDir
    ? new Vault({ root: config.vaultDir, dirs: config.libraryDirs, exclude: config.excludeDirs, noteType: config.noteType, ttlMs: config.scanTtlMs })
    : null;

  let store = null;
  let storeError = null;
  if (config.dataDir) {
    try {
      store = new Store({ dir: config.dataDir, maxBytes: config.maxUploadBytes });
    } catch (e) {
      storeError = e instanceof Error ? e.message : String(e);
      console.error(`store disabled: ${storeError}`);
    }
  }

  function cors(req, res) {
    const origin = req.headers.origin;
    res.setHeader('Vary', 'Origin');
    if (origin && (allowedOrigins.includes('*') || allowedOrigins.includes(origin))) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
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

  function vaultPiece(p) {
    const { scoreFile, pdfFile, ...rest } = p;
    const enc = encodeURIComponent(p.id);
    return {
      ...rest,
      composer: null,
      notes: null,
      location: 'vault',
      origin: null,
      originRef: null,
      editable: false,
      hasOriginal: false,
      scoreUrl: p.hasScore ? `api/pieces/${enc}/score` : null,
      scoreFormat: scoreFile ? extname(scoreFile).slice(1).toLowerCase() : null,
      pdfUrl: p.hasPdf ? `api/pieces/${enc}/pdf` : null,
      originalUrl: null,
      obsidianUrl: obsidianVault ? `obsidian://open?vault=${encodeURIComponent(obsidianVault)}&file=${encodeURIComponent(p.notePath.replace(/\.md$/, ''))}` : null,
      createdAt: null,
      updatedAt: null
    };
  }

  function storePiece(p) {
    const url = (slot) => `api/pieces/${p.id}/${slot}?v=${p.updatedAt}`;
    return {
      id: p.id,
      title: p.title,
      composer: p.composer,
      status: p.status,
      difficulty: p.difficulty,
      tags: p.tags,
      source: p.source,
      video: p.video,
      startedAt: p.startedAt,
      finishedAt: p.finishedAt,
      notes: p.notes,
      location: 'store',
      origin: p.origin,
      originRef: p.originRef,
      editable: true,
      notePath: null,
      obsidianUrl: null,
      hasScore: Boolean(p.scoreFormat),
      hasPdf: p.hasPdf,
      hasOriginal: Boolean(p.originalFormat),
      scoreUrl: p.scoreFormat ? url('score') : null,
      scoreFormat: p.scoreFormat,
      pdfUrl: p.hasPdf ? url('pdf') : null,
      originalUrl: p.originalFormat ? url('original') : null,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt
    };
  }

  async function library(refresh = false) {
    const scan = vault ? await vault.get(refresh) : null;
    const imported = store ? store.originRefs('vault') : new Set();
    const pieces = [
      ...(store ? store.list().map(storePiece) : []),
      ...(scan ? scan.pieces.filter((p) => !imported.has(p.id)).map(vaultPiece) : [])
    ].sort((a, b) => a.title.localeCompare(b.title, 'es'));
    return { scannedAt: scan?.scannedAt ?? Date.now(), pieces };
  }

  async function findPiece(id) {
    const own = store && (store.get(id) ?? store.findByOrigin('vault', id));
    if (own) return { own };
    const piece = vault ? await vault.piece(id) : null;
    return piece ? { piece } : null;
  }

  async function sendPieceFile(res, found, slot) {
    if (found.own) {
      const file = store.filePath(found.own.id, slot);
      if (!file) return json(res, 404, { error: `no ${slot}` });
      return sendFile(res, file, { 'Cache-Control': 'no-cache' });
    }
    const { piece } = found;
    if (slot === 'original') return json(res, 404, { error: 'no original' });
    if (slot === 'score') {
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

  async function writable(res, id) {
    if (store.get(id)) return true;
    if (vault && (await vault.piece(id))) json(res, 409, { error: 'read-only' });
    else if (isPieceId(id)) json(res, 404, { error: 'unknown piece' });
    else json(res, 400, { error: 'invalid id' });
    return false;
  }

  async function api(req, res, path) {
    const url = new URL(req.url, 'http://x');
    const method = req.method === 'HEAD' ? 'GET' : req.method;
    if (method !== 'GET') {
      if (!store) return storeError ? json(res, 503, { error: 'store unavailable', storeError }) : json(res, 404, { error: 'store disabled' });
      const denied = writeDenied(req.headers, config);
      if (denied) return json(res, denied.status, { error: denied.error });
    }
    if (path === '/api/health') {
      if (method !== 'GET') return json(res, 405, { error: 'method not allowed' });
      const pieces = vault || store ? (await library()).pieces.length : 0;
      return json(res, 200, { ok: true, vault: Boolean(vault), pieces, store: Boolean(store), ...(storeError ? { storeError } : {}), auth: Boolean(config.writeToken) });
    }
    const sync = /^\/api\/sync\/([^/]+)$/.exec(path);
    if (sync) {
      if (!store) return json(res, 404, { error: 'store disabled' });
      const profile = decodeURIComponent(sync[1]);
      if (method === 'GET') return json(res, 200, readSync(store.db, profile));
      if (method === 'POST') return json(res, 200, mergeSync(store.db, profile, await readJson(req, 8 * 1024 * 1024)));
      return json(res, 405, { error: 'method not allowed' });
    }
    if (!vault && !store) return json(res, 404, { error: 'no library configured' });
    if (path === '/api/library') {
      if (method !== 'GET') return json(res, 405, { error: 'method not allowed' });
      const { pieces, scannedAt } = await library(url.searchParams.has('refresh'));
      return json(res, 200, { name: config.libraryName, scannedAt, store: { enabled: Boolean(store), auth: Boolean(config.writeToken) }, pieces });
    }
    const m = /^\/api\/pieces(?:\/([^/]+)(?:\/(score|pdf|original))?)?$/.exec(path);
    if (!m) return json(res, 404, { error: 'not found' });
    const [, rawId, slot] = m;
    if (!rawId) {
      if (method !== 'POST') return json(res, 405, { error: 'method not allowed' });
      const piece = await store.upload(req, { name: url.searchParams.get('name'), title: url.searchParams.get('title'), size: req.headers['content-length'] });
      return json(res, 201, storePiece(piece));
    }
    const id = decodeURIComponent(rawId);
    if (method === 'GET') {
      const found = await findPiece(id);
      if (!found) return json(res, 404, { error: 'unknown piece' });
      if (slot) return sendPieceFile(res, found, slot);
      return json(res, 200, found.own ? storePiece(found.own) : vaultPiece(found.piece));
    }
    if (method === 'PATCH' && !slot) {
      if (!(await writable(res, id))) return;
      return json(res, 200, storePiece(store.patch(id, await readJson(req))));
    }
    if (method === 'PUT' && (slot === 'score' || slot === 'pdf')) {
      if (!(await writable(res, id))) return;
      const staged = await store.stage(req, req.headers['content-length']);
      return json(res, 200, storePiece(await store.putFile(id, slot, staged, { keepOriginal: url.searchParams.get('keepOriginal') === '1' })));
    }
    if (method === 'DELETE') {
      if (!(await writable(res, id))) return;
      if (slot) return json(res, 200, storePiece(await store.removeFile(id, slot)));
      await store.remove(id);
      res.writeHead(204);
      return res.end();
    }
    return json(res, 405, { error: 'method not allowed' });
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
        return await api(req, res, path);
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'method not allowed' });
      return await serveStatic(req, res, path);
    } catch (e) {
      if (e instanceof StoreError && !res.headersSent) {
        if (e.status === 413) res.setHeader('Connection', 'close');
        return json(res, e.status, { error: e.message });
      }
      console.error(e);
      if (!res.headersSent) json(res, 500, { error: 'internal error' });
      else res.end();
    }
  });
  server.on('close', () => store?.close());
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
