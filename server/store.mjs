import { randomInt } from 'node:crypto';
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { mkdir, open, rename, rm } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const ID = /^[a-z0-9]{10}$/;
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const SNIFF_BYTES = 64 * 1024;
const SCORE_FORMATS = ['mxl', 'musicxml'];
const ORIGINS = ['upload', 'vault', 'omr'];
const TEXT_FIELDS = { title: 'title', composer: 'composer', status: 'status', difficulty: 'difficulty', source: 'source', video: 'video', startedAt: 'started_at', finishedAt: 'finished_at', notes: 'notes' };
const MAX_TAGS = 50;

export const MIGRATIONS = [
  `CREATE TABLE pieces (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    composer TEXT,
    status TEXT,
    difficulty TEXT,
    tags TEXT NOT NULL DEFAULT '[]',
    source TEXT,
    video TEXT,
    started_at TEXT,
    finished_at TEXT,
    notes TEXT,
    origin TEXT NOT NULL DEFAULT 'upload',
    origin_ref TEXT,
    score_format TEXT,
    has_pdf INTEGER NOT NULL DEFAULT 0,
    original_format TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX pieces_origin ON pieces (origin, origin_ref);`
];

export class StoreError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function isPieceId(id) {
  return typeof id === 'string' && ID.test(id);
}

export function newId() {
  let id = '';
  for (let i = 0; i < 10; i++) id += ALPHABET[randomInt(ALPHABET.length)];
  return id;
}

export function sniffBuffer(head) {
  if (head.length >= 4 && head.readUInt32BE(0) === 0x504b0304) return { kind: 'score', format: 'mxl' };
  if (head.subarray(0, 5).toString('latin1') === '%PDF-') return { kind: 'pdf', format: 'pdf' };
  const text = head.subarray(0, SNIFF_BYTES).toString('utf8').replace(/^﻿/, '').trimStart();
  if (text.startsWith('<') && /<score-(partwise|timewise)[\s>/]/.test(text)) return { kind: 'score', format: 'musicxml' };
  return { kind: null, format: null };
}

