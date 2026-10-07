import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error plain ESM module without types
import { MIGRATIONS, Store, isPieceId, migrate, sniffBuffer, titleFromName, validatePatch } from '../server/store.mjs';

const minuet = readFileSync(join(__dirname, '..', 'public', 'samples', 'minuet.musicxml'));
const pdf = Buffer.from('%PDF-1.4\n% fake\n%%EOF\n');
const mxl = Buffer.concat([Buffer.from([0x50, 0x4b, 3, 4]), Buffer.alloc(32)]);

const dirs: string[] = [];
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

let dir: string;
let store: InstanceType<typeof Store>;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'doremifaaa-store-'));
  dirs.push(dir);
  store = new Store({ dir, maxBytes: 64 * 1024 });
});
afterEach(() => store.close());

describe('store basics', () => {
  it('migrates a fresh database and is idempotent on reopen', () => {
    expect(store.version).toBe(MIGRATIONS.length);
    store.close();
    store = new Store({ dir });
    const db = new DatabaseSync(join(dir, 'doremifaaa.db'));
    expect(db.prepare('PRAGMA user_version').get()).toEqual({ user_version: MIGRATIONS.length });
    expect(migrate(db)).toBe(MIGRATIONS.length);
    db.close();
  });

  it('runs appended migrations in order', () => {
    const db = new DatabaseSync(':memory:');
    migrate(db, ['CREATE TABLE a (x)']);
    migrate(db, ['CREATE TABLE a (x)', 'ALTER TABLE a ADD COLUMN y']);
    expect(db.prepare('PRAGMA user_version').get()).toEqual({ user_version: 2 });
    expect(() => migrate(db, ['CREATE TABLE a (x)'])).toThrow(/newer/);
    db.close();
  });

  it('creates, patches and lists pieces', () => {
    const p = store.create({ title: '  Minuet ', tags: ['bach', ' bach ', 'baroque'] });
    expect(isPieceId(p.id)).toBe(true);
    expect(p).toMatchObject({ title: 'Minuet', tags: ['bach', 'baroque'], origin: 'upload', originRef: null, scoreFormat: null, hasPdf: false });
    const q = store.patch(p.id, { composer: 'Petzold', status: 'Learning', notes: 'slow', tags: null });
    expect(q).toMatchObject({ composer: 'Petzold', status: 'Learning', notes: 'slow', tags: [] });
    expect(q.updatedAt).toBeGreaterThan(p.updatedAt);
    expect(store.patch(p.id, { composer: '' }).composer).toBeNull();
    store.create({ title: 'Air', origin: 'vault', originRef: 'Air note' });
    expect(store.list().map((x: { title: string }) => x.title)).toEqual(['Air', 'Minuet']);
    expect(store.findByOrigin('vault', 'Air note').title).toBe('Air');
    expect([...store.originRefs('vault')]).toEqual(['Air note']);
  });

  it('validates metadata', () => {
    expect(() => validatePatch({ title: '' })).toThrow(/required/);
    expect(() => validatePatch({ title: null })).toThrow(/required/);
    expect(() => validatePatch({ nope: 1 })).toThrow(/unknown field/);
    expect(() => validatePatch({ composer: 3 })).toThrow(/string/);
    expect(() => validatePatch({ composer: 'x'.repeat(501) })).toThrow(/too long/);
    expect(validatePatch({ notes: 'x'.repeat(5000) }).notes).toHaveLength(5000);
    expect(() => validatePatch({ tags: 'a' })).toThrow(/tags/);
    expect(() => validatePatch({ tags: Array.from({ length: 51 }, (_, i) => `t${i}`) })).toThrow(/tags/);
    expect(() => validatePatch([])).toThrow(/object/);
    expect(() => store.create({ title: 'x', origin: 'nope' })).toThrow(/origin/);
  });

  it('only accepts generated ids', () => {
    expect(isPieceId('abcdefghij')).toBe(true);
    for (const id of ['ABCDEFGHIJ', 'abc', '../../etc', 'abcdefghi/', 'abcdefghijk', '..%2F..%2F']) expect(isPieceId(id)).toBe(false);
    expect(store.get('../../etc')).toBeNull();
    expect(() => store.path('../../etc', 'x')).toThrow(/invalid id/);
    expect(() => store.path('abcdefghij', '../../x')).toThrow(/invalid path/);
  });
});

