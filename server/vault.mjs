import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, extname, join, relative, resolve, sep } from 'node:path';

const SKIP = new Set(['.obsidian', '.trash', '.git', 'node_modules', '.stfolder', '.stversions']);
const SCORE_EXT = ['.mxl', '.musicxml', '.xml'];

function unquote(v) {
  const s = v.trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) return s.slice(1, -1).replace(/\\"/g, '"');
  return s;
}

function scalar(v) {
  const s = v.trim();
  if (/^(["']).*\1$/.test(s)) return unquote(s);
  if (s === '' || s === 'null' || s === '~') return null;
  if (/^-?\d+(\.\d+)?$/.test(s) && !/^0\d/.test(s)) return Number(s);
  if (s === 'true' || s === 'false') return s === 'true';
  if (/^\[.*\]$/.test(s) && !s.startsWith('[['))
    return s
      .slice(1, -1)
      .split(',')
      .map((x) => unquote(x))
      .filter(Boolean);
  return s;
}

export function parseFrontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!m) return { data: {}, body: text };
  const data = {};
  let listKey = null;
  for (const line of m[1].split(/\r?\n/)) {
    const item = /^\s*-\s+(.*)$/.exec(line);
    if (item && listKey) {
      data[listKey].push(unquote(item[1]));
      continue;
    }
    const kv = /^([A-Za-z0-9_\-]+):\s*(.*)$/.exec(line);
    if (!kv) continue;
    const [, key, value] = kv;
    if (value.trim() === '') {
      data[key] = [];
      listKey = key;
    } else {
      data[key] = scalar(value);
      listKey = null;
    }
  }
  for (const [k, v] of Object.entries(data)) if (Array.isArray(v) && v.length === 0) data[k] = null;
  return { data, body: text.slice(m[0].length) };
}

export function linkTarget(value) {
  if (typeof value !== 'string') return null;
  const wiki = /\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]/.exec(value);
  return (wiki ? wiki[1] : value).trim() || null;
}

export function embeds(body) {
  return [...body.matchAll(/!\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]/g)].map((m) => m[1].trim());
}

async function walk(root, dir, out) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (SKIP.has(e.name) || e.name.startsWith('.')) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) await walk(root, full, out);
    else if (e.isFile()) out.push(full);
  }
}

export function slug(name) {
  return name.normalize('NFC');
}

export class Vault {
  constructor({ root, dirs = [], noteType = 'partitura', ttlMs = 60000 }) {
    this.root = resolve(root);
    this.dirs = dirs.length ? dirs.map((d) => resolve(this.root, d)) : [this.root];
    this.noteType = noteType;
    this.ttlMs = ttlMs;
    this.cache = null;
    this.pending = null;
  }

  inside(path) {
    const full = resolve(path);
    return full === this.root || full.startsWith(this.root + sep);
  }

  async scan() {
    const files = [];
    for (const d of this.dirs) if (this.inside(d)) await walk(this.root, d, files);
    const byName = new Map();
    for (const f of files) {
      const key = basename(f).toLowerCase();
      if (!byName.has(key)) byName.set(key, f);
      const rel = relative(this.root, f).split(sep).join('/').toLowerCase();
      byName.set(rel, f);
    }
    const resolveLink = (target, exts) => {
      if (!target) return null;
      const t = target.toLowerCase();
      for (const c of [t, ...exts.map((e) => t + e)]) {
        const hit = byName.get(c) ?? byName.get(c.split('/').pop());
        if (hit) return hit;
      }
      return null;
    };
    const pieces = [];
    const ids = new Set();
    for (const f of files) {
      if (extname(f).toLowerCase() !== '.md') continue;
      let text;
      try {
        text = await readFile(f, 'utf8');
      } catch {
        continue;
      }
      if (!text.startsWith('---')) continue;
      const { data, body } = parseFrontmatter(text);
      if (data.type !== this.noteType) continue;
      const name = basename(f, '.md');
      let id = slug(name);
      if (ids.has(id)) id = slug(relative(this.root, f).split(sep).join('/').replace(/\.md$/, ''));
      ids.add(id);
      const embedded = embeds(body);
      const pdfLink = linkTarget(data.pdf) ?? embedded.find((e) => /\.pdf$/i.test(e)) ?? null;
      const scoreLink = linkTarget(data.musicxml ?? data.score) ?? embedded.find((e) => /\.(mxl|musicxml|xml)$/i.test(e)) ?? null;
      const scoreFile = resolveLink(scoreLink, SCORE_EXT) ?? SCORE_EXT.map((e) => byName.get((name + e).toLowerCase())).find(Boolean) ?? null;
      const pdfFile = resolveLink(pdfLink, ['.pdf']);
      const tags = Array.isArray(data.tags) ? data.tags.map(String) : typeof data.tags === 'string' ? [data.tags] : [];
      pieces.push({
        id,
        title: String(data.titulo ?? data.title ?? name),
        status: data.estado ?? data.status ?? null,
        difficulty: data.dificultad ?? data.difficulty ?? null,
        tags,
        source: typeof (data.fuente ?? data.source) === 'string' ? (data.fuente ?? data.source) : null,
        video: typeof data.video === 'string' ? data.video : null,
        startedAt: data.fecha_inicio ?? null,
        finishedAt: data.fecha_fin ?? null,
        paperlessId: typeof data.paperless_id === 'number' ? data.paperless_id : null,
        notePath: relative(this.root, f).split(sep).join('/'),
        scoreFile,
        pdfFile,
        hasScore: Boolean(scoreFile),
        hasPdf: Boolean(pdfFile) || typeof data.paperless_id === 'number'
      });
    }
    pieces.sort((a, b) => a.title.localeCompare(b.title, 'es'));
    return { pieces, scannedAt: Date.now() };
  }

  async get(force = false) {
    if (!force && this.cache && Date.now() - this.cache.scannedAt < this.ttlMs) return this.cache;
    this.pending ??= this.scan().finally(() => (this.pending = null));
    this.cache = await this.pending;
    return this.cache;
  }

  async piece(id) {
    const { pieces } = await this.get();
    return pieces.find((p) => p.id === id) ?? null;
  }
}

export async function sniff(file) {
  const info = await stat(file);
  const fh = await readFile(file);
  const head = fh.subarray(0, 8).toString('latin1');
  if (head.startsWith('%PDF')) return { kind: 'pdf', size: info.size };
  const text = info.size < 4096 ? fh.toString('utf8').trim() : '';
  const url = /^https?:\/\/\S+$/.exec(text);
  if (url) return { kind: 'url', url: url[0], size: info.size };
  return { kind: 'unknown', size: info.size };
}
