import { createReadStream, mkdirSync } from 'node:fs';
import { copyFile, readdir, readFile, rename, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { isPieceId } from './store.mjs';

export const DIRS = ['queue', 'work', 'done', 'failed'];

export class Omr {
  constructor({ store, dir, timeoutMs = 30 * 60 * 1000 }) {
    this.store = store;
    this.dir = dir;
    this.timeoutMs = timeoutMs;
    for (const d of DIRS) mkdirSync(join(dir, d), { recursive: true });
    this.polling = null;
  }

  path(kind, id, ext) {
    if (!isPieceId(id)) throw new Error('invalid id');
    return join(this.dir, kind, `${id}.${ext}`);
  }

  async enqueue(id) {
    const piece = this.store.require(id);
    const pdf = this.store.filePath(piece.id, 'pdf');
    if (!pdf) throw Object.assign(new Error('no pdf'), { status: 409 });
    await rm(this.path('failed', id, 'log'), { force: true });
    const tmp = join(this.dir, 'queue', `.${id}.pdf.tmp`);
    await copyFile(pdf, tmp);
    await rename(tmp, this.path('queue', id, 'pdf'));
    return this.store.setOmr(id, 'queued');
  }

  shouldConvert(piece) {
    return Boolean(piece.hasPdf && !piece.scoreFormat);
  }

  async exists(file) {
    try {
      return await stat(file);
    } catch {
      return null;
    }
  }

  async finish(id) {
    const result = this.path('done', id, 'mxl');
    try {
      const piece = this.store.get(id);
      if (!piece) return;
      if (piece.scoreFormat) return void this.store.setOmr(id, 'done', 'the piece already had a score, the conversion was not used');
      const staged = await this.store.stage(createReadStream(result));
      if (staged.kind !== 'score') {
        await this.store.discard(staged);
        return void this.store.setOmr(id, 'failed', 'the converter did not produce a MusicXML file');
      }
      await this.store.putFile(id, 'score', staged, { scoreOrigin: 'omr' });
      this.store.setOmr(id, 'done');
    } finally {
      await rm(result, { force: true });
    }
  }

  async fail(id, log) {
    try {
      const text = (await readFile(log, 'utf8')).trim().split('\n')[0].slice(0, 500);
      if (this.store.get(id)) this.store.setOmr(id, 'failed', text || 'conversion failed');
    } finally {
      await rm(log, { force: true });
    }
  }

  async pollOnce() {
    for (const name of await readdir(join(this.dir, 'done'))) {
      const id = name.replace(/\.mxl$/, '');
      if (name.endsWith('.mxl') && isPieceId(id)) await this.finish(id);
    }
    for (const name of await readdir(join(this.dir, 'failed'))) {
      const id = name.replace(/\.log$/, '');
      if (name.endsWith('.log') && isPieceId(id)) await this.fail(id, join(this.dir, 'failed', name));
    }
    for (const piece of [...this.store.withOmr('queued'), ...this.store.withOmr('running')]) {
      const work = await this.exists(this.path('work', piece.id, 'pdf'));
      const queued = await this.exists(this.path('queue', piece.id, 'pdf'));
      if (work && piece.omr.state === 'queued') this.store.setOmr(piece.id, 'running');
      else if (work && Date.now() - work.mtimeMs > this.timeoutMs) this.store.setOmr(piece.id, 'failed', 'the conversion timed out');
      else if (!work && !queued) this.store.setOmr(piece.id, 'failed', 'the job was lost, convert again');
    }
  }

  poll() {
    this.polling ??= this.pollOnce()
      .catch((e) => console.error(`omr: ${e.message}`))
      .finally(() => (this.polling = null));
    return this.polling;
  }
}