export function titleFromName(name) {
  const base = String(name ?? '').split(/[\\/]/).pop() ?? '';
  return base.replace(/\.[^.]*$/, '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500);
}

function cleanTags(value) {
  if (value === null || value === '') return [];
  if (!Array.isArray(value) || value.length > MAX_TAGS) throw new StoreError(400, `tags must be an array of up to ${MAX_TAGS} strings`);
  const tags = [];
  for (const tag of value) {
    if (typeof tag !== 'string' || tag.trim().length > 500) throw new StoreError(400, 'tags must be strings of up to 500 characters');
    const t = tag.trim();
    if (t && !tags.includes(t)) tags.push(t);
  }
  return tags;
}

export function validatePatch(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new StoreError(400, 'expected a JSON object');
  const out = {};
  for (const [key, value] of Object.entries(body)) {
    if (key === 'tags') {
      out.tags = cleanTags(value);
      continue;
    }
    if (!Object.hasOwn(TEXT_FIELDS, key)) throw new StoreError(400, `unknown field ${key}`);
    if (value !== null && typeof value !== 'string') throw new StoreError(400, `${key} must be a string`);
    const s = value === null ? '' : value.trim();
    if (s.length > (key === 'notes' ? 5000 : 500)) throw new StoreError(400, `${key} is too long`);
    if (!s && key === 'title') throw new StoreError(400, 'title is required');
    out[key] = s || null;
  }
  return out;
}

export function migrate(db, migrations = MIGRATIONS) {
  const current = db.prepare('PRAGMA user_version').get().user_version;
  if (current > migrations.length) throw new Error(`database version ${current} is newer than this server supports (${migrations.length})`);
  for (let v = current; v < migrations.length; v++) {
    db.exec('BEGIN');
    try {
      db.exec(migrations[v]);
      db.exec(`PRAGMA user_version = ${v + 1}`);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }
  return migrations.length;
}

function toPiece(row) {
  return {
    id: row.id,
    title: row.title,
    composer: row.composer,
    status: row.status,
    difficulty: row.difficulty,
    tags: JSON.parse(row.tags),
    source: row.source,
    video: row.video,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    notes: row.notes,
    origin: row.origin,
    originRef: row.origin_ref,
    scoreFormat: row.score_format,
    hasPdf: Boolean(row.has_pdf),
    originalFormat: row.original_format,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export class Store {
  constructor({ dir, maxBytes = 50 * 1024 * 1024 }) {
    this.root = resolve(dir);
    this.filesDir = join(this.root, 'files');
    this.tmpDir = join(this.root, 'tmp');
    this.maxBytes = maxBytes;
    mkdirSync(this.filesDir, { recursive: true });
    mkdirSync(this.tmpDir, { recursive: true });
    for (const f of readdirSync(this.tmpDir)) if (f.endsWith('.part')) rmSync(join(this.tmpDir, f), { force: true });
    this.db = new DatabaseSync(join(this.root, 'doremifaaa.db'));
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000');
    this.version = migrate(this.db);
  }

  close() {
    if (this.db.isOpen) this.db.close();
  }

  list() {
    return this.db.prepare('SELECT * FROM pieces ORDER BY title COLLATE NOCASE, id').all().map(toPiece);
  }

  get(id) {
    if (!isPieceId(id)) return null;
    const row = this.db.prepare('SELECT * FROM pieces WHERE id = ?').get(id);
    return row ? toPiece(row) : null;
  }

  findByOrigin(origin, ref) {
    const row = this.db.prepare('SELECT * FROM pieces WHERE origin = ? AND origin_ref = ? ORDER BY created_at, id LIMIT 1').get(origin, ref);
    return row ? toPiece(row) : null;
  }

  originRefs(origin) {
    return new Set(this.db.prepare('SELECT origin_ref FROM pieces WHERE origin = ? AND origin_ref IS NOT NULL').all(origin).map((r) => r.origin_ref));
  }

  create({ origin = 'upload', originRef = null, ...meta }) {
    if (!ORIGINS.includes(origin)) throw new StoreError(400, `unknown origin ${origin}`);
    const fields = validatePatch(meta);
    if (!fields.title) throw new StoreError(400, 'title is required');
    let id = newId();
    while (this.get(id)) id = newId();
    const now = Date.now();
    const cols = Object.keys(fields).map((k) => (k === 'tags' ? 'tags' : TEXT_FIELDS[k]));
    const values = Object.values(fields).map((v) => (Array.isArray(v) ? JSON.stringify(v) : v));
    this.db
      .prepare(`INSERT INTO pieces (id, origin, origin_ref, created_at, updated_at, ${cols.join(', ')}) VALUES (?, ?, ?, ?, ?, ${cols.map(() => '?').join(', ')})`)
      .run(id, origin, originRef === null ? null : String(originRef), now, now, ...values);
    return this.get(id);
  }

  require(id) {
    const piece = this.get(id);
    if (!piece) throw new StoreError(404, 'unknown piece');
    return piece;
  }

  update(piece, columns) {
    const stamp = Math.max(Date.now(), piece.updatedAt + 1);
    const keys = Object.keys(columns);
    const sets = [...keys.map((k) => `${k} = ?`), 'updated_at = ?'].join(', ');
    this.db.prepare(`UPDATE pieces SET ${sets} WHERE id = ?`).run(...keys.map((k) => columns[k]), stamp, piece.id);
    return this.get(piece.id);
  }

  patch(id, body) {
    const piece = this.require(id);
    const fields = validatePatch(body);
    if (!Object.keys(fields).length) return piece;
    const columns = {};
    for (const [k, v] of Object.entries(fields)) columns[k === 'tags' ? 'tags' : TEXT_FIELDS[k]] = Array.isArray(v) ? JSON.stringify(v) : v;
    return this.update(piece, columns);
  }

  path(id, name) {
    if (!isPieceId(id)) throw new StoreError(400, 'invalid id');
    const full = resolve(this.filesDir, id, name);
    if (!full.startsWith(this.filesDir + sep)) throw new StoreError(400, 'invalid path');
    return full;
  }

  fileName(piece, slot) {
    if (slot === 'score') return piece.scoreFormat ? `score.${piece.scoreFormat}` : null;
    if (slot === 'pdf') return piece.hasPdf ? 'pdf.pdf' : null;
    if (slot === 'original') return piece.originalFormat ? `original.${piece.originalFormat}` : null;
    return null;
  }

  filePath(id, slot) {
    const piece = this.get(id);
    const name = piece && this.fileName(piece, slot);
    return name ? this.path(id, name) : null;
  }

  async stage(source, declaredSize) {
    if (Number(declaredSize) > this.maxBytes) throw new StoreError(413, 'file too large');
    const file = join(this.tmpDir, `${newId()}.part`);
    const fh = await open(file, 'wx');
    const head = [];
    let headBytes = 0;
    let size = 0;
    try {
      const chunks = typeof source.iterator === 'function' ? source.iterator({ destroyOnReturn: false }) : source;
      for await (const chunk of chunks) {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += buf.length;
        if (size > this.maxBytes) throw new StoreError(413, 'file too large');
        if (headBytes < SNIFF_BYTES) {
          head.push(buf);
          headBytes += buf.length;
        }
        await fh.write(buf);
      }
      await fh.close();
    } catch (e) {
      await fh.close().catch(() => {});
      await rm(file, { force: true });
      throw e;
    }
    return { file, size, ...sniffBuffer(Buffer.concat(head)) };
  }

  async discard(staged) {
    await rm(staged.file, { force: true });
  }

  async upload(source, { name, title, size } = {}) {
    const staged = await this.stage(source, size);
    try {
      if (!staged.kind) throw new StoreError(415, 'expected a MusicXML, MXL or PDF file');
      const piece = this.create({ title: (typeof title === 'string' && title.trim()) || titleFromName(name) || 'Untitled' });
      try {
        return await this.attach(piece, staged.kind, staged, {});
      } catch (e) {
        await this.remove(piece.id);
        throw e;
      }
    } finally {
      await this.discard(staged);
    }
  }

  async putFile(id, slot, staged, { keepOriginal = false } = {}) {
    try {
      const piece = this.require(id);
      if (staged.kind !== slot) throw new StoreError(415, slot === 'score' ? 'expected a MusicXML or MXL file' : 'expected a PDF file');
      return await this.attach(piece, slot, staged, { keepOriginal });
    } finally {
      await this.discard(staged);
    }
  }

  async attach(piece, slot, staged, { keepOriginal }) {
    await mkdir(this.path(piece.id, '.'), { recursive: true });
    if (slot === 'pdf') {
      await rename(staged.file, this.path(piece.id, 'pdf.pdf'));
      return this.update(piece, { has_pdf: 1 });
    }
    const columns = { score_format: staged.format };
    if (keepOriginal && piece.scoreFormat && !piece.originalFormat) {
      await rename(this.path(piece.id, `score.${piece.scoreFormat}`), this.path(piece.id, `original.${piece.scoreFormat}`));
      columns.original_format = piece.scoreFormat;
    }
    for (const f of SCORE_FORMATS) if (f !== staged.format) await rm(this.path(piece.id, `score.${f}`), { force: true });
    await rename(staged.file, this.path(piece.id, `score.${staged.format}`));
    return this.update(piece, columns);
  }

  async removeFile(id, slot) {
    const piece = this.require(id);
    const name = this.fileName(piece, slot);
    if (!name) return piece;
    await rm(this.path(id, name), { force: true });
    return this.update(piece, { score: { score_format: null }, pdf: { has_pdf: 0 }, original: { original_format: null } }[slot]);
  }

  async remove(id) {
    this.require(id);
    this.db.prepare('DELETE FROM pieces WHERE id = ?').run(id);
    await rm(this.path(id, '.'), { recursive: true, force: true });
  }
}
