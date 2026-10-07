import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { sniff } from './vault.mjs';

function text(value) {
  if (value === null || value === undefined || value === '') return null;
  return String(value).trim().slice(0, 500) || null;
}

export function importedMeta(piece) {
  return {
    title: text(piece.title) ?? piece.id,
    status: text(piece.status),
    difficulty: text(piece.difficulty),
    tags: (piece.tags ?? []).map(String).filter((t) => t.trim()).slice(0, 50),
    source: text(piece.source),
    video: text(piece.video),
    startedAt: text(piece.startedAt),
    finishedAt: text(piece.finishedAt)
  };
}

export async function pdfSourceKind(vault, piece, { allowedRemote, paperlessToken }) {
  if (piece.pdfFile && vault.inside(piece.pdfFile)) {
    const kind = await sniff(piece.pdfFile);
    if (kind.kind === 'pdf') return { kind: 'file', file: piece.pdfFile };
    if (kind.kind === 'url' && allowedRemote(kind.url)) return { kind: 'url', url: kind.url };
  }
  if (paperlessToken && piece.paperlessId) return { kind: 'paperless', id: piece.paperlessId };
  return null;
}

export class Importer {
  constructor({ vault, store, allowedRemote = () => false, paperlessUrl = '', paperlessToken = '', fetch: fetchImpl = fetch }) {
    this.vault = vault;
    this.store = store;
    this.allowedRemote = allowedRemote;
    this.paperlessUrl = paperlessUrl;
    this.paperlessToken = paperlessToken;
    this.fetch = fetchImpl;
  }

  async plan() {
    const { pieces } = await this.vault.get(true);
    const items = [];
    for (const piece of pieces) {
      const own = this.store.findByOrigin('vault', piece.id);
      const pdf = await pdfSourceKind(this.vault, piece, this);
      const missing = [];
      if (piece.scoreFile && !own?.scoreFormat) missing.push('score');
      if (pdf && !own?.hasPdf) missing.push('pdf');
      items.push({ id: piece.id, title: piece.title, state: own ? (missing.length ? 'incomplete' : 'imported') : 'new', storeId: own?.id ?? null, hasScore: Boolean(piece.scoreFile), pdf: pdf?.kind ?? null, missing });
    }
    const count = (state) => items.filter((i) => i.state === state).length;
    return { total: items.length, new: count('new'), incomplete: count('incomplete'), imported: count('imported'), pieces: items };
  }

  async openPdf(source) {
    if (source.kind === 'file') return createReadStream(source.file);
    const url = source.kind === 'url' ? source.url : `${this.paperlessUrl}/api/documents/${source.id}/download/`;
    const headers = source.kind === 'paperless' ? { Authorization: `Token ${this.paperlessToken}` } : {};
    const res = await this.fetch(url, { headers, redirect: 'follow' });
    if (!res.ok || !res.body) throw new Error(`PDF download failed (HTTP ${res.status})`);
    return Readable.fromWeb(res.body);
  }

  async copy(own, slot, open) {
    const staged = await this.store.stage(await open());
    return this.store.putFile(own.id, slot, staged, { scoreOrigin: 'vault' });
  }

  async importOne(piece) {
    const existing = this.store.findByOrigin('vault', piece.id);
    let own = existing ?? this.store.create({ origin: 'vault', originRef: piece.id, notePath: piece.notePath, ...importedMeta(piece) });
    const done = [];
    const errors = [];
    if (piece.scoreFile && !own.scoreFormat) {
      try {
        own = await this.copy(own, 'score', () => createReadStream(piece.scoreFile));
        done.push('score');
      } catch (e) {
        errors.push(`score: ${e.message}`);
      }
    }
    const pdf = own.hasPdf ? null : await pdfSourceKind(this.vault, piece, this);
    if (pdf) {
      try {
        own = await this.copy(own, 'pdf', () => this.openPdf(pdf));
        done.push('pdf');
      } catch (e) {
        errors.push(`pdf: ${e.message}`);
      }
    }
    return { id: piece.id, storeId: own.id, created: !existing, copied: done, errors };
  }

  async run(ids = null) {
    const { pieces } = await this.vault.get(true);
    const wanted = ids ? pieces.filter((p) => ids.includes(p.id)) : pieces;
    const result = { imported: [], updated: [], skipped: [], failed: [] };
    for (const piece of wanted) {
      const r = await this.importOne(piece);
      if (r.errors.length) result.failed.push({ id: r.id, storeId: r.storeId, error: r.errors.join('; ') });
      if (r.created) result.imported.push(r.id);
      else if (r.copied.length) result.updated.push(r.id);
      else if (!r.errors.length) result.skipped.push(r.id);
    }
    return result;
  }
}