describe('store files', () => {
  it('sniffs scores and PDFs and rejects junk', () => {
    expect(sniffBuffer(minuet)).toEqual({ kind: 'score', format: 'musicxml' });
    expect(sniffBuffer(mxl)).toEqual({ kind: 'score', format: 'mxl' });
    expect(sniffBuffer(pdf)).toEqual({ kind: 'pdf', format: 'pdf' });
    expect(sniffBuffer(Buffer.from('<html><body>score-partwise</body></html>')).kind).toBeNull();
    expect(sniffBuffer(Buffer.from('hello')).kind).toBeNull();
    expect(titleFromName('C:\\fakepath\\Route_201.final.pdf')).toBe('Route 201.final');
  });

  it('uploads a score, replaces it keeping the original, and deletes files', async () => {
    const p = await store.upload([minuet], { name: 'Minuet_in_G.musicxml' });
    expect(p).toMatchObject({ title: 'Minuet in G', scoreFormat: 'musicxml', hasPdf: false, originalFormat: null });
    expect(readFileSync(store.filePath(p.id, 'score'))).toEqual(minuet);

    const replaced = await store.putFile(p.id, 'score', await store.stage([mxl]), { keepOriginal: true });
    expect(replaced).toMatchObject({ scoreFormat: 'mxl', originalFormat: 'musicxml' });
    expect(readFileSync(store.filePath(p.id, 'original'))).toEqual(minuet);
    expect(readdirSync(join(dir, 'files', p.id)).sort()).toEqual(['original.musicxml', 'score.mxl']);

    const again = await store.putFile(p.id, 'score', await store.stage([minuet]), { keepOriginal: true });
    expect(again).toMatchObject({ scoreFormat: 'musicxml', originalFormat: 'musicxml' });
    expect(readdirSync(join(dir, 'files', p.id)).sort()).toEqual(['original.musicxml', 'score.musicxml']);

    const withPdf = await store.putFile(p.id, 'pdf', await store.stage([pdf]));
    expect(withPdf.hasPdf).toBe(true);
    await expect(store.putFile(p.id, 'pdf', await store.stage([minuet]))).rejects.toMatchObject({ status: 415 });

    expect((await store.removeFile(p.id, 'original')).originalFormat).toBeNull();
    expect((await store.removeFile(p.id, 'pdf')).hasPdf).toBe(false);
    expect(readdirSync(join(dir, 'files', p.id))).toEqual(['score.musicxml']);

    await store.remove(p.id);
    expect(store.get(p.id)).toBeNull();
    expect(existsSync(join(dir, 'files', p.id))).toBe(false);
    expect(readdirSync(join(dir, 'tmp'))).toEqual([]);
  });

  it('rejects junk and oversized uploads without leaving files behind', async () => {
    await expect(store.upload([Buffer.from('not a score')], { name: 'x.txt' })).rejects.toMatchObject({ status: 415 });
    await expect(store.upload([Buffer.alloc(40 * 1024, 32), Buffer.alloc(40 * 1024, 32)], { name: 'big.pdf' })).rejects.toMatchObject({ status: 413 });
    await expect(store.upload([pdf], { name: 'x.pdf', size: 1024 * 1024 })).rejects.toMatchObject({ status: 413 });
    expect(store.list()).toEqual([]);
    expect(readdirSync(join(dir, 'tmp'))).toEqual([]);
    expect(readdirSync(join(dir, 'files'))).toEqual([]);
  });

  it('uses the title parameter over the file name', async () => {
    const p = await store.upload([pdf], { name: 'scan_001.pdf', title: 'Route 201' });
    expect(p).toMatchObject({ title: 'Route 201', hasPdf: true, scoreFormat: null });
  });
});
